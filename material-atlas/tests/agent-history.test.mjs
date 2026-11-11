import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {cleanAgentHistory,emptyAgentHistory,chatTitle} from '../dist/agent-history.js';
import {AgentHistoryFile} from '../desktop/agent-history.mjs';

const chat=(id,scopeIds=null)=>({id,title:'比较合金性能',createdAt:1,updatedAt:2,scopeIds,entries:[{role:'user',content:'**比较合金性能**'},{role:'assistant',content:'## 研究结论\n\n1000 MPa [p1]',sources:[{id:'p1',title:'合金 A',year:'2024',doi:'10.test/a'}]}]});
const history=(conversations=[chat('chat-1')],activeId=conversations[0]?.id||'')=>({...emptyAgentHistory(),activeId,conversations});

test('chat history preserves Markdown, references and frozen scope but excludes provider credentials',()=>{
  const input=history([chat('chat-1',['p1'])]);input.apiKey='provider-secret';input.conversations[0].config={apiKey:'provider-secret'};input.conversations[0].entries[1].apiKey='provider-secret';
  const saved=cleanAgentHistory(input);assert.deepEqual(saved.conversations[0].scopeIds,['p1']);assert.match(saved.conversations[0].entries[1].content,/#/);assert.equal(saved.conversations[0].entries[1].sources[0].doi,'10.test/a');assert.ok(!JSON.stringify(saved).includes('provider-secret'));
  assert.equal(chatTitle(input.conversations[0].entries),'比较合金性能');
});
test('history survives file reopen and preserves new and deleted conversations without touching other libraries',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'materia-chats-')),a=new AgentHistoryFile(path.join(root,'a')),b=new AgentHistoryFile(path.join(root,'b'));
  assert.deepEqual(await a.load(),emptyAgentHistory());await a.save(history());
  const reopened=new AgentHistoryFile(a.root);assert.equal((await reopened.load()).activeId,'chat-1');assert.equal((await reopened.load()).conversations[0].entries.length,2);assert.deepEqual(await b.load(),emptyAgentHistory());
  await a.save(history([chat('chat-1'),chat('chat-2',['p1'])],'chat-2'));
  await a.save(history([chat('chat-2',['p1'])],'chat-2'));assert.deepEqual((await reopened.load()).conversations.map(c=>c.id),['chat-2']);assert.deepEqual(await b.load(),emptyAgentHistory());
  const previous=JSON.parse(await readFile(path.join(a.root,'ai-chats.previous.json'),'utf8'));assert.equal(previous.conversations.length,2);
});
test('history writes remain ordered and invalid or corrupt data never replace valid records',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'materia-chats-')),store=new AgentHistoryFile(root);
  await Promise.all([store.save(history([chat('one')])),store.save(history([chat('one'),chat('two')],'two'))]);assert.equal((await store.load()).activeId,'two');
  const before=await readFile(store.file,'utf8');assert.throws(()=>store.save(history([chat('one')],'missing')),/不存在/);assert.equal(await readFile(store.file,'utf8'),before);
  await writeFile(store.file,'BROKEN HISTORY');await assert.rejects(store.load(),/原文件已保留/);await assert.rejects(store.save(history()),/原文件已保留/);assert.equal(await readFile(store.file,'utf8'),'BROKEN HISTORY');
});
test('history limits reject rather than silently discard saved messages or conversations',()=>{
  assert.throws(()=>cleanAgentHistory(history(Array.from({length:201},(_,i)=>chat(`c-${i}`)))),/200/);
  const tooMany=chat('many');tooMany.entries=Array.from({length:1001},()=>({role:'user',content:'x'}));assert.throws(()=>cleanAgentHistory(history([tooMany])),/1000/);
  const duplicate=chat('same');assert.throws(()=>cleanAgentHistory(history([duplicate,duplicate])),/重复/);
  const scope=chat('invalid');scope.scopeIds='all';assert.throws(()=>cleanAgentHistory(history([scope])),/范围/);
});

test('voice files and sentence references survive reopening and reject paths outside the library',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'materia-saved-voice-'));
  const store=new AgentHistoryFile(root);
  const audio=Buffer.alloc(80);
  audio.write('RIFF');audio.writeUInt32LE(72,4);audio.write('WAVE',8);
  const wav=audio.toString('base64');
  const [id,same]=await Promise.all([store.storeVoice(wav),store.storeVoice(wav)]);
  assert.equal(id,same);
  const input=history();
  input.conversations[0].entries[1].voiceClips=[{id,language:'ja',text:'保存的句子',wav:'must not be in history'}];
  await store.save(input);
  const reopened=new AgentHistoryFile(root);
  assert.equal(await reopened.readVoice(id),wav);
  assert.deepEqual((await reopened.load()).conversations[0].entries[1].voiceClips,[{id,language:'ja',text:'保存的句子'}]);
  await assert.rejects(reopened.readVoice('../private'),/标识/);
  await assert.rejects(reopened.storeVoice(Buffer.from('not wav').toString('base64')),/格式/);
});
