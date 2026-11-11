// Runs the actual desktop entry and preload against an isolated library, with no visible window.
import { app, safeStorage } from 'electron';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile,readdir } from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import http from 'node:http';
import { LocalLibrary } from '../desktop/library.mjs';
import { AgentHistoryFile } from '../desktop/agent-history.mjs';

const root=path.resolve(import.meta.dirname,'..'),output=path.join(root,'.local','agent-desktop-verification');
await mkdir(output,{recursive:true});
const isolated=await mkdtemp(path.join(output,'run-'));
process.env.MATERIA_VOICE_DIR=path.join(isolated,'voice');
process.env.MATERIA_PROFILE_DIR=path.join(isolated,'profile');process.env.MATERIA_LIBRARY_DIR=path.join(isolated,'library');process.env.MATERIA_HEADLESS='1';
app.setName('MateriaAgentVerification');
const lib=await new LocalLibrary(process.env.MATERIA_LIBRARY_DIR).init();
const fixturePdf=Buffer.from('%PDF-1.4\n% Synthetic desktop agent fixture\n%%EOF');
await lib.putPapers([{id:'p1',title:'桌面 Agent 合成文献 A',tags:[],authors:'Ada',authorDetails:[],filename:'a.pdf',year:'2024',measurements:[],fileBytes:fixturePdf},{id:'p2',title:'不在本次范围的文献 B',tags:[],authors:'Bo',authorDetails:[],filename:'b.pdf',year:'2025',measurements:[],fileBytes:fixturePdf}]);
await lib.setSetting('notes',{'paper:p1':[{id:'n1',body:'桌面通信验证笔记',createdAt:1,updatedAt:1}]});
const checks=[],requests=[];let win,automaticRequests=0;
const mock=http.createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks));requests.push(body);
  if(body.messages[0]?.content.includes('Galgame 自动对话')){
    automaticRequests++;
    if(automaticRequests===2)return;
    const result={lines:Array.from({length:10},(_,i)=>'桌面自动台词 '+(i+1)+'。'),recap:'棋局'};
    if(body.messages[0].content.includes('加入 "choices"')){
      result.lines[9]='下一局想试哪种开局？';
      result.choices=['先走王兵。','试试后翼弃兵。','先看看你的开局。'];
    }
    res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}));return;
  }
  if(/^(我来插一句。|我叫桌面测试林|你还记得环形磁芯)/.test(body.messages.at(-1)?.content??'')){
    res.end(JSON.stringify({choices:[{message:{content:'我在听。'}}]}));return;
  }
  if(body.messages.at(-1)?.content==='慢请求')return;
  const tools=body.messages.filter(m=>m.role==='tool');let message;
  if(!tools.length)message={tool_calls:[{id:'s1',type:'function',function:{name:'search_library',arguments:'{"query":""}'}}]};
  else if(tools.length===1)message={tool_calls:[{id:'r1',type:'function',function:{name:'read_papers',arguments:'{"ids":["p1"]}'}}]};
  else message={content:'已读取桌面文献笔记 [p1]'};
  res.end(JSON.stringify({choices:[{finish_reason:message.tool_calls?'tool_calls':'stop',message}]}));
});
await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
const baseUrl=`http://127.0.0.1:${mock.address().port}/v1`;
const timeout=setTimeout(()=>finish(new Error('Desktop verification timed out.')),45000);
const exec=body=>win.webContents.executeJavaScript(`(async()=>{${body}})()`);
async function check(name,run){await run();checks.push(name);console.log('PASS '+name);}
async function finish(error){
  clearTimeout(timeout);mock.closeAllConnections();mock.close();
  if(error){console.error(error);await writeFile(path.join(output,'failure.json'),JSON.stringify({error:error.stack,checks},null,2));}
  else await writeFile(path.join(output,'report.json'),JSON.stringify({passed:checks.length,checks,providerRequests:requests.length,systemEncryption:await safeStorage.isAsyncEncryptionAvailable(),isolated:true,visibleWindow:false},null,2));
  app.exit(error?1:0);
}
app.on('browser-window-created',(_event,window)=>{
  win=window;
  window.webContents.once('did-finish-load',async()=>{
    try {
      for(let attempt=0;attempt<100;attempt++){if(await exec('return !document.querySelector(".import-main").disabled;'))break;await new Promise(r=>setTimeout(r,30));}
      await check('real desktop starts hidden with the sandboxed preload and isolated literature',async()=>{
        assert.equal(win.isVisible(),false);assert.equal(await exec('return typeof require;'),'undefined');assert.equal((await exec('return await materiaDesktop.getPapers();')).length,2);
      });
      await check('real safeStorage retains keys outside literature and never returns keys through the bridge',async()=>{
        const value={baseUrl,model:'mock-model',apiKey:'desktop-synthetic-test-key',protocol:'chat',rememberKey:await safeStorage.isAsyncEncryptionAvailable()};
        const config=await exec(`return await materiaDesktop.agentSaveConfig(${JSON.stringify(value)});`);assert.equal(config.hasKey,true);assert.equal(config.apiKey,undefined);
        assert.ok(!(await readFile(path.join(process.env.MATERIA_PROFILE_DIR,'ai-agent.json'),'utf8')).includes(value.apiKey));
        assert.ok(!(await readFile(path.join(process.env.MATERIA_LIBRARY_DIR,'library.json'),'utf8')).includes(value.apiKey));
      });
      await check('actual desktop IPC executes the agent loop in main and emits progress with source IDs',async()=>{
        await exec('globalThis.desktopAgentProgress=[];globalThis.unsubscribeAgent=materiaDesktop.onAgentProgress(p=>desktopAgentProgress.push(p));');
        const answer=await exec('return await materiaDesktop.agentRun({id:"desktop-test",question:"总结选中文献",history:[],scopeIds:["p1"]});');
        assert.equal(answer.answer,'已读取桌面文献笔记 [p1]');assert.deepEqual(answer.sources.map(p=>p.id),['p1']);
        assert.equal(JSON.parse(requests[1].messages.at(-1).content).total,1);assert.ok(JSON.stringify(requests[2]).includes('桌面通信验证笔记'));
        assert.ok((await exec('return desktopAgentProgress;')).some(p=>p.stage==='tool'&&p.id==='desktop-test'));
      });
      await check('desktop sidebar uses the real bridge to submit questions and navigate citations',async()=>{
        await exec('document.querySelector(".workspace-ribbon [data-action=ai-agent]").click();');
        for(let attempt=0;attempt<100;attempt++){if(await exec('return document.querySelector("#agent-model").value==="mock-model";'))break;await new Promise(r=>setTimeout(r,20));}
        await exec('document.querySelector("#agent-question").value="通过桌面侧栏总结文献";document.querySelector("#agent-question-form").requestSubmit();');
        for(let attempt=0;attempt<100;attempt++){if(await exec('return Boolean(document.querySelector(".agent-assistant"));'))break;await new Promise(r=>setTimeout(r,30));}
        assert.equal(await exec('return document.querySelectorAll(".agent-stage-answer .agent-citation").length;'),1);
        await exec('document.querySelector(".agent-stage-answer .agent-citation").click();');assert.equal(await exec('return document.querySelector("#ai-agent-panel").hidden;'),true);
        assert.ok((await exec('return document.querySelector("#detail-panel").textContent;')).includes('桌面 Agent 合成文献 A'));
      });
      await check('real desktop history saves Markdown and references to the current library and resumes after reload',async()=>{
        const before=await exec('return await materiaDesktop.agentGetHistory();');assert.equal(before.state.conversations.length,1);assert.equal(before.state.conversations[0].entries.length,2);assert.equal(before.state.conversations[0].entries[1].sources[0].id,'p1');
        const disk=await new AgentHistoryFile(process.env.MATERIA_LIBRARY_DIR).load();assert.deepEqual(disk,before.state);assert.ok(!(await readFile(path.join(process.env.MATERIA_LIBRARY_DIR,'ai-chats.json'),'utf8')).includes('desktop-synthetic-test-key'));
        const loaded=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));win.webContents.reload();await loaded;
        for(let attempt=0;attempt<100;attempt++){if(await exec('return !document.querySelector(".import-main").disabled;'))break;await new Promise(r=>setTimeout(r,30));}
        await exec('document.querySelector(".workspace-ribbon [data-action=ai-agent]").click();');
        for(let attempt=0;attempt<100;attempt++){if(await exec('return Boolean(document.querySelector(".agent-assistant"));'))break;await new Promise(r=>setTimeout(r,20));}
        assert.equal(await exec('return document.querySelectorAll(".agent-stage-answer .agent-citation").length;'),1);
        const mismatch=await exec(`return await materiaDesktop.agentSaveHistory({libraryKey:"other-library",state:${JSON.stringify(before.state)}}).then(()=>false,()=>true);`);assert.equal(mismatch,true);assert.deepEqual((await exec('return await materiaDesktop.agentGetHistory();')).state,before.state);
      });
      await check('confirmed desktop history deletion persists without affecting literature',async()=>{
        await exec('document.querySelector("[data-agent-action=history]").click();document.querySelector("[data-history-delete]").click();document.querySelector("[data-history-delete]").click();');
        for(let attempt=0;attempt<100;attempt++){if(await exec('return document.querySelector("#agent-status").textContent.includes("已删除");'))break;await new Promise(r=>setTimeout(r,20));}
        const disk=await new AgentHistoryFile(process.env.MATERIA_LIBRARY_DIR).load();assert.deepEqual(disk.conversations,[]);assert.equal(disk.activeId,'');assert.equal((await exec('return await materiaDesktop.getPapers();')).length,2);
      });
      await check('actual desktop cancellation aborts the pending provider request',async()=>{
        await exec('globalThis.pendingDesktopAgent=materiaDesktop.agentRun({id:"desktop-stop",question:"慢请求",history:[],scopeIds:["p1"]}).then(value=>value.canceled?"cancelled":"unexpected success",()=>"unexpected rejection");');
        for(let attempt=0;attempt<100&&!requests.some(r=>r.messages.at(-1)?.content==='慢请求');attempt++)await new Promise(r=>setTimeout(r,20));
        await exec('await materiaDesktop.agentCancel("desktop-stop");');assert.equal(await exec('return await pendingDesktopAgent;'),'cancelled');
      });
      await check('desktop companion IPC sends only dialogue and releases a canceled automatic turn for an interruption',async()=>{
        const reply=await exec('return await materiaDesktop.agentRun({id:"auto-1",chatId:"companion-test",companion:{locale:"zh-CN",offerChoice:true},history:[]});');
        assert.deepEqual(reply,{lines:[...Array.from({length:9},(_,i)=>'桌面自动台词 '+(i+1)+'。'),'下一局想试哪种开局？'],recap:'棋局',choices:['先走王兵。','试试后翼弃兵。','先看看你的开局。']});
        assert.equal(requests.at(-1).tools,undefined);
        assert.ok(!JSON.stringify(requests.at(-1)).includes('桌面通信验证笔记'));
        await exec('globalThis.pendingAuto=materiaDesktop.agentRun({id:"auto-2",chatId:"companion-test",companion:{locale:"zh-CN"},history:[{role:"assistant",content:"桌面自动台词一。"}]});');
        for(let attempt=0;attempt<100&&automaticRequests<2;attempt++)await new Promise(r=>setTimeout(r,20));
        assert.equal(automaticRequests,2);
        await exec('await materiaDesktop.agentCancel("auto-2");');
        assert.equal((await exec('return await pendingAuto;')).canceled,true);
        const manual=await exec('return await materiaDesktop.agentRun({id:"interrupt-1",chatId:"companion-test",companionContext:true,question:"我来插一句。",history:[{role:"assistant",content:"桌面自动台词一。"}]});');
        assert.equal(manual.answer,'我在听。');
        assert.match(requests.at(-1).messages[0].content,/用户正在插话/);
      });
      await check('desktop indexes actual exchanges and uses the saved reply language and local corpus',async()=>{
        const before=requests.length;
        const type=question=>exec('document.querySelector("#agent-question").value='+JSON.stringify(question)+';document.querySelector("#agent-question-form").requestSubmit();');
        const waitForStatus=async text=>{
          for(let attempt=0;attempt<100;attempt++){
            if((await exec('return document.querySelector("#agent-status").textContent;')).includes(text))return;
            await new Promise(resolve=>setTimeout(resolve,25));
          }
          throw Error('Missing status: '+text);
        };
        await type('我叫桌面测试林，研究环形磁芯退火。');await waitForStatus('回答完成');
        const load=()=>new AgentHistoryFile(process.env.MATERIA_LIBRARY_DIR).load();
        const indexed=(await load()).characterMemory.roles['makise-kurisu'];
        assert.deepEqual(indexed.episodes[0].turns,[[0,1,'name']]);
        const folder=path.join(isolated,'记忆库','relationship','makise-kurisu');
        const files=await readdir(folder);
        const index=JSON.parse(await readFile(path.join(folder,files[0]),'utf8'));
        assert.deepEqual(index.episodes,indexed.episodes);
        assert.doesNotMatch(JSON.stringify(index),/桌面测试林/);
        await exec('document.querySelector("[data-agent-settings-tab=language]").click();const el=document.querySelector("#agent-reply-language");el.value="ja";el.dispatchEvent(new Event("change"));');
        await waitForStatus('回复语言已保存');
        assert.equal((await load()).characterMemory.roles['makise-kurisu'].replyLanguage,'ja');
        assert.equal(requests.length,before+1);
        await exec('document.querySelector("[data-agent-action=new]").click();');
        await type('你还记得环形磁芯退火吗？');await waitForStatus('回答完成');
        assert.match(requests.at(-1).messages[0].content,/桌面测试林/);
        assert.match(requests.at(-1).messages[0].content,/使用 日本語/);
        const catalog=await exec('return materiaDesktop.agentCharacterCorpus({characterId:"makise-kurisu",query:"pudding",locale:"ja"});');
        if(catalog.count){
          assert.ok(catalog.count>=19000);
          assert.ok(catalog.matches.some(row=>row.lines.some(line=>line.text.includes('プリン'))));
        }
      });
      await check('desktop key clearing removes saved ciphertext and leaves literature unchanged',async()=>{
        await exec(`await materiaDesktop.agentSaveConfig(${JSON.stringify({baseUrl,model:'mock-model',protocol:'chat',apiKey:'',clearKey:true,rememberKey:false})});globalThis.unsubscribeAgent?.();`);
        const current=await exec('return await materiaDesktop.agentGetConfig();');assert.equal(current.hasKey,false);
        assert.ok(!(await readFile(path.join(process.env.MATERIA_PROFILE_DIR,'ai-agent.json'),'utf8')).includes('encryptedKey'));
        const papers=await exec('return await materiaDesktop.getPapers();');assert.equal(papers.length,2);assert.equal(papers[0].title,'桌面 Agent 合成文献 A');
      });
      await finish();
    } catch(error){await finish(error);}
  });
});
const appRoot=process.env.MATERIA_AGENT_VERIFY_APP||root;
await import(pathToFileURL(path.join(appRoot,'desktop/main.mjs')).href);
