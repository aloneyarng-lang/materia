import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {paperMaterials,paperMeasurements,materializePaper,normalizeMaterials,normalizePaperMaterials} from '../dist/materials.js';
import {parseMarkdown,markdownTemplate} from '../dist/markdown.js';
import {parseMetadata,matchRecords,planBatch} from '../dist/import-plan.js';
import {filterCatalog} from '../dist/catalog.js';
import {chartDataset,figureDataCSV} from '../dist/chart-data.js';
import {parameterKey,parameterOptions,measurementsCSV} from '../dist/parameters.js';
import {parameterInventory,hasParameter} from '../dist/parameter-index.js';
import {buildFigure} from '../dist/figure.js';
import {createResearchTools} from '../dist/ai-agent-core.js';
import {LocalLibrary} from '../desktop/library.mjs';
import {createBackup,readBackup} from '../dist/storage.js';

const measurement=(name,value,extra={})=>({id:name,name,value,unit:'MPa',sample:'S1',conditions:'RT',source:'Fig. 2',qualifier:'',uncertainty:2,...extra});
const material=(id,name,measurements)=>({id,name,composition:id==='a'?'FeNi':'FeCo',description:'退火处理',measurements});
const materials=normalizeMaterials([material('a','合金',[measurement('X',1),measurement('Y',10)]),material('b','合金',[measurement('X',2),measurement('Y',20)])]);
const paper={id:'multi',filename:'multi.pdf',title:'Multiple materials',year:'2025',tags:[],materials};
const xy={type:'scatter',x:'m:'+parameterKey('X','MPa'),y:'m:'+parameterKey('Y','MPa'),group:'material'};
const md=`# Materia 文献批量元数据
格式版本: 2
## 文献 1
- 文件名: multi.pdf
- 标题: Multiple materials
### 材料
#### 材料 1
- 材料ID: alloy-a
- 名称: 合金 A
- 成分 / 配方: FeNi
- 说明: 退火态
##### 性能参数
| 样品 / 批次 | 参数名称 | 数值 | 单位 | 测试条件 | 来源 | 限定符 | 误差 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | X | 1 | MPa | RT | Fig. 1 | | 0.1 |
| S1 | Y | 10 | MPa | RT | Fig. 2 | | 2 |
#### 材料 2
- 材料ID: alloy-b
- 名称: 合金 B
- 成分 / 配方: FeCo
##### 性能参数
| 样品 | 参数名称 | 数值 | 单位 | 测试条件 | 来源 |
| --- | --- | --- | --- | --- | --- |
| S1 | X | 2 | MPa | RT | Fig. 3 |
| S1 | Y | 20 | MPa | RT | Fig. 4 |
### 文献笔记
#### 研究笔记
两个材料分别比较。
## 文献 2
- 文件名: other.pdf
### 材料
#### 材料 1
- 名称: 尚无参数的材料
`;

test('legacy measurements migrate deterministically by sample without modifying values or inventing composition',()=>{
  const old={id:'legacy',measurements:[measurement('A',1,{sample:'S1'}),measurement('B',2,{sample:''}),measurement('C',3,{sample:'S1'})]},before=structuredClone(old);
  const next=normalizePaperMaterials(old);assert.equal(next.measurements,undefined);assert.deepEqual(next.materials.map(m=>[m.name,m.measurements.length,m.composition]),[['S1',2,''],['未命名材料',1,'']]);
  assert.deepEqual(next.materials.flatMap(m=>m.measurements).map(m=>m.value),[1,3,2]);assert.deepEqual(old,before);assert.deepEqual(normalizePaperMaterials(next),next);
  assert.deepEqual(materializePaper({measurements:[{name:'Invalid',value:''}]}).materials[0].measurements,[{name:'Invalid',value:''}]);
  assert.deepEqual(paperMaterials({materials:[],measurements:old.measurements}),[]);
});

test('materials have distinct stable IDs; validation rejects malformed or duplicate records without cross-material ID collisions',()=>{
  assert.equal(materials.length,2);assert.equal(materials[0].measurements[0].id,materials[1].measurements[0].id);
  assert.throws(()=>normalizeMaterials([{...materials[0],name:''}]),/名称/);
  assert.throws(()=>normalizeMaterials([materials[0],materials[0]]),/ID/);
  assert.throws(()=>normalizePaperMaterials({materials:null,measurements:[]}),/数组/);
  assert.throws(()=>normalizeMaterials([{...materials[0],measurements:null}]),/数组/);
  assert.throws(()=>normalizeMaterials([{...materials[0],measurements:[measurement('X','1 MPa')]}]),/独立数字/);
  assert.throws(()=>normalizeMaterials([{...materials[0],measurements:[measurement('X',1),measurement('X',2)]}]),/ID/);
  const renamed=normalizeMaterials([{...materials[0],name:'重命名'}]);assert.equal(renamed[0].id,'a');assert.deepEqual(renamed[0].measurements,materials[0].measurements);
});

