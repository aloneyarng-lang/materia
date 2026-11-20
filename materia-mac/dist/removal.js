export function takeRemoval(data, ids, id, createdAt = Date.now()) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 10000 || ids.some(value => typeof value !== 'string' || !value)) throw new Error('请选择有效的文献。');
  const selected = new Set(ids), papers = data.papers.filter(paper => selected.has(paper.id));
  const notes = {}, selection = data.settings.comparisonSelection || [];
  for (const paper of papers) {
    const key = `paper:${paper.id}`;
    if (data.settings.notes?.[key]) notes[key] = data.settings.notes[key];
  }
  const batch = { format: 'materia-removal', version: 1, id, createdAt, papers, notes, selection: selection.filter(value => selected.has(value)) };
  if (papers.length) {
    data.papers = data.papers.filter(paper => !selected.has(paper.id));
    data.settings.notes = { ...data.settings.notes };
    for (const paper of papers) delete data.settings.notes[`paper:${paper.id}`];
    data.settings.comparisonSelection = selection.filter(value => !selected.has(value));
    data.settings.lastRemoval = { id, count: papers.length, createdAt };
  }
  return batch;
}

export function restoreRemoval(data, batch) {
  if (batch?.format !== 'materia-removal' || batch.version !== 1 || !Array.isArray(batch.papers)) throw new Error('移除记录无法读取。');
  const existing = new Set(data.papers.map(paper => paper.id));
  const restored = [];
  for (const paper of batch.papers) {
    if (!paper || typeof paper.id !== 'string' || !paper.id || typeof paper.title !== 'string' || !paper.title.trim()) throw new Error('移除记录中的文献信息不正确。');
    if (!existing.has(paper.id)) { restored.push(paper); existing.add(paper.id); }
  }
  data.papers.push(...restored);
  data.settings.notes ||= {};
  for (const paper of restored) {
    const key = `paper:${paper.id}`;
    data.settings.notes[key] = [...new Map([...(batch.notes?.[key] || []), ...(data.settings.notes[key] || [])].map(note => [note.id, note])).values()];
  }
  const restoredIds = new Set(restored.map(paper => paper.id));
  data.settings.comparisonSelection = [...new Set([...(data.settings.comparisonSelection || []), ...(batch.selection || []).filter(id => restoredIds.has(id))])];
  if (data.settings.lastRemoval?.id === batch.id) data.settings.lastRemoval = null;
  return restored;
}
