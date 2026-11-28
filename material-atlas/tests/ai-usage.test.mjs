import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { collectAiUsageSnapshot, normalizeCodexQuota, parseAntigravityTranscripts, parseCodexSessions, recordApiUsage } from '../desktop/ai-usage.mjs';
import { formatCountdown, formatTokenCount } from '../dist/ai-usage-panel.js';
import { animateNumber, normalizeThemeTransition, prefersReducedMotion, runThemeTransition, setBrandOrbitActivity } from '../dist/ui-motion.js';
import { activityHTML } from '../dist/import-activity.js';
import { createGraphTelescope } from '../dist/graph-telescope.js';

const NOW = Date.UTC(2026, 10, 25, 12, 0, 0);

test('parseCodexSessions deduplicates cumulative totals, tracks model switches, and handles expired resets', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'materia-codex-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const sessionDir = path.join(dir, '2026', '11', '25');
  await mkdir(sessionDir, { recursive: true });
  const jsonl = [
    JSON.stringify({ timestamp: new Date(NOW - 3600_000).toISOString(), type: 'turn_context', payload: { model: 'gpt-6.2-astra' } }),
    JSON.stringify({
      timestamp: new Date(NOW - 3000_000).toISOString(),
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: { total_token_usage: { input_tokens: 1000, cached_input_tokens: 400, output_tokens: 200, total_tokens: 1200 } },
        rate_limits: { primary: { used_percent: 22, window_minutes: 300, resets_at: Math.floor((NOW + 7200_000) / 1000) } },
      },
    }),
    // Duplicate snapshot with identical cumulative totals must add 0 delta
    JSON.stringify({
      timestamp: new Date(NOW - 2400_000).toISOString(),
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: { total_token_usage: { input_tokens: 1000, cached_input_tokens: 400, output_tokens: 200, total_tokens: 1200 } },
      },
    }),
    JSON.stringify({
      timestamp: new Date(NOW - 1800_000).toISOString(),
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: { total_token_usage: { input_tokens: 1500, cached_input_tokens: 700, output_tokens: 350, total_tokens: 1850 } },
        rate_limits: {
          primary: { used_percent: 25, window_minutes: 300, resets_at: Math.floor((NOW - 10_000) / 1000) },
          secondary: { used_percent: 40, window_minutes: 10080, resets_at: Math.floor((NOW + 86_400_000) / 1000) },
          plan_type: 'plus',
        },
      },
    }),
    JSON.stringify({
      timestamp: new Date(NOW - 900_000).toISOString(),
      type: 'event_msg',
      payload: { type: 'token_count', rate_limits: { limit_id: 'premium', primary: null, secondary: null } },
    }),
  ].join('\n');

  await writeFile(path.join(sessionDir, 'rollout-1.jsonl'), jsonl, 'utf8');

  const parsed = await parseCodexSessions(dir, { now: NOW });
  assert.equal(parsed.filesScanned, 1);
  assert.equal(parsed.events.length, 2);
  assert.equal(parsed.events.reduce((s, e) => s + e.totalTokens, 0), 1850);
  assert.equal(parsed.events.reduce((s, e) => s + e.cachedTokens, 0), 700);
  assert.equal(parsed.latestModel, 'gpt-6.2-astra');
  assert.equal(parsed.quota.planType, 'plus');
  // Expired primary window resets remaining to 1
  assert.equal(parsed.quota.primary.remaining, 1);
  assert.equal(parsed.quota.primary.resetAt, null);
  assert.ok(Math.abs(parsed.quota.secondary.remaining - 0.6) < 1e-6);
});

