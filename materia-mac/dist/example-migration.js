// These are the exact bytes of the two synthetic fixtures shipped during development.
const fixtures = new Set(['5e5800d0792c93c2ea1f2db5745847770fdde5836b877c9c564feeb1fe29bf66','30431b2eb6a0a67269501d4fd5b7235e91d1cdc4d0358958ba8e3d59c705a68d']);
export function isOldExample(paper) { return paper.demo === true || /^demo-[0-5]-\d+$/.test(paper.id) && !paper.file && !paper.pdfPath || fixtures.has(String(paper.fingerprint || '').toLowerCase()); }
export function removeOldExampleNotes(notes, removedIds) {
  const next = {};
  for (const [key,list] of Object.entries(notes || {})) if (!removedIds.has(key.replace(/^paper:/,''))) {
    const keep = list.filter(n=> !['qa-t1','qa-n1','qa-n2'].includes(n.id) && !n.id?.startsWith('demo-note-'));
    if (keep.length) next[key] = keep;
  }
  return next;
}
