import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanCharacter,defaultCharacter} from '../dist/agent-character.js';
import {cleanAgentHistory,emptyAgentHistory} from '../dist/agent-history.js';
import {runResearchAgent} from '../dist/ai-agent-core.js';

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
