import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {interpolateOrbitView, normalizeOrbitStyle, orbitEntryView, orbitPlane, orbitPlanetStyle, orbitViewAngles, orbitWakePath, orbitWarpStreaks, projectOrbit, rankOrbitPapers, reverseRandomSatellite, rotateOrbitView} from '../dist/graph-orbit.js';
import {ACHIEVEMENTS} from '../dist/flow-achievements.js';
import {GRAPH_DEFAULTS} from '../dist/graph-settings.js';

const center = {id: 'center', tags: ['Common A', 'Common B', 'Rare']};
const common = Array.from({length: 12}, (_, i) => ({
  id: 'common-' + String(i).padStart(2, '0'), tags: ['Common A', 'Common B'],
}));
const rare = {id: 'rare', tags: [' Ｒａｒｅ ', 'rare']};
const weak = {id: 'weak', tags: ['Common A', 'Unrelated']};
const papers = [center, ...common, weak, rare];
const ids = entries => entries.map(({paper}) => paper.id);

test('planet artwork is stable per paper and varies across a library', () => {
  const styles = Array.from({length: 48}, (_, i) => orbitPlanetStyle('paper-' + i));
  assert.deepEqual(orbitPlanetStyle('paper-10'), styles[10]);
  assert.equal(new Set(styles.map(style => style.form)).size, 4);
  assert.equal(new Set(styles.map(style => style.color)).size, 5);
});

test('each inclined orbit follows a great circle on its own sphere', () => {
  const plane = orbitPlane('center', 'nearby');
  assert.deepEqual(orbitPlane('center', 'nearby'), plane);
  assert.notEqual(orbitPlane('center', 'other').rotation, plane.rotation);
  const radius = 210;
  const positions = Array.from({length: 8}, (_, i) => projectOrbit(plane, radius, i * Math.PI / 4));
  for (const {x, y, z} of positions) assert.ok(Math.abs(Math.hypot(x, y, z) - radius) < 1e-8);
  assert.ok(positions[2].z > 0);
  assert.ok(positions[6].z < 0);
  for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(positions[2][axis] + positions[6][axis]) < 1e-8);
});

test('a successful one percent roll reverses just one satellite at its current phase', () => {
  const satellites = [{phase: 2, angularSpeed: .01}, {phase: 3, angularSpeed: .02}];
  assert.equal(reverseRandomSatellite(satellites, () => .01), null);
  const rolls = [.00999, .75];
  assert.equal(reverseRandomSatellite(satellites, () => rolls.shift()), satellites[1]);
  assert.deepEqual(satellites, [{phase: 2, angularSpeed: .01}, {phase: 3, angularSpeed: -.02}]);
  assert.deepEqual(ACHIEVEMENTS.filter(item => item.metric === 'orbitReversals').map(item => item.target), [1, 5, 10, 20]);
});

test('changing the view rotates the orbit axes and preserves their lengths and angle', () => {
  const {u, v} = orbitPlane('center', 'nearby');
  const [turnedU, turnedV] = rotateOrbitView([u, v], .9, -.6);
  assert.notEqual(turnedU.z, u.z);
  for (const axis of [turnedU, turnedV]) assert.ok(Math.abs(Math.hypot(axis.x, axis.y, axis.z) - 1) < 1e-10);
  assert.ok(Math.abs(turnedU.x * turnedV.x + turnedU.y * turnedV.y + turnedU.z * turnedV.z) < 1e-10);
});

test('rare shared tags outrank more numerous common shared tags with six entries by default', () => {
  const entries = rankOrbitPapers(center, papers, GRAPH_DEFAULTS);
  assert.equal(entries.length, 6);
  assert.deepEqual(entries.slice(0, 3).map(({paper, count}) => [paper.id, count]), [
    ['rare', 1], ['common-00', 2], ['common-01', 2],
  ]);
  assert.deepEqual(ids(rankOrbitPapers(center, [...papers].reverse(), GRAPH_DEFAULTS)), ids(entries));
  assert.deepEqual(ids(rankOrbitPapers(center, papers, {...GRAPH_DEFAULTS, orbitRings: 1})), ['rare']);
  assert.equal(rankOrbitPapers(center, papers, {...GRAPH_DEFAULTS, orbitRings: 8}).length, 8);
});

