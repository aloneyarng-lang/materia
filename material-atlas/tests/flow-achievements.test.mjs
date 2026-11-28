import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACHIEVEMENTS,
  achievementTier,
  companionDisplayName,
} from '../dist/flow-achievements.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('achievementTier separates legendary, milestone, and daily tiers', () => {
  assert.equal(achievementTier({ id: 'r2-master', category: 'lab' }), 'legendary');
  assert.equal(achievementTier({ id: 'hundred-papers', category: 'reading' }), 'legendary');
  assert.equal(achievementTier({ id: 'streak-7', category: 'chrono' }), 'legendary');
  assert.equal(achievementTier({ id: 'orbit-reversal-20', category: 'flow' }), 'legendary');
  assert.equal(achievementTier({ id: 'first-deep-read', category: 'reading' }), 'milestone');
  assert.equal(achievementTier({ id: 'reimu-prayer', category: 'chrono' }), 'milestone');
  assert.equal(achievementTier({ id: 'daily-deep-read', category: 'daily' }), 'daily');
  assert.equal(ACHIEVEMENTS.some(a => a.id === 'r2-master'), true);
});

test('companionDisplayName resolves built-in companion names with fallback', () => {
  assert.equal(companionDisplayName('makise-kurisu'), '牧濑红莉栖');
  assert.equal(companionDisplayName('chainsawman-reze'), '蕾塞');
  assert.equal(companionDisplayName('genshin-ganyu'), '甘雨');
  assert.equal(companionDisplayName('other'), '心流伴侣');
});

test('Flow Achievements popup keeps Top-Layer popover, burst FX, chimes and reduced-motion rules', () => {
  const js = fs.readFileSync(path.join(ROOT, 'dist/flow-achievements.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'dist/flow-achievements.css'), 'utf8');

  assert.match(js, /setAttribute\('popover', 'manual'\)/);
  assert.match(js, /showPopover/);
  assert.match(js, /playAchievementChime/);
  assert.match(js, /sparkBurstHTML/);
  assert.match(js, /medalRingSVG/);
  assert.match(js, /data-flow="preview-toast"/);
  assert.match(js, /data-ach-replay=/);

  assert.match(css, /\[data-tier="legendary"\]/);
  assert.match(css, /\.ach-foil-sweep/);
  assert.match(css, /\.ach-spark/);
  assert.match(css, /\.ach-pulse-ring/);
  assert.match(css, /\.ach-toast-timer/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test('Hidden easter egg achievements exist and render masked secret cards when locked', () => {
  const secretIds = ['worldline-observer', 'singularity-weaver', 'solar-flare-conductor'];
  for (const id of secretIds) {
    const entry = ACHIEVEMENTS.find(a => a.id === id);
    assert.ok(entry, `Missing secret achievement ${id}`);
    assert.equal(entry.hidden, true);
  }
  assert.equal(achievementTier({ id: 'worldline-observer', category: 'flow' }), 'legendary');
  assert.equal(achievementTier({ id: 'singularity-weaver', category: 'reading' }), 'legendary');
  assert.equal(achievementTier({ id: 'solar-flare-conductor', category: 'reading' }), 'milestone');

  const js = fs.readFileSync(path.join(ROOT, 'dist/flow-achievements.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'dist/flow-achievements.css'), 'utf8');
  assert.match(js, /data-secret="true"/);
  assert.match(js, /\?\?\? · 隐藏彩蛋/);
  assert.match(css, /\.flow-ach-card\[data-secret="true"\]/);
});
