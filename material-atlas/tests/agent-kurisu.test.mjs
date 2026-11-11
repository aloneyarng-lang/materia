import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {AgentHistoryFile} from '../desktop/agent-history.mjs';
import {emptyAgentHistory} from '../dist/agent-history.js';
import {defaultCharacter,cleanCharacter} from '../dist/agent-character.js';
import {PREVIOUS_KURISU_PERSONALITY,LEGACY_KURISU_PERSONALITY,LEGACY_KURISU_GREETING} from '../dist/agent-kurisu.js';
import {KURISU_ID,profileFor,recallCharacterMemory} from '../dist/agent-character-memory.js';
import {createCharacterCorpus,validateCharacterCorpus} from '../dist/agent-character-corpus.js';
import {runResearchAgent} from '../dist/ai-agent-core.js';
import {runCompanionTurn} from '../dist/agent-companion.js';
import {dialogueHistory} from '../dist/agent-choices.js';

const character=defaultCharacter();
const other={name:'DeepSeek 娘',actorId:'deepseek',personality:'其他角色'};
const entry=(role,content,extra)=>({role,content,...extra});
const chat=(id,entries,role=character)=>({id,title:id,createdAt:1,updatedAt:1,scopeIds:null,character:role,entries});
const corpus={
  format:'materia-character-corpus',version:1,characterId:KURISU_ID,languages:['zh-CN','en','ja'],
  records:[{id:'fixture:1',kind:'dialogue',work:'SG',variant:'kurisu',scene:'SG_TEST',sourceLanguage:'ja',
    source:{method:'game_script_bytecode'},lines:[{speaker:'Kurisu',texts:{'zh-CN':'布丁被谁吃了？',en:'Who ate the pudding?',ja:'プリンを食べたのは誰？'}}]}],
};
const findCanon=createCharacterCorpus(async()=>corpus);

test('only unchanged legacy defaults migrate; custom cards keep their wording',()=>{
  const legacy={...character,personality:LEGACY_KURISU_PERSONALITY,greeting:LEGACY_KURISU_GREETING};
  assert.deepEqual(cleanCharacter(legacy),character);
  assert.deepEqual(cleanCharacter({...character,personality:PREVIOUS_KURISU_PERSONALITY}),character);
  assert.equal(cleanCharacter({...legacy,personality:'自定义'}).personality,'自定义');
  assert.equal(cleanCharacter({...legacy,name:'原创角色'}).personality,LEGACY_KURISU_PERSONALITY);
});

test('Kurisu opens briefly without treating an earlier automatic monologue as a user topic',async()=>{
  const oldLine='刚才那个关于冷水结冰的故事';
  const history=[entry('assistant',oldLine,{automatic:true})];
  const companion={locale:'zh-CN',seed:0,recap:oldLine,offerChoice:true};
  const topics=[];
  for(const chatId of ['chat-a','chat-b']){
    const result=await runCompanionTurn({chatId,character,history,companion,voiceLanguage:'ja',
      findCanon:()=>assert.fail('An automatic monologue is not a canon query'),complete:async({messages})=>{
        const input=JSON.parse(messages[1].content);
        assert.deepEqual(input.recent,[]);
        assert.equal(input.recap,'');
        topics.push(input.topic);
        return {content:JSON.stringify({lines:['你好。','今天怎么样？','多出的一句'],recap:oldLine,
          speech:['こんにちは。','今日はどう？','余分な台詞'],choices:['甲','乙','丙']})};
      }});
    assert.deepEqual(result.lines,['你好。','今天怎么样？']);
    assert.equal(result.recap,'');
    assert.equal(result.choices,undefined);
    assert.deepEqual(result.voice.segments.map(x=>x.speech),['こんにちは。','今日はどう？']);
  }
  assert.notEqual(topics[0],topics[1]);
  await runCompanionTurn({character,companion,history:[...history,entry('user','还是聊聊晚饭吧。')],
    complete:async({messages})=>{
      const input=JSON.parse(messages[1].content);
      assert.equal(input.topic,undefined);
      assert.equal(input.recent.at(-1).content,'还是聊聊晚饭吧。');
      return {content:'{"lines":["好。"]}'};
    }});
});

test('unanswered automatic tangents are omitted from the next Kurisu turn',async()=>{
  const tangent='国际象棋里有一种安静走法。';
  const entries=[entry('user','说话慢一点。'),entry('assistant','好，慢慢说。'),
    entry('assistant',tangent,{automatic:true}),entry('assistant','再举一个例子。',{automatic:true})];
  for(const followUp of ['', '刚才那个国际象棋走法是什么？']){
    const history=dialogueHistory(followUp?[...entries,entry('user',followUp)]:entries);
    await runCompanionTurn({character,history,companion:{recap:tangent,seed:1},
      complete:async({messages})=>{
        const input=JSON.parse(messages[1].content);
        assert.equal(input.topic,undefined);
        assert.equal(input.recent.some(row=>row.content.includes(tangent)),Boolean(followUp));
        assert.equal(input.recap,followUp?tangent:'');
        assert.equal(input.recent[0].content,'说话慢一点。');
        return {content:'{"lines":["好。"]}'};
      }});
  }
});