test('version 2 Markdown keeps multiple materials, overlapping sample IDs, notes and materials without measurements',async()=>{
  const parsed=parseMarkdown(md);assert.equal(parsed.length,2);assert.equal(parsed[0].measurements,undefined);
  assert.deepEqual(parsed[0].materials.map(m=>[m.id,m.name,m.composition,m.measurements.length]),[['alloy-a','合金 A','FeNi',2],['alloy-b','合金 B','FeCo',2]]);
  assert.equal(parsed[1].materials[0].measurements.length,0);assert.equal(parsed[0].paperNotes[0].body,'两个材料分别比较。');
  const plan=await planBatch([],parseMetadata(md),[paper,{...paper,id:'other',filename:'other.pdf'}]);assert.equal(plan.updated,2);assert.equal(plan.updates[0].materials.length,2);assert.equal(plan.notes.length,1);
  assert.deepEqual(parseMarkdown(markdownTemplate(['multi.pdf']))[0].materials,undefined);
  assert.equal((await readFile(new URL('../metadata-template.md',import.meta.url),'utf8')).replace(/\r\n/g,'\n'),markdownTemplate());
  assert.deepEqual(matchRecords(parseMarkdown(markdownTemplate(['multi.pdf'])),[paper]).updates[0].materials,materials);
  assert.throws(()=>parseMarkdown(md.replace('名称: 合金 A','名称: ')),/名称/);
  assert.throws(()=>parseMarkdown(md.replace('alloy-b','alloy-a')),/ID/);
  assert.throws(()=>parseMarkdown(md.replace('##### 性能参数','### 性能参数')),/必须放在对应材料/);
  assert.equal(matchRecords([{filename:'multi.pdf',materials:[]}],[paper]).updates[0].materials.length,0);
  const json=parseMetadata(JSON.stringify({papers:[{filename:'multi.pdf',materials}]}));assert.deepEqual(matchRecords(json,[paper]).updates[0].materials,materials);
  assert.throws(()=>matchRecords([{filename:'multi.pdf',materials,measurements:[]}],[paper]),/不要同时提供/);
});

test('innovation points import per paper from Markdown or JSON and survive desktop storage and backup restore', async () => {
  const points = ['新制备工艺', '新组织设计', '新表征方法', '新机理'];
  const metadata = `## 文献 1\n- 文件名: multi.pdf\n### 创新点\n1. ${points[0]}\n- ${points[1]}\n3) ${points[2]}\n4. ${points[3]}\n- ${points[0]}\n## 文献 2\n- 文件名: other.pdf\n### Innovations\n- Other point`;
  const file = new File(['%PDF-1.4\nSynthetic fixture'], 'multi.pdf', {type:'application/pdf'});
  const plan = await planBatch([file], parseMetadata(metadata), [{...paper,id:'other',filename:'other.pdf'}]);
  assert.deepEqual(plan.updates.map(p => p.innovations), [points, ['Other point']]);
  const imported = plan.updates[0];
  assert.deepEqual(matchRecords(parseMarkdown(markdownTemplate(['multi.pdf'])),[imported]).updates[0].innovations, points);
  const json = parseMetadata('{"papers":[{"filename":"multi.pdf","innovations":[" 更新后的创新点 "]}]}');
  assert.deepEqual((await planBatch([], json, [imported])).updates[0].innovations, ['更新后的创新点']);
  assert.deepEqual(matchRecords([{filename:'multi.pdf', innovations:[]}], [imported]).updates[0].innovations, []);
  assert.throws(() => matchRecords([{filename:'multi.pdf', innovations:['valid', {}]}], [imported]), /innovations/);

  const parent = path.resolve('.local/tests');
  await mkdir(parent, {recursive:true});
  const root = await mkdtemp(path.join(parent, 'innovations-'));
  const library = await new LocalLibrary(root).init();
  await library.putPapers([{...imported, fileBytes:await file.arrayBuffer()}]);
  await library.putPapers([{id:imported.id, title:'Edited title'}]);
  const reopened = await new LocalLibrary(root).init();
  assert.deepEqual(reopened.getPapers()[0].innovations, points);
  const backup = await createBackup([{...imported, file:null}], []);
  assert.deepEqual(readBackup(backup).papers[0].innovations, points);
});

test('search, inventory, comparison and CSV retain every material and never pair axes between materials with identical samples',()=>{
  assert.equal(filterCatalog([paper],{query:'FeCo',filters:{}}).length,1);assert.equal(filterCatalog([paper],{query:'退火处理',filters:{}}).length,1);
  assert.equal(hasParameter(paper,'X'),true);assert.equal(parameterInventory([paper]).find(p=>p.name==='X').records,2);assert.equal(parameterOptions([paper])[0].paperCount,1);
  const data=chartDataset([paper],xy);assert.deepEqual(data.points.map(p=>[p.materialId,p.x,p.y]),[['a',1,10],['b',2,20]]);
  assert.notEqual(data.points[0].groupKey,data.points[1].groupKey);
  const crossed={...paper,materials:[{...materials[0],measurements:[measurement('X',1)]},{...materials[1],measurements:[measurement('Y',20)]}]};assert.equal(chartDataset([crossed],xy).points.length,0);
  const csv=measurementsCSV([paper]);assert.match(csv,/材料ID/);assert.match(csv,/"a","合金","FeNi"/);assert.match(csv,/"b","合金","FeCo"/);
  assert.match(figureDataCSV(data,'X','Y'),/材料名称/);assert.equal(buildFigure([paper],{...xy,type:'bar'}).data.points.length,2);
});