test('orbit drops matches below the research similarity threshold even when space remains', () => {
  const subset = [center, ...common.slice(0, 4), rare, weak];
  const entries = rankOrbitPapers(center, subset, GRAPH_DEFAULTS);
  assert.equal(entries.length, 5);
  assert.ok(entries.every(({paper}) => paper.id !== weak.id));
  const strict = rankOrbitPapers(center, papers, {...GRAPH_DEFAULTS, similarityThreshold: .5});
  assert.deepEqual(ids(strict), ['rare']);
});

test('orbit wake trails behind the active phase along the 3D ellipse in either direction', () => {
  const plane = orbitPlane('center', 'nearby');
  const forward = orbitWakePath(plane, 180, 1.4, 1);
  const reverse = orbitWakePath(plane, 180, 1.4, -1);
  assert.match(forward.d, /^M /);
  const expectedHead = projectOrbit(plane, 180, 1.4);
  assert.ok(Math.abs(forward.head.x - expectedHead.x) < 0.05);
  assert.ok(Math.abs(forward.head.y - expectedHead.y) < 0.05);
  assert.notEqual(forward.tail.x, reverse.tail.x);
});

test('orbitViewAngles, interpolateOrbitView, and normalizeOrbitStyle preserve 3D camera geometry', () => {
  const identity = [{x: 1, y: 0, z: 0}, {x: 0, y: 1, z: 0}, {x: 0, y: 0, z: 1}];
  assert.deepEqual(orbitViewAngles(identity), {azimuth: 0, elevation: 0});
  const rotated = rotateOrbitView(identity, 0.5, -0.3);
  const angles = orbitViewAngles(rotated);
  assert.notEqual(angles.azimuth, 0);
  assert.notEqual(angles.elevation, 0);

  const mid = interpolateOrbitView(rotated, identity, 0.5);
  for (const axis of mid) assert.ok(Math.abs(Math.hypot(axis.x, axis.y, axis.z) - 1) < 1e-8);
  assert.ok(Math.abs(mid[0].x * mid[1].x + mid[0].y * mid[1].y + mid[0].z * mid[1].z) < 1e-8);

  assert.equal(normalizeOrbitStyle('armillary'), 'armillary');
  assert.equal(normalizeOrbitStyle('cosmos'), 'cosmos');
  assert.equal(normalizeOrbitStyle('other'), 'cosmos');
});

test('orbitEntryView and orbitWarpStreaks drive Star-Map to Orbit warp entry', () => {
  const entryView = orbitEntryView();
  for (const axis of entryView) assert.ok(Math.abs(Math.hypot(axis.x, axis.y, axis.z) - 1) < 1e-10);
  const angles = orbitViewAngles(entryView);
  assert.ok(angles.azimuth !== 0 || angles.elevation !== 0);

  const identity = [{x: 1, y: 0, z: 0}, {x: 0, y: 1, z: 0}, {x: 0, y: 0, z: 1}];
  assert.deepEqual(orbitViewAngles(interpolateOrbitView(entryView, identity, 1)), {azimuth: 0, elevation: 0});

  const streaks = orbitWarpStreaks(310, 24);
  assert.equal(streaks.length, 24);
  for (const s of streaks) {
    const r1 = Math.hypot(s.x1 - 500, s.y1 - 310);
    const r2 = Math.hypot(s.x2 - 500, s.y2 - 310);
    assert.ok(r2 > r1);
    assert.ok(s.delay >= 0 && s.delay < 0.25);
  }

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const viewJs = fs.readFileSync(path.join(root, 'dist/graph-view.js'), 'utf8');
  const graphCss = fs.readFileSync(path.join(root, 'dist/graph.css'), 'utf8');
  assert.match(viewJs, /captureOrbitOrigin/);
  assert.match(viewJs, /data-orbit-entering|orbitEntering/);
  assert.match(graphCss, /\.graph-orbit-warp-streak/);
  assert.match(graphCss, /\.graph-orbit-lock-iris/);
});
