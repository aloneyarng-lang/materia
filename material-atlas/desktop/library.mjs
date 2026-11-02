import {cleanStudy,cleanVocabulary,cleanTranslationCache,cleanTranslationPreferences,applyStudyOperation,mergeVocabulary,saveTranslationCache} from '../dist/study-model.js';
import {cleanMaterialSelection} from '../dist/material-selection.js';
import {cleanMaterialGroups,mergeMaterialGroups} from '../dist/material-list-model.js';
import { normalizeNotes, cleanReaderState, cleanReaderDrafts } from '../dist/note-model.js';
import { mkdir, readFile, writeFile, rename, copyFile, stat, access } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { normalizeAuthors, numericImpact, mergeMetrics, parseMetrics } from '../dist/catalog.js';
import { renameTitleLinks } from '../dist/note-links.js';
import { normalizePaperMaterials, materializePaper } from '../dist/materials.js';
import { isOldExample, removeOldExampleNotes } from '../dist/example-migration.js';
import { takeRemoval, restoreRemoval } from '../dist/removal.js';
import { planBulkEdit } from '../dist/bulk-edit.js';
import { cleanLayout } from '../dist/force-layout.js';
import { cleanFigureSettings } from '../dist/figure.js';
import { cleanGraphSettings } from '../dist/graph-settings.js';
import { GRAPH_APPEARANCE_VERSION } from '../dist/graph-appearance.js';
import { cleanAssociations } from '../dist/associations.js';
import { seedJournalMetrics } from '../dist/journal-data.js';
import { cleanThemePreferences } from '../dist/themes.js';
import {FolderSync} from './folder-sync.mjs';
import {seedImportActivity,recordImports,mergeImportActivity} from '../dist/import-activity.js';
import {planReadingStatus,preserveReadingStatus} from '../dist/reading-status.js';

export function resolveInside(root, relative) {
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) throw new Error('文件路径超出当前文献库。');
  return resolved;
}
export function cleanTags(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter(t => typeof t === 'string').map(t => t.trim().slice(0, 80)).filter(Boolean))].slice(0, 30);
}
export const cleanNotes = normalizeNotes;

