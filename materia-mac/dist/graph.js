import { PALETTE } from './palette.js';
import { eligibleTags, tagCounts, MIN_TAG_PAPERS } from './tags.js';

export function buildLinks(papers, eligible = eligibleTags(papers)) {
  const byTag = new Map();
  papers.forEach((paper, index) => {
    for (const tag of new Set(paper.tags)) {
      if (!eligible.has(tag)) continue;
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag).push(index);
    }
  });
  const links = new Map();
  for (const [tag, indices] of byTag) {
    for (let i = 0; i < indices.length; i++) for (let j = i + 1; j < indices.length; j++) {
      const key = `${indices[i]}:${indices[j]}`;
      if (!links.has(key)) links.set(key, { source: indices[i], target: indices[j], tags: [] });
      links.get(key).tags.push(tag);
    }
  }
  return [...links.values()];
}

export function countLinks(papers, eligible = eligibleTags(papers)) {
  // A bit set stores each undirected pair once, even when several tags overlap.
  const tags = new Map();
  papers.forEach((paper, index) => {
    for (const tag of new Set(paper.tags)) {
      if (!eligible.has(tag)) continue;
      if (!tags.has(tag)) tags.set(tag, []);
      tags.get(tag).push(index);
    }
  });
  const n = papers.length;
  const bits = new Uint8Array(Math.ceil(n * (n - 1) / 16));
  let count = 0;
  for (const indices of tags.values()) for (let i = 0; i < indices.length; i++) for (let j = i + 1; j < indices.length; j++) {
    const a = indices[i], b = indices[j];
    const pair = a * (2 * n - a - 1) / 2 + b - a - 1;
    const byte = pair >> 3, mask = 1 << (pair & 7);
    if (!(bits[byte] & mask)) { bits[byte] |= mask; count++; }
  }
  return count;
}

export function tagGroups(papers) {
  return [...tagCounts(papers)].filter(([, count]) => count >= MIN_TAG_PAPERS).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, count], i) => ({ name, count, color: PALETTE[i % PALETTE.length] }));
}

export { StarMap } from './graph-view.js';
