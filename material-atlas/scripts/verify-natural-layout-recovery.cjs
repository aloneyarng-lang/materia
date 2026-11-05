const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),out=path.join(root,'.local/natural-layout-recovery'),packaged=process.argv.includes('--packaged');
let browser,page,child,profile,library;const checks=[],errors=[],workers=[];
const wait=(fn,arg,options={})=>page.waitForFunction(fn,arg,{polling:100,...options});
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function capture(name){for(let i=0;i<3;i++)try{await page.screenshot({path:path.join(out,(packaged?'packaged-':'')+name),timeout:15000,animations:'disabled'});return;}catch(error){if(i===2)throw error;}}
async function closeModal(){if(await page.locator('#modal').evaluate(e=>e.open)){await page.locator('#modal [data-action="close-modal"]').last().click();await wait(()=>!document.querySelector('#modal').open);}}
async function themes(){await closeModal();await page.locator('[data-menu-toggle="workspace-menu"]').click();await page.locator('#ribbon-theme').click();}
const positions=()=>page.evaluate(()=>materiaDesktop.getSetting('graphLayout'));
const business=()=>page.evaluate(async()=>({papers:await materiaDesktop.getPapers(),notes:await materiaDesktop.getSetting('notes'),groups:await materiaDesktop.getSetting('collections'),activity:await materiaDesktop.getSetting('importActivity')}));
async function arranged(){await wait(()=>document.querySelector('#star-map').dataset.naturalLayout==='settled'&&document.querySelector('#graph-arrange').getAttribute('aria-busy')==='false',null,{timeout:25000});await page.waitForTimeout(650);}
async function arrangeMenu(action){await page.locator('#graph-arrange').click({button:'right'});await page.locator('#graph-arrange-menu [data-action="'+action+'"]').click();}
async function start(){
  const env={...process.env,MATERIA_HEADLESS:'1',MATERIA_PROFILE_DIR:profile,MATERIA_LIBRARY_DIR:library};delete env.ELECTRON_RUN_AS_NODE;
  await fs.unlink(path.join(profile,'DevToolsActivePort')).catch(e=>{if(e.code!=='ENOENT')throw e;});
  const exe=packaged?(process.env.MATERIA_RELEASE_EXE||path.join(root,'release/v'+require(path.join(root,'package.json')).version+'/Materia-win32-x64/Materia.exe')):path.join(root,'node_modules/electron/dist/electron.exe');
  child=spawn(exe,[...(packaged?[]:[root]),'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--disable-gpu','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows'],{env,windowsHide:true,stdio:'ignore'});
  let port;for(let i=0;i<150;i++){try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break;}catch{}if(child.exitCode!==null)throw Error('Test app exited '+child.exitCode);await new Promise(r=>setTimeout(r,100));}
  assert.ok(port);browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);const context=browser.contexts()[0];page=context.pages()[0]||await context.waitForEvent('page',{timeout:20000});page.on('pageerror',error=>errors.push(error.message));page.on('worker',worker=>workers.push(worker.url()));
  await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:1440,height:940});await wait(()=>document.querySelector('.import-main')?.disabled===false);
  assert.equal(path.resolve((await page.evaluate(()=>materiaDesktop.info())).path),path.resolve(library));
}
async function stop(){await browser?.close();browser=null;if(child?.exitCode===null){const ended=new Promise(r=>child.once('exit',r));child.kill();await ended;}child=null;}
function pdf(text){const content=`BT /F1 18 Tf 72 740 Td (${text}) Tj ET`,objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`];let data='%PDF-1.4\n',offsets=[];objects.forEach((obj,i)=>{offsets.push(data.length);data+=`${i+1} 0 obj\n${obj}\nendobj\n`;});const xref=data.length;return Buffer.from(data+`xref\n0 6\n0000000000 65535 f \n${offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);}
(async()=>{
  await fs.mkdir(out,{recursive:true});const run=await fs.mkdtemp(path.join(out,'run-'));profile=path.join(run,'profile');library=path.join(run,'library');
  const {LocalLibrary}=await import(pathToFileURL(path.join(root,'desktop/library.mjs')).href),{createNetwork}=await import(pathToFileURL(path.join(root,'dist/force-layout.js')).href);const lib=await new LocalLibrary(library).init();
  await lib.setSetting('collections',[{id:'folder-a',name:'磁性合金',color:'#97491e'},{id:'folder-b',name:'界面强化',color:'#6c7e63'},{id:'folder-c',name:'二维材料',color:'#a17b48'}]);
  const labels=['磁性合金','界面强化','二维材料'];
  await lib.putPapers(Array.from({length:46},(_,i)=>({id:i===45?'hidden':'fixture-'+i,title:i===45?'Hidden archived reference':`Verification · ${labels[Math.floor(i/15)]} ${String(i+1).padStart(2,'0')}`,filename:'sample-'+i+'.pdf',authors:'Researcher A',journal:'Materials',year:'2025',tags:i===45?['Hidden']:[labels[Math.floor(i/15)]],collection:'folder-'+String.fromCharCode(97+Math.floor(i/15)%3),fileBytes:pdf('Materials research sample '+i)})));
  await lib.setSetting('notes',{'paper:fixture-0':[{id:'n',body:'Original research note',createdAt:1,updatedAt:1}]});await lib.setSetting('graphAssociations',labels.map(value=>({kind:'tag',value})));
  const graph=createNetwork(lib.getPapers(),[],{},lib.getSetting('graphAssociations')),initial=Object.fromEntries(graph.nodes.map(n=>[n.id,{x:500,y:310,pinned:false}]));
  Object.assign(initial['paper:fixture-0'],{x:180,y:130,pinned:true});Object.assign(initial['paper:fixture-1'],{x:850,y:500,pinned:true});Object.assign(initial['paper:hidden'],{x:-1200,y:800,pinned:true});
  await lib.setSetting('graphLayout',initial);await lib.setSetting('themePreferences',{selected:'steins-gate',mode:'dark'});await lib.setSetting('graphPreferences',{appearance:'theme'});await start();
  await page.locator('#search').fill('Verification');await wait(()=>document.querySelectorAll('.paper-node').length===45);const original=await business();let originalPositions;
  await check('normal click completes through worker and restores controls',async()=>{
    await page.locator('#graph-arrange').click();await arranged();assert.equal(await page.locator('#graph-arrange').isEnabled(),true);
  });
  await check('a second click cancels a running task and permits retry',async()=>{
    await page.evaluate(()=>{window.RealWorker=Worker;window.Worker=class{postMessage(){}terminate(){}};});
    await page.locator('#graph-arrange').click();await wait(()=>document.querySelector('#graph-arrange').getAttribute('aria-busy')==='true');assert.equal(await page.locator('#graph-arrange-status').isVisible(),true);await page.locator('#graph-arrange').click();
    await wait(()=>document.querySelector('#graph-arrange').getAttribute('aria-busy')==='false');assert.equal(await page.locator('#star-map').getAttribute('data-natural-layout'),'cancelled');await page.evaluate(()=>window.Worker=window.RealWorker);
    await page.locator('#graph-arrange').click();await arranged();
  });
  await check('unresponsive workers recover on the main thread and still finish',async()=>{
    await page.evaluate(()=>{window.RealWorker=Worker;window.Worker=class{postMessage(){}terminate(){}};});
    await page.locator('#graph-arrange').click();await arranged();await page.evaluate(()=>window.Worker=window.RealWorker);
  });
  await check('animation errors clear busy state and the next click succeeds',async()=>{
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(async()=>{const {StarMap}=await import('./graph-view.js');const paint=StarMap.prototype.paint;StarMap.prototype.paint=function(){if(this.svg.dataset.naturalLayout==='animating'){StarMap.prototype.paint=paint;throw Error('Synthetic layout paint failure');}return paint.call(this);};});
    await page.locator('#graph-arrange').click();await wait(()=>document.querySelector('#star-map').dataset.naturalLayout==='error');await wait(()=>document.querySelector('#graph-arrange').getAttribute('aria-busy')==='false');
    await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#graph-arrange').click();await arranged();
  });
  await check('final display errors also restore the button before retry',async()=>{
    await page.evaluate(async()=>{const {StarMap}=await import('./graph-view.js');const highlight=StarMap.prototype.highlightNode;StarMap.prototype.highlightNode=function(key){if(key===''&&this.svg.dataset.naturalLayout==='calculating'){StarMap.prototype.highlightNode=highlight;throw Error('Synthetic completion failure');}return highlight.call(this,key);};});
    await page.locator('#graph-arrange').click();await wait(()=>document.querySelector('#star-map').dataset.naturalLayout==='error');await wait(()=>document.querySelector('#graph-arrange').getAttribute('aria-busy')==='false');
    await page.locator('#graph-arrange').click();await arranged();
  });
  assert.deepEqual(await business(),original);assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'recovery-report.json'),JSON.stringify({checks,errors,packaged,isolatedLibrary:true},null,2));
})().catch(async error=>{console.error(error);process.exitCode=1;await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,(packaged?'packaged-':'')+'failure.txt'),error.stack);await page?.screenshot({path:path.join(out,(packaged?'packaged-':'')+'failure.png'),timeout:10000,animations:'disabled'}).catch(()=>{});}).finally(stop);
