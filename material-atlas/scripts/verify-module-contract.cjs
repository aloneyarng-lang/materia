// Serves a test-only module without editing the production module registry or personal data.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),settings={};let browser,page,server,includeFixture=true;const errors=[];
const fixture=`export const fixture={id:'fixture',label:'测试功能',title:'测试功能',icon:'chart',panelId:'fixture-panel',styles:[new URL('./fixture.css',import.meta.url).href],async create(context){
 let state=(await context.services.load()).state||{value:0},queue=Promise.resolve();globalThis.fixtureMounts=(globalThis.fixtureMounts||0)+1;
 context.on(document,'fixture-signal',()=>globalThis.fixtureEvents=(globalThis.fixtureEvents||0)+1);
 context.on(context.host,'click',()=>{state.value++;queue=queue.then(async()=>{const current=await context.services.load();await context.services.save({libraryKey:current.libraryKey,state});});render();});
 function render(){context.host.innerHTML='<button id="fixture-increment">'+state.value+'</button>';context.setCount('fixture');}
 return{render,flush:()=>queue,reset(){state={value:0};},dispose(){globalThis.fixtureDisposals=(globalThis.fixtureDisposals||0)+1;}};
}};`;
(async()=>{
 server=http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);if(pathname==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(fixture);return;}if(pathname==='/fixture.css'){res.setHeader('Content-Type','text/css');res.end('#fixture-panel{padding:24px}');return;}
  const target=path.resolve(root,'dist','.'+(pathname==='/'?'/index.html':pathname));if(!target.startsWith(path.join(root,'dist')+path.sep))throw Error('path');let content=await fs.readFile(target);
  if(pathname==='/modules/index.js'&&includeFixture)content=Buffer.from(content.toString()+"\nimport {fixture} from '/fixture.js';WORKSPACE_MODULES.push(fixture);\n");
  res.setHeader('Content-Type',/\.(?:mjs|js)$/.test(target)?'text/javascript':/\.css$/.test(target)?'text/css':/\.html$/.test(target)?'text/html':'application/octet-stream');res.end(content);
 }catch{res.statusCode=404;res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,executablePath:process.env.MATERIA_CHROME||path.join(process.env['ProgramFiles(x86)'],'Microsoft/Edge/Application/msedge.exe')});page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.exposeFunction('__moduleAPI',(name,...args)=>{if(name==='getPapers')return[];if(name==='getSetting')return structuredClone(settings[args[0]]);if(name==='setSetting'){settings[args[0]]=structuredClone(args[1]);return true;}if(name==='info')return{path:'ISOLATED MODULE CONTRACT'};if(name==='canvasReady')return true;throw Error(name);});
 await page.addInitScript(()=>{globalThis.materiaDesktop=Object.fromEntries(['getPapers','getSetting','setSetting','info','canvasReady'].map(name=>[name,(...args)=>__moduleAPI(name,...args)]));});
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('.import-main:not([disabled])').waitFor({state:'attached'});
 assert.equal(await page.locator('[data-view="fixture"]').count(),1);assert.equal(await page.evaluate(()=>globalThis.fixtureMounts||0),0);
 await page.locator('[data-view="fixture"]').click();await page.locator('#fixture-increment').click();assert.equal(await page.locator('#fixture-increment').textContent(),'1');
 await page.keyboard.press('Control+k');await page.locator('#workspace-command-input').fill('功能管理');await page.keyboard.press('Enter');await page.locator('[data-workspace-module="fixture"]').uncheck();await page.waitForFunction(()=>!document.querySelector('[data-view="fixture"]'));
 assert.equal(settings['module:fixture'].value,1);assert.equal(await page.evaluate(()=>globalThis.fixtureDisposals),1);
 await page.evaluate(()=>document.dispatchEvent(new Event('fixture-signal')));assert.equal(await page.evaluate(()=>globalThis.fixtureEvents||0),0);assert.equal(await page.locator('link[href$="fixture.css"]').count(),0);
 await page.locator('[data-workspace-module="fixture"]').check();await page.locator('#modal [data-action="close-modal"]').last().click();await page.locator('[data-view="fixture"]').click();assert.equal(await page.locator('#fixture-increment').textContent(),'1');assert.equal(await page.evaluate(()=>globalThis.fixtureMounts),2);
 await page.evaluate(()=>document.dispatchEvent(new Event('fixture-signal')));assert.equal(await page.evaluate(()=>globalThis.fixtureEvents),1);
 includeFixture=false;await page.reload();await page.locator('.import-main:not([disabled])').waitFor({state:'attached'});assert.equal(await page.locator('[data-view="fixture"]').count(),0);assert.equal(await page.locator('[data-view="graph"]').getAttribute('aria-selected'),'true');assert.equal(settings['module:fixture'].value,1);assert.deepEqual(errors,[]);
 console.log('PASS new module registers navigation, shortcut and panel without changing app.js');console.log('PASS disable flushes storage, removes styles and listeners; re-enable restores data');console.log('PASS removing its registry entry leaves the core workspace usable and data retained');
})().catch(e=>{console.error(e);console.error(errors);process.exitCode=1;}).finally(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
