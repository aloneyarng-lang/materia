// Exercise the real Electron entry/preload with isolated data and a local synthetic provider.
import {app} from 'electron';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {LocalLibrary} from '../desktop/library.mjs';
const root=path.resolve(import.meta.dirname,'..');
const output=path.join(root,'.local/ganyu-integration/desktop-check');
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
      await check('switch to Ganyu loads original Workshop scene and own card',async()=>{
        await exec('const s=document.querySelector(".agent-actor-switch");s.value="ganyu";s.dispatchEvent(new Event("change",{bubbles:true}));');
        await wait('document.querySelector(".agent-stage").dataset.actor==="ganyu"&&!document.querySelector(".agent-actor-switch").disabled');
        await wait('document.querySelector(".agent-stage").classList.contains("agent-ganyu-scene-ready")');
        assert.equal(await exec('return document.querySelector(".agent-header h2").textContent.includes("甘雨");'),true);
        assert.equal(await exec('return document.querySelector(".agent-portrait").src.includes("/actors/ganyu/poster.jpg");'),true);
        assert.equal(await exec('return document.querySelector(".agent-effect-canvas").hidden;'),true);
        assert.equal(await exec('return document.querySelector("[data-character=autoplay]").disabled;'),false);
        assert.equal(await exec('return (await materiaDesktop.agentVoiceStatus("genshin-ganyu")).available;'),true);
      });
      await check('reply language persists for Ganyu and does not change Kurisu',async()=>{
        await exec('document.querySelector("[data-character=settings]").click();document.querySelector("[data-agent-settings-tab=language]").click();const s=document.querySelector("#agent-reply-language");s.value="en";s.dispatchEvent(new Event("change",{bubbles:true}));');
        await wait('document.querySelector("#agent-status").textContent.includes("回复语言已保存")');
        await exec('document.querySelector("#agent-settings").open=false;document.querySelector("#agent-question").value="Can you hear the heartbeat of the world in the grass?";document.querySelector("#agent-question-form").requestSubmit();');
        await wait('document.querySelector("#agent-status").textContent.includes("回答完成")');
        assert.match(requests.at(-1).messages[0].content,/甘雨的对话习惯/);
        assert.match(requests.at(-1).messages[0].content,/使用 English/);
        assert.match(requests.at(-1).messages[0].content,/ganyu-game-/);
        const saved=await exec('return (await materiaDesktop.agentGetHistory()).state;');
        assert.equal(saved.characterMemory.roles['genshin-ganyu'].replyLanguage,'en');
        assert.equal(saved.characterMemory.roles['genshin-ganyu'].episodes.length,1);
        assert.equal(saved.characterMemory.roles['makise-kurisu'],undefined);
        const dir=path.join(isolated,'记忆库/relationship/genshin-ganyu');
        const names=await import('node:fs/promises').then(m=>m.readdir(dir));
        const index=JSON.parse(await readFile(path.join(dir,names[0]),'utf8'));
        assert.equal(index.characterId,'genshin-ganyu');assert.equal(index.episodes.length,1);
      });
      await check('memory page loads Ganyu corpus with provenance labels',async()=>{
        await exec('document.querySelector("[data-character=settings]").click();document.querySelector("[data-agent-settings-tab=memory]").click();document.querySelector("#agent-corpus-query").value="heartbeat";document.querySelector("#agent-corpus-form").requestSubmit();');
        await wait('document.querySelector("#agent-corpus-status").textContent.includes("405")');
        assert.equal(await exec('return document.querySelectorAll("#agent-corpus-results li").length>0;'),true);
        assert.equal(await exec('return [...document.querySelectorAll("#agent-memory-page a")].some(a=>a.href.startsWith("https://"));'),true);
        assert.equal(await exec('return document.querySelector("#agent-corpus-results").textContent.includes("游戏原文");'),true);
      });
      await check('switching away and back retains separate language settings',async()=>{
        await exec('document.querySelector("#agent-settings").open=false;const s=document.querySelector(".agent-actor-switch");s.value="amadeus";s.dispatchEvent(new Event("change",{bubbles:true}));');
        await wait('document.querySelector(".agent-stage").dataset.actor==="amadeus"&&!document.querySelector(".agent-actor-switch").disabled');
        assert.equal(await exec('return document.querySelector("#agent-reply-language").value;'),'zh-CN');
        await exec('const s=document.querySelector(".agent-actor-switch");s.value="ganyu";s.dispatchEvent(new Event("change",{bubbles:true}));');
        await wait('document.querySelector(".agent-stage").dataset.actor==="ganyu"&&!document.querySelector(".agent-actor-switch").disabled');
        assert.equal(await exec('return document.querySelector("#agent-reply-language").value;'),'en');
      });
      await check('Ganyu reset restores Ganyu, and motion can be paused',async()=>{
        await exec('document.querySelector("[data-character=settings]").click();document.querySelector("[data-agent-settings-tab=role]").click();document.querySelector("[data-character=reset]").click();');
        assert.equal(await exec('return document.querySelector(".agent-character-editor [name=name]").value;'),'甘雨 · Ganyu');
        await exec('document.querySelector("[data-character=motion]").click();');
        await wait('!document.querySelector("#ai-agent-panel").classList.contains("agent-motion")');
        await exec('document.querySelector("#agent-settings").open=false;');
        await new Promise(r=>setTimeout(r,180));
        const a=await exec('return document.querySelector(".agent-ganyu-canvas").toDataURL();');
        await new Promise(r=>setTimeout(r,120));
        assert.equal(await exec('return document.querySelector("#ai-agent-panel").classList.contains("agent-motion");'),false);
        await writeFile(path.join(output,'reze-scene.png'),(await win.webContents.capturePage()).toPNG());
      });
      await check('nine controls keep Flow, open memory, and hide/restore dialogue by Escape or click',async()=>{
        assert.deepEqual(await exec('return [...document.querySelectorAll(".agent-character-tools button")].map(b=>b.dataset.character);'),
          ['export-chat','history','voice','log','autoplay','flow','hide','memory','settings']);
        const cells=await exec('return [...document.querySelectorAll(".agent-character-tools button")].map(b=>{const r=b.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width)};});');
        assert.ok(cells.every(c=>c.w>0));
        assert.equal(new Set(cells.map(c=>c.y)).size,3);
        assert.equal(new Set(cells.map(c=>c.x)).size,3);
        assert.equal(new Set(cells.map(c=>c.w)).size,1);
        await exec('document.querySelector("[data-character=memory]").click();');
        assert.equal(await exec('return document.querySelector("#agent-settings").open&&!document.querySelector("#agent-memory-page").hidden;'),true);
        await exec('document.querySelector("#agent-settings").open=false;document.querySelector("[data-character=hide]").click();');
        assert.equal(await exec('return getComputedStyle(document.querySelector(".agent-dialogue")).visibility;'),'hidden');
        await exec('document.querySelector("#ai-agent-panel").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));');
        assert.equal(await exec('return !document.querySelector("#ai-agent-panel").hidden&&getComputedStyle(document.querySelector(".agent-dialogue")).visibility!=="hidden";'),true);
        await exec('document.querySelector("[data-character=hide]").click();document.querySelector(".agent-stage").click();');
        assert.equal(await exec('return getComputedStyle(document.querySelector(".agent-character-tools")).visibility;'),'visible');
      });
      await check('memory library browses pages, edits canon, removes/restores and persists relationship notes',async()=>{
        await exec('document.querySelector("[data-character=memory]").click();document.querySelector("[data-memory-tab=canon]").click();document.querySelector("[data-memory-clear]").click();');
        await wait('document.querySelectorAll("#agent-corpus-results .memory-card").length===20');
        await exec('document.querySelector("[data-memory-next]").click();');
        await wait('document.querySelector("[data-memory-page]").textContent.startsWith("2 /")');
        await exec('document.querySelector("[data-memory-clear]").click();');
        await wait('document.querySelector("[data-memory-page]").textContent.startsWith("1 /")&&document.querySelectorAll(".memory-editor textarea").length===3');
        await exec('const fields=[...document.querySelectorAll(".memory-editor textarea")];fields[0].value="只在甘雨个人修订中的星砂咖啡 GY-MEM-27。";fields[1].value="Ganyu personal correction GY-MEM-27.";fields[2].value="甘雨の個人修正 GY-MEM-27。";document.querySelector(".memory-editor").requestSubmit();');
        await wait('document.querySelector("#agent-corpus-status").textContent.includes("已保存")');
        const corrected=await exec('return await materiaDesktop.agentCharacterCorpus({characterId:"genshin-ganyu",query:"GY-MEM-27",locale:"en"});');
        assert.ok(corrected.matches.some(r=>r.userEdited&&r.translation==="personal"));
        await exec('document.querySelector("#agent-corpus-query").value="GY-MEM-27";document.querySelector("#agent-corpus-form").requestSubmit();');
        await wait('document.querySelectorAll("#agent-corpus-results .memory-card").length===1');
        await exec('[...document.querySelectorAll(".memory-editor-actions button")].find(b=>b.textContent==="移除记忆").click();');
        await wait('document.querySelector("#agent-corpus-status").textContent.includes("已移除，不再")');
        await exec('const s=document.querySelector("[data-memory-trash]");s.checked=true;s.dispatchEvent(new Event("change",{bubbles:true}));');
        await wait('document.querySelectorAll("#agent-corpus-results .memory-card").length===1');
        await exec('[...document.querySelectorAll(".memory-editor-actions button")].find(b=>b.textContent==="恢复记忆").click();');
        await wait('document.querySelector("#agent-corpus-status").textContent.includes("已恢复")');
        const restored=await exec('return await materiaDesktop.agentCharacterCorpus({characterId:"genshin-ganyu",query:"GY-MEM-27",locale:"en"});');
        assert.ok(restored.matches.every(r=>!r.userEdited&&!r.lines.some(l=>l.text.includes("GY-MEM-27"))));
        await exec('document.querySelector("[data-memory-tab=relationship]").click();document.querySelector("[data-memory-trash]").checked=false;document.querySelector("[data-memory-clear]").click();');
        await wait('!document.querySelector("[data-memory-add]").hidden');
        await exec('document.querySelector("[data-memory-add]").click();document.querySelector(".memory-editor textarea").value="星砂咖啡不加糖。";document.querySelector(".memory-editor").requestSubmit();');
        await wait('document.querySelector("#agent-corpus-status").textContent.includes("已添加")&&!document.querySelector(".memory-editor button[type=submit]").disabled');
        let saved=await exec('return (await materiaDesktop.agentGetHistory()).state;');
        assert.ok(saved.characterMemory.roles["genshin-ganyu"].notes.some(n=>n.text==="星砂咖啡不加糖。"));
        await exec('document.querySelector(".memory-editor textarea").value="星砂咖啡改成半糖。";document.querySelector(".memory-editor").requestSubmit();');
        await wait('document.querySelector("#agent-corpus-status").textContent.includes("已保存")');
        saved=await exec('return (await materiaDesktop.agentGetHistory()).state;');
        assert.ok(saved.characterMemory.roles["genshin-ganyu"].notes.some(n=>n.text==="星砂咖啡改成半糖。"));
        await exec('document.querySelector("[data-memory-tab=canon]").click();document.querySelector("[data-memory-clear]").click();');
        await wait('document.querySelectorAll("#agent-corpus-results .memory-card").length===20');
        await exec('document.querySelector("#agent-settings").open=true;');
        const bounds=await exec('const m=document.querySelector("#agent-settings").getBoundingClientRect(),f=document.querySelector(".memory-library-footer").getBoundingClientRect();return {modalBottom:m.bottom,footerBottom:f.bottom};');
        assert.ok(bounds.footerBottom<=bounds.modalBottom,JSON.stringify(bounds));
        win.setContentSize(1180,850);await new Promise(r=>setTimeout(r,350));
        await writeFile(path.join(output,'memory-library-desktop.png'),(await win.webContents.capturePage()).toPNG());
        win.setMinimumSize(480,600);win.setContentSize(640,900);await new Promise(r=>setTimeout(r,180));
        assert.equal(await exec('return document.querySelector("#agent-memory-page").scrollWidth<=document.querySelector("#agent-memory-page").clientWidth+2;'),true);
        await writeFile(path.join(output,'memory-library-mobile.png'),(await win.webContents.capturePage()).toPNG());
      });
      assert.deepEqual(errors,[]);
      await finish();
    }catch(error){await finish(error);}
  });
});
const appRoot=process.env.MATERIA_REZE_VERIFY_APP||root;
await import(pathToFileURL(path.join(appRoot,'desktop/main.mjs')).href);