test('collectAiUsageSnapshot reads a configured Codex home and desktop usage records', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'materia-codex-home-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sessions = path.join(root, 'sessions');
  await mkdir(sessions);
  const timestamp = new Date(NOW - 60_000).toISOString();
  const usage = { input_tokens: 50, cached_input_tokens: 20, output_tokens: 10, total_tokens: 60 };
  const record = { timestamp, type: 'token_usage_record', payload: { usage, response_id: 'test-response' } };
  await writeFile(path.join(sessions, 'rollout-desktop.jsonl'), [record, record].map(row => JSON.stringify(row)).join('\n'));
  const options = { now: NOW, codexHome: root, antigravityBrainDirs: [], geminiTmpDir: '', inspectAntigravityFn: async () => ({ok: false}) };
  const snapshot = await collectAiUsageSnapshot(options);
  assert.equal(snapshot.engines.codex.online, true);
  assert.equal(snapshot.views.codex['7d'].totalTokens, 60);
  await writeFile(path.join(sessions, 'rollout-desktop.jsonl'), [
    record,
    { timestamp, type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: usage } } },
  ].map(row => JSON.stringify(row)).join('\n'));
  assert.equal((await collectAiUsageSnapshot(options)).views.codex['7d'].totalTokens, 60);
});

test('collectAiUsageSnapshot merges Antigravity transcripts + live quotas, avoids Gemini double-counting, and preserves privacy', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'materia-usage-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const codexDir = path.join(root, 'codex');
  const brainDir = path.join(root, 'brain');
  const geminiTmpDir = path.join(root, 'gemini-tmp');
  const profileDir = path.join(root, 'profile');
  await mkdir(path.join(codexDir, '2026', '11', '25'), { recursive: true });
  await mkdir(path.join(brainDir, 'conv-1', '.system_generated', 'logs'), { recursive: true });
  await mkdir(path.join(geminiTmpDir, 'proj', 'chats'), { recursive: true });

  await writeFile(
    path.join(codexDir, '2026', '11', '25', 'rollout-a.jsonl'),
    [
      JSON.stringify({ timestamp: new Date(NOW - 3600_000).toISOString(), type: 'turn_context', payload: { model: 'gpt-codex-test' } }),
      JSON.stringify({
        timestamp: new Date(NOW - 3000_000).toISOString(),
        type: 'event_msg',
        payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 2000, cached_input_tokens: 500, output_tokens: 500, total_tokens: 2500 } } },
      }),
    ].join('\n'),
    'utf8'
  );

  await writeFile(
    path.join(brainDir, 'conv-1', '.system_generated', 'logs', 'transcript.jsonl'),
    [
      JSON.stringify({ type: 'USER_INPUT', content: 'SECRET_PROMPT_SHOULD_NOT_APPEAR' }),
      JSON.stringify({ type: 'PLANNER_RESPONSE', model: 'gemini-4-neon-high', input_tokens: 10000, cache_read_tokens: 2000, output_tokens: 1000, created_at: new Date(NOW - 1200_000).toISOString() }),
      JSON.stringify({ type: 'PLANNER_RESPONSE', model: 'claude-4-sonnet', input_tokens: 4000, cache_read_tokens: 0, output_tokens: 500, created_at: new Date(NOW - 600_000).toISOString() }),
    ].join('\n'),
    'utf8'
  );

  const snapshotFallback = await collectAiUsageSnapshot({
    now: NOW,
    codexSessionsDir: codexDir,
    antigravityBrainDirs: [brainDir],
    geminiTmpDir,
    profileDir,
    inspectAntigravityFn: async () => ({
      ok: true,
      models: [
        { id: 'gemini-4-neon-high', name: 'Gemini 4 Neon (High)', remaining: 0.24, resetTime: new Date(NOW + 1800_000).toISOString() },
        { id: 'claude-4-sonnet', name: 'Claude 4 Sonnet', remaining: 0.85 },
      ],
    }),
  });

  // `all` = codex (2500) + antigravity (11000 + 4500) = 18000 (no Gemini double-counting!)
  assert.equal(snapshotFallback.views.all['7d'].totalTokens, 18000);
  assert.equal(snapshotFallback.views.antigravity['7d'].totalTokens, 15500);
  assert.equal(snapshotFallback.engines.gemini.online, false);
  assert.equal(snapshotFallback.activeEngines, 2);
  assert.equal(snapshotFallback.views.gemini['7d'].totalTokens, 0);
  assert.deepEqual(snapshotFallback.views.gemini['7d'].models, []);
  assert.equal(snapshotFallback.views.antigravity['7d'].models.find(row => row.model === 'gemini-4-neon-high').remaining, 0.24);
  assert.ok(!JSON.stringify(snapshotFallback).includes('SECRET_PROMPT_SHOULD_NOT_APPEAR'));

  // Now add direct Materia Gemini API usage + Gemini CLI log and verify strict separation
  await recordApiUsage(profileDir, {
    timestamp: NOW - 300_000,
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    inputTokens: 600,
    outputTokens: 150,
    cachedTokens: 0,
    totalTokens: 750,
  });
  await recordApiUsage(profileDir, {
    timestamp: NOW - 300_000,
    provider: 'antigravity',
    model: 'gemini-4-neon-high',
    totalTokens: 11000,
  });
  await writeFile(
    path.join(geminiTmpDir, 'proj', 'chats', 'session-1.json'),
    JSON.stringify({
      messages: [
        { model: 'gemini-2.5-flash', timestamp: new Date(NOW - 200_000).toISOString(), tokens: { input: 300, output: 100, cached: 50, thoughts: 50, total: 450 } },
      ],
    }),
    'utf8'
  );

  const snapshotDirect = await collectAiUsageSnapshot({
    now: NOW,
    codexSessionsDir: codexDir,
    antigravityBrainDirs: [brainDir],
    geminiTmpDir,
    profileDir,
    inspectAntigravityFn: async () => { throw new Error('offline'); },
  });

  assert.equal(snapshotDirect.engines.gemini.online, true);
  assert.equal(snapshotDirect.views.gemini['7d'].totalTokens, 1200);
  assert.equal(snapshotDirect.views.all['7d'].totalTokens, 18000 + 1200);
  assert.equal(snapshotDirect.engines.antigravity.liveQuotaAvailable, false);
});

