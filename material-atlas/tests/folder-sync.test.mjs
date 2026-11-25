import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,rename,access,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {LocalLibrary} from '../desktop/library.mjs';
import {prepareLibraryLocation,portableLibraryRoot} from '../desktop/library-location.mjs';
import {dayKey,seedImportActivity,recordImports,mergeImportActivity,activityCalendar,cleanImportActivity} from '../dist/import-activity.js';
const base=path.resolve('.local/tests');await mkdir(base,{recursive:true});
const fresh=async()=>new LocalLibrary(await mkdtemp(path.join(base,'folder-sync-'))).init();
const pdf=name=>Buffer.from('%PDF-1.4\n% '+name+'\n%%EOF');

test('app assignment, Explorer moves, folder renames and a restart preserve the same paper and its complete metadata',async()=>{
  const lib=await fresh();await lib.setSetting('collections',[{id:'folder-a',name:'北航',color:'#005bac'},{id:'folder-b',name:'界面',color:'#805095'}]);
  await lib.putPapers([{id:'p1',title:'原有录入标题',filename:'original.pdf',tags:['原标签'],authors:'A',doi:'10/test',addedAt:123456,fileBytes:pdf('one'),collection:'folder-a',materials:[{id:'m1',name:'Sample',measurements:[{id:'x',name:'Strength',value:123,unit:'MPa'}]}]}]);
  await lib.setSetting('notes',{'paper:p1':[{id:'n1',body:'原有笔记',createdAt:10,updatedAt:20}]});
  const original=structuredClone(lib.data.papers[0]),notes=structuredClone(lib.getSetting('notes')),history=structuredClone(lib.getSetting('importActivity'));
  assert.equal(original.pdfPath,'papers/北航/original.pdf');
  await rename(path.join(lib.root,original.pdfPath),path.join(lib.root,'papers/界面/renamed.pdf'));await lib.syncFolders();
  const moved=lib.data.papers[0];assert.equal(moved.id,'p1');assert.equal(moved.collection,'folder-b');assert.equal(moved.pdfPath,'papers/界面/renamed.pdf');
  const stable=p=>{const {pdfPath,collection,...metadata}=p;return metadata;};assert.deepEqual(stable(moved),stable(original));assert.deepEqual(lib.getSetting('notes'),notes);assert.deepEqual(lib.getSetting('importActivity'),history);
  await rename(path.join(lib.root,'papers/界面'),path.join(lib.root,'papers/界面研究'));await lib.syncFolders();assert.equal(lib.getSetting('collections').find(c=>c.id==='folder-b').name,'界面研究');assert.equal(lib.data.papers[0].collection,'folder-b');
  const reopened=await new LocalLibrary(lib.root).init();assert.deepEqual(reopened.data.papers,lib.data.papers);assert.deepEqual(Buffer.from(await reopened.readPdf('p1')),pdf('one'));assert.equal((await reopened.syncFolders()).changed,false);
});
test('desktop startup can load an established catalog before reconciling external PDFs',async()=>{
  const lib=await fresh();
  await writeFile(path.join(lib.root,'papers/indexed.pdf'),pdf('indexed'));
  await lib.syncFolders();
  await writeFile(path.join(lib.root,'papers/external.pdf'),pdf('deferred'));
  const reopened=await new LocalLibrary(lib.root).init({deferFolderSync:true});
  assert.equal(reopened.getPapers().length,1);
  await reopened.setSetting('graphLayout',{'paper:test':{x:100,y:200,pinned:true}});
  assert.equal(reopened.getPapers().length,1);
  assert.equal((await reopened.syncFolders()).added,1);
  assert.equal(reopened.getPapers().length,2);
  assert.equal(reopened.getSetting('graphLayout')['paper:test'].pinned,true);
});
test('desktop startup reconciles an empty catalog before displaying it',async()=>{
  const lib=await fresh();
  await writeFile(path.join(lib.root,'papers/external.pdf'),pdf('unindexed'));
  const reopened=await new LocalLibrary(lib.root).init({deferFolderSync:true});
  assert.equal(reopened.getPapers().length,1);
});
test('empty and nested folders import, external PDFs count once, copied duplicates and removed records never reappear',async()=>{
  const lib=await fresh();await mkdir(path.join(lib.root,'papers/新组/子组'),{recursive:true});await writeFile(path.join(lib.root,'papers/新组/子组/new.pdf'),pdf('new'));
  const sync=await lib.syncFolders();assert.equal(sync.added,1);assert.equal(lib.data.papers.length,1);assert.equal(lib.getSetting('collections').length,2);const paper=lib.data.papers[0],history=lib.getSetting('importActivity');assert.equal(history.days[dayKey()],1);
  await writeFile(path.join(lib.root,'papers/copy.pdf'),pdf('new'));assert.equal((await lib.syncFolders()).added,0);assert.equal(lib.data.papers.length,1);
  await lib.putPapers([{...lib.getPapers()[0],title:'修改标题'}]);assert.equal(lib.getSetting('importActivity').days[dayKey()],1);
  const result=await lib.deletePapers([paper.id]);await lib.syncFolders();assert.equal(lib.data.papers.length,0);assert.equal(lib.getSetting('importActivity').days[dayKey()],1);
  await lib.restorePapers(result.id);assert.equal(lib.data.papers.length,1);assert.equal(lib.getSetting('importActivity').days[dayKey()],1);
});
test('moving a PDF outside papers keeps its metadata and associates the original ID when returned',async()=>{
  const lib=await fresh();await lib.putPapers([{id:'old',title:'Preserve',filename:'a.pdf',fileBytes:pdf('gone')}]);const paper=structuredClone(lib.data.papers[0]);
  const outside=path.join(lib.root,'held.pdf');await rename(path.join(lib.root,paper.pdfPath),outside);await lib.syncFolders();assert.deepEqual(lib.data.papers[0],paper);await assert.rejects(lib.readPdf('old'),/仍保留/);
  await rename(outside,path.join(lib.root,'papers/returned.pdf'));await lib.syncFolders();assert.equal(lib.data.papers[0].id,'old');assert.deepEqual(Buffer.from(await lib.readPdf('old')),pdf('gone'));
});
test('application rename changes the physical group and retains the group ID',async()=>{
  const lib=await fresh();await lib.setSetting('collections',[{id:'legacy-id',name:'旧组',color:'#005bac'}]);await lib.putPapers([{id:'p',title:'T',filename:'a.pdf',fileBytes:pdf('rename'),collection:'legacy-id'}]);
  await lib.setSetting('collections',[{id:'legacy-id',name:'新组',color:'#005bac'}]);assert.equal(lib.data.papers[0].pdfPath,'papers/新组/a.pdf');await lib.syncFolders();assert.equal(lib.getSetting('collections').length,1);assert.equal(lib.getSetting('collections')[0].id,'legacy-id');
});
test('the first upgrade keeps old removed PDF revisions out of the catalog',async()=>{
  const root=await mkdtemp(path.join(base,'legacy-pdfs-'));await mkdir(path.join(root,'papers'));const bytes=pdf('active'),hash=createHash('sha256').update(bytes).digest('hex'),retired=pdf('retired'),retiredHash=createHash('sha256').update(retired).digest('hex');
  const paper={id:'original',title:'原有标题',tags:['T'],filename:'original.pdf',pdfPath:'papers/'+hash+'.pdf',fingerprint:hash,addedAt:12345,collection:'',size:bytes.length};
  await writeFile(path.join(root,paper.pdfPath),bytes);await writeFile(path.join(root,'papers/'+retiredHash+'.pdf'),retired);await writeFile(path.join(root,'library.json'),JSON.stringify({format:'materia-library',version:1,papers:[paper],settings:{collections:[],notes:{}}}));
  const lib=await new LocalLibrary(root).init();assert.deepEqual(lib.data.papers,[paper]);await lib.syncFolders();assert.equal(lib.data.papers.length,1);await access(path.join(root,'papers/'+retiredHash+'.pdf'));
});
test('a disk import discovered during another save still publishes an automatic refresh',async()=>{
  const lib=await fresh(),events=[];lib.onFolderChange=event=>events.push(event);await writeFile(path.join(lib.root,'papers/external.pdf'),pdf('event'));await lib.setSetting('mode','own');assert.equal(events.length,1);assert.equal(events[0].added,1);assert.equal((await lib.syncFolders()).changed,false);assert.equal(lib.data.papers.length,1);
});
test('an external group rename is not reverted by saving an unrelated group from an older UI snapshot',async()=>{
  const lib=await fresh();await lib.setSetting('collections',[{id:'folder-a',name:'旧名',color:'#005bac'}]);const snapshot=structuredClone(lib.getSetting('collections'));await rename(path.join(lib.root,'papers/旧名'),path.join(lib.root,'papers/新名'));await lib.setSetting('collections',[...snapshot,{id:'folder-b',name:'另一个组',color:'#0071e3'}]);assert.equal(lib.getSetting('collections').find(c=>c.id==='folder-a').name,'新名');await access(path.join(lib.root,'papers/新名'));
});
test('a failed multi-import and replacement do not resurrect staged files or old PDF versions',async()=>{
  const lib=await fresh();await lib.putPapers([{id:'p',title:'Original',filename:'p.pdf',fileBytes:pdf('old')}]);
  await assert.rejects(lib.putPapers([{id:'first',title:'Failed batch',fileBytes:pdf('staged')},{id:'../../invalid',title:'Invalid',fileBytes:pdf('invalid')}]),/格式/);await lib.syncFolders();assert.equal(lib.data.papers.length,1);
  const old=lib.data.papers[0].pdfPath;await lib.putPapers([{...lib.getPapers()[0],fileBytes:pdf('replacement')}]);await lib.syncFolders();assert.equal(lib.data.papers.length,1);await access(path.join(lib.root,old));assert.deepEqual(Buffer.from(await lib.readPdf('p')),pdf('replacement'));
});
test('root relocation copies every original file, keeps the old library and respects a custom library choice',async()=>{
  const parent=await mkdtemp(path.join(base,'root-migration-')),old=path.join(parent,'release/文献库'),target=path.join(parent,'文献库');await mkdir(old,{recursive:true});
  const data={format:'materia-library',version:1,papers:[],settings:{notes:{a:[]}}};await writeFile(path.join(old,'library.json'),JSON.stringify(data));await writeFile(path.join(old,'ai-chats.json'),'conversation');
  const result=await prepareLibraryLocation({configuredRoot:old,defaultRoot:target,legacyRoots:[old]});assert.equal(result,target);assert.deepEqual(JSON.parse(await readFile(path.join(target,'library.json'))),data);assert.equal(await readFile(path.join(target,'ai-chats.json'),'utf8'),'conversation');await access(path.join(old,'library.json'));
  assert.equal(await prepareLibraryLocation({defaultRoot:target,legacyRoots:[old]}),target);assert.equal(await prepareLibraryLocation({envRoot:'isolated',defaultRoot:target}), 'isolated');
  assert.equal(await prepareLibraryLocation({configuredRoot:old,defaultRoot:target,legacyRoots:[]}),old);
  assert.equal(portableLibraryRoot(path.join(parent,'material-atlas/release/v1/resources/app'),parent),target);
});
test('activity histories survive deletion and backup merges without recounting; leap years and invalid input are handled',()=>{
  const initial=seedImportActivity([{id:'old',addedAt:new Date(2024,1,29).getTime(),fingerprint:'abc'}]);let next=recordImports(initial,[{id:'old'},{id:'new',fingerprint:'new'}],new Date(2024,2,1).getTime());next=recordImports(next,[{id:'new'},{id:'copy',fingerprint:'new'}],new Date(2024,2,2).getTime());assert.deepEqual(next.days,{'2024-02-29':1,'2024-03-01':1});
  assert.deepEqual(mergeImportActivity(next,next).days,next.days);const calendar=activityCalendar(next,2024,new Date(2025,0,1).getTime());assert.equal(calendar.cells.filter(Boolean).length,366);assert.equal(calendar.total,2);assert.equal(calendar.activeDays,2);
  assert.deepEqual(cleanImportActivity({days:{'2024-99-10':3,'2024-02-30':2,'2024-02-29':-1}}).days,{});
});