test('AI tools search material metadata and expose exact ownership without leaking arbitrary material fields',()=>{
  const tools=createResearchTools({papers:[{...paper,materials:materials.map(m=>({...m,pdfPath:'PRIVATE_MATERIAL_SECRET'}))}]});
  assert.equal(tools.execute('search_library',{query:'FeCo'}).total,1);assert.equal(tools.execute('library_overview').materialCount,2);
  const read=tools.execute('read_papers',{ids:['multi']});assert.equal(read.papers[0].materials.length,2);assert.equal(read.papers[0].measurements[2].materialId,'b');
  assert.ok(!JSON.stringify(read).includes('PRIVATE_MATERIAL_SECRET'));
  const rows=tools.execute('compare_parameters',{name:'Y'}).observations;assert.deepEqual(rows.map(r=>[r.materialId,r.materialName,r.value]),[['a','合金',10],['b','合金',20]]);
});

test('disk, complete backup, removal undo and metadata-only edits preserve materials, parameters and original PDF bytes',async()=>{
  const parent=path.resolve('.local/tests');await mkdir(parent,{recursive:true});const folder=await mkdtemp(path.join(parent,'materials-')),lib=await new LocalLibrary(folder).init(),bytes=Buffer.from('%PDF-1.4\nSynthetic material fixture\n%%EOF');
  await lib.putPapers([{...paper,fileBytes:bytes}]);await lib.setSetting('notes',{'paper:multi':[{id:'n',body:'Preserve notes',createdAt:1,updatedAt:1}]});
  assert.equal(JSON.parse(await readFile(path.join(folder,'library.json'),'utf8')).version,2);
  const reopened=await new LocalLibrary(folder).init();assert.deepEqual(reopened.getPapers()[0].materials,materials);assert.equal(reopened.getPapers()[0].measurements,undefined);
  await reopened.putPapers([{id:paper.id,title:'Renamed title'}]);assert.deepEqual(reopened.getPapers()[0].materials,materials);
  const receipt=await reopened.deletePapers([paper.id]);await reopened.restorePapers(receipt.id);assert.deepEqual(reopened.getPapers()[0].materials,materials);assert.deepEqual(Buffer.from(await reopened.readPdf(paper.id)),bytes);
  const before=await readFile(path.join(folder,'library.json'),'utf8');await assert.rejects(reopened.putPapers([{...paper,materials:[{...materials[0],name:''}]}]),/名称/);assert.equal(await readFile(path.join(folder,'library.json'),'utf8'),before);
  const oldReader=globalThis.FileReader;globalThis.FileReader=class{async readAsDataURL(blob){this.result='data:application/pdf;base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');this.onload();}};
  try{const backup=await createBackup([{...paper,file:new Blob([bytes])}],[]),restored=readBackup(backup);assert.equal(backup.version,2);assert.deepEqual(restored.papers[0].materials,materials);assert.deepEqual(Buffer.from(await restored.papers[0].file.arrayBuffer()),bytes);}finally{globalThis.FileReader=oldReader;}
  // Loading an old on-disk library is a lossless view; it does not rewrite the file.
  const raw=JSON.parse(before);raw.version=1;raw.papers[0].measurements=materials[0].measurements;delete raw.papers[0].materials;await writeFile(path.join(folder,'library.json'),JSON.stringify(raw));const legacyBytes=await readFile(path.join(folder,'library.json'));const old=await new LocalLibrary(folder).init();assert.equal(old.getPapers()[0].materials[0].name,'S1');assert.deepEqual(await readFile(path.join(folder,'library.json')),legacyBytes);
});

test('an older desktop backend cannot silently discard a material edit, deletion or restored backup',async()=>{
  const previous=globalThis.materiaDesktop;let calls=0;
  globalThis.materiaDesktop={info:async()=>({materialsVersion:0}),putPapers:async()=>{calls++;},mergeBackup:async()=>{calls++;}};
  try{const storage=await import('../dist/storage.js?materials-version-test');await assert.rejects(storage.putPaper(paper),/重新打开/);await assert.rejects(storage.putPaper({...paper,materials:[]}),/重新打开/);await assert.rejects(storage.mergeBackup({papers:[paper],notes:{},collections:[]}),/重新打开/);assert.equal(calls,0);}finally{globalThis.materiaDesktop=previous;}
});
