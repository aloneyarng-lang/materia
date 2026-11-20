import { matchMetadata } from './catalog.js';
import { parseMarkdown } from './markdown.js';
export const filenameKey = value => String(value || '').split(/[\\/]/).pop().normalize('NFKC').trim().toLocaleLowerCase();
export function parseMetadata(text) {
  text=text.replace(/^\uFEFF/,'');
  const fenced=text.trim().match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i);if(fenced)text=fenced[1];
  if (!text.trim()) return [];
  if (/^\s*(?:#|格式版本)/.test(text) || /^##\s+(?:文献|paper)(?:\s|[:：]|$)/im.test(text)) return parseMarkdown(text);
  const parsed = JSON.parse(text), rows = Array.isArray(parsed) ? parsed : parsed.papers;
  if (!Array.isArray(rows)) throw new Error('请导入规范 Markdown 或包含 papers 数组的 JSON。');
  return rows;
}
export function matchRecords(records, papers, {tagMode='append'} = {}) {
  const updates = [], unmatched = [], notes = [], ids = new Set();
  for (const row of records) {
    const result = matchMetadata(JSON.stringify([row]), papers);
    if (!result.updates.length) { unmatched.push(...result.unmatched); continue; }
    const paper = result.updates[0];
    const previous=papers.find(p=>p.id===paper.id);
    if(row.tags!==undefined&&tagMode!=='replace')paper.tags=[...new Set([...(previous?.tags || []),...paper.tags])];
    if (ids.has(paper.id)) throw new Error(`多条元数据匹配到「${paper.title}」，请按文献区块去重。`); ids.add(paper.id);
    updates.push(paper);
    for (const note of row.paperNotes || []) if (note.body?.trim()) notes.push({ owner: `paper:${paper.id}`, body: note.body.trim(), paperId: paper.id });
    for (const note of row.tagNotes || []) if (note.tag?.trim() && note.body?.trim()) notes.push({ owner: `tag:${note.tag.trim()}`, body: note.body.trim(), paperId: paper.id });
  }
  return { updates, unmatched, notes };
}
export function mergeImportNotes(current, incoming) {
  const next = structuredClone(current);
  for (const note of incoming) {
    next[note.owner] ||= [];
    if (next[note.owner].some(n=>n.body === note.body)) continue;
    const now = Date.now(); next[note.owner].push({ id: `note-${crypto.randomUUID()}`, body: note.body, createdAt: now, updatedAt: now });
  }
  return next;
}
export async function planBatch(files, records, existing, { collection = '', tags = [], tagMode = 'append', onProgress = () => {}, fingerprint = null } = {}) {
  const hash = fingerprint || (async file => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join(''));
  const byHash = new Map(existing.filter(p=>p.fingerprint).map(p=>[p.fingerprint,p]));
  const targets = new Map(), rows = [], matchedRecords = new Set(), incomingNotes = [];
  let duplicates = 0, index = 0;
  for (const file of files) {
    onProgress(++index, files.length, file.name);
    const digest = await hash(file), previous = byHash.get(digest);
    if (previous && targets.has(previous.id)) { duplicates++; rows.push({ filename:file.name, status:'批内重复', paper:previous }); continue; }
    const base = previous ? { ...previous, filename: file.name } : { id:`paper-${crypto.randomUUID()}`, title:file.name.replace(/\.pdf$/i,'').replaceAll('_',' '), authors:'', authorDetails:[], journal:'', year:'', doi:'', impactFactor:null, impactYear:'', tags:[], materials:[], notes:'', collection, favorite:false, addedAt:Date.now()+index, file, size:file.size, filename:file.name, fingerprint:digest };
    let choices = records.map((r,i)=>({r,i})).filter(({r})=>r.filename && filenameKey(r.filename) === filenameKey(file.name));
    if (!choices.length) choices = records.map((r,i)=>({r,i})).filter(({r})=>r.id === base.id || r.title && r.title.toLocaleLowerCase() === base.title.toLocaleLowerCase());
    if (choices.length > 1) throw new Error(`「${file.name}」匹配多个 Markdown 文献区块，请让文件名唯一。`);
    let paper = base, notes = [];
    if (choices.length) {
      const {r,i} = choices[0];
      if (matchedRecords.has(i)) throw new Error(`多个不同 PDF 都叫「${file.name}」，请先使用唯一文件名再匹配 Markdown。`);
      const matched = matchRecords([{ ...r, id:base.id }], [base], {tagMode}); paper = matched.updates[0]; notes = matched.notes; matchedRecords.add(i);
    }
    paper.tags = [...new Set([...paper.tags, ...tags])];
    if (collection) paper.collection = collection;
    const changed = !previous || choices.length || tags.length || collection;
    if (changed) { targets.set(paper.id, paper); incomingNotes.push(...notes); }
    if (previous) duplicates++;
    byHash.set(digest, paper);
    rows.push({ filename:file.name, paper, status:!previous ? choices.length ? '新增 · MD 已匹配' : '新增 · 待补元数据' : changed ? '已有 PDF · 更新信息' : '已存在 · 跳过' });
  }
  const unmatched = [];
  for (let i=0;i<records.length;i++) if (!matchedRecords.has(i)) {
    const result = matchRecords([records[i]], existing, {tagMode});
    if (result.updates.length) {
      const paper = result.updates[0]; if (targets.has(paper.id)) throw new Error(`「${paper.title}」被重复匹配，请检查 MD 文献区块。`);
      targets.set(paper.id,paper); incomingNotes.push(...result.notes); rows.push({ filename:paper.filename, paper, status:'仅元数据 · 更新' });
    } else unmatched.push(records[i].filename || records[i].title || records[i].id || `第 ${i+1} 条`);
  }
  const updates = [...targets.values()], existingIds = new Set(existing.map(p=>p.id));
  return { updates, notes:incomingNotes, rows, unmatched, duplicates, added:updates.filter(p=>!existingIds.has(p.id)).length, updated:updates.filter(p=>existingIds.has(p.id)).length };
}
