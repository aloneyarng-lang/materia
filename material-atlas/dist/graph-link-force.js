// Shared by the live simulation and the one-click natural arrangement.
export function graphLinkDistance(edge, spacing) {
  if (Number.isFinite(edge.sharedTags)) return spacing / Math.sqrt(edge.sharedTags);
  return edge.similarity === undefined ? spacing : spacing * (1.65 - 1.15 * edge.similarity);
}

export function graphLinkStrength(edge, strength) {
  if (Number.isFinite(edge.sharedTags)) return strength * edge.sharedTags;
  return strength * (edge.similarity === undefined ? 1 : .4 + 1.6 * edge.similarity);
}