test('formatTokenCount and formatCountdown render compact telemetry strings', () => {
  assert.equal(formatTokenCount(0), '0');
  assert.equal(formatTokenCount(842), '842');
  assert.equal(formatTokenCount(1420000), '1.42M');
  assert.equal(formatCountdown(null, NOW), '—');
  assert.equal(formatCountdown(NOW - 1000, NOW), '已重置');
  assert.equal(formatCountdown(NOW + 46 * 60_000, NOW), '46m');
  assert.equal(formatCountdown(NOW + (2 * 60 + 18) * 60_000, NOW), '2h 18m');
});

test('parseAntigravityTranscripts ignores malformed lines cleanly', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'materia-ag-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'abc', '.system_generated', 'logs'), { recursive: true });
  await writeFile(
    path.join(dir, 'abc', '.system_generated', 'logs', 'transcript.jsonl'),
    `not-json\n{"type":"PLANNER_RESPONSE","model":"gemini-3.8-flash","input_tokens":500,"output_tokens":50,"created_at":"${new Date(NOW).toISOString()}"}\n`,
    'utf8'
  );
  const res = await parseAntigravityTranscripts([dir], { now: NOW });
  assert.equal(res.filesScanned, 1);
  assert.equal(res.events.length, 1);
  assert.equal(res.events[0].totalTokens, 550);
});

test('ui-motion helpers degrade safely in non-DOM environments and honor duration/abort', async () => {
  assert.equal(prefersReducedMotion(), false);
  const el = { textContent: '' };
  const stop = animateNumber(el, 100, 1420000, formatTokenCount, { duration: 0 });
  assert.equal(el.textContent, '1.42M');
  assert.equal(typeof stop, 'function');
  stop();

  assert.equal(setBrandOrbitActivity('ai', true), true);
  assert.equal(setBrandOrbitActivity('sync', true), true);
  assert.equal(setBrandOrbitActivity('ai', false), true);
  assert.equal(setBrandOrbitActivity('sync', false), false);

  const markup = activityHTML({ version: 1, days: { '2026-11-25': 3 }, seen: [], fingerprints: [] }, 2026, { animateWave: true });
  assert.match(markup, /activity-calendar activity-wave/);
  assert.match(markup, /style="--col:\d+"/);

  assert.equal(normalizeThemeTransition('curtain'), 'curtain');
  assert.equal(normalizeThemeTransition('unknown'), 'iris');
  assert.equal(normalizeThemeTransition('off'), 'off');

  let applied = false;
  await runThemeTransition('shutter', () => { applied = true; });
  assert.equal(applied, true);

  const telescope = createGraphTelescope(null);
  telescope.update({ busy: true, progress: { completed: 1, total: 2 } });
  telescope.update({ busy: false });
  telescope.dispose();
});

