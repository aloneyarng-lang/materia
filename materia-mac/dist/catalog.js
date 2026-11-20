import { paperMaterials, paperMeasurements, normalizePaperMaterials } from './materials.js';
import { eligibleTags } from './tags.js';
import { hasParameter } from './parameter-index.js';
import {readingStatusOf,readingStatusRank} from './reading-status.js';
export const journalKey = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
export function normalizeAuthors(input) {
  if (!input) return [];
  const rows = typeof input === 'string' ? input.split(/\r?\n/).filter(Boolean).map(line => { const [name, ...institutions] = line.split('|'); return { name, affiliations: institutions.join(';').split(/[;；]/) }; }) : Array.isArray(input) ? input : [];
  return rows.slice(0, 2000).map(item => {
    if (typeof item === 'string') return { name: item.trim().slice(0, 500), affiliations: [] };
    const affiliations = item?.affiliations ?? item?.institutions ?? item?.affiliation ?? item?.institution ?? [];
    return { name: String(item?.name || item?.author || '').trim().slice(0, 500), affiliations: [...new Set((Array.isArray(affiliations) ? affiliations : String(affiliations).split(/[;；]/)).map(v => String(v).trim().slice(0, 1000)).filter(Boolean))].slice(0, 100) };
  }).filter(item => item.name);
}
export const authorsText = details => normalizeAuthors(details).map(a => a.name + (a.affiliations.length ? ` | ${a.affiliations.join('；')}` : '')).join('\n');
export const numericImpact = value => value === '' || value === null || value === undefined || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1000 ? null : Number(value);
export function impactOf(paper, metrics = [], year = '') {
  const explicit = numericImpact(paper.impactFactor);
  if (explicit !== null && (!year || String(paper.impactYear) === String(year))) return { value: explicit, year: paper.impactYear || '', source: '文献手动录入' };
  const rows = metrics.filter(m => journalKey(m.journal) === journalKey(paper.journal) && numericImpact(m.impactFactor) !== null && (!year || String(m.year) === String(year))).sort((a, b) => Number(b.year) - Number(a.year));
  return rows.length ? { value: Number(rows[0].impactFactor), year: rows[0].year || '', source: rows[0].source || '导入的期刊指标' } : null;
}
export function filterCatalog(papers, state, notes = {}, metrics = []) {
  const f = state.filters || {}, q = String(state.query || '').toLocaleLowerCase().trim();
  const tokens = [...q.matchAll(/"([^"]+)"|(\S+)/g)].map(m => m[1] || m[2]);
  const eligible = eligibleTags(papers);
  const noteText = p => [p.notes || '', ...(notes[`paper:${p.id}`] || []).map(n => [n.anchor?.label,n.body,...(n.attachments||[]).map(image=>image.name)].join(' ')), ...p.tags.flatMap(tag => (notes[`tag:${tag}`] || []).map(n => n.body))].join(' ');
  let result = papers.filter(p => {
    if(state.readingStatus&&readingStatusOf(p)!==state.readingStatus)return false;
    if (f.parameterName && !hasParameter(p, f.parameterName, f.parameterUnit ?? '*')) return false;
    if (state.hiddenIds?.has(p.id) || f.excludeTags?.some(tag => p.tags.includes(tag))) return false;
    const authors = normalizeAuthors(p.authorDetails || []);
    const author = [p.authors || '', ...authors.map(a => a.name)].join(' '), institutions = authors.flatMap(a => a.affiliations).join(' ');
    const content = state.searchScope === 'title' ? p.title : state.searchScope === 'tags' ? [...p.tags, p.journal].join(' ') : state.searchScope === 'notes' ? noteText(p) : [p.title, author, institutions, p.journal, p.doi, ...p.tags, ...paperMaterials(p).flatMap(m=>[m.name,m.composition,m.description]), noteText(p), ...(paperMeasurements(p)).flatMap(m=>[m.name,m.value,m.unit,m.sample,m.conditions])].join(' ');
    if (!tokens.every(token => token.startsWith('#') ? p.tags.some(tag => tag.toLocaleLowerCase().includes(token.slice(1))) : content.toLocaleLowerCase().includes(token))) return false;
    if (state.collection && p.collection !== state.collection || state.nav === 'favorites' && !p.favorite || state.tag && !p.tags.includes(state.tag) || state.year && p.year !== state.year) return false;
    if (f.tags?.length && !(f.tagMode === 'any' ? f.tags.some(t => p.tags.includes(t)) : f.tags.every(t => p.tags.includes(t)))) return false;
    if (f.journal && journalKey(p.journal) !== journalKey(f.journal) || f.author && !author.toLocaleLowerCase().includes(f.author.toLocaleLowerCase()) || f.institution && !institutions.toLocaleLowerCase().includes(f.institution.toLocaleLowerCase())) return false;
    if (f.yearFrom && (!p.year || Number(p.year) < Number(f.yearFrom)) || f.yearTo && (!p.year || Number(p.year) > Number(f.yearTo))) return false;
    const metric = impactOf(p, metrics, f.impactYear);
    if (f.minIF !== '' && f.minIF !== undefined && (!metric || metric.value < Number(f.minIF)) || f.maxIF !== '' && f.maxIF !== undefined && (!metric || metric.value > Number(f.maxIF))) return false;
    if (f.onlyFavorites && !p.favorite || f.hasNotes && !noteText(p).trim() || f.onlyRelated && !p.tags.some(t => eligible.has(t))) return false;
    return true;
  });
  result.sort((a, b) => {
    if(state.sort==='reading-status'){const difference=readingStatusRank(a)-readingStatusRank(b);if(difference)return difference;}
    if (state.sort === 'if-desc' || state.sort === 'if-asc') {
      const ai = impactOf(a, metrics, f.impactYear)?.value, bi = impactOf(b, metrics, f.impactYear)?.value;
      if (ai === undefined && bi !== undefined) return 1; if (bi === undefined && ai !== undefined) return -1;
      if (ai !== undefined && bi !== undefined && ai !== bi) return state.sort === 'if-desc' ? bi - ai : ai - bi;
    }
    if (state.sort === 'title') return a.title.localeCompare(b.title);
    if (state.sort === 'year-desc' || state.sort === 'year-asc') { if (!a.year && b.year) return 1; if (!b.year && a.year) return -1; return state.sort === 'year-desc' ? Number(b.year) - Number(a.year) : Number(a.year) - Number(b.year); }
    return b.addedAt - a.addedAt;
  });
  return result;
}
export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const delimiter = text.split(/\r?\n/)[0].includes('\t') ? '\t' : ',';
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (c === delimiter && !quoted) { row.push(field.trim()); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field.trim()); if (row.some(Boolean)) rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (quoted) throw new Error('CSV 中存在未闭合的引号。');
  row.push(field.trim()); if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) throw new Error('文件需要表头和至少一行数据。');
  const headers = rows.shift().map(h => h.toLocaleLowerCase().replace(/[ _-]/g, ''));
  return rows.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] || ''])));
}
export function parseMetrics(text) {
  const trimmed = text.trim();
  const parsed = /^[\[{]/.test(trimmed) ? JSON.parse(trimmed) : parseCSV(trimmed);
  const rows = Array.isArray(parsed) ? parsed : parsed.journals || parsed.metrics;
  if (!Array.isArray(rows) || !rows.length || rows.length > 50000) throw new Error('期刊指标文件需要包含有效记录。');
  const result = new Map();
  rows.forEach((row, index) => {
    const journal = String(row.journal || row.期刊 || row.刊物 || row.journaltitle || '').trim();
    const value = numericImpact(row.impactFactor ?? row.impactfactor ?? row.if ?? row.影响因子);
    const year = String(row.year || row.年份 || row.impactYear || row.impactyear || '').trim();
    if (!journal || value === null || !/^\d{4}$/.test(year)) throw new Error(`第 ${index + 1} 条指标需要期刊名称、有效影响因子和四位指标年份。`);
    result.set(`${journalKey(journal)}:${year}`, { journal: journal.slice(0, 300), impactFactor: value, year, source: String(row.source || row.来源 || '').slice(0, 500) });
  });
  return [...result.values()];
}
export function mergeMetrics(current, incoming) { return [...new Map([...current, ...incoming].map(m => [`${journalKey(m.journal)}:${m.year}`, m])).values()]; }
export function matchMetadata(text, papers) {
  const data = JSON.parse(text), rows = Array.isArray(data) ? data : data.papers;
  if (!Array.isArray(rows) || !rows.length) throw new Error('元数据 JSON 需要 papers 数组或文献数组。');
  const updates = [], unmatched = [];
  for (const row of rows) {
    let candidates = row.id ? papers.filter(p => p.id === row.id) : [];
    if (!candidates.length && row.filename) { const key = v => String(v || '').split(/[\\/]/).pop().normalize('NFKC').toLocaleLowerCase(); candidates = papers.filter(p => key(p.filename) === key(row.filename)); }
    if (!candidates.length && row.doi) candidates = papers.filter(p => p.doi && journalKey(p.doi) === journalKey(row.doi));
    if (!candidates.length && row.title) candidates = papers.filter(p => journalKey(p.title) === journalKey(row.title));
    if (candidates.length !== 1) { unmatched.push(row.filename || row.title || row.id || '未标识文献'); continue; }
    const existing = candidates[0], authorDetails = row.authors !== undefined || row.authorDetails !== undefined ? normalizeAuthors(row.authorDetails || row.authors) : existing.authorDetails;
    const updated = { ...existing };
    for (const field of ['title', 'journal', 'doi', 'year', 'impactYear']) if (row[field] !== undefined) updated[field] = String(row[field]).slice(0, 1000);
    if (!updated.title.trim() || updated.year && !/^\d{4}$/.test(updated.year) || updated.impactYear && !/^\d{4}$/.test(updated.impactYear)) throw new Error('标题或年份格式不正确。');
    if ((row.authors !== undefined || row.authorDetails !== undefined) && authorDetails) { updated.authorDetails = authorDetails; updated.authors = authorDetails.map(a => a.name).join(', '); }
    if (row.tags !== undefined) { if (!Array.isArray(row.tags)) throw new Error('tags 必须是字符串数组。'); updated.tags = [...new Set(row.tags.map(t => String(t).trim()).filter(Boolean))].slice(0, 30); }
    if (row.impactFactor !== undefined) { updated.impactFactor = numericImpact(row.impactFactor); if (updated.impactFactor === null && row.impactFactor !== null && row.impactFactor !== '') throw new Error('影响因子格式不正确。'); }
    if (row.materials !== undefined && row.measurements !== undefined) throw new Error('请使用 materials 材料数组，不要同时提供文献级 measurements。');
    if (row.materials !== undefined || row.measurements !== undefined) {
      const incoming = row.materials !== undefined ? { materials: row.materials } : { measurements: row.measurements };
      updated.materials = normalizePaperMaterials(incoming).materials; delete updated.measurements;
    }
    updates.push(updated);
  }
  if (new Set(updates.map(p => p.id)).size !== updates.length) throw new Error('同一份元数据中多条记录匹配到同一篇文献，请先去重。');
  return { updates, unmatched };
}
