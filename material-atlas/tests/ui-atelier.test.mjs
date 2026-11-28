import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORKSPACE_MODULES } from '../dist/modules/index.js';
import { validatePackagedAssets } from '../desktop/package-assets.mjs';
import {
  checkSpellingAttempt,
  sortVocabularyRows,
  vocabularyCSV,
  vocabularyStats,
} from '../dist/vocabulary-ui.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('WORKSPACE_MODULES registers redesigned Research Hub, 5 sub-modules, Full-Page Vocabulary, and Figura Atelier', () => {
  const research = WORKSPACE_MODULES.find(m => m.id === 'research');
  assert.ok(research);
  assert.equal(research.panelId, 'research-workspace');
  assert.equal(research.navigation, 'ribbon');

  const children = WORKSPACE_MODULES.filter(m => m.parentView === 'research').map(m => m.id);
  assert.deepEqual(children, [
    'literature-workbench',
    'takeaway-card',
    'paper-canvas',
    'combined-timeline',
    'citation-atlas',
  ]);

  const vocab = WORKSPACE_MODULES.find(m => m.id === 'vocabulary');
  assert.ok(vocab);
  assert.equal(vocab.panelId, 'vocabulary-workspace');
  assert.equal(vocab.navigation, 'ribbon');

  const figura = WORKSPACE_MODULES.find(m => m.id === 'figura');
  assert.ok(figura);
  assert.equal(figura.panelId, 'figura-workspace');
});

test('vocabularyStats, sortVocabularyRows, vocabularyCSV, and checkSpellingAttempt handle full-page studio features', () => {
  const sample = [
    {
      id: 'w1',
      term: 'coercivity',
      translation: '矫顽力',
      reading: '/kəʊˈɜːsɪvɪti/',
      termLanguage: 'en',
      targetLanguage: 'zh-CN',
      entryType: 'word',
      status: 'mastered',
      example: 'High coercivity magnets.',
      note: '',
      updatedAt: 100,
      review: { last: '2026-11-20', due: '2026-12-04', stage: 4 },
    },
    {
      id: 'w2',
      term: 'anisotropy',
      translation: '各向异性',
      reading: '',
      termLanguage: 'en',
      targetLanguage: 'zh-CN',
      entryType: 'word',
      status: 'learning',
      example: '',
      note: '方向性',
      updatedAt: 300,
      review: { last: '2026-11-25', due: '2026-11-27', stage: 1 },
    },
    {
      id: 'w3',
      term: '焼鈍',
      translation: '退火',
      reading: 'しょうどん',
      termLanguage: 'ja',
      targetLanguage: 'zh-CN',
      entryType: 'word',
      status: 'new',
      example: '',
      note: '',
      updatedAt: 200,
      review: { last: '', due: '', stage: 0 },
    },
  ];

  const stats = vocabularyStats(sample, '2026-11-27');
  assert.equal(stats.total, 3);
  assert.equal(stats.due, 2);
  assert.equal(stats.mastered, 1);
  assert.equal(stats.learning, 1);
  assert.equal(stats.newCount, 1);
  assert.equal(stats.masteryPct, 33);
  assert.deepEqual(stats.byLanguage, { en: 2, ja: 1 });

  assert.deepEqual(sortVocabularyRows(sample, 'alpha').map(w => w.id), ['w2', 'w1', 'w3']);
  assert.deepEqual(sortVocabularyRows(sample, 'due').map(w => w.id), ['w3', 'w2', 'w1']);
  assert.deepEqual(sortVocabularyRows(sample, 'stage').map(w => w.id), ['w3', 'w2', 'w1']);
  assert.deepEqual(sortVocabularyRows(sample, 'updated').map(w => w.id), ['w2', 'w3', 'w1']);

  const csv = vocabularyCSV(sample);
  assert.ok(csv.startsWith('\uFEFF语言,表达,词义'));
  assert.match(csv, /coercivity/);
  assert.match(csv, /しょうどん/);

  assert.equal(checkSpellingAttempt('  Coercivity! ', 'coercivity').exact, true);
  assert.equal(checkSpellingAttempt('coercivity ', 'COERCIVITY.').exact, true);
  assert.equal(checkSpellingAttempt('coercive', 'coercivity').exact, false);
});

test('Redesigned Research Hub, Sub-modules, Vocabulary Page, and Figura CSS keep reduced-motion and asset integrity', async () => {
  const filesToCheck = [
    'dist/modules/research-hub/workspace.css',
    'dist/modules/innovation-timeline/workspace.css',
    'dist/modules/citation-atlas/workspace.css',
    'dist/vocabulary-page.css',
    'dist/figura/workspace.css',
    'desktop/literature-workbench/web/style.css',
  ];
  for (const rel of filesToCheck) {
    const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.match(content, /prefers-reduced-motion:\s*reduce/, `${rel} must honor reduced-motion`);
  }

  const summary = await validatePackagedAssets(path.join(ROOT, 'dist'), { requireWindowsRuntime: false });
  assert.ok(summary.files > 10);
});