test('normalizeCodexQuota parses camelCase codex app-server account/rateLimits/read payloads and strips identity', () => {
  const resetsPrimary = Math.floor((NOW + 90 * 60_000) / 1000);
  const resetsWeekly = Math.floor((NOW + 3 * 86_400_000) / 1000);
  const quota = normalizeCodexQuota({
    accountId: '0879fd5d-2f9d-4fe4-ba15-407e1c62590e',
    rateLimits: {
      limitId: 'codex',
      primary: { usedPercent: 64, windowDurationMins: 300, resetsAt: resetsPrimary },
      secondary: { usedPercent: 84, windowDurationMins: 10080, resetsAt: resetsWeekly },
      planType: 'plus',
    },
  }, NOW);

  assert.equal(quota.planType, 'plus');
  assert.ok(Math.abs(quota.primary.remaining - 0.36) < 1e-6);
  assert.equal(quota.primary.resetAt, resetsPrimary * 1000);
  assert.equal(quota.primary.windowMinutes, 300);
  assert.ok(Math.abs(quota.secondary.remaining - 0.16) < 1e-6);
  assert.equal(quota.secondary.resetAt, resetsWeekly * 1000);
  assert.equal(quota.secondary.windowMinutes, 10080);
  assert.ok(!JSON.stringify(quota).includes('0879fd5d'));
});

test('collectAiUsageSnapshot prefers live Codex quota over stale JSONL limits and exposes dual 5h/7d windows', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'materia-codex-live-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sessions = path.join(root, 'sessions', '2026', '11', '20');
  await mkdir(sessions, { recursive: true });
  await writeFile(path.join(sessions, 'rollout-old.jsonl'), [
    JSON.stringify({ timestamp: new Date(NOW - 3 * 86_400_000).toISOString(), type: 'turn_context', payload: { model: 'gpt-6.2-sol' } }),
    JSON.stringify({
      timestamp: new Date(NOW - 3 * 86_400_000).toISOString(),
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: { total_token_usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 } },
        rate_limits: {
          limit_id: 'codex',
          primary: { used_percent: 10, window_minutes: 300, resets_at: Math.floor((NOW - 86_400_000) / 1000) },
          secondary: { used_percent: 20, window_minutes: 10080, resets_at: Math.floor((NOW + 86_400_000) / 1000) },
        },
      },
    }),
  ].join('\n'), 'utf8');

  const liveQuota = normalizeCodexQuota({
    rateLimits: {
      limitId: 'codex',
      primary: { usedPercent: 64, windowDurationMins: 300, resetsAt: Math.floor((NOW + 3600_000) / 1000) },
      secondary: { usedPercent: 84, windowDurationMins: 10080, resetsAt: Math.floor((NOW + 2 * 86_400_000) / 1000) },
      planType: 'plus',
    },
  }, NOW);

  const snapshot = await collectAiUsageSnapshot({
    now: NOW,
    codexHome: root,
    antigravityBrainDirs: [],
    geminiTmpDir: '',
    inspectAntigravityFn: async () => ({ ok: false }),
    inspectCodexFn: async () => ({ ok: true, quota: liveQuota }),
  });

  assert.equal(snapshot.engines.codex.online, true);
  assert.equal(snapshot.engines.codex.liveQuotaAvailable, true);
  assert.equal(snapshot.engines.codex.planType, 'plus');
  assert.equal(snapshot.views.codex['24h'].totalTokens, 0);
  const model24h = snapshot.views.codex['24h'].models[0];
  assert.equal(model24h.model, 'gpt-6.2-sol');
  assert.equal(model24h.planType, 'plus');
  assert.ok(Math.abs(model24h.remaining - 0.16) < 1e-6);
  assert.equal(model24h.quotaWindows.length, 2);
  assert.equal(model24h.quotaWindows[0].label, '5h');
  assert.equal(model24h.quotaWindows[1].label, '7d');
  assert.ok(Math.abs(model24h.quotaWindows[0].remaining - 0.36) < 1e-6);
  assert.ok(Math.abs(model24h.quotaWindows[1].remaining - 0.16) < 1e-6);
});
