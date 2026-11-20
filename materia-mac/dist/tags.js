export const MIN_TAG_PAPERS = 3;

// Count library membership, never repeated occurrences within one paper.
export function tagCounts(papers) {
  const counts = new Map();
  for (const paper of papers) for (const tag of new Set(paper.tags || [])) {
    if (tag) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return counts;
}

export function eligibleTags(papers) {
  return new Set([...tagCounts(papers)].filter(([, count]) => count >= MIN_TAG_PAPERS).map(([tag]) => tag));
}

export const primaryTag = (paper, eligible) => (paper.tags || []).find(tag => eligible.has(tag)) || '';