export class LocalLibrary {
  constructor(root) { this.root = path.resolve(root); this.queue = Promise.resolve(); this.folders=new FolderSync(this.root); }
  async init() {
    await mkdir(path.join(this.root, 'papers'), { recursive: true });
    await mkdir(path.join(this.root, 'backups'), { recursive: true });
    const file = path.join(this.root, 'library.json');
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8'));
      if (parsed.format !== 'materia-library' || ![1,2,3].includes(parsed.version) || !Array.isArray(parsed.papers)) throw new Error('文献库格式不受支持。');
      for (const paper of parsed.papers) if (paper.pdfPath) resolveInside(this.root, paper.pdfPath);
      this.data = parsed; this.data.settings ||= {};
      this.data.settings.mode = 'own';
      const examples = this.data.papers.filter(isOldExample);
      if (examples.length) {
        this.data.papers = this.data.papers.filter(p=>!isOldExample(p));
        this.data.settings.notes = removeOldExampleNotes(this.data.settings.notes || {}, new Set(examples.map(p=>p.id)));
        await this.save(this.data);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error(`无法读取文献库，原文件已保留：${error.message}`);
      this.data = { format: 'materia-library', version: 1, papers: [], settings: { collections: [], notes: {}, mode: 'own' } };
      await this.save(this.data);
    }
    const metrics = seedJournalMetrics(this.data.settings.journalMetrics || []);
    if (JSON.stringify(metrics) !== JSON.stringify(this.data.settings.journalMetrics)) { this.data.settings.journalMetrics = metrics; await this.save(this.data); }
    if(this.data.settings.translationPreferences?.instant===true){this.data.settings.translationPreferences=cleanTranslationPreferences(this.data.settings.translationPreferences);await this.save(this.data);}
    const next=structuredClone(this.data);
    next.settings.importActivity ||= seedImportActivity(next.papers);
    // The first upgrade exports the existing memberships before reading physical folders.
    // Afterwards the disk is reconciled first, so Explorer moves win over stale paths.
    const firstUpgrade=!next.settings.folderSync,moves=firstUpgrade?await this.folders.export(next):[];
    if(firstUpgrade)await this.folders.preserveLegacyFiles(next);
    await this.folders.import(next,(input,existing)=>this.preparePaper(input,existing));
    next.settings.importActivity=recordImports(next.settings.importActivity,next.papers);
    if(JSON.stringify(next)!==JSON.stringify(this.data))await this.save(next);
    await this.folders.finish(moves,this.data);
    return this;
  }
  async save(data) {
    const studyVersion=data.version===3||data.settings.vocabulary?.length||data.settings.translationCache?.length;
    if (data.papers.some(paper => paper.materials !== undefined)) data.version = 2;
    if(studyVersion)data.version=3;
    const target = path.join(this.root, 'library.json');
    const temp = path.join(this.root, `.library-${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(data, null, 2), { encoding: 'utf8', flag: 'wx' });
    try { await copyFile(target, path.join(this.root, 'backups', 'library.previous.json')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    await rename(temp, target);
    this.data = data;
  }
  mutate(fn) {
    const operation = this.queue.then(async () => {
      const next=structuredClone(this.data),disk=await this.folders.import(next,(input,existing)=>this.preparePaper(input,existing));
      const previous=[...next.papers];const result=await fn(next);
      const retained=new Set(next.papers.map(p=>p.id)),ignored=new Set(next.settings.folderSync?.ignored||[]);
      for(const paper of previous)if(paper.fingerprint&&(!retained.has(paper.id)||next.papers.find(p=>p.id===paper.id)?.fingerprint!==paper.fingerprint))ignored.add(paper.fingerprint);
      next.settings.folderSync={...next.settings.folderSync,ignored:[...ignored]};
      next.settings.importActivity=recordImports(next.settings.importActivity||seedImportActivity(previous),next.papers);
      const moves=await this.folders.export(next);await this.save(next);await this.folders.finish(moves,next);if(disk.changed)this.onFolderChange?.({changed:true,added:disk.added.length});return result;
    });
    this.queue = operation.catch(() => {}); return operation;
  }
  syncFolders(){
    const operation=this.queue.then(async()=>{const next=structuredClone(this.data),result=await this.folders.import(next,(input,existing)=>this.preparePaper(input,existing));const summary={changed:result.changed,added:result.added.length};if(result.changed){next.settings.importActivity=recordImports(next.settings.importActivity,next.papers);await this.save(next);this.onFolderChange?.(summary);}return summary;});
    this.queue=operation.catch(()=>{});return operation;
  }
  getPapers() { return this.data.papers.map(p => materializePaper({ ...p, file: p.pdfPath ? { desktop: true, size: p.size } : null })); }
  getSetting(key) { return this.data.settings[key]; }
  async setSetting(key, value) {
    const previousGroups=key==='collections'?structuredClone(this.data.settings.collections||[]):null;
    const moduleData=typeof key==='string'&&/^module:[a-z][a-z0-9-]{0,63}$/.test(key);
    if (!moduleData&&!['workspaceModules','collections', 'notes', 'mode', 'journalMetrics', 'comparisonSelection', 'comparisonState', 'graphLayout', 'chartPreferences', 'graphPreferences', 'graphAssociations', 'themePreferences', 'readerState', 'readerDrafts', 'vocabulary', 'translationCache', 'translationPreferences'].includes(key)) throw new Error('不支持的文献库设置。');
    if(key==='workspaceModules'){
      if(!value||value.version!==1||!Array.isArray(value.disabled)||value.disabled.length>256||value.disabled.some(id=>typeof id!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(id)))throw Error('功能管理设置无效。');
      value={version:1,disabled:[...new Set(value.disabled)]};
    }
    if(moduleData){const text=JSON.stringify(value);if(typeof text!=='string'||Buffer.byteLength(text)>5*1024*1024)throw Error('模块数据格式无效或超过 5 MB，请使用独立存储服务。');value=JSON.parse(text);}
    if(key==='vocabulary')value=cleanVocabulary(value);
    if(key==='translationCache')value=cleanTranslationCache(value);
    if(key==='translationPreferences')value=cleanTranslationPreferences(value);
    if(key==='comparisonState')value=cleanMaterialSelection(value);
    if(key==='readerDrafts')value=cleanReaderDrafts(value);
    if(key==='readerState')value=cleanReaderState(value);
    if(key==='themePreferences')value=cleanThemePreferences(value);
    if(key==='graphPreferences')value=cleanGraphSettings(value);
    if(key==='graphAssociations')value=cleanAssociations(value);
    if(key==='chartPreferences')value=cleanFigureSettings(value);
    if(key==='graphLayout')value=cleanLayout(value);
    if(key==='notes')value=cleanNotes(value);
    if(key==='journalMetrics')value=Array.isArray(value) && value.length ? parseMetrics(JSON.stringify(value)) : [];
    return this.mutate(data => {
      if(key==='collections'&&Array.isArray(value)){
        const previous=new Map(previousGroups.map(c=>[c.id,c])),requested=new Map(value.map(c=>[c.id,c]));
        const merged=(data.settings.collections||[]).filter(c=>!previous.has(c.id)||requested.has(c.id)).map(c=>requested.has(c.id)&&JSON.stringify(requested.get(c.id))!==JSON.stringify(previous.get(c.id))?requested.get(c.id):c);
        for(const group of value)if(!merged.some(c=>c.id===group.id))merged.push(group);data.settings.collections=merged;
      }else data.settings[key] = value;
    });
  }
  async preparePaper(input, existing) {
    if (!input || typeof input.id !== 'string' || !/^[a-z\d_-]{1,120}$/i.test(input.id) || typeof input.title !== 'string' || !input.title.trim()) throw new Error('文献信息格式不正确。');
    const paper = {
      id: input.id, title: input.title.trim().slice(0, 1000), authors: String(input.authors || '').slice(0, 1000), journal: String(input.journal || '').slice(0, 300), year: /^\d{4}$/.test(String(input.year)) ? String(input.year) : '',
      tags: cleanTags(input.tags), notes: String(input.notes || '').slice(0, 20000), collection: String(input.collection || '').slice(0, 120), favorite: Boolean(input.favorite), addedAt: Number(input.addedAt) || Date.now(),
      filename: path.basename(String(input.filename || existing?.filename || 'document.pdf')), size: existing?.size || 0, pdfPath: existing?.pdfPath || '', fingerprint: existing?.fingerprint || '',
      authorDetails: normalizeAuthors(input.authorDetails || existing?.authorDetails || []), doi: String(input.doi || '').slice(0, 1000), impactFactor: numericImpact(input.impactFactor), impactYear: /^\d{4}$/.test(String(input.impactYear)) ? String(input.impactYear) : '',
      materials: normalizePaperMaterials(input.materials !== undefined || input.measurements !== undefined ? input : existing || {}).materials,
    };
    if (input.fileBytes) {
      const bytes = Buffer.from(input.fileBytes);
      if (!bytes.subarray(0, 1024).toString('latin1').includes('%PDF-')) throw new Error('文件不是有效的 PDF。');
      paper.size = bytes.length; paper.fingerprint = createHash('sha256').update(bytes).digest('hex'); paper.pdfPath = `.imports/${paper.fingerprint}.pdf`;
      await mkdir(path.join(this.root,'.imports'),{recursive:true});
      const destination = resolveInside(this.root, paper.pdfPath);
      const temp = destination + `.${randomUUID()}.tmp`;
      await writeFile(temp, bytes, { flag: 'wx' }); await rename(temp, destination);
    }
    if (!paper.pdfPath) throw new Error('文献缺少 PDF 文件。');
    return preserveReadingStatus(paper,input.readingStatus!==undefined?input:existing);
  }
  async putPapers(inputs) {
    if (!Array.isArray(inputs) || inputs.length > 10000) throw new Error('导入数量不正确。');
    return this.mutate(async data => {
      const byId = new Map(data.papers.map(p => [p.id, p]));
      for (const input of inputs) {
        const previous = byId.get(input.id), paper = await this.preparePaper(input, previous);
        if (previous && previous.title !== paper.title) data.settings.notes = renameTitleLinks(data.settings.notes || {}, previous.title, paper.title);
        byId.set(paper.id, paper);
      }
      data.papers = [...byId.values()];
    });
  }
  async deletePaper(id) {
    return this.mutate(async data => {
      const p = data.papers.find(p => p.id === id); if (!p) return;
      // Preserve removed PDFs on disk; restore information is kept beside them.
      const trash = path.join(this.root, '.trash'); await mkdir(trash, { recursive: true });
      await writeFile(path.join(trash, `${Date.now()}-${randomUUID()}.json`), JSON.stringify({ paper: p, notes: data.settings.notes?.[`paper:${id}`] || [] }, null, 2));
      data.papers = data.papers.filter(p => p.id !== id);
    });
  }
  async bulkEdit(ids, options) {
    return this.mutate(data => {
      const plan = planBulkEdit(data.papers, data.settings.collections || [], ids, options, `folder-${randomUUID()}`);
      const updates = new Map(plan.updates.map(paper => [paper.id, paper]));
      data.papers = data.papers.map(paper => updates.get(paper.id) || paper);
      if (plan.collection) data.settings.collections = [...(data.settings.collections || []), plan.collection];
      return { count: plan.updates.length };
    });
  }
  async setReadingStatus(ids,status){
    return this.mutate(data=>{const plan=planReadingStatus(data.papers,ids,status),updates=new Map(plan.updates.map(p=>[p.id,p]));data.papers=data.papers.map(p=>updates.get(p.id)||p);return {count:plan.count};});
  }
  async deletePapers(ids) {
    return this.mutate(async data => {
      const batch = takeRemoval(data, ids, `batch-${randomUUID()}`);
      if (!batch.papers.length) return { count: 0 };
      const trash = path.join(this.root, '.trash');
      await mkdir(trash, { recursive: true });
      await writeFile(path.join(trash, `${batch.id}.json`), JSON.stringify(batch, null, 2), { encoding: 'utf8', flag: 'wx' });
      return data.settings.lastRemoval;
    });
  }
  async restorePapers(id) {
    if (typeof id !== 'string' || !/^batch-[a-f\d-]{36}$/i.test(id)) throw new Error('移除记录标识无效。');
    return this.mutate(async data => {
      const batch = JSON.parse(await readFile(resolveInside(this.root, `.trash/${id}.json`), 'utf8'));
      if (batch.id !== id || batch.format !== 'materia-removal' || !Array.isArray(batch.papers) || batch.papers.length > 10000) throw new Error('移除记录无法读取。');
      const existing = new Set(data.papers.map(paper => paper.id));
      for (const paper of batch.papers) if (!existing.has(paper.id)) {
        try{await access(resolveInside(this.root,paper.pdfPath));}catch(error){if(error.code!=='ENOENT')throw error;const file=(await this.folders.scan()).files.find(f=>f.fingerprint===paper.fingerprint);if(!file)throw new Error('恢复记录中的 PDF 不在文献库内，原有录入信息仍保留在 .trash。');paper.pdfPath=file.relative;}
        const prepared = await this.preparePaper(paper, paper); delete paper.measurements; Object.assign(paper, prepared);
      }
      return { count: restoreRemoval(data, batch).length };
    });
  }
  async pdfPath(id) { let paper=this.data.papers.find(p=>p.id===id);if(!paper?.pdfPath)throw new Error('找不到 PDF 文件。');let file=resolveInside(this.root,paper.pdfPath);try{await access(file);}catch(error){if(error.code!=='ENOENT')throw error;await this.syncFolders();paper=this.data.papers.find(p=>p.id===id);file=resolveInside(this.root,paper.pdfPath);try{await access(file);}catch{throw new Error('PDF 已被移出文献库；文献信息仍保留。将文件放回 papers 文件夹后会自动重新关联。');}}return file; }
  async readPdf(id) { return new Uint8Array(await readFile(await this.pdfPath(id))); }
  getStudy(){return cleanStudy({vocabulary:this.data.settings.vocabulary,cache:this.data.settings.translationCache,preferences:this.data.settings.translationPreferences});}
  updateStudy(operation){return this.mutate(data=>applyStudyOperation(data.settings,operation));}
  async mergeBackup(backup) {
    const study=backup.study?cleanStudy(backup.study):null;
    const materialGroups=backup.materialGroups!==undefined?cleanMaterialGroups(backup.materialGroups):null;
    return this.mutate(async data => {
      const byId = new Map(data.papers.map(p => [p.id, p]));
      for (const input of backup.papers) { const paper = await this.preparePaper(input, byId.get(input.id)); byId.set(paper.id, paper); }
      data.papers = [...byId.values()];
      const folders = new Map((data.settings.collections || []).map(c => [c.id, c]));
      for (const c of backup.collections) folders.set(c.id, c);
      data.settings.collections = [...folders.values()];
      const incomingNotes = cleanNotes(backup.notes || {}), currentNotes = data.settings.notes || {};
      for (const [key, notes] of Object.entries(incomingNotes)) currentNotes[key] = [...new Map([...(currentNotes[key] || []), ...notes].map(n => [n.id, n])).values()];
      data.settings.notes = currentNotes; data.settings.mode = 'own';
      data.settings.journalMetrics = mergeMetrics(data.settings.journalMetrics || [], backup.journalMetrics || []);
      if(materialGroups){const current=cleanMaterialSelection(data.settings.comparisonState);data.settings.comparisonState=cleanMaterialSelection({...current,groups:mergeMaterialGroups(current.groups||[],materialGroups)});}
      if(study){data.settings.vocabulary=mergeVocabulary(data.settings.vocabulary,study.vocabulary);let cache=data.settings.translationCache||[];for(const row of study.cache)cache=saveTranslationCache(cache,row);data.settings.translationCache=cache;data.settings.translationPreferences=study.preferences;}
      data.settings.importActivity=mergeImportActivity(data.settings.importActivity,backup.importActivity||seedImportActivity(backup.papers),backup.papers);
    });
  }
  async info() {
    let bytes = 0; for (const paper of this.data.papers) { try { bytes += (await stat(await this.pdfPath(paper.id))).size; } catch {} }
    return { path: this.root, papers: this.data.papers.length, bytes, readingStatusVersion:1,folderSyncVersion:1,importActivityVersion:1,studyVersion: 1, materialsVersion: 1, readerNotesVersion: 1, readerAnnotationsVersion: 1, readerDraftsVersion: 1, themeSchemaVersion: 2, graphThemeVersion: GRAPH_APPEARANCE_VERSION, researchCanvasVersion: 1, materialSelectionVersion: 1, materialGroupsVersion: 1 };
  }
}
