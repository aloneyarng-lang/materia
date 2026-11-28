import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

import {
  createCitationAtlas,
  normalizeDoi as backendNormalizeDoi,
  normalizeTitleKey as backendNormalizeTitleKey,
} from '../desktop/citation-atlas.mjs';
import { validatePackagedAssets } from '../desktop/package-assets.mjs';
import { WORKSPACE_MODULES } from '../dist/modules/index.js';
import {
  buildCrossGraph,
  filterCrossGraph,
  formatBibtex,
  formatUnseenMarkdown,
  normalizeDoi,
  normalizeTitleKey,
  rebindLibrary,
} from '../dist/modules/citation-atlas/model.js';
import { citationArrangement } from '../dist/modules/citation-atlas/graph-canvas.js';
import {
  DEFAULT_CITATION_THEME,
  CITATION_THEMES,
  normalizeCitationTheme,
  classifyCitationTiers,
  highCitedExtraRadius,
  formatCompactCitations,
  themePreviewSvg,
  themeLegendIconSvg,
} from '../dist/modules/citation-atlas/themes.js';

test('normalizeDoi and normalizeTitleKey handle prefixes, percent-encoding, punctuation, and tags', () => {
  assert.equal(normalizeDoi('https://dx.doi.org/10.1016/j.jmst.2026.07.067.'), '10.1016/j.jmst.2026.07.067');
  assert.equal(normalizeDoi('doi: 10.1038%2Fnature14539;'), '10.1038/nature14539');
  assert.equal(backendNormalizeDoi('HTTPS://doi.org/10.1000/ABC-123)'), '10.1000/abc-123');
  assert.equal(normalizeDoi('not-a-doi'), null);
  for (const normalize of [normalizeDoi, backendNormalizeDoi]) {
    assert.equal(normalize('10.1000/example(2024)).'), '10.1000/example(2024)');
  }

  assert.equal(
    normalizeTitleKey('Fe<sub>76</sub>Si<sub>9</sub>B<sub>10</sub>P<sub>5</sub>\u00ad Alloy — Review!'),
    'fe76si9b10p5 alloy review',
  );
  assert.equal(
    backendNormalizeTitleKey('Fe<sub>76</sub>Si<sub>9</sub>B<sub>10</sub>P<sub>5</sub> Alloy'),
    'fe76si9b10p5 alloy',
  );
});

