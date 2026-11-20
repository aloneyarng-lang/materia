import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {LocalLibrary} from '../desktop/library.mjs';

const point = {direction:'processing',summary:'分段退火抑制晶粒长大。',page:2,quote:'Staged annealing suppressed grain growth.'};

test('opening the catalog drops retired AI results and keeps paper innovations and their directions',async t=>{
  const root = await mkdtemp(path.join(os.tmpdir(),'materia-innovation-store-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const library = await new LocalLibrary(root).init();
  const fixture = Buffer.concat([Buffer.from('%PDF-1.4\n'),Buffer.alloc(5*1024*1024)]);
  await library.putPapers([{id:'paper',title:'Paper',filename:'paper.pdf',fileBytes:fixture,innovations:['录入的创新点']}]);
  const {length,revision} = await library.readPdfRange('paper');
  assert.equal(length,fixture.length);
  assert.deepEqual(Buffer.from(await library.readPdfRange('paper',{begin:0,end:8,revision})),fixture.subarray(0,8));
  await assert.rejects(library.readPdfRange('paper',{begin:0,end:8,revision:'expired'}),/PDF 已更换/);
  await assert.rejects(library.readPdfRange('paper',{begin:0,end:length,revision}),/读取范围无效/);
  library.folders.import = async()=>{throw Error('Unexpected folder scan');};
  const timeline = { '["paper","录入的创新点"]': '制备与工艺' };
  await library.setSetting('module:innovation-timeline',timeline);
  const catalog = path.join(root,'library.json');
  const legacy = JSON.parse(await readFile(catalog,'utf8'));
  legacy.settings['module:innovation-sea'] = {version:1,papers:{paper:{revision:2,points:[point]}}};
  await writeFile(catalog,JSON.stringify(legacy));
  const reopened = await new LocalLibrary(root).init();
  assert.equal(reopened.getSetting('module:innovation-sea'),undefined);
  assert.equal(Object.hasOwn(JSON.parse(await readFile(catalog,'utf8')).settings,'module:innovation-sea'),false);
  const previous = JSON.parse(await readFile(path.join(root,'backups','library.previous.json'),'utf8'));
  assert.equal(Object.hasOwn(previous.settings,'module:innovation-sea'),false);
  assert.deepEqual(reopened.getPapers()[0].innovations,['录入的创新点']);
  assert.deepEqual(reopened.getSetting('module:innovation-timeline'),timeline);
});
