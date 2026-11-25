import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanChoices,readChoiceReply,entryText,rollDialogueChoices} from '../dist/agent-choices.js';
import {emptyAgentHistory,cleanAgentHistory} from '../dist/agent-history.js';
import {runResearchAgent} from '../dist/ai-agent-core.js';
import {runCompanionTurn} from '../dist/agent-companion.js';
import {defaultCharacter} from '../dist/agent-character.js';
const choices=['先梳理已有资料','一起比较性能参数','聊聊研究方向'];
test('optional choice metadata is bounded and separate from the visible answer',()=>{
  const text='我们可以从三个方向开始。\n<materia_choices>'+JSON.stringify(choices)+'</materia_choices>';
  assert.deepEqual(readChoiceReply(text),{answer:'我们可以从三个方向开始。',choices});
  assert.deepEqual(readChoiceReply('普通回答'),{answer:'普通回答'});
  assert.deepEqual(readChoiceReply('正常内容\n<materia_choices>bad</materia_choices>'),{answer:'正常内容'});
  assert.throws(()=>cleanChoices(['a','b']),/格式/);
  assert.throws(()=>cleanChoices(['a','a','b']),/重复/);
  assert.throws(()=>cleanChoices(['a'.repeat(121),'b','c']),/格式/);
});
test('choices persist with the assistant entry and remain available to subsequent context',()=>{
  const entry={role:'assistant',content:'选一个方向吧',choices};
  const state=cleanAgentHistory({...emptyAgentHistory(),activeId:'x',conversations:[{id:'x',title:'对话',scopeIds:null,createdAt:1,updatedAt:1,entries:[entry]}]});
  assert.deepEqual(state.conversations[0].entries[0],entry);
  assert.match(entryText(entry),/2. 一起比较性能参数/);
});
test('normal model replies support three scene choices without another provider request',async()=>{
  let calls=0;
  const result=await runResearchAgent({question:'你觉得下一步做什么？',offerChoice:true,context:{papers:[],notes:{},scopeIds:null},
    complete:async input=>{calls++;assert.match(input.messages[0].content,/materia_choices/);return {content:'选一个方向吧\n<materia_choices>'+JSON.stringify(choices)+'</materia_choices>'};}});
  assert.equal(calls,1);assert.deepEqual(result.choices,choices);assert.equal(result.answer,'选一个方向吧');
});
test('the shared choice roll selects exactly the interval below forty percent',()=>{
  assert.equal(rollDialogueChoices(()=>.39999),true);
  assert.equal(rollDialogueChoices(()=>.4),false);
});
test('manual replies use the draw even for factual answers or when the model omits choices',async()=>{
  const metadata='\n<materia_choices>'+JSON.stringify(choices)+'</materia_choices>';
  const complete=content=>async()=>({content:content+metadata});
  const ordinary=await runResearchAgent({question:'铝的元素符号是什么？',complete:complete('铝的元素符号是 Al。')});
  assert.deepEqual(ordinary,{answer:'铝的元素符号是 Al。',sources:[]});
  const branch=await runResearchAgent({question:'铝的元素符号是什么？',offerChoice:true,complete:complete('铝的元素符号是 Al。')});
  assert.deepEqual(branch.choices,choices);
  const fallback=await runResearchAgent({question:'How are you?',offerChoice:true,kurisuContext:{replyLanguage:'en'},
    complete:async()=>({content:'I’m doing well.'})});
  assert.equal(fallback.answer,'I’m doing well.');
  assert.match(fallback.choices[0],/^Can we/);
  assert.equal(fallback.choices.length,3);
});
test('a selected automatic batch keeps choices after a statement and supplies them when invalid',async()=>{
  const turn=async(offerChoice,options)=>runCompanionTurn({character:defaultCharacter(),history:[],companion:{locale:'zh-CN',offerChoice},
    complete:async()=>({content:JSON.stringify({lines:['今天读到一本很有意思的书。'],choices:options})})});
  assert.deepEqual((await turn(true,choices)).choices,choices);
  assert.equal((await turn(true,['重复','重复','重复'])).choices.length,3);
  assert.equal((await turn(false,choices)).choices,undefined);
});
