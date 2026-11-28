import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_POMODORO_ANIMATION,
  POMODORO_ANIMATION_STYLES,
  POMODORO_ANIMATION_VALUES,
  buildPomodoroCalendar,
  getPomodoroAnimation,
  getPomodoroAuraEnabled,
  normalizePomodoroAnimation,
  previewPomodoroAnimation,
  setPomodoroAnimation,
  setPomodoroAuraEnabled,
} from '../dist/pomodoro.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function withMockStorage(fn) {
  const prev = globalThis.localStorage;
  const map = new Map();
  globalThis.localStorage = {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
  };
  try {
    return fn(map);
  } finally {
    if (prev === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = prev;
  }
}

test('pomodoro animation normalization and exported style constants', () => {
  assert.equal(DEFAULT_POMODORO_ANIMATION, 'shrine');
  assert.deepEqual(POMODORO_ANIMATION_STYLES, ['shrine', 'chronometer', 'eclipse', 'crystal']);
  assert.deepEqual(POMODORO_ANIMATION_VALUES, ['shrine', 'chronometer', 'eclipse', 'crystal', 'off']);
  assert.equal(normalizePomodoroAnimation('shrine'), 'shrine');
  assert.equal(normalizePomodoroAnimation('chronometer'), 'chronometer');
  assert.equal(normalizePomodoroAnimation('eclipse'), 'eclipse');
  assert.equal(normalizePomodoroAnimation('crystal'), 'crystal');
  assert.equal(normalizePomodoroAnimation('off'), 'off');
  assert.equal(normalizePomodoroAnimation('unknown'), 'shrine');
  assert.equal(normalizePomodoroAnimation(null), 'shrine');
});

test('pomodoro animation and aura preferences persist cleanly in storage', () => {
  withMockStorage(() => {
    assert.equal(getPomodoroAnimation(), 'shrine');
    assert.equal(getPomodoroAuraEnabled(), true);

    assert.equal(setPomodoroAnimation('chronometer'), 'chronometer');
    assert.equal(getPomodoroAnimation(), 'chronometer');

    assert.equal(setPomodoroAnimation('eclipse'), 'eclipse');
    assert.equal(getPomodoroAnimation(), 'eclipse');

    assert.equal(setPomodoroAnimation('crystal'), 'crystal');
    assert.equal(getPomodoroAnimation(), 'crystal');

    assert.equal(setPomodoroAnimation('off'), 'off');
    assert.equal(getPomodoroAnimation(), 'off');

    assert.equal(setPomodoroAnimation('bogus'), 'shrine');
    assert.equal(getPomodoroAnimation(), 'shrine');

    assert.equal(setPomodoroAuraEnabled(false), false);
    assert.equal(getPomodoroAuraEnabled(), false);
    assert.equal(setPomodoroAuraEnabled(true), true);
    assert.equal(getPomodoroAuraEnabled(), true);
  });
});

test('previewPomodoroAnimation returns false safely when off or without DOM', () => {
  assert.equal(previewPomodoroAnimation('off'), false);
  assert.equal(previewPomodoroAnimation('shrine'), false);
  assert.equal(previewPomodoroAnimation('chronometer'), false);
  assert.equal(previewPomodoroAnimation('eclipse'), false);
  assert.equal(previewPomodoroAnimation('crystal'), false);
});

test('buildPomodoroCalendar aggregates daily seconds, pomodoros and streak', () => {
  const now = Date.parse('2026-06-15T12:00:00Z');
  const days = {
    '2026-06-13': { seconds: 1800, pomodoros: 1, sessions: 1 },
    '2026-06-14': { seconds: 5400, pomodoros: 2, sessions: 2 },
    '2026-06-15': { seconds: 10800, pomodoros: 4, sessions: 3 },
  };
  const cal = buildPomodoroCalendar(days, 2026, now);
  assert.equal(cal.totalSeconds, 18000);
  assert.equal(cal.activeDays, 3);
  assert.equal(cal.totalPomodoros, 7);
  assert.equal(cal.streak, 3);
});

test('Settings wiring, Theme Hub consolidation, Top-Layer dialogs and reduced-motion safeguards stay intact', () => {
  const appJs = fs.readFileSync(path.join(ROOT, 'dist/app.js'), 'utf8');
  const pomoJs = fs.readFileSync(path.join(ROOT, 'dist/pomodoro.js'), 'utf8');
  const pomoLuxJs = fs.readFileSync(path.join(ROOT, 'dist/pomodoro-luxury.js'), 'utf8');
  const pomoCss = fs.readFileSync(path.join(ROOT, 'dist/pomodoro.css'), 'utf8');

  assert.match(appJs, /data-action="theme-hub"/);
  assert.match(appJs, /function themeHubModal/);
  assert.match(appJs, /data-pomodoro-card=/);
  assert.match(appJs, /id="pomodoro-animation"/);
  assert.match(appJs, /'chronometer','活版时漏'/);
  assert.match(appJs, /'eclipse','日蚀心流'/);
  assert.match(appJs, /'crystal','晶体退火'/);
  assert.match(appJs, /id="pomodoro-animation-preview"/);
  assert.match(appJs, /id="pomodoro-aura"/);
  assert.doesNotMatch(pomoJs, /pomodoro-theme-pills/);
  assert.doesNotMatch(pomoCss, /\.pomodoro-theme-pills/);
  assert.match(pomoJs, /createPomodoroLuxuryStage/);
  assert.match(pomoJs, /pomo-ceremony-content/);
  assert.match(pomoLuxJs, /#version 300 es/);
  for (const style of ['shrine', 'chronometer', 'eclipse', 'crystal']) {
    assert.match(pomoLuxJs, new RegExp(style));
  }
  assert.match(pomoLuxJs, /prefers-reduced-motion:\s*reduce/);
  assert.match(pomoCss, /\.pomo-luxury-layer/);
  assert.match(pomoCss, /\.has-luxury-stage/);
  assert.match(pomoJs, /id = 'pomodoro-aura-overlay'/);
  assert.match(pomoJs, /playChronoChime/);
  assert.match(pomoJs, /playEclipseChime/);
  assert.match(pomoJs, /playCrystalChime/);
  assert.match(pomoJs, /chronoZenDialSVG/);
  assert.match(pomoJs, /eclipseZenDialSVG/);
  assert.match(pomoJs, /crystalZenDialSVG/);
  assert.match(pomoJs, /pomodoroRibbonIconSVG/);
  assert.match(pomoJs, /pomodoroMiniDialSVG/);
  assert.match(pomoJs, /pomodoro-mini-stage/);
  assert.match(pomoJs, /showModal/);
  assert.match(pomoJs, /openTopDialog/);
  assert.match(pomoCss, /dialog\.pomodoro-ceremony/);
  assert.match(pomoCss, /dialog\.pomodoro-zen-stage/);
  assert.match(pomoCss, /dialog\.pomodoro-reimu-veil/);
  assert.match(pomoCss, /\[data-style="chronometer"\]/);
  assert.match(pomoCss, /\[data-style="eclipse"\]/);
  assert.match(pomoCss, /\[data-style="crystal"\]/);
  assert.match(pomoCss, /\.pomodoro-mini-stage/);
  assert.match(pomoCss, /\.pomodoro-icon-shrine/);
  assert.match(pomoCss, /prefers-reduced-motion:\s*reduce/);
});
