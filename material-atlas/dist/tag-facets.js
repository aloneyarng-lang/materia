export const DEFAULT_TAG_WEIGHT = .05;
const knownFacets = new Set(['方向','体系','结构','形态','工艺','性能','表征','类型','应用']);
let vocabulary = {};

export function setTagVocabulary(value) {
  vocabulary = value?.facets && typeof value.facets === 'object' ? value.facets : {};
}

export async function loadTagVocabulary() {
  try {
    const response = await fetch(new URL('./tag-vocab.json', import.meta.url));
    if (!response.ok) throw new Error('Missing vocabulary');
    setTagVocabulary(await response.json());
  } catch { setTagVocabulary(null); }
}

export function tagFacet(tag, facets = vocabulary) {
  const colon = tag.indexOf(':');
  const prefix = colon > 0 ? tag.slice(0, colon).trim() : '';
  const entry = knownFacets.has(prefix) ? facets[prefix] : null;
  // Zero-weight metadata stays excluded even when the vocabulary is unavailable.
  if (prefix === '表征' || prefix === '类型') return {facet:prefix, weight:0};
  if (entry && typeof entry.weight === 'number' && Number.isFinite(entry.weight) && entry.weight >= 0) {
    return {facet:prefix, weight:entry.weight};
  }
  return {facet:'', weight:DEFAULT_TAG_WEIGHT};
}
