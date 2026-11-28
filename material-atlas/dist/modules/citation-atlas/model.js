import { READING_STATUSES, readingStatusInfo, readingStatusOf } from '../../reading-status.js';

export function normalizeDoi(value) {
  let text = String(value ?? '').trim();
  if (!text) return null;
  text = text.replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, '');
  try {
    text = decodeURIComponent(text);
  } catch {
    // Ignore malformed percent-encoding.
  }
  text = text.trim().toLowerCase();
  // Preserve balanced brackets that belong to the DOI suffix.
  while (text) {
    text = text.replace(/[.,;:]+$/, '');
    const close = text.at(-1);
    if (close !== ')' && close !== ']') break;
    const open = close === ')' ? '(' : '[';
    if (text.split(close).length <= text.split(open).length) break;
    text = text.slice(0, -1);
  }
  return /^10\.\d{4,9}\/\S+$/.test(text) ? text : null;
}

export function normalizeTitleKey(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/<\/?(?:sub|sup)\b[^>]*>/gi, '')
    .replace(/\u00ad/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function parseAuthorList(paper) {
  if (Array.isArray(paper?.authors)) {
    return paper.authors.map(a => String(a || '').trim()).filter(Boolean);
  }
  if (Array.isArray(paper?.authorDetails) && paper.authorDetails.length) {
    return paper.authorDetails.map(a => String(a?.name || '').trim()).filter(Boolean);
  }
  return String(paper?.authors || '')
    .split(/[,，;；]+/)
    .map(a => a.trim())
    .filter(Boolean);
}

export function parseYear(value) {
  if (Number.isInteger(value) && value >= 1000 && value <= 2999) return value;
  const match = String(value ?? '').match(/\b(1\d{3}|20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

export function shortAuthorLabel(node) {
  const authors = Array.isArray(node?.authors) ? node.authors : parseAuthorList(node);
  const first = authors[0] || '佚名';
  const surname = first.includes(',') ? first.split(',')[0].trim() : first.split(/\s+/).at(-1);
  return `${surname}, ${node?.year ?? '未知'}`;
}

export function indexLibraryPapers(libraryPapers = []) {
  const byId = new Map();
  const byDoi = new Map();
  const byTitle = new Map();

  for (const paper of libraryPapers) {
    if (!paper?.id) continue;
    byId.set(paper.id, paper);
    const doi = normalizeDoi(paper.doi);
    if (doi && !byDoi.has(doi)) byDoi.set(doi, paper);
    const title = normalizeTitleKey(paper.title);
    if (title.length >= 20 && title.split(' ').length >= 4) {
      if (!byTitle.has(title)) byTitle.set(title, paper);
    }
  }

  return {
    byId,
    byDoi,
    byTitle,
    findMatch(work) {
      const doi = normalizeDoi(work?.doi);
      if (doi && byDoi.has(doi)) return byDoi.get(doi);
      const title = normalizeTitleKey(work?.title);
      if (title && byTitle.has(title)) return byTitle.get(title);
      return null;
    },
  };
}

function classifyCitedTier(libraryPaper) {
  if (!libraryPaper) return { readingStatus: null, statusTier: 'missing', isUnseen: true };
  const status = readingStatusOf(libraryPaper);
  const statusTier = status === 'unread' ? 'unread' : 'read';
  return { readingStatus: status, statusTier, isUnseen: statusTier !== 'read' };
}

export function computeGraphCounts(nodes, seedCount) {
  const cited = nodes.filter(n => n.role === 'cited');
  const cocited = cited.filter(n => n.coCiteCount >= 2);
  const cocitedUnseen = cocited.filter(n => n.isUnseen);
  return {
    seedCount,
    totalCited: cited.length,
    cocitedUnseen: cocitedUnseen.length,
    cocitedMissing: cocitedUnseen.filter(n => n.statusTier === 'missing').length,
    cocitedUnread: cocitedUnseen.filter(n => n.statusTier === 'unread').length,
    cocitedAll: cocited.length,
    unseenAll: cited.filter(n => n.isUnseen).length,
    inLibrary: cited.filter(n => n.libraryPaper !== null).length,
    all: cited.length,
  };
}

export function buildCrossGraph({ seedPapers = [], libraryPapers = [], queryResult = {} }) {
  const index = indexLibraryPapers(libraryPapers);
  const seedMatchById = new Map((queryResult.seedMatches || []).map(item => [item.seedId, item]));
  const seedNodeByPaperId = new Map();
  const seedByDoi = new Map();
  const seedByTitle = new Map();
  const seedByOpenalexId = new Map();
  const nodes = [];

  for (const seedPaper of seedPapers) {
    if (!seedPaper?.id) continue;
    const matchMeta = seedMatchById.get(seedPaper.id);
    const livePaper = index.byId.get(seedPaper.id) || seedPaper;
    const doi = normalizeDoi(livePaper.doi);
    const titleKey = normalizeTitleKey(livePaper.title);
    const node = {
      id: `seed:${livePaper.id}`,
      role: 'seed',
      paperId: livePaper.id,
      openalexId: matchMeta?.openalexId || null,
      title: livePaper.title || '未题名论文',
      authors: parseAuthorList(livePaper),
      year: parseYear(livePaper.year),
      venue: livePaper.journal || null,
      doi,
      url: matchMeta?.url || (doi ? `https://doi.org/${doi}` : null),
      abstract: matchMeta?.abstract || null,
      citationCount: matchMeta?.citationCount ?? null,
      referenceCount: matchMeta?.referenceCount ?? 0,
      needsPdfFallback: Boolean(matchMeta?.needsPdfFallback),
      libraryPaper: livePaper,
      readingStatus: readingStatusOf(livePaper),
      statusTier: 'seed',
      isUnseen: false,
      citedBySeedIds: [],
      seedPages: {},
      seedSources: {},
      coCiteCount: 0,
    };
    nodes.push(node);
    seedNodeByPaperId.set(livePaper.id, node);
    if (doi) seedByDoi.set(doi, node);
    if (titleKey.length >= 20) seedByTitle.set(titleKey, node);
    if (node.openalexId) seedByOpenalexId.set(node.openalexId, node);
  }

  const workKeyToNodeId = new Map();
  const citedNodeById = new Map();

  for (const work of queryResult.works || []) {
    if (!work?.key) continue;
    const doi = normalizeDoi(work.doi);
    const titleKey = normalizeTitleKey(work.title);
    const matchedSeed = (work.openalexId && seedByOpenalexId.get(work.openalexId))
      || (doi && seedByDoi.get(doi))
      || (titleKey && seedByTitle.get(titleKey))
      || null;
    if (matchedSeed) {
      workKeyToNodeId.set(work.key, matchedSeed.id);
      if (matchedSeed.citationCount === null && work.citationCount !== null) matchedSeed.citationCount = work.citationCount;
      if (!matchedSeed.abstract && work.abstract) matchedSeed.abstract = work.abstract;
      continue;
    }

    const matchedPaper = index.findMatch(work);
    const tier = classifyCitedTier(matchedPaper);
    const node = {
      id: work.key,
      role: 'cited',
      paperId: matchedPaper?.id || null,
      openalexId: work.openalexId || null,
      title: matchedPaper?.title || work.title || '未题名论文',
      authors: Array.isArray(work.authors) && work.authors.length ? work.authors : parseAuthorList(matchedPaper),
      year: work.year ?? parseYear(matchedPaper?.year),
      venue: work.venue || matchedPaper?.journal || null,
      doi: doi || normalizeDoi(matchedPaper?.doi),
      url: work.url || (doi ? `https://doi.org/${doi}` : null),
      abstract: work.abstract || null,
      citationCount: work.citationCount ?? null,
      libraryPaper: matchedPaper,
      readingStatus: tier.readingStatus,
      statusTier: tier.statusTier,
      isUnseen: tier.isUnseen,
      citedBySeedIds: [],
      seedPages: {},
      seedSources: {},
      coCiteCount: 0,
    };
    workKeyToNodeId.set(work.key, node.id);
    citedNodeById.set(node.id, node);
    nodes.push(node);
  }

  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const mapTargetKey = key => {
    if (!key) return null;
    if (key.startsWith('seed:') && nodeById.has(key)) return key;
    return workKeyToNodeId.get(key) || (nodeById.has(key) ? key : null);
  };

  const edgeMap = new Map();
  for (const link of queryResult.seedLinks || []) {
    const sourceId = `seed:${link.seedId}`;
    const targetId = mapTargetKey(link.targetKey);
    if (!nodeById.has(sourceId) || !targetId || sourceId === targetId) continue;

    const targetNode = nodeById.get(targetId);
    if (!targetNode.citedBySeedIds.includes(link.seedId)) {
      targetNode.citedBySeedIds.push(link.seedId);
    }
    if (link.page && !targetNode.seedPages[link.seedId]) {
      targetNode.seedPages[link.seedId] = link.page;
    }
    if (link.source && !targetNode.seedSources[link.seedId]) {
      targetNode.seedSources[link.seedId] = link.source;
    }

    const edgeKey = `${sourceId}=>${targetId}`;
    const prev = edgeMap.get(edgeKey);
    if (!prev || (!prev.page && link.page)) {
      edgeMap.set(edgeKey, {
        id: edgeKey,
        source: sourceId,
        target: targetId,
        kind: 'seed_ref',
        page: link.page || prev?.page || null,
        provenance: link.source || prev?.provenance || 'openalex',
      });
    }
  }

  for (const node of nodes) {
    node.coCiteCount = node.citedBySeedIds.length;
  }

  for (const link of queryResult.internalLinks || []) {
    const sourceId = mapTargetKey(link.sourceKey);
    const targetId = mapTargetKey(link.targetKey);
    if (!sourceId || !targetId || sourceId === targetId) continue;
    const edgeKey = `${sourceId}=>${targetId}`;
    if (!edgeMap.has(edgeKey)) {
      edgeMap.set(edgeKey, {
        id: edgeKey,
        source: sourceId,
        target: targetId,
        kind: 'ref_ref',
        page: null,
        provenance: 'openalex',
      });
    }
  }

  const edges = [...edgeMap.values()];
  const counts = computeGraphCounts(nodes, seedNodeByPaperId.size);
  return {
    nodes,
    edges,
    seedIds: [...seedNodeByPaperId.keys()],
    warnings: Array.isArray(queryResult.warnings) ? [...queryResult.warnings] : [],
    counts,
  };
}

export function rebindLibrary(graph, libraryPapers = []) {
  if (!graph) return graph;
  const index = indexLibraryPapers(libraryPapers);
  const nextNodes = graph.nodes.map(node => {
    if (node.role === 'seed') {
      const livePaper = index.byId.get(node.paperId) || node.libraryPaper;
      return {
        ...node,
        libraryPaper: livePaper,
        readingStatus: livePaper ? readingStatusOf(livePaper) : node.readingStatus,
        statusTier: 'seed',
        isUnseen: false,
      };
    }
    const matchedPaper = (node.paperId && index.byId.get(node.paperId)) || index.findMatch(node);
    const tier = classifyCitedTier(matchedPaper);
    return {
      ...node,
      paperId: matchedPaper?.id || null,
      libraryPaper: matchedPaper,
      readingStatus: tier.readingStatus,
      statusTier: tier.statusTier,
      isUnseen: tier.isUnseen,
    };
  });
  return {
    ...graph,
    nodes: nextNodes,
    counts: computeGraphCounts(nextNodes, graph.seedIds.length),
  };
}

export function filterCrossGraph(graph, options = {}) {
  if (!graph) {
    return {
      nodes: [],
      edges: [],
      listItems: [],
      seedNodes: [],
      years: [0, 0],
    };
  }
  const {
    preset = 'cocited-unseen',
    minCoCite = 1,
    yearFrom = null,
    yearTo = null,
    search = '',
    sort = 'cocite',
  } = options;

  const effectiveMinCoCite = (preset === 'cocited-unseen' || preset === 'cocited-all')
    ? Math.max(2, Number(minCoCite) || 2)
    : Math.max(1, Number(minCoCite) || 1);

  const seedNodes = graph.nodes.filter(n => n.role === 'seed');
  const citedNodes = graph.nodes.filter(n => n.role === 'cited');
  const allYears = graph.nodes.flatMap(n => Number.isInteger(n.year) ? [n.year] : []);
  const years = allYears.length ? [Math.min(...allYears), Math.max(...allYears)] : [0, 0];

  const matchesPreset = node => {
    if (node.coCiteCount < effectiveMinCoCite) return false;
    if (preset === 'cocited-unseen') return node.isUnseen;
    if (preset === 'unseen-all') return node.isUnseen;
    if (preset === 'in-library') return node.libraryPaper !== null;
    return true;
  };

  const matchesYears = node => {
    if (yearFrom === null && yearTo === null) return true;
    if (!Number.isInteger(node.year)) return yearFrom === null && yearTo === null;
    if (yearFrom !== null && node.year < yearFrom) return false;
    if (yearTo !== null && node.year > yearTo) return false;
    return true;
  };

  const visibleCited = citedNodes.filter(node => matchesPreset(node) && matchesYears(node));
  const visibleNodes = [...seedNodes, ...visibleCited];
  const visibleIds = new Set(visibleNodes.map(n => n.id));
  const visibleEdges = graph.edges.filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target));

  const query = String(search || '').trim().toLowerCase();
  const listItems = visibleCited
    .filter(node => {
      if (!query) return true;
      const hay = [node.title, ...(node.authors || []), node.venue || '', node.doi || ''].join(' ').toLowerCase();
      return hay.includes(query);
    })
    .sort((a, b) => {
      if (sort === 'citations') {
        return ((b.citationCount ?? -1) - (a.citationCount ?? -1)) || (b.coCiteCount - a.coCiteCount);
      }
      if (sort === 'year') {
        return ((b.year ?? 0) - (a.year ?? 0)) || (b.coCiteCount - a.coCiteCount);
      }
      return (b.coCiteCount - a.coCiteCount)
        || (Number(b.isUnseen) - Number(a.isUnseen))
        || ((b.citationCount ?? -1) - (a.citationCount ?? -1))
        || ((b.year ?? 0) - (a.year ?? 0));
    });

  return {
    nodes: visibleNodes,
    edges: visibleEdges,
    listItems,
    seedNodes,
    years,
  };
}

export function statusBadgeMeta(node) {
  if (!node) return { label: '', tone: 'read' };
  if (node.role === 'seed') return { label: '所选种子', tone: 'seed' };
  if (node.statusTier === 'missing') return { label: '未入库', tone: 'missing' };
  const info = READING_STATUSES.find(s => s.id === node.readingStatus) || READING_STATUSES[0];
  return {
    label: node.statusTier === 'unread' ? `${info.symbol} 库内未读` : `${info.symbol} ${info.name}`,
    tone: node.statusTier,
  };
}

export function formatBibtex(node) {
  const firstAuthor = (node?.authors?.[0] || 'unknown').split(/[,\s]+/).filter(Boolean).at(-1) || 'paper';
  const slug = firstAuthor.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'paper';
  const key = `${slug}${node?.year || 'nd'}`;
  const lines = [`@article{${key},`];
  lines.push(`  title = {${String(node?.title || '').replace(/[{}]/g, '')}},`);
  if (node?.authors?.length) lines.push(`  author = {${node.authors.join(' and ')}},`);
  if (node?.venue) lines.push(`  journal = {${node.venue}},`);
  if (node?.year) lines.push(`  year = {${node.year}},`);
  if (node?.doi) lines.push(`  doi = {${node.doi}},`);
  if (node?.url) lines.push(`  url = {${node.url}},`);
  lines.push('}');
  return lines.join('\n');
}

export function formatUnseenMarkdown({ seedPapers = [], listItems = [], counts = null }) {
  const seedById = new Map(seedPapers.map(p => [p.id, p]));
  const totalSeeds = seedPapers.length;
  const missing = listItems.filter(n => n.statusTier === 'missing');
  const unread = listItems.filter(n => n.statusTier === 'unread');
  const other = listItems.filter(n => n.statusTier === 'read');

  const lines = [
    '# 引文交叉漏读与共同引用清单',
    '',
    `- 所选种子文献：${totalSeeds} 篇`,
    `- 导出条目：${listItems.length} 篇（未入库 ${missing.length} 篇 · 库内未读 ${unread.length} 篇${other.length ? ` · 库内已读 ${other.length} 篇` : ''}）`,
    counts ? `- 全图统计：共引且未看 ${counts.cocitedUnseen} 篇（未入库 ${counts.cocitedMissing} 篇 + 库内未读 ${counts.cocitedUnread} 篇）` : '',
    '',
    '## 所选种子文献',
    ...seedPapers.map((p, idx) => `${idx + 1}. ${p.title}${p.year ? ` (${p.year})` : ''}${p.doi ? ` · DOI: ${p.doi}` : ''}`),
  ].filter(line => line !== '');

  const renderSection = (heading, items) => {
    if (!items.length) return;
    lines.push('', `## ${heading}（${items.length} 篇）`, '');
    for (const node of items) {
      const citingTitles = node.citedBySeedIds.map(id => seedById.get(id)?.title || id);
      const meta = [
        node.authors?.slice(0, 3).join(', ') || '作者未知',
        node.year ?? '年份未知',
        node.venue || null,
        node.citationCount !== null ? `被引 ${node.citationCount}` : null,
        node.doi ? `DOI: ${node.doi}` : null,
      ].filter(Boolean).join(' · ');
      lines.push(`### ${node.title}`);
      lines.push(`- 共引交叉：被 ${node.coCiteCount} / ${totalSeeds} 篇所选文献共同引用`);
      lines.push(`- 题录信息：${meta}`);
      lines.push(`- 引用它的种子：${citingTitles.join('；')}`);
      lines.push('');
    }
  };

  renderSection('共同引用 · 尚未入库', missing);
  renderSection('共同引用 · 已在库内待读', unread);
  if (other.length) renderSection('已读参考', other);

  return lines.join('\n').trim() + '\n';
}


// Remove a direct edge only while an alternate directed path still exists.
export function reduceCitationEdges(edges) {
  const outgoing = new Map();
  for (const {source, target} of edges) {
    if (!outgoing.has(source)) outgoing.set(source, new Set());
    outgoing.get(source).add(target);
  }
  for (const [source, direct] of outgoing) {
    for (const via of direct) {
      if (direct.size < 2) break;
      const seen = new Set([source, via]);
      const stack = [via];
      while (stack.length) {
        const current = stack.pop();
        for (const next of outgoing.get(current) || []) {
          if (seen.has(next)) continue;
          seen.add(next);
          direct.delete(next);
          stack.push(next);
        }
      }
    }
  }
  return edges.filter(({source, target}) => outgoing.get(source).has(target));
}
