// Exercise the real Electron entry/preload with isolated data and a local synthetic provider.
import {app} from 'electron';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {LocalLibrary} from '../desktop/library.mjs';
const root=path.resolve(import.meta.dirname,'..');
const output=path.join(root,'.local/reze-integration/desktop-check');
await mkdir(output,{recursive:true});
const isolated=await mkdtemp(path.join(output,'run-'));
process.env.MATERIA_PROFILE_DIR=path.join(isolated,'profile');
process.env.MATERIA_LIBRARY_DIR=path.join(isolated,'library');
process.env.MATERIA_HEADLESS='1';
await mkdir(process.env.MATERIA_PROFILE_DIR,{recursive:true});
await writeFile(path.join(process.env.MATERIA_PROFILE_DIR,'preferences.json'),JSON.stringify({agentVoiceEnabled:false}));
await new LocalLibrary(process.env.MATERIA_LIBRARY_DIR).init();
const requests=[],checks=[],errors=[];
const server=http.createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);
  const body=JSON.parse(Buffer.concat(chunks));requests.push(body);
  const automatic=body.messages?.[0]?.content.includes('Galgame 自动对话');
  const content=automatic?JSON.stringify({lines:Array.from({length:10},(_,i)=>'Let us talk about coffee, point '+(i+1)+'.'),recap:''}):'A quiet place sounds good. What would you like to talk about?';
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content}}]}));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const baseUrl='http://127.0.0.1:'+server.address().port+'/v1';
let win;
const exec=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
const wait=async expression=>{
  for(let i=0;i<150;i++){if(await exec('return '+expression+';'))return;await new Promise(r=>setTimeout(r,70));}
  throw Error('Timed out: '+expression);
};
async function check(label,run){await run();checks.push(label);console.log('PASS '+label);}
async function finish(error){
  server.close();
  const report={passed:checks.length,checks,errors,isolated,appRoot:process.env.MATERIA_REZE_VERIFY_APP||root,error:error?.stack||null};
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  if(error)console.error(error);
  app.exit(error?1:0);
}
app.on('browser-window-created',(_event,window)=>{
  win=window;
  window.webContents.on('console-message',(_event,details)=>{if(details.level==='error')errors.push(details.message);});
  window.webContents.once('did-finish-load',async()=>{
    try{
      await wait('document.querySelector(".import-main")&&!document.querySelector(".import-main").disabled');
      await exec('await materiaDesktop.agentSaveConfig('+JSON.stringify({baseUrl,model:'mock-model',protocol:'chat',apiKey:'synthetic-reze-check',rememberKey:false})+');document.querySelector("[data-action=ai-agent]").click();');
      await wait('document.querySelector(".agent-actor-switch")&&!document.querySelector(".agent-actor-switch").disabled');
      await check('switch to Reze loads original Workshop scene and own card',async()=>{
        await exec('const s=document.querySelector(".agent-actor-switch");s.value="reze";s.dispatchEvent(new Event("change",{bubbles:true}));');
        await wait('document.querySelector(".agent-stage").dataset.actor==="reze"&&!document.querySelector(".agent-actor-switch").disabled');
        await wait('document.querySelector(".agent-stage").classList.contains("agent-reze-scene-ready")');
        assert.equal(await exec('return document.querySelector(".agent-header h2").textContent.includes("蕾塞");'),true);
        assert.equal(await exec('return document.querySelector(".agent-portrait").src.includes("/actors/reze/portrait.png");'),true);
        assert.equal(await exec('return document.querySelector(".agent-effect-canvas").hidden;'),true);
        assert.equal(await exec('return document.querySelector("[data-character=autoplay]").disabled;'),false);
        assert.equal(await exec('return (await materiaDesktop.agentVoiceStatus("chainsawman-reze")).available;'),true);
      });
      await check('reply language persists for Reze and does not change Kurisu',async()=>{
        await exec('document.querySelector("[data-character=settings]").click();document.querySelector("[data-agent-settings-tab=language]").click();const s=document.querySelector("#agent-reply-language");s.value="en";s.dispatchEvent(new Event("change",{bubbles:true}));');
        await wait('document.querySelector("#agent-status").textContent.includes("回复语言已保存")');
        await exec('document.querySelector("#agent-settings").open=false;document.querySelector("#agent-question").value="I like quiet coffee shops.";document.querySelector("#agent-question-form").requestSubmit();');
        await wait('document.querySelector("#agent-status").textContent.includes("回答完成")');
        assert.match(requests.at(-1).messages[0].content,/蕾塞的对话习惯/);
        assert.match(requests.at(-1).messages[0].content,/使用 English/);
        assert.match(requests.at(-1).messages[0].content,/reze-manga-cafe-first/);
        const saved=await exec('return (await materiaDesktop.agentGetHistory()).state;');
        assert.equal(saved.characterMemory.roles['chainsawman-reze'].replyLanguage,'en');
        assert.equal(saved.characterMemory.roles['chainsawman-reze'].episodes.length,1);
        assert.equal(saved.characterMemory.roles['makise-kurisu'],undefined);
        const dir=path.join(isolated,'记忆库/relationship/chainsawman-reze');
        const names=await import('node:fs/promises').then(m=>m.readdir(dir));
        const index=JSON.parse(await readFile(path.join(dir,names[0]),'utf8'));
        assert.equal(index.characterId,'chainsawman-reze');assert.equal(index.episodes.length,1);
      });
      await check('memory page loads Reze corpus with provenance labels',async()=>{
        await exec('document.querySelector("[data-character=settings]").click();document.querySelector("[data-agent-settings-tab=memory]").click();document.querySelector("#agent-corpus-query").value="coffee";document.querySelector("#agent-corpus-form").requestSubmit();');
        await wait('document.querySelector("#agent-corpus-status").textContent.includes("59")');
        assert.equal(await exec('return document.querySelectorAll("#agent-corpus-results li").length>0;'),true);
        assert.equal(await exec('return [...document.querySelectorAll("#agent-memory-page a")].some(a=>a.href.startsWith("https://"));'),true);
        assert.equal(await exec('return document.querySelector("#agent-corpus-results").textContent.includes("二手转录");'),true);
      });
      await check('switching away and back retains separate language settings',async()=>{
        await exec('document.querySelector("#agent-settings").open=false;const s=document.querySelector(".agent-actor-switch");s.value="amadeus";s.dispatchEvent(new Event("change",{bubbles:true}));');
        await wait('document.querySelector(".agent-stage").dataset.actor==="amadeus"&&!document.querySelector(".agent-actor-switch").disabled');
        assert.equal(await exec('return document.querySelector("#agent-reply-language").value;'),'zh-CN');
        await exec('const s=document.querySelector(".agent-actor-switch");s.value="reze";s.dispatchEvent(new Event("change",{bubbles:true}));');
        await wait('document.querySelector(".agent-stage").dataset.actor==="reze"&&!document.querySelector(".agent-actor-switch").disabled');
        assert.equal(await exec('return document.querySelector("#agent-reply-language").value;'),'en');
      });
      await check('Reze reset restores Reze, and motion can be paused',async()=>{
        await exec('document.querySelector("[data-character=settings]").click();document.querySelector("[data-agent-settings-tab=role]").click();document.querySelector("[data-character=reset]").click();');
        assert.equal(await exec('return document.querySelector(".agent-character-editor [name=name]").value;'),'蕾塞 · Reze');
        await exec('document.querySelector("[data-character=motion]").click();');
        await wait('!document.querySelector("#ai-agent-panel").classList.contains("agent-motion")');
        await exec('document.querySelector("#agent-settings").open=false;');
        await new Promise(r=>setTimeout(r,180));
        const a=await exec('return document.querySelector(".agent-reze-canvas").toDataURL();');
        await new Promise(r=>setTimeout(r,120));
        assert.equal(await exec('return document.querySelector(".agent-reze-canvas").toDataURL();'),a);
        await writeFile(path.join(output,'reze-scene.png'),(await win.webContents.capturePage()).toPNG());
      });
      assert.deepEqual(errors,[]);
      await finish();
    }catch(error){await finish(error);}
  });
});
const appRoot=process.env.MATERIA_REZE_VERIFY_APP||root;
await import(pathToFileURL(path.join(appRoot,'desktop/main.mjs')).href);

