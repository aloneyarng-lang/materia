// Evidence is taken only from the bibliography of the citing PDF.
const heading = /^\s*(?:\d+\.?\s+)?(?:references|bibliography|literature cited|works cited|参考文献|引用文献)\s*[:：]?\s*$/i;
const ending = /^\s*(?:\d+\.?\s+)?(?:appendix(?:\s+[A-Z0-9]+)?(?:[.:：].*)?|supplementary (?:material|data|information)|supporting information|acknowledg(?:e)?ments|author biographies)\s*[:：]?\s*$/i;
const doiPattern = /\b10\.\d{4,9}\/[-._;()/:a-z0-9]+/gi;
export function citationDoi(value) {
  let text = String(value ?? '').trim();
  try { text = decodeURIComponent(text); } catch {}
  return text.replace(/^(?:doi\s*:\s*|https?:\/\/(?:dx\.)?doi\.org\/)/i, '').toLowerCase();
}
const titleKey = value => String(value ?? '').normalize('NFKC').replace(/<\/?(?:sub|sup)\b[^>]*>/gi, '')
  .replace(/\u00ad/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function bibliography(pages) {
  const result = [];
  let active = false;
  for (const [index, page] of pages.entries()) {
    const lines = [];
    for (const line of page.split(/\r?\n/)) {
      if (heading.test(line)) { active = true; continue; }
      if (active && ending.test(line)) { add(lines,index); return result; }
      if (active) lines.push(line);
    }
    add(lines, index);
  }
  return result;
  function add(lines, index) {
    const text = lines.join('\n');
    if (text.trim()) result.push({page:index + 1, text:titleKey(text), dois:[...(text.match(doiPattern) || [])]});
  }
}

export function citationLinks(papers, bibliographies) {
  const doiIndex = new Map(), titleIndex = new Map();
  for (const paper of papers) {
    const doi = citationDoi(paper.doi), title = titleKey(paper.title);
    if (/^10\.\d{4,9}\/\S+$/.test(doi)) unique(doiIndex, doi, paper.id);
    if (title.length >= 28 && title.split(' ').length >= 4) unique(titleIndex, title, paper.id);
  }
  const edges = [];
  for (const {id:source} of papers) {
    const matches = new Map();
    for (const {page,text,dois} of bibliographies.get(source) || []) {
      for (const token of dois) {
        let doi = citationDoi(token);
        while (!doiIndex.has(doi) && /[.,;:)\]]$/.test(doi)) doi = doi.slice(0, -1);
        add(doiIndex.get(doi), 'doi', page);
      }
      const words = ' ' + text + ' ';
      for (const [title,target] of titleIndex) if (target && words.includes(' ' + title + ' ')) add(target, 'title', page);
    }
    edges.push(...matches.values());
    function add(target, method, page) {
      if (!target || source === target) return;
      const previous = matches.get(target);
      if (!previous || previous.method === 'title' && method === 'doi') matches.set(target,{source,target,method,page});
    }
  }
  return edges;
  function unique(index, key, id) { index.set(key, index.has(key) ? null : id); }
}

export function citationLocalPapers(papers, edges, id, depth) {
  const allowed = new Set(papers.map(p => p.id));
  if (!allowed.has(id)) return papers;
  const reached = new Set([id]);
  for (let layer = 0; layer < depth; layer++) {
    const current = new Set(reached);
    for (const {source,target} of edges) {
      if (current.has(source) && allowed.has(target)) reached.add(target);
      if (current.has(target) && allowed.has(source)) reached.add(source);
    }
  }
  return papers.filter(p => reached.has(p.id));
}

export function citationGeometry(source, target) {
  const dx = target.x-source.x, dy = target.y-source.y, length = Math.hypot(dx,dy);
  const line = `M${source.x},${source.y}L${target.x},${target.y}`;
  if (length < 25) return line;
  const x = source.x + dx*.67, y = source.y + dy*.67, ux = dx/length, uy = dy/length;
  return line + `M${x-ux*7-uy*3.5},${y-uy*7+ux*3.5}L${x},${y}L${x-ux*7+uy*3.5},${y-uy*7-ux*3.5}`;
}
