import { spawn } from 'node:child_process';
import { appendFile, mkdir, readdir, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import zlib from 'node:zlib';
import { inspectAntigravity } from './agent-antigravity.mjs';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MAX_DAYS = 35;

const clamp01 = value => Math.max(0, Math.min(1, value));
const num = value => (Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0);

function parseTimeMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function startOfLocalDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatMonthDay(ms) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatHourMinute(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:00`;
}

function normalizeModelKey(id) {
  return String(id || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

async function collectRecentFiles(rootDir, matcher, { cutoffMs, maxFiles = 250 }) {
  const hits = [];
  async function walk(dir, depth) {
    if (depth > 5) return;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
      } else if (entry.isFile() && matcher(entry.name, full)) {
        try {
          const info = await stat(full);
          if (info.mtimeMs >= cutoffMs) hits.push({ path: full, mtimeMs: info.mtimeMs });
        } catch {}
      }
    }
  }
  await walk(rootDir, 0);
  hits.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return hits.slice(0, maxFiles);
}

/**
 * Append a sanitized local API usage record for Materia's direct provider calls.
 * Never persists prompts, API keys, URLs, or account identifiers.
 */
export async function recordApiUsage(profileDir, entry = {}) {
  if (!profileDir || !entry) return;
  const inputTokens = num(entry.inputTokens);
  const outputTokens = num(entry.outputTokens);
  const cachedTokens = num(entry.cachedTokens);
  const totalTokens = num(entry.totalTokens) || (inputTokens + outputTokens);
  if (totalTokens <= 0 && inputTokens <= 0 && outputTokens <= 0) return;
  const row = {
    timestamp: parseTimeMs(entry.timestamp) || Date.now(),
    provider: String(entry.provider || 'api').slice(0, 60),
    model: String(entry.model || 'unknown').slice(0, 120),
    inputTokens,
    outputTokens,
    cachedTokens,
    totalTokens,
  };
  await mkdir(profileDir, { recursive: true });
  await appendFile(path.join(profileDir, 'ai-usage-log.jsonl'), JSON.stringify(row) + '\n', 'utf8');
}

function normalizeRateWindow(win, now) {
  if (!win || typeof win !== 'object') return null;
  const usedPercent = typeof win.used_percent === 'number' ? win.used_percent : Number(win.usedPercent);
  if (!Number.isFinite(usedPercent)) return null;
  const resetAtRaw = parseTimeMs(win.resets_at ?? win.resetsAt ?? win.resetAt);
  const rawMinutes = win.window_minutes ?? win.windowDurationMins ?? win.windowMinutes;
  const windowMinutes = Number.isFinite(Number(rawMinutes)) ? Number(rawMinutes) : null;
  if (resetAtRaw !== null && resetAtRaw <= now) {
    return { remaining: 1, resetAt: null, expired: true, windowMinutes };
  }
  return {
    remaining: clamp01(1 - usedPercent / 100),
    resetAt: resetAtRaw,
    expired: false,
    windowMinutes,
  };
}

/**
 * Normalize Codex rate-limit snapshots from either `codex app-server`
 * (`account/rateLimits/read`) or local session JSONL `token_count.rate_limits`.
 */
export function normalizeCodexQuota(raw, now = Date.now()) {
  const source = raw?.rateLimitsByLimitId?.codex || raw?.rateLimits || raw;
  if (!source || typeof source !== 'object') return null;
  const primary = normalizeRateWindow(source.primary, now);
  const secondary = normalizeRateWindow(source.secondary, now);
  if (!primary && !secondary) return null;
  const rawPlan = source.planType ?? source.plan_type;
  const planType = typeof rawPlan === 'string' && rawPlan.trim() ? rawPlan.trim() : null;
  return { planType, primary, secondary };
}

async function fileMtimeIfExists(filePath) {
  if (!filePath) return null;
  try {
    const info = await stat(filePath);
    return info.isFile() ? info.mtimeMs : null;
  } catch {
    return null;
  }
}

export async function findCodexExecutable({
  homeDir = os.homedir(),
  localAppData = process.env.LOCALAPPDATA,
  env = process.env,
} = {}) {
  for (const explicit of [env?.MATERIA_CODEX_PATH, env?.CODEX_CLI_PATH]) {
    if (explicit && (await fileMtimeIfExists(explicit)) !== null) return explicit;
  }

  const isWin = process.platform === 'win32';
  const exeName = isWin ? 'codex.exe' : 'codex';
  const candidates = [];

  if (isWin) {
    const desktopBinDir = path.join(localAppData || path.join(homeDir, 'AppData', 'Local'), 'OpenAI', 'Codex', 'bin');
    try {
      const entries = await readdir(desktopBinDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const full = path.join(desktopBinDir, entry.name, exeName);
        const mtimeMs = await fileMtimeIfExists(full);
        if (mtimeMs !== null) candidates.push({ path: full, mtimeMs });
      }
    } catch {}
  }

  for (const extRoot of ['.vscode/extensions', '.cursor/extensions', '.antigravity/extensions']) {
    const rootPath = path.join(homeDir, extRoot);
    let entries;
    try { entries = await readdir(rootPath, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('openai.chatgpt-')) continue;
      const binRoot = path.join(rootPath, entry.name, 'bin');
      const found = await collectRecentFiles(binRoot, name => name === exeName, { cutoffMs: 0, maxFiles: 8 });
      for (const hit of found) candidates.push(hit);
    }
  }

  if (candidates.length) {
    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return candidates[0].path;
  }

  for (const dir of String(env?.PATH || '').split(path.delimiter).filter(Boolean)) {
    const full = path.join(dir, exeName);
    if ((await fileMtimeIfExists(full)) !== null) return full;
  }

  if (process.platform === 'darwin') {
    for (const macPath of ['/Applications/Codex.app/Contents/Resources/codex', '/opt/homebrew/bin/codex', '/usr/local/bin/codex']) {
      if ((await fileMtimeIfExists(macPath)) !== null) return macPath;
    }
  }

  return null;
}

export async function inspectCodexLiveQuota({
  homeDir = os.homedir(),
  codexHome,
  codexExecutable,
  timeoutMs = 5000,
  now = Date.now(),
} = {}) {
  const effectiveCodexHome = codexHome || process.env.CODEX_HOME?.trim() || path.join(homeDir, '.codex');
  if ((await fileMtimeIfExists(path.join(effectiveCodexHome, 'auth.json'))) === null) {
    return { ok: false, quota: null };
  }

  const exe = codexExecutable || await findCodexExecutable({ homeDir });
  if (!exe) return { ok: false, quota: null };

  return await new Promise(resolve => {
    let settled = false;
    let child;
    let rl;
    let timer;

    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { rl?.close(); } catch {}
      try { child?.stdin?.end(); } catch {}
      try { child?.kill(); } catch {}
      resolve(result);
    };

    try {
      child = spawn(exe, ['app-server'], {
        stdio: ['pipe', 'pipe', 'ignore'],
        windowsHide: true,
        env: { ...process.env, CODEX_HOME: effectiveCodexHome },
      });
    } catch {
      finish({ ok: false, quota: null });
      return;
    }

    timer = setTimeout(() => finish({ ok: false, quota: null }), timeoutMs);
    child.stdin.on('error', () => {});
    child.once('error', () => finish({ ok: false, quota: null }));
    child.once('exit', () => finish({ ok: false, quota: null }));

    rl = createInterface({ input: child.stdout });
    rl.on('line', line => {
      if (!line) return;
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      if (msg.id === 1) {
        if (msg.error) {
          finish({ ok: false, quota: null });
          return;
        }
        try {
          child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} }) + '\n');
          child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'account/rateLimits/read', params: null }) + '\n');
        } catch {
          finish({ ok: false, quota: null });
        }
      } else if (msg.id === 2) {
        const quota = msg.error ? null : normalizeCodexQuota(msg.result, now);
        finish({ ok: Boolean(quota), quota });
      }
    });

    try {
      child.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { clientInfo: { name: 'materia', title: 'Materia', version: '3.1.0' } },
      }) + '\n');
    } catch {
      finish({ ok: false, quota: null });
    }
  });
}

/**
 * Parse Codex CLI local JSONL session logs under `~/.codex/sessions`.
 */
export async function parseCodexSessions(sessionsDir, { now = Date.now(), maxDays = MAX_DAYS, maxFiles = 250 } = {}) {
  const cutoffMs = now - maxDays * DAY_MS;
  const canReadZst = typeof zlib.zstdDecompressSync === 'function';
  const files = await collectRecentFiles(
    sessionsDir,
    name => name.endsWith('.jsonl') || (canReadZst && name.endsWith('.jsonl.zst')),
    { cutoffMs, maxFiles },
  );
  const events = [];
  let latestRateTs = -1;
  let latestRateLimits = null;
  let latestPlanType = null;
  let latestModel = '';
  let latestModelTs = -1;

  for (const file of files) {
    let raw;
    try {
      if (file.path.endsWith('.zst')) {
        raw = zlib.zstdDecompressSync(await readFile(file.path)).toString('utf8');
      } else {
        raw = await readFile(file.path, 'utf8');
      }
    } catch {
      continue;
    }
    let currentModel = 'gpt-codex';
    let prevTotal = { input: 0, cached: 0, output: 0, total: 0 };
    const fallbackEvents = [];
    const responseIds = new Set();
    const before = events.length;

    for (const line of raw.split(/\r?\n/)) {
      if (!line) continue;
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }

      const ts = parseTimeMs(entry.timestamp) ?? file.mtimeMs;
      if (entry.type === 'turn_context' && typeof entry.payload?.model === 'string' && entry.payload.model.trim()) {
        currentModel = entry.payload.model.trim();
        if (ts >= latestModelTs) {
          latestModel = currentModel;
          latestModelTs = ts;
        }
        continue;
      }

      if (entry.type === 'token_usage_record' || entry.payload?.type === 'token_usage_record') {
        const { usage, response_id: responseId } = entry.payload ?? {};
        if (!usage || (responseId && responseIds.has(responseId))) continue;
        if (responseId) responseIds.add(responseId);
        const inputTokens = num(usage.input_tokens);
        const cachedTokens = num(usage.cached_input_tokens);
        const outputTokens = num(usage.output_tokens);
        const totalTokens = num(usage.total_tokens) || inputTokens + outputTokens;
        if (totalTokens > 0) fallbackEvents.push({
          engine: 'codex', model: currentModel, timestamp: ts,
          inputTokens, cachedTokens, outputTokens, totalTokens,
        });
        continue;
      }

      if (entry.type !== 'event_msg' || entry.payload?.type !== 'token_count') continue;
      const rates = entry.payload.rate_limits;
      if (rates && (!rates.limit_id || rates.limit_id === 'codex') &&
          (normalizeRateWindow(rates.primary, now) || normalizeRateWindow(rates.secondary, now))) {
        if (typeof rates.plan_type === 'string' && rates.plan_type.trim()) {
          latestPlanType = rates.plan_type.trim();
        }
        if (ts >= latestRateTs) {
          latestRateTs = ts;
          latestRateLimits = rates;
        }
      }

      const info = entry.payload.info;
      if (!info) continue;

      let inputTokens = 0;
      let cachedTokens = 0;
      let outputTokens = 0;
      let totalTokens = 0;

      if (info.total_token_usage && typeof info.total_token_usage === 'object') {
        const u = info.total_token_usage;
        const currInput = num(u.input_tokens);
        const currCached = num(u.cached_input_tokens);
        const currOutput = num(u.output_tokens);
        const currTotal = num(u.total_tokens) || (currInput + currOutput);

        inputTokens = Math.max(0, currInput - prevTotal.input);
        cachedTokens = Math.max(0, currCached - prevTotal.cached);
        outputTokens = Math.max(0, currOutput - prevTotal.output);
        totalTokens = Math.max(0, currTotal - prevTotal.total);

        prevTotal = {
          input: Math.max(prevTotal.input, currInput),
          cached: Math.max(prevTotal.cached, currCached),
          output: Math.max(prevTotal.output, currOutput),
          total: Math.max(prevTotal.total, currTotal),
        };
      } else if (info.last_token_usage && typeof info.last_token_usage === 'object') {
        const u = info.last_token_usage;
        inputTokens = num(u.input_tokens);
        cachedTokens = num(u.cached_input_tokens);
        outputTokens = num(u.output_tokens);
        totalTokens = num(u.total_tokens) || (inputTokens + outputTokens);
      }

      if (totalTokens > 0 || inputTokens > 0 || outputTokens > 0) {
        events.push({
          engine: 'codex',
          model: currentModel,
          timestamp: ts,
          inputTokens,
          cachedTokens,
          outputTokens,
          totalTokens: totalTokens || (inputTokens + outputTokens),
        });
      }
    }
    // Desktop rollouts may carry both representations of the same tokens.
    if (events.length === before) events.push(...fallbackEvents);
  }

  const quota = normalizeCodexQuota(
    latestRateLimits ? { ...latestRateLimits, plan_type: latestRateLimits.plan_type || latestPlanType } : null,
    now,
  );

  return {
    filesScanned: files.length,
    events,
    quota,
    latestModel: latestModel || null,
  };
}

/**
 * Parse Antigravity desktop & CLI conversation transcript JSONL logs.
 */
export async function parseAntigravityTranscripts(brainDirs, { now = Date.now(), maxDays = MAX_DAYS, maxFiles = 300 } = {}) {
  const cutoffMs = now - maxDays * DAY_MS;
  const candidates = [];

  for (const brainDir of brainDirs) {
    let entries;
    try { entries = await readdir(brainDir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const file = path.join(brainDir, entry.name, '.system_generated', 'logs', 'transcript.jsonl');
      try {
        const info = await stat(file);
        if (info.isFile() && info.mtimeMs >= cutoffMs) {
          candidates.push({ path: file, mtimeMs: info.mtimeMs });
        }
      } catch {}
    }
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const selected = candidates.slice(0, maxFiles);
  const events = [];

  for (const file of selected) {
    let raw;
    try { raw = await readFile(file.path, 'utf8'); } catch { continue; }
    for (const line of raw.split(/\r?\n/)) {
      if (!line || (!line.includes('input_tokens') && !line.includes('output_tokens'))) continue;
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      if (typeof entry.input_tokens !== 'number' && typeof entry.output_tokens !== 'number') continue;

      const inputTokens = num(entry.input_tokens);
      const cachedTokens = num(entry.cache_read_tokens);
      const outputTokens = num(entry.output_tokens);
      const effectiveInput = cachedTokens > inputTokens ? cachedTokens : inputTokens;
      const totalTokens = effectiveInput + outputTokens;
      if (totalTokens <= 0) continue;

      const ts = parseTimeMs(entry.created_at || entry.timestamp) || file.mtimeMs;
      events.push({
        engine: 'antigravity',
        model: String(entry.model || 'antigravity-model').trim(),
        timestamp: ts,
        inputTokens: effectiveInput,
        cachedTokens,
        outputTokens,
        totalTokens,
      });
    }
  }

  return { filesScanned: selected.length, events };
}

/**
 * Parse Gemini CLI session JSON logs (`~/.gemini/tmp/.../session-*.json`)
 * and Materia's direct API usage log (`ai-usage-log.jsonl`).
 */
export async function parseGeminiLocalUsage({ geminiTmpDir, apiLogFile, now = Date.now(), maxDays = MAX_DAYS } = {}) {
  const cutoffMs = now - maxDays * DAY_MS;
  const events = [];
  let cliFilesScanned = 0;

  if (geminiTmpDir) {
    const files = await collectRecentFiles(geminiTmpDir, name => name.endsWith('.json'), { cutoffMs, maxFiles: 200 });
    cliFilesScanned = files.length;
    for (const file of files) {
      let data;
      try { data = JSON.parse(await readFile(file.path, 'utf8')); } catch { continue; }
      const messages = Array.isArray(data?.messages) ? data.messages : Array.isArray(data) ? data : [];
      for (const msg of messages) {
        const tokens = msg?.tokens;
        if (!tokens || typeof tokens !== 'object') continue;
        const inputTokens = num(tokens.input);
        const cachedTokens = num(tokens.cached);
        const outputTokens = num(tokens.output) + num(tokens.thoughts);
        const totalTokens = num(tokens.total) || (inputTokens + outputTokens);
        if (totalTokens <= 0) continue;
        events.push({
          engine: 'gemini',
          model: String(msg.model || data?.model || 'gemini-cli').trim(),
          timestamp: parseTimeMs(msg.timestamp) || file.mtimeMs,
          inputTokens,
          cachedTokens,
          outputTokens,
          totalTokens,
        });
      }
    }
  }

  let apiLogCount = 0;
  if (apiLogFile) {
    let raw = '';
    try { raw = await readFile(apiLogFile, 'utf8'); } catch {}
    for (const line of raw.split(/\r?\n/)) {
      if (!line) continue;
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      const ts = parseTimeMs(row.timestamp);
      if (!ts || ts < cutoffMs) continue;
      const model = String(row.model || 'gemini-api').trim();
      const provider = String(row.provider || '').toLowerCase();
      if (['antigravity', 'local-gemini'].includes(provider)) continue;
      if (provider !== 'gemini' && !/^gemini/i.test(model)) continue;
      const inputTokens = num(row.inputTokens);
      const cachedTokens = num(row.cachedTokens);
      const outputTokens = num(row.outputTokens);
      const totalTokens = num(row.totalTokens) || (inputTokens + outputTokens);
      if (totalTokens <= 0) continue;
      apiLogCount++;
      events.push({
        engine: 'gemini',
        model,
        timestamp: ts,
        inputTokens,
        cachedTokens,
        outputTokens,
        totalTokens,
      });
    }
  }

  return { cliFilesScanned, apiLogCount, events };
}

function buildRangeSpec(range, now) {
  if (range === '24h') {
    const stepMs = 2 * HOUR_MS;
    const startMs = now - DAY_MS;
    const buckets = Array.from({ length: 12 }, (_, i) => {
      const from = startMs + i * stepMs;
      return {
        key: `${range}-${i}`,
        label: i === 11 ? '现在' : formatHourMinute(from),
        from,
        to: from + stepMs,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        totalTokens: 0,
        isCurrent: i === 11,
      };
    });
    return { startMs, days: 1, buckets, stepMs };
  }

  if (range === '7d') {
    const todayStart = startOfLocalDay(now);
    const startMs = todayStart - 6 * DAY_MS;
    const buckets = Array.from({ length: 7 }, (_, i) => {
      const from = startMs + i * DAY_MS;
      return {
        key: `${range}-${i}`,
        label: i === 6 ? '今天' : formatMonthDay(from),
        from,
        to: from + DAY_MS,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        totalTokens: 0,
        isCurrent: i === 6,
      };
    });
    return { startMs, days: 7, buckets, stepMs: DAY_MS };
  }

  // 30d -> 15 clean 2-day bars so bars stay legible while matching the 30d sum identically.
  const todayStart = startOfLocalDay(now);
  const startMs = todayStart - 29 * DAY_MS;
  const stepMs = 2 * DAY_MS;
  const buckets = Array.from({ length: 15 }, (_, i) => {
    const from = startMs + i * stepMs;
    return {
      key: `${range}-${i}`,
      label: i === 14 ? '今天' : formatMonthDay(from),
      from,
      to: from + stepMs,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      totalTokens: 0,
      isCurrent: i === 14,
    };
  });
  return { startMs, days: 30, buckets, stepMs };
}

function buildView(events, { scope, range, now, codexQuota, codexLatestModel, antigravityLiveModels }) {
  const spec = buildRangeSpec(range, now);
  let totalTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;
  const modelTotals = new Map();

  for (const event of events) {
    if (event.timestamp < spec.startMs || event.timestamp > now) continue;
    totalTokens += event.totalTokens;
    inputTokens += event.inputTokens;
    outputTokens += event.outputTokens;
    cachedTokens += event.cachedTokens;

    const bucketIndex = Math.min(
      spec.buckets.length - 1,
      Math.max(0, Math.floor((event.timestamp - spec.startMs) / spec.stepMs))
    );
    const bucket = spec.buckets[bucketIndex];
    bucket.totalTokens += event.totalTokens;
    bucket.inputTokens += event.inputTokens;
    bucket.outputTokens += event.outputTokens;
    bucket.cachedTokens += event.cachedTokens;

    const modelKey = `${event.engine}:${normalizeModelKey(event.model)}`;
    const existing = modelTotals.get(modelKey) || {
      engine: event.engine,
      model: event.model,
      displayName: event.model,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      totalTokens: 0,
    };
    existing.inputTokens += event.inputTokens;
    existing.outputTokens += event.outputTokens;
    existing.cachedTokens += event.cachedTokens;
    existing.totalTokens += event.totalTokens;
    modelTotals.set(modelKey, existing);
  }

  // Merge live quota metadata onto models (and surface live-quota models even at 0 tokens in the active window).
  const liveByKey = new Map();
  for (const row of antigravityLiveModels || []) {
    liveByKey.set(normalizeModelKey(row.id), row);
    liveByKey.set(normalizeModelKey(row.name), row);
  }

  if (scope === 'all' || scope === 'antigravity') {
    for (const row of antigravityLiveModels || []) {
      const byId = modelTotals.get(`antigravity:${normalizeModelKey(row.id)}`);
      const byName = modelTotals.get(`antigravity:${normalizeModelKey(row.name)}`);
      const matched = byId || byName;

      if (matched) {
        matched.displayName = row.name || matched.model;
        matched.remaining = row.remaining;
        matched.resetAt = parseTimeMs(row.resetTime);
        matched.windowLabel = '客户端配额';
      } else {
        modelTotals.set(`antigravity:${normalizeModelKey(row.id)}`, {
          engine: 'antigravity',
          model: row.id,
          displayName: row.name || row.id,
          remaining: row.remaining,
          resetAt: parseTimeMs(row.resetTime),
          windowLabel: '客户端配额',
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          totalTokens: 0,
        });
      }
    }
  }

  // Attach Codex primary/secondary quota window info to Codex models.
  if (codexQuota && (scope === 'all' || scope === 'codex')) {
    const codexRows = [...modelTotals.values()].filter(row => row.engine === 'codex');
    if (!codexRows.length) {
      const seeded = {
        engine: 'codex',
        model: codexLatestModel || 'Codex',
        displayName: codexLatestModel || 'Codex',
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        totalTokens: 0,
      };
      modelTotals.set(`codex:${normalizeModelKey(seeded.model)}`, seeded);
      codexRows.push(seeded);
    }
    const primary = codexQuota.primary;
    const secondary = codexQuota.secondary;
    const quotaWindows = [];
    if (primary) {
      quotaWindows.push({
        id: '5h',
        label: `${Math.round((primary.windowMinutes || 300) / 60)}h`,
        remaining: primary.remaining,
        resetAt: primary.resetAt,
        expired: Boolean(primary.expired),
      });
    }
    if (secondary) {
      const mins = secondary.windowMinutes || 10080;
      quotaWindows.push({
        id: '7d',
        label: mins >= 10000 ? '7d' : `${Math.round(mins / 60)}h`,
        remaining: secondary.remaining,
        resetAt: secondary.resetAt,
        expired: Boolean(secondary.expired),
      });
    }
    const activeWindows = quotaWindows.filter(w => !w.expired);
    const effectiveRemaining = activeWindows.length
      ? Math.min(...activeWindows.map(w => w.remaining))
      : (quotaWindows[0]?.remaining ?? null);
    const effectiveResetAt = (primary && !primary.expired ? primary.resetAt : null)
      ?? (secondary && !secondary.expired ? secondary.resetAt : null)
      ?? null;
    const windowLabel = quotaWindows.map(w => `${w.label} ${Math.round(w.remaining * 100)}%`).join(' · ') || '本地窗口';

    for (const row of codexRows) {
      row.remaining = effectiveRemaining;
      row.resetAt = effectiveResetAt;
      row.quotaWindows = quotaWindows;
      row.planType = codexQuota.planType || null;
      row.windowLabel = windowLabel;
    }
  }

  for (const row of modelTotals.values()) {
    if (row.remaining === undefined) row.remaining = null;
    if (row.resetAt === undefined) row.resetAt = null;
    if (!row.windowLabel && row.engine === 'antigravity') {
      const live = liveByKey.get(normalizeModelKey(row.model));
      if (live) {
        row.displayName = live.name || row.model;
        row.remaining = live.remaining;
        row.resetAt = parseTimeMs(live.resetTime);
        row.windowLabel = '客户端配额';
      } else {
        row.windowLabel = '本地会话日志';
      }
    } else if (!row.windowLabel && row.engine === 'gemini') {
      row.windowLabel = '本地日志 / API';
    }
    row.engineLabel = row.engine === 'codex' ? 'Codex' : row.engine === 'antigravity' ? 'Antigravity' : 'Gemini';
  }

  const models = [...modelTotals.values()].sort((a, b) => {
    if (b.totalTokens !== a.totalTokens) return b.totalTokens - a.totalTokens;
    const ra = a.remaining ?? 2;
    const rb = b.remaining ?? 2;
    return ra - rb;
  });

  return {
    totalTokens,
    inputTokens,
    outputTokens,
    cachedTokens,
    avgPerDay: Math.round(totalTokens / spec.days),
    series: spec.buckets.map(({ key, label, inputTokens: i, outputTokens: o, cachedTokens: c, totalTokens: t, isCurrent }) => ({
      key, label, inputTokens: i, outputTokens: o, cachedTokens: c, totalTokens: t, isCurrent,
    })),
    models,
  };
}

/**
 * Collect and aggregate local Codex, Antigravity, and Gemini token usage & quota telemetry.
 */
export async function collectAiUsageSnapshot(options = {}) {
  const startedAt = Date.now();
  const now = options.now ?? startedAt;
  const homeDir = options.homeDir || os.homedir();
  const codexHome = options.codexHome || process.env.CODEX_HOME?.trim();
  const codexSessionsDir = options.codexSessionsDir || path.join(codexHome || path.join(homeDir, '.codex'), 'sessions');
  const antigravityBrainDirs = options.antigravityBrainDirs || [
    path.join(homeDir, '.gemini', 'antigravity', 'brain'),
    path.join(homeDir, '.gemini', 'antigravity-cli', 'brain'),
  ];
  const geminiTmpDir = options.geminiTmpDir ?? path.join(homeDir, '.gemini', 'tmp');
  const apiLogFile = options.apiLogFile ?? (options.profileDir ? path.join(options.profileDir, 'ai-usage-log.jsonl') : '');
  const quotaTimeoutMs = options.quotaTimeoutMs ?? 4500;

  const inspectQuota = async () => {
    if (typeof options.inspectAntigravityFn === 'function') {
      return await options.inspectAntigravityFn();
    }
    const clientPath = options.agentConfig?.connection === 'antigravity' ? (options.agentConfig.clientPath || '') : '';
    return await inspectAntigravity({ connection: 'antigravity', clientPath }, {
      signal: AbortSignal.timeout(quotaTimeoutMs),
    });
  };

  const inspectCodex = async () => {
    if (typeof options.inspectCodexFn === 'function') {
      return await options.inspectCodexFn();
    }
    if (options.codexSessionsDir && !options.codexHome) {
      return { ok: false, quota: null };
    }
    return await inspectCodexLiveQuota({
      homeDir,
      codexHome,
      codexExecutable: options.codexExecutable,
      timeoutMs: Math.max(quotaTimeoutMs, 5000),
      now,
    });
  };

  const [codexData, antigravityData, geminiData, liveQuotaResult, codexLiveResult] = await Promise.all([
    parseCodexSessions(codexSessionsDir, { now }),
    parseAntigravityTranscripts(antigravityBrainDirs, { now }),
    parseGeminiLocalUsage({ geminiTmpDir, apiLogFile, now }),
    inspectQuota().catch(error => ({ ok: false, error: error?.message || '未连接' })),
    inspectCodex().catch(() => ({ ok: false, quota: null })),
  ]);

  const codexLiveQuota = Boolean(codexLiveResult?.ok && codexLiveResult.quota);
  const effectiveCodexQuota = codexLiveQuota ? codexLiveResult.quota : codexData.quota;
  if (effectiveCodexQuota && !effectiveCodexQuota.planType && codexData.quota?.planType) {
    effectiveCodexQuota.planType = codexData.quota.planType;
  }

  const antigravityLiveModels = Array.isArray(liveQuotaResult?.models) ? liveQuotaResult.models : [];
  const antigravityLiveQuota = Boolean(liveQuotaResult?.ok && antigravityLiveModels.some(m => typeof m.remaining === 'number'));

  const directGeminiEvents = geminiData.events;
  const allEvents = [...codexData.events, ...antigravityData.events, ...directGeminiEvents];

  const engineEvents = {
    all: allEvents,
    codex: codexData.events,
    antigravity: antigravityData.events,
    gemini: directGeminiEvents,
  };

  const views = {};
  for (const scope of ['all', 'codex', 'antigravity', 'gemini']) {
    views[scope] = {};
    for (const range of ['24h', '7d', '30d']) {
      views[scope][range] = buildView(engineEvents[scope], {
        scope,
        range,
        now,
        codexQuota: effectiveCodexQuota,
        codexLatestModel: codexData.latestModel,
        antigravityLiveModels,
      });
    }
  }

  const codexOnline = codexData.events.length > 0 || Boolean(effectiveCodexQuota);
  const antigravityOnline = antigravityData.events.length > 0 || Boolean(liveQuotaResult?.ok);
  const geminiOnline = directGeminiEvents.length > 0;

  const engines = {
    codex: {
      id: 'codex',
      label: 'Codex',
      online: codexOnline,
      liveQuotaAvailable: codexLiveQuota,
      planType: effectiveCodexQuota?.planType || null,
      quota: effectiveCodexQuota,
      sourceLabel: codexLiveQuota
        ? (codexData.events.length > 0 ? '实时配额 + 本地会话日志' : '客户端实时配额')
        : (codexOnline ? 'Codex 本地会话日志' : '未检测到本地会话'),
    },
    antigravity: {
      id: 'antigravity',
      label: 'Antigravity',
      online: antigravityOnline,
      liveQuotaAvailable: antigravityLiveQuota,
      sourceLabel: antigravityLiveQuota ? '客户端实时配额 + 本地转录' : antigravityOnline ? '本地转录日志' : '未检测到会话',
    },
    gemini: {
      id: 'gemini',
      label: 'Gemini',
      online: geminiOnline,
      sourceLabel: geminiOnline ? 'Gemini CLI / API 日志' : '暂无独立日志',
    },
  };

  return {
    ok: true,
    syncedAt: now,
    syncMs: Math.max(1, Date.now() - startedAt),
    activeEngines: [codexOnline, antigravityOnline, geminiOnline].filter(Boolean).length,
    engines,
    views,
  };
}
