const normalize = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
let cache;

export function sharedTagLinks(papers, threshold = 6) {
  const rows = papers.map(paper => [...new Set((paper.tags || []).map(normalize).filter(Boolean))]);
  const key = JSON.stringify([threshold, papers.map((paper, index) => [paper.id, rows[index]])]);
  if (cache?.key === key) return cache.links.map(edge => ({ ...edge }));
  const index = new Map();
  rows.forEach((tags, paper) => {
    for (const tag of tags) {
      if (!index.has(tag)) index.set(tag, []);
      index.get(tag).push(paper);
    }
  });
  const links = [];
  rows.forEach((tags, source) => {
    const counts = new Map();
    for (const tag of tags) {
      for (const target of index.get(tag)) {
        if (target > source) counts.set(target, (counts.get(target) || 0) + 1);
      }
    }
    for (const [target, sharedTags] of [...counts].sort((a, b) => a[0] - b[0])) {
      if (sharedTags > threshold) links.push({ source, target, sharedTags });
    }
  });
  cache = { key, links };
  return links.map(edge => ({ ...edge }));
}

export function sharedTagLocalPapers(papers, id, depth = 1, threshold = 6) {
  const start = papers.findIndex(paper => paper.id === id);
  if (start < 0) return papers;
  const selected = new Set([start]);
  const links = sharedTagLinks(papers, threshold);
  for (let layer = 0; layer < depth; layer++) {
    const before = new Set(selected);
    for (const edge of links) {
      if (before.has(edge.source)) selected.add(edge.target);
      if (before.has(edge.target)) selected.add(edge.source);
    }
  }
  return papers.filter((_, index) => selected.has(index));
}
