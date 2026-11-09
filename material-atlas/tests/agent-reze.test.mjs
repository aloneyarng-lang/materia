import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {defaultCharacter,cleanCharacter} from '../dist/agent-character.js';
import {REZE_PERSONALITY,LEGACY_REZE_PERSONALITY,LEGACY_REZE_GREETING,REZE_GREETING} from '../dist/agent-reze.js';
import {ACTORS} from '../dist/agent-actors.js';
import {AgentHistoryFile} from '../desktop/agent-history.mjs';
import {emptyAgentHistory,cleanAgentHistory} from '../dist/agent-history.js';
import {KURISU_ID,REZE_ID,profileFor,recallCharacterMemory} from '../dist/agent-character-memory.js';
import {createDesktopCorpus} from '../desktop/agent-character-corpus.mjs';
import {runResearchAgent} from '../dist/ai-agent-core.js';
import {runCompanionTurn} from '../dist/agent-companion.js';
import {createAgentVoice} from '../desktop/agent-voice.mjs';
const reze=cleanCharacter({...ACTORS.reze,actorId:ACTORS.reze.id,name:ACTORS.reze.label});
const kurisu=defaultCharacter();
const legacyReze={...reze,personality:LEGACY_REZE_PERSONALITY,greeting:LEGACY_REZE_GREETING};
const turn=(id,character,text)=>({id,character,title:id,scopeIds:null,createdAt:1,updatedAt:1,
  entries:[{role:'user',content:text},{role:'assistant',content:'了解了。'}]});

test('Reze and Kurisu preserve separate recall, language, and root relationship indexes',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'materia-reze-'));
  try{
    const state=emptyAgentHistory();
    state.conversations=[turn('r',reze,'咖啡豆编号是 R77。'),turn('k',kurisu,'咖啡豆编号是 K22。')];
    state.characterMemory={version:1,roles:{[REZE_ID]:{replyLanguage:'ja'},[KURISU_ID]:{replyLanguage:'en'}}};
    const store=new AgentHistoryFile(path.join(root,'library'),{memoryRoot:path.join(root,'memory')});
    await store.save(state);const saved=await store.load();
    assert.equal(profileFor(saved,REZE_ID).replyLanguage,'ja');
    for(const [character,id,expected,excluded] of [[reze,REZE_ID,'R77','K22'],[kurisu,KURISU_ID,'K22','R77']]){
      const result=recallCharacterMemory({state:saved,character,question:'还记得咖啡豆编号吗？'});
      assert.match(JSON.stringify(result),new RegExp(expected));assert.ok(!JSON.stringify(result).includes(excluded));
      const files=await import('node:fs/promises').then(m=>m.readdir(path.join(root,'memory/relationship',id)));
      const index=JSON.parse(await readFile(path.join(root,'memory/relationship',id,files[0]),'utf8'));
      assert.equal(index.characterId,id);assert.equal(index.episodes.length,1);
    }
    state.conversations=state.conversations.filter(x=>x.id!=='r');
    assert.deepEqual(profileFor(cleanAgentHistory(state),REZE_ID).episodes,[]);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('bundled corpus cache is scoped by role and labels original style examples',async()=>{
  const find=createDesktopCorpus();
  const r=await find({characterId:REZE_ID,query:'coffee',locale:'ja',browse:true});
  assert.equal(r.count,59);assert.ok(r.matches.some(x=>x.method==='source_summary'));
  assert.ok(r.matches.every(x=>x.variant==='reze'));
  const k=await find({characterId:KURISU_ID,query:'pudding',locale:'en'});
  assert.ok(k.count>19000);assert.ok(k.matches.every(x=>x.variant!=='reze'));
  const style=await find({characterId:REZE_ID,query:'语音',locale:'zh-CN',browse:true});
  assert.equal(style.count,59);
  const promptRows=await find({characterId:REZE_ID,query:'Calling it a day',locale:'en'});
  assert.ok(promptRows.matches.every(x=>x.kind!=='authored_style_example'));
  const original=await find({characterId:REZE_ID,query:'Calling it a day',locale:'en',browse:true});
  assert.ok(original.matches.some(x=>x.kind==='authored_style_example'&&x.translation==='authored'));
});
test('manual and automatic Reze prompts pass role identity and selected language to retrieval',async()=>{
  assert.deepEqual(cleanCharacter(legacyReze),reze);
  assert.equal(reze.greeting,REZE_GREETING);
  assert.equal(cleanCharacter({...legacyReze,personality:'手动修改'}).personality,'手动修改');
  let id;
  const findCanon=async request=>{id=request.characterId;return {matches:[{id:'fixture-reze',kind:'canon_summary',lines:[],sourceTitle:'official'}]};};
  let manual;
  await runResearchAgent({question:'聊聊咖啡',character:legacyReze,kurisuContext:{replyLanguage:'ja'},findCanon,
    context:{papers:[],notes:{}},complete:async({messages})=>{manual=messages[0].content;return {content:'いいよ。'};}});
  assert.ok(manual.includes(REZE_PERSONALITY));assert.ok(!manual.includes(LEGACY_REZE_PERSONALITY));
  assert.equal(id,REZE_ID);assert.match(manual,/蕾塞的对话习惯/);assert.match(manual,/使用 日本語/);assert.ok(!manual.includes('Amadeus 的对话习惯'));
  const lines=Array.from({length:10},(_,i)=>'台词'+i+'。');
  const result=await runCompanionTurn({character:legacyReze,history:[{role:'user',content:'咖啡'}],companion:{},kurisuContext:{replyLanguage:'en'},findCanon,
    complete:async({messages})=>{assert.match(messages[0].content,/使用 English/);assert.ok(messages[0].content.includes(REZE_PERSONALITY));assert.ok(!messages[0].content.includes(LEGACY_REZE_PERSONALITY));return {content:JSON.stringify({lines,recap:''})};}});
  assert.equal(id,REZE_ID);assert.equal(result.lines.length,10);
});
test('unknown roles cannot accidentally launch Kurisu voice',async()=>{
  const voice=createAgentVoice(path.join(os.tmpdir(),'nonexistent-materia-voice'));
  try{
    assert.equal((await voice.status('deepseek')).available,false);
    await assert.rejects(voice.synthesize({characterId:'deepseek',text:'hello',language:'en'}),/格式/);
    await assert.rejects(voice.prepare('../../kurisu'),/暂不可用/);
  }finally{voice.close();}
});

