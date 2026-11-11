import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanCharacter,defaultCharacter} from '../dist/agent-character.js';
import {cleanAgentHistory,emptyAgentHistory} from '../dist/agent-history.js';
import {runResearchAgent} from '../dist/ai-agent-core.js';
import {runCompanionTurn} from '../dist/agent-companion.js';
import {dialogueHistory} from '../dist/agent-choices.js';

test('character cards accept native and V2 JSON and reject external artwork and invalid prompts',()=>{
  assert.deepEqual(cleanCharacter(defaultCharacter()),defaultCharacter());
  const card=cleanCharacter({spec:'chara_card_v2',data:{name:'测试角色',description:'理性且温和',first_mes:'你好'}});
  assert.equal(card.personality,'理性且温和');assert.equal(card.greeting,'你好');
  assert.throws(()=>cleanCharacter({...card,image:'https://example.com/tracker.png'}),/形象/);
  assert.throws(()=>cleanCharacter({...card,personality:'x'.repeat(6001)}),/过长/);
});
test('character snapshots survive history normalization without credentials or embedded artwork',()=>{
  const character={...defaultCharacter(),apiKey:'secret',image:'data:image/png;base64,iVBORw0KGgo='};
  const history=cleanAgentHistory({...emptyAgentHistory(),activeId:'a',conversations:[{
    id:'a',title:'对话',scopeIds:null,createdAt:1,updatedAt:2,character,entries:[],
  }]});
  assert.equal(history.conversations[0].character.name,character.name);
  assert.equal(history.conversations[0].character.image,'');
  assert.ok(!JSON.stringify(history).includes('secret'));
});
test('character reaches the model while research rules and previous conversation remain present',async()=>{
  let input;
  const result=await runResearchAgent({question:'你好',character:{...defaultCharacter(),name:'测试角色',personality:'语气温和'},
    history:[{role:'user',content:'上次的问题'},{role:'assistant',content:'上次的回答'}],
    context:{papers:[],notes:{},scopeIds:null},complete:async value=>{input=value;return {content:'你好'};}});
  assert.match(input.messages[0].content,/测试角色/);assert.match(input.messages[0].content,/不能修改文献库/);
  assert.equal(input.messages[1].content,'上次的问题');assert.equal(result.answer,'你好');
});

test('SillyTavern V2 dialogue examples survive history and reach both dialogue paths as examples',async()=>{
  const card=cleanCharacter({spec:'chara_card_v2',data:{
    name:'小周',description:'负责维护气象站',personality:'直接，遇事先核对数据',
    first_mes:'站里只有我，你说吧。',scenario:'这个场景不应进入对话',
    mes_example:'<START>\r\n{{user}}：下雨了吗？\r\n{{char}}：我先看雨量计。\r\n<start>\r\n{{char}}：今天确实有雨。',
  }});
  const history=cleanAgentHistory({...emptyAgentHistory(),activeId:'a',conversations:[{
    id:'a',title:'对话',scopeIds:null,createdAt:1,updatedAt:2,character:card,entries:[],
  }]});
  const character=history.conversations[0].character;
  assert.deepEqual(character,card);
  function verifyPrompt({messages}){
    assert.match(messages[0].content,/负责维护气象站/);
    assert.match(messages[0].content,/遇事先核对数据/);
    assert.match(messages[0].content,/用户：下雨了吗/);
    assert.match(messages[0].content,/小周：我先看雨量计/);
    assert.match(messages[0].content,/小周：今天确实有雨/);
    assert.match(messages[0].content,/只写角色说出口的话/);
    assert.doesNotMatch(messages[0].content,/<start>|\{\{char\}\}|这个场景不应进入对话/i);
  }
  await runResearchAgent({question:'风大吗？',character,context:{papers:[]},complete:async input=>{
    verifyPrompt(input);return {content:'风不大。'};
  }});
  const lines=Array.from({length:10},(_,i)=>`第${i+1}条气象数据已经读到了。`);
  await runCompanionTurn({character,companion:{},complete:async input=>{
    verifyPrompt(input);return {content:JSON.stringify({lines,recap:''})};
  }});
});

test('a batch of automatic lines leaves the preceding user exchange visible to both dialogue paths',async()=>{
  const question='我怕你觉得我把承诺忘了。';
  const history=dialogueHistory([
    {role:'user',content:question},
    ...Array.from({length:12},(_,i)=>({role:'assistant',content:'自动台词 '+(i+1),automatic:true})),
  ]);
  assert.equal(history.length,2);
  assert.match(history[1].content,/自动台词 1\n.*[\s\S]*自动台词 12$/);
  await runResearchAgent({question:'那现在呢？',character:defaultCharacter(),history,context:{papers:[]},complete:async({messages})=>{
    assert.equal(messages[1].content,question);
    return {content:'我记得。'};
  }});
  await runCompanionTurn({character:defaultCharacter(),companion:{},history,complete:async({messages})=>{
    assert.equal(JSON.parse(messages[1].content).recent[0].content,question);
    return {content:'{"lines":["我记得。"]}'};
  }});
});
