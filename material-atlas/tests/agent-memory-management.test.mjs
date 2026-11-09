import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createDesktopCorpus} from '../desktop/agent-character-corpus.mjs';
import {REZE_ID,GANYU_ID,recallCharacterMemory,profileFor} from '../dist/agent-character-memory.js';
import {AgentHistoryFile} from '../desktop/agent-history.mjs';
import {emptyAgentHistory} from '../dist/agent-history.js';
import {ACTORS} from '../dist/agent-actors.js';
import {cleanCharacter} from '../dist/agent-character.js';
const character=cleanCharacter({...ACTORS.reze,actorId:'reze',name:'蕾塞 · Reze'});
test('blank-query browsing paginates the full corpus; personal correction persists and changes live retrieval',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'materia-memory-edit-'));
 try{
  const find=createDesktopCorpus(root),first=await find.list({characterId:REZE_ID,limit:20}),next=await find.list({characterId:REZE_ID,offset:20,limit:20});
  assert.equal(first.records.length,20);assert.equal(next.records.length,20);assert.notEqual(first.records[0].id,next.records[0].id);
  const row=first.records[0],lines=row.lines.map(l=>({...l,texts:{'zh-CN':'只在蕾塞个人修订里出现的星尘咖啡。',en:'Personal stardust coffee correction.',ja:'個人修正の星屑コーヒー。'}}));
  await find.update({characterId:REZE_ID,recordId:row.id,action:'edit',revision:0,lines});
  assert.ok((await find({characterId:REZE_ID,query:'星尘咖啡'})).matches.some(r=>r.id===row.id&&r.translation==='personal'));
  const reopened=createDesktopCorpus(root),list=await reopened.list({characterId:REZE_ID,query:'星尘咖啡'});
  assert.equal(list.records[0].source.userEdited,true);assert.deepEqual(list.records[0].originalLines,row.lines);
  assert.equal((await reopened({characterId:GANYU_ID,query:'星尘咖啡'})).matches.length,0);
  await assert.rejects(reopened.update({characterId:REZE_ID,recordId:row.id,action:'delete',revision:0}),/已更新/);
  await reopened.update({characterId:REZE_ID,recordId:row.id,action:'delete',revision:1});
  assert.equal((await reopened.list({characterId:REZE_ID,query:'星尘咖啡'})).total,0);
  assert.equal((await reopened.list({characterId:REZE_ID,trash:true})).total,1);
  assert.ok(!(await reopened({characterId:REZE_ID,query:'星尘咖啡'})).matches.some(r=>r.id===row.id));
  await reopened.update({characterId:REZE_ID,recordId:row.id,action:'restore',revision:2});
  const restored=await reopened.list({characterId:REZE_ID});assert.deepEqual(restored.records.find(r=>r.id===row.id).lines,row.lines);
  await assert.rejects(reopened.update({characterId:'../../escape',recordId:row.id,action:'delete',revision:3}),/没有资料/);
  const file=path.join(root,'canon',REZE_ID,'personal-edits.json');await writeFile(file,'broken');
  await assert.rejects(reopened.list({characterId:REZE_ID}),/原文件已保留/);assert.equal(await readFile(file,'utf8'),'broken');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('relationship edits, exclusions and manual notes survive reopening without rewriting chat messages',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'materia-relationship-edit-'));
 try{
  const state=emptyAgentHistory();state.conversations=[{id:'chat1',title:'咖啡',scopeIds:null,createdAt:1,updatedAt:2,character,entries:[{role:'user',content:'咖啡豆编号是旧值 R1。'},{role:'assistant',content:'记住了。'}]}];
  state.characterMemory={version:1,roles:{[REZE_ID]:{memoryEdits:{'chat1:0':{text:'咖啡豆编号是修订值 R9。',reply:'以新值为准。',deleted:false,updatedAt:3}},notes:[{id:'note-test',text:'星尘咖啡不加糖。',reply:'',updatedAt:4,deleted:false}]}}};
  const store=new AgentHistoryFile(path.join(root,'library'),{memoryRoot:path.join(root,'memory')});await store.save(state);
  let loaded=await store.load();assert.match(loaded.conversations[0].entries[0].content,/R1/);
  assert.match(JSON.stringify(recallCharacterMemory({state:loaded,character,question:'咖啡豆编号'})),/R9/);
  assert.match(JSON.stringify(recallCharacterMemory({state:loaded,character,question:'星尘咖啡'})),/不加糖/);
  profileFor(loaded,REZE_ID).memoryEdits['chat1:0'].deleted=true;await store.save(loaded);loaded=await store.load();
  assert.ok(!JSON.stringify(recallCharacterMemory({state:loaded,character,question:'咖啡豆编号'})).includes('R9'));
  delete profileFor(loaded,REZE_ID).memoryEdits['chat1:0'];await store.save(loaded);loaded=await store.load();
  assert.match(JSON.stringify(recallCharacterMemory({state:loaded,character,question:'咖啡豆编号'})),/R1/);
 }finally{await rm(root,{recursive:true,force:true});}
});
