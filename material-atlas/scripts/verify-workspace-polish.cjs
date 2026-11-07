// Isolated fixtures for workspace layout and navigation. Never opens a personal library.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),output=path.join(root,'.local/workspace-polish-verification');
const titles=['铁基非晶粉末的成分与软磁性能','退火工艺对磁芯损耗的影响','FeSiBCr 合金粉末的结构演变','纳米晶形成与磁导率变化','粉末粒径与高频磁性','绝缘包覆与磁芯致密化'];
const papers=Array.from({length:18},(_,i)=>({id:'p'+i,title:titles[i%6]+(i>=6?' · '+(i+1):''),authors:'A. Researcher, B. Author',authorDetails:[{name:'A. Researcher',affiliations:['材料研究所']}],journal:'Synthetic Materials Journal',year:String(2026-i%4),doi:'',filename:'synthetic-'+i+'.pdf',file:{desktop:true,size:1200000},addedAt:Date.now()-i*86400000,tags:['非晶粉末',i%2?'热处理':'软磁性能'],favorite:i%5===0,collection:i<9?'g1':'g2',readingStatus:i%3?'reading':'unread',materials:[{id:'m'+i,name:'FeSiB '+(i+1),composition:'Fe80Si9B11',measurements:[{id:'h'+i,name:'矫顽力',unit:'A/m',value:10+i,sample:'退火态',conditions:'室温'}]}]}));
const notes=Object.fromEntries(papers.slice(0,8).map((p,i)=>['paper:'+p.id,[{id:'n'+i,body:'记录退火温度、粒径与软磁性能之间的关系。\n\n需要核对各组样品的测试频率和磁感应强度，再进行横向比较。',createdAt:Date.now()-i*86400000,updatedAt:Date.now()-i*86400000}]]));
const settings={collections:[{id:'g1',name:'非晶粉末',color:'#548fbd'},{id:'g2',name:'热处理与磁性',color:'#9880aa'}],notes,themePreferences:{selected:'liquid-glass',mode:process.env.MATERIA_DARK?'dark':'light'}};
let page,browser,server;const errors=[],checks=[];
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function shot(name){await page.screenshot({path:path.join(output,name+'.png'),animations:'disabled'});}
const views=['graph','list','materials','notes','figura'];
async function captureAll(prefix){for(const view of views){await page.locator(`[data-view="${view}"]`).click();if(view==='figura')await page.locator('.figura-gallery').waitFor();await shot(prefix+'-'+view);}}
(async()=>{
 await fs.mkdir(output,{recursive:true});const {createPreviewServer}=await import(pathToFileURL(path.join(root,'server.mjs')));server=createPreviewServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,executablePath:process.env.MATERIA_CHROME||path.join(process.env['ProgramFiles(x86)'],'Microsoft/Edge/Application/msedge.exe')});page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 const {schemeCatalog}=await import(pathToFileURL(path.join(root,'desktop/figura/catalog.mjs')));
 const schemes=await schemeCatalog(path.join(root,'dist/figura/schemes'),path.join(output,'no-custom-schemes'));
 await page.exposeFunction('__polishAPI',(method,...args)=>{if(method==='getPapers')return structuredClone(papers);if(method==='getSetting')return structuredClone(settings[args[0]]);if(method==='setSetting'){settings[args[0]]=structuredClone(args[1]);return true;}if(method==='info')return{path:'ISOLATED POLISH LIBRARY'};if(method==='moduleLoad')return{libraryKey:'ISOLATED',state:null};if(method==='figureCall'&&args[0]==='catalog')return schemes;if(method==='canvasReady'||method==='canvasConfirmClose')return true;if(method==='agentGetConfig')return{providers:[],configured:false};throw Error('Unexpected API '+method);});
 await page.addInitScript(()=>{globalThis.materiaDesktop=Object.fromEntries(['getPapers','getSetting','setSetting','info','moduleLoad','figureCall','canvasReady','canvasConfirmClose','agentGetConfig'].map(m=>[m,(...args)=>__polishAPI(m,...args)]));materiaDesktop.onCanvasClose=()=>()=>{};});
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('.import-main:not([disabled])').waitFor({state:'attached'});
 if(process.env.MATERIA_CAPTURE_BASELINE){await captureAll('before');return;}
 await check('original Mac radii and liquid-glass selected surfaces survive all five top-level tabs',async()=>{
  for(const view of views){
   const button=page.locator(`[data-view="${view}"]`);await button.click();await page.waitForTimeout(160);
   const visual=await button.evaluate(el=>{const probe=document.createElement('span');probe.style.background='var(--glass-card)';document.body.append(probe);const expected=getComputedStyle(probe).backgroundColor;probe.remove();const style=getComputedStyle(el);return{radius:style.borderRadius,background:style.backgroundColor,expected,shadow:style.boxShadow,group:getComputedStyle(el.parentElement).borderRadius};});
   assert.equal(visual.radius,'20px');assert.equal(visual.group,'24px');assert.equal(visual.background,visual.expected);assert.ok(visual.shadow.includes('inset'));
  }
  await page.locator('[data-view="list"]').click();
  assert.equal(await page.locator('#ribbon-import').evaluate(el=>getComputedStyle(el).borderRadius),await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--button-radius').trim()));
  assert.ok((await page.locator('#ribbon-import').evaluate(el=>getComputedStyle(el).backgroundImage)).includes('linear-gradient'));
  const button=page.locator('[data-view="list"]');await button.hover();await page.mouse.down();await page.waitForTimeout(110);
  assert.equal(await button.evaluate(el=>el.hasAttribute('data-glass-pressed')),true);assert.ok(await button.evaluate(el=>(parseFloat(getComputedStyle(el).scale)||1)<1));
  await page.mouse.up();await page.waitForTimeout(500);assert.equal(await button.evaluate(el=>parseFloat(getComputedStyle(el).scale)||1),1);await page.mouse.move(20,20);
 });
 await check('all main views render without clipping at desktop size',async()=>{await captureAll('after');assert.equal(await page.locator('.view-tabs').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);});
 await check('quick actions open by button and keyboard and navigate without losing focus',async()=>{
  await page.locator('#workspace-command').click();await shot('after-quick-actions');await page.locator('#workspace-command-input').fill('文献');assert.ok(await page.locator('[data-workspace-command-id]').count()>0);await page.keyboard.press('Escape');assert.equal(await page.locator('#workspace-command').evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Control+k');await page.locator('#workspace-command-input').fill('材料');await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('[data-view="materials"]').getAttribute('aria-selected')==='true');
  await page.keyboard.press('Control+k');await page.locator('#workspace-command-input').fill('退火工艺对磁芯');await page.keyboard.press('Enter');assert.equal(await page.locator('[data-view="list"]').getAttribute('aria-selected'),'true');assert.ok((await page.locator('#detail-panel').textContent()).includes('退火工艺对磁芯'));
 });
 await check('one click clears search and Escape clears only the active search',async()=>{
  await page.locator('#search').fill('不会匹配的字符串');await page.locator('#clear-workspace-search').click();assert.equal(await page.locator('#search').inputValue(),'');assert.equal(await page.locator('#search').evaluate(el=>el===document.activeElement),true);
  await page.locator('#search').fill('退火');await page.keyboard.press('Escape');assert.equal(await page.locator('#search').inputValue(),'');
 });
 await check('view tabs have roving focus and support arrow keys, Home and End',async()=>{
  await page.locator('[data-view="list"]').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('[data-view="materials"]').getAttribute('aria-selected'),'true');
  await page.keyboard.press('End');assert.equal(await page.locator('[data-view="figura"]').getAttribute('aria-selected'),'true');await page.keyboard.press('Home');assert.equal(await page.locator('[data-view="graph"]').getAttribute('aria-selected'),'true');
 });
 await check('last view, sidebar and inspector persist across reload',async()=>{
  await page.locator('[data-view="list"]').click();await page.locator('#toggle-sidebar').click();await page.locator('#workspace-details').click();await page.reload();await page.locator('.import-main:not([disabled])').waitFor({state:'attached'});
  assert.equal(await page.locator('[data-view="list"]').getAttribute('aria-selected'),'true');assert.equal(await page.locator('#sidebar').isVisible(),true);assert.equal(await page.locator('#detail-panel').isVisible(),false);
 });
 await check('layouts stay usable on smaller windows, dark mode and large text',async()=>{
  await page.locator('#toggle-sidebar').click();await page.setViewportSize({width:1000,height:760});await shot('after-compact');assert.ok(await page.locator('#workspace-command').isVisible());
  await page.evaluate(()=>materiaDesktop.setSetting('themePreferences',{selected:'liquid-glass',mode:'dark'}));await page.reload();await page.locator('.import-main:not([disabled])').waitFor({state:'attached'});await shot('after-dark');assert.equal(await page.locator('html').getAttribute('data-theme-mode'),'dark');
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(async()=>{const {setLocale}=await import('./i18n.js');await setLocale('de',{persist:false});});await shot('after-german');
  await page.keyboard.press('Control+k');assert.ok(!(await page.locator('#workspace-command-dialog').textContent()).includes('搜索操作'));await page.keyboard.press('Escape');
  await page.evaluate(async()=>{const {setLocale}=await import('./i18n.js');await setLocale('zh-CN',{persist:false});document.documentElement.style.setProperty('--ui-font-scale','1.25');});await page.setViewportSize({width:1100,height:800});await shot('after-large-text');
 });
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(output,'report.json'),JSON.stringify({checks,errors},null,2));console.log('All '+checks.length+' workspace checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
