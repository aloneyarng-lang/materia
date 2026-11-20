export function wikiLinks(body) {
  return [...String(body || '').matchAll(/\[\[([^\]\r\n]{1,1000})\]\]/g)].map(match => ({ raw: match[0], value: match[1].trim(), index: match.index, type: match[1].trim().startsWith('#') ? 'tag' : 'paper' }));
}
export function resolveLink(link, papers) {
  if (link.type === 'tag') return { type: 'tag', id: link.value.slice(1).trim() };
  const paper = papers.find(p => p.title.toLocaleLowerCase() === link.value.toLocaleLowerCase());
  return paper ? { type: 'paper', id: paper.id } : null;
}
export function backlinks(notes, type, id, papers) {
  const key = `${type}:${id}`, results = [];
  for (const [source, list] of Object.entries(notes)) {
    if (source === key) continue;
    for (const note of list) if (wikiLinks(note.body).some(link => { const resolved = resolveLink(link, papers); return resolved?.type === type && resolved.id === id; })) results.push({ source, note });
  }
  return results;
}
export function renameTitleLinks(notes, oldTitle, newTitle) {
  if (oldTitle === newTitle) return notes;
  return Object.fromEntries(Object.entries(notes).map(([key, list]) => [key, list.map(note => ({ ...note, body: note.body.replace(/\[\[([^\]\r\n]{1,1000})\]\]/g, (raw, value) => value.trim().toLocaleLowerCase() === oldTitle.toLocaleLowerCase() ? `[[${newTitle}]]` : raw) }))]));
}