test('completed exchanges and self-introductions are organized locally with stable role and source references',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'materia-kurisu-'));
  try{
    const state=emptyAgentHistory();
    state.conversations=[
      chat('kurisu',[entry('user','我叫林。'),entry('assistant','好。'),
        entry('user','环形磁芯样品编号是 M23。'),entry('assistant','知道了。'),
        entry('user','环形磁芯密封日期是星期五。'),entry('error','失败'),
        entry('user','环形磁芯样品重量保留三位数。'),entry('assistant','自动独白',{automatic:true})]),
      chat('other',[entry('user','环形磁芯样品代号是其他角色专用。'),entry('assistant','收到。')],other),
    ];
    state.kurisuMemory={recall:false,facts:['环形磁芯：先核查厚度']};
    const store=new AgentHistoryFile(temp);
    await store.save(state);
    const question='你还记得环形磁芯样品吗？';
    const context=loaded=>recallCharacterMemory({state:loaded,character,question});
    const saved=await new AgentHistoryFile(temp).load();
    assert.equal(saved.kurisuMemory,undefined);
    assert.deepEqual(profileFor(saved).episodes,[{chatId:'kurisu',turns:[[0,1,'name'],[2,3,'exchange']]}]);
    assert.deepEqual(context(saved),{replyLanguage:'zh-CN',name:'我叫林。',
      migrated:['环形磁芯：先核查厚度'],episodic:[{text:'环形磁芯样品编号是 M23。',reply:'知道了。',where:'之前的对话'}]});
    assert.equal(recallCharacterMemory({state:saved,character:other,question}),undefined);
    assert.deepEqual(recallCharacterMemory({state:saved,character,question,scopeIds:['selected']}).episodic,[]);
    const newLibrary=await new AgentHistoryFile(path.join(temp,'other-library')).load();
    assert.deepEqual(context(newLibrary).episodic,[]);
    profileFor(saved).replyLanguage='ja';
    saved.conversations=saved.conversations.filter(item=>item.id!=='kurisu');
    await store.save(saved);
    const after=await store.load();
    assert.deepEqual(profileFor(after).episodes,[]);
    assert.equal(context(after).replyLanguage,'ja');
  }finally{await rm(temp,{recursive:true,force:true});}
});

test('a trilingual corpus can search across languages, label originals, and rejects missing text',async()=>{
  for(const [query,locale] of [['布丁','ja'],['pudding','zh-CN'],['プリン','en']]){
    const result=await findCanon({query,locale});
    assert.equal(result.count,1);
    assert.equal(result.matches[0].id,'fixture:1');
    assert.equal(result.matches[0].lines[0].text,corpus.records[0].lines[0].texts[locale]);
    assert.equal(result.matches[0].translation,locale==='ja'?'source':'machine');
  }
  const broken=structuredClone(corpus);
  delete broken.records[0].lines[0].texts.ja;
  assert.throws(()=>validateCharacterCorpus(broken),/缺译/);
  assert.deepEqual(await findCanon({characterId:'another',query:'pudding'}),{count:0,matches:[]});
});

test('manual and automatic prompts use selected language and actual corpus, with isolation and short automatic replies',async()=>{
  const memory={replyLanguage:'en',episodic:[{where:'本次对话',text:'前面聊过布丁。',reply:'我还在找。'}]};
  const question='聊聊布丁吧。';
  for(const selected of [character,other]){
    await runResearchAgent({question,character:selected,kurisuContext:memory,findCanon,
      context:{papers:[],scopeIds:[]},complete:async({messages,tools})=>{
        const instructions=messages[0].content;
        assert.deepEqual(tools.map(tool=>tool.name).sort(),['compare_parameters','draft_note','library_overview','read_papers','search_library']);
        for(const text of ['前面聊过布丁','fixture:1','使用 English'])assert.equal(instructions.includes(text),selected===character);
        assert.match(instructions,/本次范围内共有 0 篇文献/);
        return {content:'Okay.'};
      }});
  }
  let requests=0;
  const lines=['That still bothers me.'];
  const turn=await runCompanionTurn({character,history:[entry('user',question)],kurisuContext:memory,findCanon,
    companion:{locale:'zh-CN',recap:''},complete:async({messages,tools})=>{
      assert.deepEqual(tools,[]);
      assert.match(messages[0].content,/English/);
      assert.match(messages[0].content,/fixture:1/);
      assert.match(messages[0].content,/最近的原话优先于旧摘要/);
      return {content:JSON.stringify({lines:++requests===1?[]:lines,recap:''})};
    }});
  assert.deepEqual(turn.lines,lines);
  assert.equal(requests,2);
  await assert.rejects(runCompanionTurn({character,history:[],companion:{},complete:async()=>({content:'{"lines":[]}'})}),/未返回有效台词/);
});

