import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeBlackHoleDisplacement,
  computeOrbitSingularityPerturbation,
  hawkingReboundFactor,
  solarFlareSpeedMultiplier,
} from '../dist/black-hole-physics.js';
import { NIXIE_TARGET, matchesWorldlinePhrase } from '../dist/easter-eggs.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('matchesWorldlinePhrase matches exact Steins;Gate phrase with whitespace/case normalization', () => {
  assert.equal(NIXIE_TARGET, '1.048596');
  assert.equal(matchesWorldlinePhrase('el psy kongroo'), true);
  assert.equal(matchesWorldlinePhrase('  El   Psy  Kongroo  '), true);
  assert.equal(matchesWorldlinePhrase('EL PSY CONGROO'), true);
  assert.equal(matchesWorldlinePhrase('el psy'), false);
  assert.equal(matchesWorldlinePhrase('el psy kongroo extra'), false);
  assert.equal(matchesWorldlinePhrase('Ti6Al4V'), false);
});

test('computeBlackHoleDisplacement pulls and swirls nearby points without mutating inputs', () => {
  const input = Object.freeze({ x: 180, y: 120 });
  const bh = { x: 100, y: 120, horizon: 22, radius: 290, strength: 1, phase: 'pull' };
  const inside = computeBlackHoleDisplacement(input, bh);
  assert.ok(inside.dx < 0, 'point to the right of black hole pulls inward (-x)');
  assert.ok(inside.dy > 0, 'nearby point swirls tangentially around vortex');
  assert.ok(inside.pull > 0 && inside.pull < 1);
  assert.equal(input.x, 180);
  assert.equal(input.y, 120);

  const far = computeBlackHoleDisplacement({ x: 600, y: 120 }, bh);
  assert.deepEqual(far, { dx: 0, dy: 0, pull: 0 });

  const evaporating = computeBlackHoleDisplacement(input, { ...bh, phase: 'evaporating', peakStrength: 1, reboundFactor: -0.25 });
  assert.ok(evaporating.dx > 0, 'negative reboundFactor produces outward spring overshoot');
});

test('hawkingReboundFactor starts at 1, oscillates cleanly, and settles to 0', () => {
  assert.equal(hawkingReboundFactor(0), 1);
  assert.equal(hawkingReboundFactor(1), 0);
  assert.ok(hawkingReboundFactor(0.42) < 0, 'crosses zero into damped elastic overshoot');
  assert.ok(Math.abs(hawkingReboundFactor(0.85)) < 0.05);
});

test('computeOrbitSingularityPerturbation deflects and slightly slingshots nearby satellites', () => {
  const bh = { x: 500, y: 200, horizon: 16, radius: 260, strength: 1, phase: 'pull' };
  const near = computeOrbitSingularityPerturbation({ x: 560, y: 200 }, bh);
  assert.ok(near.dx < 0);
  assert.ok(near.dy !== 0);
  assert.ok(near.speedBoost > 0 && near.speedBoost <= 0.55);

  const outside = computeOrbitSingularityPerturbation({ x: 900, y: 200 }, bh);
  assert.deepEqual(outside, { dx: 0, dy: 0, speedBoost: 0 });
});

test('solarFlareSpeedMultiplier ramps smoothly to peak and decays cleanly back to 1', () => {
  assert.equal(solarFlareSpeedMultiplier(0), 1);
  assert.equal(solarFlareSpeedMultiplier(2600), 1);
  const peak = solarFlareSpeedMultiplier(160, 2600, 4.8);
  const mid = solarFlareSpeedMultiplier(900, 2600, 4.8);
  const late = solarFlareSpeedMultiplier(2100, 2600, 4.8);
  assert.ok(Math.abs(peak - 4.8) < 0.05);
  assert.ok(mid > late && late > 1);
});

test('HTML, StarMap, GraphOrbit, and CSS wire all interactive Easter eggs with reduced-motion guards', () => {
  const html = fs.readFileSync(path.join(ROOT, 'dist/index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(ROOT, 'dist/app.js'), 'utf8');
  const viewJs = fs.readFileSync(path.join(ROOT, 'dist/graph-view.js'), 'utf8');
  const orbitJs = fs.readFileSync(path.join(ROOT, 'dist/graph-orbit.js'), 'utf8');
  const graphCss = fs.readFileSync(path.join(ROOT, 'dist/graph.css'), 'utf8');
  const eggCss = fs.readFileSync(path.join(ROOT, 'dist/easter-eggs.css'), 'utf8');

  assert.match(html, /\.\/easter-eggs\.css/);
  assert.match(appJs, /initEasterEggs/);
  assert.match(viewJs, /summonBlackHole/);
  assert.match(viewJs, /computeBlackHoleDisplacement/);
  assert.match(viewJs, /bhChargeTimer/);
  assert.match(orbitJs, /summonSingularity/);
  assert.match(orbitJs, /triggerSolarFlare/);
  assert.match(orbitJs, /solarFlareSpeedMultiplier/);
  assert.match(graphCss, /\.graph-black-hole/);
  assert.match(graphCss, /\.graph-orbit-flare-wave/);
  assert.match(graphCss, /prefers-reduced-motion:\s*reduce/);
  assert.match(eggCss, /\.materia-nixie-meter/);
  assert.match(eggCss, /prefers-reduced-motion:\s*reduce/);
});