test('buildCrossGraph, filterCrossGraph, and rebindLibrary separate missing, unread, and read co-cited papers', () => {
  const seedA = { id: 'seed-a', title: 'Seed A', doi: '10.1000/seed-a', year: '2025', readingStatus: 'studied' };
  const seedB = { id: 'seed-b', title: 'Seed B', doi: '10.1000/seed-b', year: '2026', readingStatus: 'reading' };
  const seedC = { id: 'seed-c', title: 'Seed C', doi: '10.1000/seed-c', year: '2026', readingStatus: 'unread' };

  const libUnread = { id: 'lib-y', title: 'Foundational Unread Paper Y', doi: '10.1000/y', year: '2020', readingStatus: 'unread' };
  const libStudied = { id: 'lib-z', title: 'Foundational Studied Paper Z', doi: '10.1000/z', year: '2019', readingStatus: 'studied' };
  const libraryPapers = [seedA, seedB, seedC, libUnread, libStudied];

  const queryResult = {
    seedMatches: [
      { seedId: 'seed-a', openalexId: 'W1', referenceCount: 3, needsPdfFallback: false },
      { seedId: 'seed-b', openalexId: 'W2', referenceCount: 3, needsPdfFallback: false },
      { seedId: 'seed-c', openalexId: 'W3', referenceCount: 2, needsPdfFallback: false },
    ],
    works: [
      { key: 'W101', openalexId: 'W101', doi: '10.1000/x', title: 'Missing Landmark X', authors: ['Alice Smith'], year: 2018, citationCount: 500 },
      { key: 'W102', openalexId: 'W102', doi: '10.1000/y', title: 'Foundational Unread Paper Y', authors: ['Bob Lee'], year: 2020, citationCount: 220 },
      { key: 'W103', openalexId: 'W103', doi: '10.1000/z', title: 'Foundational Studied Paper Z', authors: ['Carol Wu'], year: 2019, citationCount: 310 },
      { key: 'W104', openalexId: 'W104', doi: '10.1000/w', title: 'Single Citation W', authors: ['Dan Kim'], year: 2022, citationCount: 40 },
    ],
    seedLinks: [
      { seedId: 'seed-a', targetKey: 'W101', source: 'openalex', page: null },
      { seedId: 'seed-b', targetKey: 'W101', source: 'openalex', page: null },
      { seedId: 'seed-c', targetKey: 'W101', source: 'pdf', page: 9 },
      { seedId: 'seed-a', targetKey: 'W102', source: 'openalex', page: null },
      { seedId: 'seed-b', targetKey: 'W102', source: 'openalex', page: null },
      { seedId: 'seed-a', targetKey: 'W103', source: 'openalex', page: null },
      { seedId: 'seed-c', targetKey: 'W103', source: 'openalex', page: null },
      { seedId: 'seed-b', targetKey: 'W104', source: 'openalex', page: null },
    ],
    internalLinks: [
      { sourceKey: 'W102', targetKey: 'W101' },
    ],
    warnings: [],
  };

  const graph = buildCrossGraph({ seedPapers: [seedA, seedB, seedC], libraryPapers, queryResult });
  assert.equal(graph.counts.cocitedUnseen, 2);
  assert.equal(graph.counts.cocitedMissing, 1);
  assert.equal(graph.counts.cocitedUnread, 1);
  assert.equal(graph.counts.cocitedAll, 3);
  assert.equal(graph.counts.inLibrary, 2);
  assert.equal(graph.counts.all, 4);

  const unseenView = filterCrossGraph(graph, { preset: 'cocited-unseen', minCoCite: 2, sort: 'cocite' });
  assert.deepEqual(unseenView.listItems.map(n => n.id), ['W101', 'W102']);
  assert.equal(unseenView.listItems[0].seedPages['seed-c'], 9);
  assert.equal(unseenView.edges.some(e => e.source === 'W102' && e.target === 'W101' && e.kind === 'ref_ref'), true);

  const allCocitedView = filterCrossGraph(graph, { preset: 'cocited-all', minCoCite: 2 });
  assert.deepEqual(allCocitedView.listItems.map(n => n.id), ['W101', 'W102', 'W103']);

  const inLibView = filterCrossGraph(graph, { preset: 'in-library', minCoCite: 1 });
  assert.deepEqual(inLibView.listItems.map(n => n.id), ['W102', 'W103']);

  // Mark lib-y as studied and verify rebindLibrary immediately removes it from cocited-unseen.
  const updatedLibrary = libraryPapers.map(p => (p.id === 'lib-y' ? { ...p, readingStatus: 'studied' } : p));
  const rebound = rebindLibrary(graph, updatedLibrary);
  assert.equal(rebound.counts.cocitedUnseen, 1);
  assert.equal(rebound.counts.cocitedUnread, 0);
  const afterView = filterCrossGraph(rebound, { preset: 'cocited-unseen', minCoCite: 2 });
  assert.deepEqual(afterView.listItems.map(n => n.id), ['W101']);

  const md = formatUnseenMarkdown({ seedPapers: [seedA, seedB, seedC], listItems: unseenView.listItems, counts: graph.counts });
  assert.match(md, /Missing Landmark X/);
  assert.match(md, /Foundational Unread Paper Y/);
  assert.match(md, /共同引用 · 尚未入库/);
  assert.match(md, /共同引用 · 已在库内待读/);

  const bib = formatBibtex(unseenView.listItems[0]);
  assert.match(bib, /@article\{smith2018,/);
  assert.match(bib, /doi = \{10\.1000\/x\}/);
});

test('createCitationAtlas batches OpenAlex requests, prioritizes co-cited works, merges PDF fallback, and uses disk cache', async () => {
  await mkdir('.local/tests', { recursive: true });
  const cacheDir = await mkdtemp(path.resolve('.local/tests/citation-cache-'));
  try {
    const manyRefs = Array.from({ length: 30 }, (_, i) => `https://openalex.org/W${2000 + i}`);
    const worksCatalog = new Map([
      ['W10', {
        id: 'https://openalex.org/W10',
        doi: 'https://doi.org/10.1000/seed1',
        display_name: 'Seed Paper One',
        publication_year: 2025,
        cited_by_count: 12,
        authorships: [{ author: { display_name: 'Alice' } }],
        primary_location: { source: { display_name: 'Acta Mater.' }, landing_page_url: 'https://example.org/1' },
        abstract_inverted_index: { Soft: [0], magnetic: [1], core: [2] },
        referenced_works: ['https://openalex.org/W999', ...manyRefs],
      }],
      ['W20', {
        id: 'https://openalex.org/W20',
        doi: 'https://doi.org/10.1000/seed2',
        display_name: 'Seed Paper Two',
        publication_year: 2027,
        cited_by_count: 0,
        authorships: [{ author: { display_name: 'Bob' } }],
        primary_location: {},
        referenced_works: [], // Newly published paper with 0 OpenAlex refs -> triggers PDF fallback
      }],
      ['W999', {
        id: 'https://openalex.org/W999',
        doi: 'https://doi.org/10.1000/shared-ref',
        display_name: 'Shared Co-cited Anchor',
        publication_year: 2015,
        cited_by_count: 420,
        authorships: [{ author: { display_name: 'Carol' } }],
        primary_location: { source: { display_name: 'Nature' } },
        referenced_works: [],
      }],
    ]);
    for (let i = 0; i < 30; i++) {
      const id = `W${2000 + i}`;
      worksCatalog.set(id, {
        id: `https://openalex.org/${id}`,
        doi: `https://doi.org/10.1000/r${i}`,
        display_name: `Reference ${i}`,
        publication_year: 2010 + (i % 10),
        cited_by_count: i,
        authorships: [],
        primary_location: {},
        referenced_works: [],
      });
    }

    let fetchCount = 0;
    const mockFetch = async href => {
      fetchCount++;
      const url = new URL(href);
      const filter = url.searchParams.get('filter') || '';
      if (filter.startsWith('doi:')) {
        const dois = new Set(filter.slice(4).split('|'));
        const results = [...worksCatalog.values()].filter(w => dois.has(w.doi.replace('https://doi.org/', '')));
        return new Response(JSON.stringify({ results }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (filter.startsWith('openalex:')) {
        const ids = filter.slice(9).split('|');
        const results = ids.map(id => worksCatalog.get(id)).filter(Boolean);
        return new Response(JSON.stringify({ results }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ results: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const service = createCitationAtlas(cacheDir, { fetchImpl: mockFetch });
    const res = await service.query({
      seeds: [
        { id: 's1', doi: '10.1000/seed1', title: 'Seed Paper One' },
        { id: 's2', doi: '10.1000/seed2', title: 'Seed Paper Two' },
      ],
      extraCitations: [
        { seedId: 's2', doi: '10.1000/shared-ref', page: 11 },
      ],
      maxReferences: 20, // Smaller than 31 total refs: must prioritize co-cited W999!
    });

    assert.equal(res.works.length, 20);
    assert.ok(res.works.some(w => w.openalexId === 'W999'), 'co-cited W999 must be retained within maxReferences cap');
    const s2Shared = res.seedLinks.find(l => l.seedId === 's2' && l.targetKey === 'W999');
    assert.deepEqual(s2Shared, { seedId: 's2', targetKey: 'W999', page: 11, source: 'pdf' });
    assert.equal(res.seedMatches.find(m => m.seedId === 's2').needsPdfFallback, true);
    assert.equal(res.seedMatches.find(m => m.seedId === 's1').abstract, 'Soft magnetic core');
    assert.ok(fetchCount >= 2);
    await service.close();

    // Second instance reading the same cacheDir must satisfy the same query with zero network fetches.
    const offlineService = createCitationAtlas(cacheDir, {
      fetchImpl: async () => { throw new Error('Should not hit network on warm cache'); },
    });
    const cachedRes = await offlineService.query({
      seeds: [
        { id: 's1', doi: '10.1000/seed1', title: 'Seed Paper One' },
        { id: 's2', doi: '10.1000/seed2', title: 'Seed Paper Two' },
      ],
      extraCitations: [
        { seedId: 's2', doi: '10.1000/shared-ref', page: 11 },
      ],
      maxReferences: 20,
    });
    assert.equal(cachedRes.works.length, 20);
    assert.ok(cachedRes.works.some(w => w.openalexId === 'W999'));
    await offlineService.close();
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
});

test('citation-atlas module registers under research sub-navigation and passes asset validation', async () => {
  const mod = WORKSPACE_MODULES.find(m => m.id === 'citation-atlas');
  assert.ok(mod);
  assert.equal(mod.parentView, 'research');
  assert.equal(mod.navigation, undefined);

  const summary = await validatePackagedAssets(path.resolve('dist'), { requireWindowsRuntime: false });
  assert.ok(summary.files > 10);
});

test('citationArrangement preserves timeline X order, reduces edge crossings, and handles cycles', () => {
  assert.deepEqual(citationArrangement([], []), { positions: new Map(), routes: new Map(), axisTicks: [] });

  // Two crossing edges (A->D, B->C) between 2020 and 2024 should uncross after 2-opt arrangement.
  const nodes = [
    { id: 'A', role: 'seed', year: 2020, coCiteCount: 1, citationCount: 10 },
    { id: 'B', role: 'seed', year: 2020, coCiteCount: 1, citationCount: 5 },
    { id: 'C', role: 'cited', year: 2024, coCiteCount: 2, citationCount: 50 },
    { id: 'D', role: 'cited', year: 2024, coCiteCount: 2, citationCount: 100 },
  ];
  const edges = [
    { id: 'e1', source: 'A', target: 'D' },
    { id: 'e2', source: 'B', target: 'C' },
  ];
  const arranged = citationArrangement(nodes, edges, 1, 1, { years: [2020, 2024] });
  const pA = arranged.positions.get('A');
  const pB = arranged.positions.get('B');
  const pC = arranged.positions.get('C');
  const pD = arranged.positions.get('D');
  assert.ok(pA.x < pC.x && pB.x < pD.x, 'timeline X increases monotonically with year');
  assert.equal(pA.x, pB.x);
  assert.equal(pC.x, pD.x);
  // No crossing means (pA.y - pB.y) and (pD.y - pC.y) have the same sign.
  assert.ok((pA.y - pB.y) * (pD.y - pC.y) > 0, 'crossing edges are untangled');

  // Cycle resilience in non-timeline mode
  const cyclic = citationArrangement(
    [{ id: 'n1', role: 'seed' }, { id: 'n2', role: 'cited' }, { id: 'n3', role: 'cited' }],
    [{ id: 'c1', source: 'n1', target: 'n2' }, { id: 'c2', source: 'n2', target: 'n3' }, { id: 'c3', source: 'n3', target: 'n1' }],
  );
  assert.equal(cyclic.positions.size, 3);

  // Adaptive-density timeline over a 46-year sparse span stays compact and orders axisTicks monotonically
  const sparseNodes = [
    { id: 'old1', role: 'cited', year: 1978, coCiteCount: 1, citationCount: 20 },
    { id: 'mid1', role: 'cited', year: 2010, coCiteCount: 3, citationCount: 200 },
    { id: 'new1', role: 'cited', year: 2020, coCiteCount: 2, citationCount: 80 },
    { id: 'seed1', role: 'seed', year: 2024, coCiteCount: 0, citationCount: 10 },
  ];
  const sparseArranged = citationArrangement(sparseNodes, [], 1, 1, { years: [1978, 2024] });
  assert.equal(sparseArranged.axisTicks.length, 4);
  assert.deepEqual(sparseArranged.axisTicks.map(t => t.label), ['1978', '2010', '2020', '2024']);
  const totalSpanX = sparseArranged.axisTicks.at(-1).x - sparseArranged.axisTicks[0].x;
  assert.ok(totalSpanX > 300 && totalSpanX < 1500, `adaptive span ${totalSpanX} stays compact`);
});

test('citation-atlas graph themes classify high-citation nodes, preserve classic geometry, and render SVG previews', () => {
  assert.equal(DEFAULT_CITATION_THEME, 'classic');
  assert.deepEqual(
    CITATION_THEMES.map(t => t.id),
    ['classic', 'baroque', 'constellation', 'crystal', 'editorial', 'circuit'],
  );
  assert.equal(normalizeCitationTheme('unknown-theme'), 'classic');
  assert.equal(normalizeCitationTheme(null), 'classic');
  for (const id of ['classic', 'baroque', 'constellation', 'crystal', 'editorial', 'circuit']) {
    assert.equal(normalizeCitationTheme(id), id);
  }

  // Classic keeps zero extra radial morphology; baroque highlights high/landmark tiers.
  assert.equal(highCitedExtraRadius('classic', 'high'), 0);
  assert.equal(highCitedExtraRadius('classic', 'landmark'), 0);
  for (const theme of CITATION_THEMES) {
    assert.equal(highCitedExtraRadius(theme.id, 'normal'), 0);
    if (theme.id !== 'classic') {
      const highPad = highCitedExtraRadius(theme.id, 'high');
      const landmarkPad = highCitedExtraRadius(theme.id, 'landmark');
      assert.ok(highPad > 0 && landmarkPad > highPad, `${theme.id} scales high-cited nodes`);
    }
  }

  // 1-seed graph with varying citation counts and ref_ref hub degree
  const singleSeedNodes = [
    { id: 'seed:s1', role: 'seed', citationCount: 9999, coCiteCount: 0 },
    { id: 'W1', role: 'cited', citationCount: 1500, coCiteCount: 1 },
    { id: 'W2', role: 'cited', citationCount: 250, coCiteCount: 1 },
    { id: 'W3', role: 'cited', citationCount: 25, coCiteCount: 1 },
    { id: 'W4', role: 'cited', citationCount: 12, coCiteCount: 1 },
    { id: 'W5', role: 'cited', citationCount: 8, coCiteCount: 1 },
    { id: 'W6', role: 'cited', citationCount: 5, coCiteCount: 1 },
  ];
  const singleSeedEdges = [
    { source: 'seed:s1', target: 'W1' },
    { source: 'W2', target: 'W3' },
    { source: 'W4', target: 'W3' },
    { source: 'W5', target: 'W3' },
    { source: 'W6', target: 'W3' },
  ];
  const singleTiers = classifyCitationTiers(singleSeedNodes, singleSeedEdges);
  assert.equal(singleTiers.get('seed:s1').tier, 'normal');
  assert.equal(singleTiers.get('W1').tier, 'landmark');
  assert.equal(singleTiers.get('W2').tier, 'high');
  assert.equal(singleTiers.get('W3').tier, 'high'); // in-degree 4 hub
  assert.equal(singleTiers.get('W6').tier, 'normal');

  // Multi-seed graph with high co-citation overlap
  const multiSeedNodes = [
    { id: 'seed:1', role: 'seed', citationCount: 10 },
    { id: 'seed:2', role: 'seed', citationCount: 10 },
    { id: 'seed:3', role: 'seed', citationCount: 10 },
    { id: 'seed:4', role: 'seed', citationCount: 10 },
    { id: 'C1', role: 'cited', citationCount: 40, coCiteCount: 3 },
    { id: 'C2', role: 'cited', citationCount: 10, coCiteCount: 1 },
  ];
  const multiTiers = classifyCitationTiers(multiSeedNodes, []);
  assert.equal(multiTiers.get('C1').tier, 'landmark');
  assert.equal(multiTiers.get('C2').tier, 'normal');

  // Graph with zero citations and sparse degree should not falsely promote nodes
  const zeroTiers = classifyCitationTiers([
    { id: 'seed:a', role: 'seed' },
    { id: 'Z1', role: 'cited', citationCount: 0, coCiteCount: 1 },
    { id: 'Z2', role: 'cited', citationCount: null, coCiteCount: 1 },
  ], [{ source: 'seed:a', target: 'Z1' }]);
  assert.equal(zeroTiers.get('Z1').tier, 'normal');
  assert.equal(zeroTiers.get('Z2').tier, 'normal');

  assert.equal(formatCompactCitations(0), '');
  assert.equal(formatCompactCitations(null), '');
  assert.equal(formatCompactCitations(420), '420');
  assert.equal(formatCompactCitations(1250), '1.3k');
  assert.equal(formatCompactCitations(12400), '12k');

  for (const theme of CITATION_THEMES) {
    const preview = themePreviewSvg(theme.id);
    assert.match(preview, /^<svg\b[^>]*>[\s\S]*<\/svg>$/);
    for (const kind of ['seed', 'missing', 'unread', 'read', 'high']) {
      const iconSvg = themeLegendIconSvg(theme.id, kind);
      assert.match(iconSvg, /^<svg\b[^>]*>[\s\S]*<\/svg>$/);
    }
  }
});
