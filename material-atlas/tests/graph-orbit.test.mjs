import assert from 'node:assert/strict';
import test from 'node:test';
import {orbitPlane, orbitPlanetStyle, projectOrbit, rankOrbitPapers, reverseRandomSatellite, rotateOrbitView} from '../dist/graph-orbit.js';
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
