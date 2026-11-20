import assert from 'node:assert/strict';
import test from 'node:test';
import {rankOrbitPapers} from '../dist/graph-orbit.js';
import {GRAPH_DEFAULTS} from '../dist/graph-settings.js';

const center = {id: 'center', tags: ['Common A', 'Common B', 'Rare']};
const common = Array.from({length: 12}, (_, i) => ({
  id: 'common-' + String(i).padStart(2, '0'), tags: ['Common A', 'Common B'],
}));
const rare = {id: 'rare', tags: [' Ｒａｒｅ ', 'rare']};
const weak = {id: 'weak', tags: ['Common A', 'Unrelated']};
const papers = [center, ...common, weak, rare];
const ids = entries => entries.map(({paper}) => paper.id);

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
