import {app} from 'electron';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
const root=path.resolve(import.meta.dirname,'..');
const output=path.join(root,'.local','voice-reader-verification');
await mkdir(output,{recursive:true});
const isolated=await mkdtemp(path.join(output,'run-'));
process.env.MATERIA_PROFILE_DIR=path.join(isolated,'profile');
process.env.MATERIA_LIBRARY_DIR=path.join(isolated,'library');
process.env.MATERIA_HEADLESS='1';
await mkdir(process.env.MATERIA_PROFILE_DIR,{recursive:true});
await writeFile(path.join(process.env.MATERIA_PROFILE_DIR,'preferences.json'),JSON.stringify({agentVoiceEnabled:false}));
app.setName('MateriaVoiceReaderVerification');
const requests=[];
const mock=http.createServer(async(req,res)=>{
 const chunks=[];for await(const c of req)chunks.push(c);
 const body=JSON.parse(Buffer.concat(chunks));requests.push(body);
 const translating=body.messages[0].content.includes('制作配音稿');
 const lines=translating?JSON.parse(body.messages.at(-1).content).lines:[];
 const content=translating?JSON.stringify(lines.map(()=> 'ここにいるよ。')):
 JSON.stringify({segments:[{text:'我在这里。',speech:'ここにいるよ。'}]});
 res.end(JSON.stringify({choices:[{message:{content},finish_reason:'stop'}]}));
});
await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
const baseUrl='http://127.0.0.1:'+mock.address().port+'/v1';
let win,finished=false;
const exec=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
async function until(code,label,ms=100000){
 const end=Date.now()+ms;
 while(Date.now()<end){if(await exec(code))return;await new Promise(r=>setTimeout(r,200));}
 const state=await exec('return {reader:document.querySelector(".agent-reader-status")?.textContent,status:document.querySelector("#agent-status")?.textContent,dialog:document.querySelector("#agent-reader")?.open};');
 throw Error('Timed out '+label+' '+JSON.stringify(state));
}
async function finish(error){
 if(finished)return;finished=true;clearTimeout(deadline);
 if(error){console.error(error.stack);await writeFile(path.join(output,'failure.json'),JSON.stringify({error:error.stack,isolated,requests:requests.length},null,2));}
 mock.closeAllConnections();mock.close();
 app.exit(error?1:0);
}
const deadline=setTimeout(()=>finish(Error('Verification deadline')),220000);
app.on('browser-window-created',(_e,window)=>{
 win=window;
 window.webContents.setBackgroundThrottling(false);
 window.webContents.once('did-finish-load',async()=>{
  try{
   await until('return !!document.querySelector(".import-main:not([disabled])")','ready');
   await exec('await materiaDesktop.agentSaveConfig('+JSON.stringify({baseUrl,model:'mock',protocol:'chat'})+');await materiaDesktop.agentVoiceSetLanguage("ja");');
   await exec(`globalThis.audioPlays=0;HTMLMediaElement.prototype.play=function(){audioPlays++;queueMicrotask(()=>{this.dispatchEvent(new Event('playing'));setTimeout(()=>this.dispatchEvent(new Event('ended')),60);});return Promise.resolve();};document.querySelector('.workspace-ribbon [data-action="ai-agent"]').click();`);
   await until('return !document.querySelector("#ai-agent-panel").hidden','panel');
   await until('return !document.querySelector("[data-character=voice]").disabled','voice profile');
   await exec(`document.querySelector('#agent-settings').open=false;document.querySelector('[data-character="tools"]').click();document.querySelector('[data-agent-action="reader"]').click();document.querySelector('#agent-reader textarea').value='我在这里。';document.querySelector('#agent-reader select').value='ja';document.querySelector('#agent-reader form').requestSubmit();`);
   await until('return document.querySelector(".agent-reader-status").textContent.includes("朗读完成")','reader');
   assert.equal(requests.filter(b=>b.messages[0].content.includes('制作配音稿')).length,1);
   assert.equal(await exec('return document.querySelector(".agent-reader-translation p").firstChild.textContent;'),'ここにいるよ。');
   assert.equal((await readdir(path.join(process.env.MATERIA_LIBRARY_DIR,'.agent-voice'))).filter(n=>n.endsWith('.wav')).length,1);
   await new Promise(resolve=>setTimeout(resolve,250));
   await writeFile(path.join(output,'reader.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
   const saved=JSON.parse(await exec('return localStorage.getItem("materia.reader-history");'));
   assert.equal(saved.length,1);
   const plays=await exec('return audioPlays;');
   await exec('document.querySelector(".agent-reader-clips button").click();');
   await until('return audioPlays>'+plays,'replay');
   assert.equal(requests.length,1);
   await exec('document.querySelector("[data-reader-close]").click();await materiaDesktop.agentVoiceSetEnabled(true);document.querySelector("[data-character=voice]").click();');
   // Reload status after direct preference change by closing and reopening the assistant.
   await exec('document.querySelector("[data-agent-action=close]").click();document.querySelector(".workspace-ribbon [data-action=ai-agent]").click();');
   await until('return !document.querySelector("#agent-send").disabled','send');
   await exec('document.querySelector("#agent-settings").open=false;document.querySelector("#agent-question").value="你好";document.querySelector("#agent-question-form").requestSubmit();');
   await until(`const x=await materiaDesktop.agentGetHistory();return x.state.conversations.some(c=>c.entries.some(e=>e.voiceClips?.length));`,'archived conversation');
   const state=await exec('return await materiaDesktop.agentGetHistory();');
   const entry=state.state.conversations.flatMap(c=>c.entries).find(e=>e.voiceClips?.length);
   const wav=await exec('return await materiaDesktop.agentVoiceRead('+JSON.stringify({libraryKey:state.libraryKey,id:entry.voiceClips[0].id})+');');
   assert.ok(wav.startsWith('UklGR'));
   await exec('document.querySelector("[data-character=log]").click();');
   await until('return !!document.querySelector("#agent-log .agent-replay-button")','record controls');
   assert.equal(await exec('return document.querySelector("#agent-log .agent-replay-button").textContent;'),'▶');
   assert.equal(await exec('return document.querySelector("#agent-log").textContent.includes("逐句重读");'),false);
   assert.equal(await exec('return document.querySelector("#agent-reader").open;'),false);
   assert.equal(await exec('return document.querySelector("#agent-log").hidden;'),false);
   await exec('return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));');
   await writeFile(path.join(output,'record.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
   const beforeRequests=requests.length,beforePlays=await exec('return audioPlays;');
   await exec('document.querySelector("#agent-log .agent-replay-button").click();');
   await until('return audioPlays>'+beforePlays,'record replay');
   assert.equal(requests.length,beforeRequests);
   await exec('document.querySelector("[data-agent-action=close-log]").click();document.querySelector("[data-character=tools]").click();document.querySelector("[data-agent-action=reader]").click();');
   assert.ok(await exec('return document.querySelectorAll(".agent-reader-clips button").length>0;'));
   await exec(`const snapshot=await materiaDesktop.agentGetHistory();
     const chat=snapshot.state.conversations.find(c=>c.id===snapshot.state.activeId);
     const fence=String.fromCharCode(96).repeat(3);
     chat.entries.push({role:'assistant',content:'**第一句。** 第二句。\\n\\n- 外层一句。\\n  - 内层一句。\\n\\n'+fence+'js\\nconst value = 1;\\n'+fence});
     await materiaDesktop.agentSaveHistory(snapshot);`);
   const reload=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
   win.webContents.reload();
   await reload;
   await until('return !!document.querySelector(".import-main:not([disabled])")','reloaded app');
   await exec('document.querySelector(".workspace-ribbon [data-action=ai-agent]").click();');
   await until('return !document.querySelector("[data-character=voice]").disabled','reloaded voice');
   await exec('document.querySelector("#agent-settings").open=false;document.querySelector("[data-character=log]").click();');
   await until('return !!document.querySelector("#agent-log .agent-replay-button")','restored voice references');
   assert.equal(await exec('return document.querySelector("#agent-log .agent-assistant:last-child").querySelectorAll(".agent-replay-button").length;'),4);
   assert.equal(await exec('return document.querySelector("#agent-log .agent-assistant:last-child pre").querySelectorAll("button").length;'),0);
   assert.ok(await exec('return document.querySelector("#agent-log .agent-assistant:last-child strong").textContent.includes("第一句");'));
   assert.equal((await exec('return await materiaDesktop.agentGetHistory();')).state.conversations.flatMap(c=>c.entries).find(e=>e.voiceClips?.length).voiceClips[0].id,entry.voiceClips[0].id);
   await exec('document.querySelector("[data-agent-action=close-log]").click();document.querySelector("[data-character=tools]").click();document.querySelector("[data-agent-action=reader]").click();');
   assert.ok(await exec('return document.querySelectorAll(".agent-reader-clips button").length>0;'));
   await writeFile(path.join(output,'report.json'),JSON.stringify({passed:true,isolated,providerRequests:requests.length,voiceFiles:await readdir(path.join(process.env.MATERIA_LIBRARY_DIR,'.agent-voice')),recordedClips:entry.voiceClips.length},null,2));
   console.log('PASS real desktop reader translation, persistent WAV, record replay, and saved reader clips');
   await finish();
  }catch(error){await finish(error);}
 });
});
await import('../desktop/main.mjs');
