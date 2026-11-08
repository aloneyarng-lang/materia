import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTORS,actionSequence} from '../dist/agent-actors.js';
import {cleanCharacter} from '../dist/agent-character.js';
import {cleanAgentHistory,emptyAgentHistory} from '../dist/agent-history.js';
test('actor actions copy a contiguous sequence and unknown triggers have no action',()=>{
  const actor=ACTORS.deepseek,sequence=actionSequence(actor,'message.send');
  assert.deepEqual(sequence,['phone','desk','return']);
  assert.equal(actor.clips.phone.end,actor.clips.desk.start);
  assert.equal(actor.clips.desk.end,actor.clips.return.start);
  sequence.pop();assert.equal(actor.actions['message.send'].length,3);
  assert.deepEqual(actionSequence(actor,'unknown'),[]);
  assert.throws(()=>actionSequence({...actor,actions:{bad:['missing']}},'bad'),/配置无效/);
});
test('legacy role cards default to Amadeus and DeepSeek survives conversation normalization',()=>{
  assert.equal(cleanCharacter({name:'旧角色'}).actorId,'amadeus');
  const character=cleanCharacter({actorId:'deepseek',name:'DeepSeek 娘',personality:'温柔',greeting:'你好'});
  const history=cleanAgentHistory({...emptyAgentHistory(),activeId:'a',conversations:[{
    id:'a',title:'对话',scopeIds:null,createdAt:1,updatedAt:1,character,entries:[],
  }]});
  assert.equal(history.conversations[0].character.actorId,'deepseek');
});
