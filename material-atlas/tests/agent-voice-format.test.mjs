import test from 'node:test';
import assert from 'node:assert/strict';
import {readVoiceReply,voiceInstructions} from '../dist/agent-voice-format.js';
import {runResearchAgent} from '../dist/ai-agent-core.js';
import {runCompanionTurn} from '../dist/agent-companion.js';
import {defaultCharacter} from '../dist/agent-character.js';

test('paired research replies retain Markdown, citations and decision filtering with one completion',async()=>{
  let calls=0;
  const result=await runResearchAgent({question:'给我三个下一步选项',context:{papers:[]},voiceLanguage:'ja',complete:async({messages})=>{
    calls++;
    assert.match(messages[0].content,/配音格式/);
    return {content:JSON.stringify({segments:[{text:'先确认实验条件。',speech:'まず実験条件を確認しましょう。'},
      {text:'**然后核对样品。**',speech:'次に試料を確認します。'}],choices:['先检查温度','先检查样品','先检查仪器']})};
  }});
  assert.equal(calls,1);
  assert.equal(result.answer,'先确认实验条件。\n\n**然后核对样品。**');
  assert.equal(result.voice.language,'ja');
  assert.equal(result.voice.segments[1].text,'**然后核对样品。**');
  assert.equal(result.choices.length,3);
});

test('malformed speech keeps readable text for compatibility and ordinary replies need no voice format',()=>{
  const parsed=readVoiceReply(JSON.stringify({segments:[{text:'中文回复',speech:'あ'.repeat(181)}]}),'ja');
  assert.equal(parsed.answer,'中文回复');
  assert.equal(parsed.voice,undefined);
  assert.equal(readVoiceReply('普通回复','ja'),null);
  assert.equal(voiceInstructions('follow'),'');
  assert.equal(voiceInstructions('untrusted request'),'');
});

test('automatic dialogue keeps paired speech aligned after removing repeated lines',async()=>{
  const lines=Array.from({length:10},(_,i)=>'第'+i+'句中文。');
  const speech=Array.from({length:10},(_,i)=>'第'+i+'の日本語。');
  const result=await runCompanionTurn({character:defaultCharacter(),history:[],companion:{locale:'zh-CN',seed:0},voiceLanguage:'ja',
    complete:async()=>({content:JSON.stringify({lines:[lines[0],...lines],speech:[speech[0],...speech],recap:''})})});
  assert.deepEqual(result.lines,lines);
  assert.deepEqual(result.voice.segments.map(row=>row.speech),speech);
});
