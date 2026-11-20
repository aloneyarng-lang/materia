// Isolated fixtures for workspace layout and navigation. Never opens a personal library.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),output=path.join(root,'.local/workspace-polish-verification');
const titles=['铁基非晶粉末的成分与软磁性能','退火工艺对磁芯损耗的影响','FeSiBCr 合金粉末的结构演变','纳米晶形成与磁导率变化','粉末粒径与高频磁性','绝缘包覆与磁芯致密化'];
const papers=Array.from({length:18},(_,i)=>({id:'p'+i,title:titles[i%6]+(i>=6?' · '+(i+1):''),authors:'A. Researcher, B. Author',authorDetails:[{name:'A. Researcher',affiliations:['材料研究所']}],journal:'Synthetic Materials Journal',year:String(2026-i%4),doi:'',filename:'synthetic-'+i+'.pdf',file:{desktop:true,size:1200000},addedAt:Date.now()-i*86400000,tags:['非晶粉末',i%2?'热处理':'软磁性能'],favorite:i%5===0,collection:i<9?'g1':'g2',readingStatus:i%3?'reading':'unread',materials:[{id:'m'+i,name:'FeSiB '+(i+1),composition:'Fe80Si9B11',measurements:[{id:'h'+i,name:'矫顽力',unit:'A/m',value:10+i,sample:'退火态',conditions:'室温'}]}]}));
const notes=Object.fromEntries(papers.slice(0,8).map((p,i)=>['paper:'+p.id,[{id:'n'+i,body:'记录退火温度、粒径与软磁性能之间的关系。\n\n需要核对各组样品的测试频率和磁感应强度，再进行横向比较。',createdAt:Date.now()-i*86400000,updatedAt:Date.now()-i*86400000}]]));
const settings={collections:[{id:'g1',name:'非晶粉末',color:'#548fbd'},{id:'g2',name:'热处理与磁性',color:'#9880aa'}],notes,themePreferences:{selected:'liquid-glass',mode:process.env.MATERIA_DARK?'dark':'light'}};
papers[0].innovations=['提出新的界面设计。'];
papers[1].innovations=['开发分段烧结工艺。'];
papers[2].innovations=['测量原位变化。'];
papers[0].limitations=['未测量低温下的界面稳定性。'];
papers[2].limitations=['样品的成分范围有限。'];
papers[3].innovations=Array.from({length:20},(_,index)=>'界面结构创新 '+(index+1));
let page,browser,server;const errors=[],checks=[],savedExports=[];
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function shot(name){await page.screenshot({path:path.join(output,name+'.png'),animations:'disabled'});}
const views=['graph','list','materials','notes','figura'];
async function captureAll(prefix){for(const view of views){await page.locator(`[data-view="${view}"]`).click();if(view==='figura')await page.locator('.figura-gallery').waitFor();await shot(prefix+'-'+view);}}
(async()=>{
 await fs.mkdir(output,{recursive:true});const {createPreviewServer}=await import(pathToFileURL(path.join(root,'server.mjs')));server=createPreviewServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,executablePath:process.env.MATERIA_CHROME||path.join(process.env['ProgramFiles(x86)'],'Microsoft/Edge/Application/msedge.exe')});page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 const {schemeCatalog}=await import(pathToFileURL(path.join(root,'desktop/figura/catalog.mjs')));
 const schemes=await schemeCatalog(path.join(root,'dist/figura/schemes'),path.join(output,'no-custom-schemes'));
 await page.exposeFunction('__polishAPI',(method,...args)=>{if(method==='saveText'){savedExports.push(args[0]);return{canceled:false};}if(method==='getPapers')return structuredClone(papers);if(method==='notesVaultList')return {notes:[{id:'示例笔记.md',body:'# 材料研究\n\n## 实验记录\n\n整理文献、实验条件与性能结果。',revision:'sample',updatedAt:Date.now()}],skipped:0};if(method==='getSetting')return structuredClone(settings[args[0]]);if(method==='setSetting'){settings[args[0]]=structuredClone(args[1]);return true;}if(method==='info')return{path:'ISOLATED POLISH LIBRARY'};if(method==='moduleLoad')return{libraryKey:'ISOLATED',state:null};if(method==='figureCall'&&args[0]==='catalog')return schemes;if(method==='canvasReady'||method==='canvasConfirmClose')return true;if(method==='agentGetConfig')return{providers:[],configured:false};throw Error('Unexpected API '+method);});
 await page.addInitScript(()=>{globalThis.materiaDesktop=Object.fromEntries(['saveText','getPapers','getSetting','setSetting','info','moduleLoad','figureCall','canvasReady','canvasConfirmClose','agentGetConfig','notesVaultList'].map(m=>[m,(...args)=>__polishAPI(m,...args)]));materiaDesktop.onCanvasClose=()=>()=>{};});
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('.import-main:not([disabled])').waitFor({state:'attached'});
 if(process.env.MATERIA_CAPTURE_BASELINE){await captureAll('before');return;}
 await check('original Mac radii and liquid-glass selected surfaces survive both top-level tabs',async()=>{
  for(const view of ['graph','list']){
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
 await check('workspace ribbon groups research pages and exposes comparison under drawing',async()=>{
  const ribbon=page.locator('.workspace-ribbon');
  const buttons=await ribbon.locator('button.ribbon-button').evaluateAll(nodes=>nodes.map(node=>node.dataset.view||node.dataset.action||node.dataset.menuToggle));
  assert.deepEqual(buttons,['toggle-sidebar','materials','notes','research','figura','research-canvas','ai-agent','vocabulary','beta','workspace-menu']);
  assert.deepEqual(await page.locator('.view-tabs [data-view]').evaluateAll(nodes=>nodes.map(node=>node.dataset.view)),['graph','list']);
  assert.equal(await ribbon.locator('[data-comparison-action]').count(),0);
  for(const view of ['materials','notes','research','figura']){
   const button=ribbon.locator(`[data-view="${view}"]`);await button.click();
   assert.equal(await button.getAttribute('aria-current'),'page');
   await page.locator('#'+await button.getAttribute('aria-controls')).waitFor();
  }
  const compare=page.locator('#figura-workspace [data-comparison-action="open"]');
  await compare.click();await page.locator('#modal[open] [data-comparison-action="find-parameter"]').waitFor();
  await page.keyboard.press('Escape');await compare.waitFor();
  await page.keyboard.press('Control+3');assert.equal(await ribbon.locator('[data-view="materials"]').getAttribute('aria-current'),'page');
 });
 await check('research opens study and a direction-filtered timeline for selected papers',async()=>{
  await page.locator('.workspace-ribbon [data-view="research"]').click();
  const navigation=page.locator('.research-navigation');
  assert.deepEqual(await navigation.locator('button').allTextContents(),['研读','创新点时间线','局限性时间线','创新点与局限性时间线']);
  await navigation.getByText('研读',{exact:true}).click();
  await page.locator('#literature-workbench').getByRole('status').waitFor();
  await page.locator('[data-view="list"]').click();
  await page.locator('[data-select="p0"]').click({modifiers:['Shift']});
  await page.locator('[data-select="p1"]').click({modifiers:['Shift']});
  await page.locator('#selection-innovation-timeline').click();
  const timeline=page.locator('#innovation-timeline');
  await timeline.locator('.timeline-point').first().waitFor();
  assert.deepEqual(await timeline.locator('h2').allTextContents(),['2025','2026']);
  assert.deepEqual(await timeline.locator('.timeline-point').allTextContents(),[papers[1].innovations[0],papers[0].innovations[0]]);
  await timeline.getByRole('button',{name:'自动归类'}).click();
  await timeline.getByRole('button',{name:'制备与工艺 1'}).click();
  assert.deepEqual(await timeline.locator('.timeline-point').allTextContents(),[papers[1].innovations[0]]);
  const direction=timeline.locator('[data-timeline-direction]');
  await direction.fill('热处理');
  await direction.press('Tab');
  await timeline.getByRole('button',{name:'热处理 1'}).waitFor();
  await page.reload();
  await navigation.getByText('创新点时间线',{exact:true}).click();
  await timeline.getByRole('button',{name:'热处理 1'}).click();
  await timeline.getByRole('button',{name:papers[1].title,exact:true}).click();
  assert.ok((await page.locator('#detail-panel').textContent()).includes(papers[1].title));
  await page.locator('.workspace-ribbon [data-view="research"]').click();
  await navigation.getByRole('button',{name:'局限性时间线',exact:true}).click();
  const limitations=page.locator('#limitation-timeline');
  await limitations.locator('.timeline-point').first().waitFor();
  assert.deepEqual(await limitations.locator('.timeline-point').allTextContents(),papers[0].limitations);
  const limitationDirection=limitations.locator('[data-timeline-direction]');
  await limitationDirection.fill('实验范围');
  await limitationDirection.press('Tab');
  await limitations.getByRole('button',{name:'实验范围 1'}).waitFor();
  await navigation.getByRole('button',{name:'创新点与局限性时间线',exact:true}).click();
  const combined=page.locator('#combined-timeline');
  await combined.getByRole('button',{name:'热处理 1'}).waitFor();
  await combined.getByRole('button',{name:'实验范围 1'}).click();
  for (const [view, name, expected, excluded] of [
   ['innovation-timeline','创新点时间线',papers[1].innovations[0],papers[2].innovations[0]],
   ['limitation-timeline','局限性时间线',papers[0].limitations[0],papers[2].limitations[0]],
   ['combined-timeline','创新点与局限性时间线',papers[0].limitations[0],papers[1].innovations[0]],
  ]) {
   await navigation.locator(`[data-view="${view}"]`).click();
   const expectedCount=savedExports.length+1;
   await page.locator('#'+view).getByRole('button',{name:'导出 Markdown'}).click();
   for(let wait=0;savedExports.length<expectedCount&&wait<20;wait++)await new Promise(resolve=>setTimeout(resolve,50));
   assert.equal(savedExports.length,expectedCount);
   const {filename,content,type}=savedExports.at(-1);
   assert.equal(filename,name+'.md');
   assert.equal(type,'md');
   assert.ok(content.includes(expected));
   assert.ok(!content.includes(excluded));
  }
  await combined.locator('.timeline-source button').click();
  assert.ok((await page.locator('#detail-panel').textContent()).includes(papers[0].limitations[0]));
  await page.locator('#clear-paper-selection').click();
  await page.locator('.workspace-ribbon [data-view="beta"]').click();
  assert.equal(await page.locator('#beta-workspace').getByText('创意之海',{exact:true}).count(),0);
 });
 await check('long innovation timelines scroll independently and expose the last entry',async()=>{
  await page.locator('.workspace-ribbon [data-view="research"]').click();
  await page.locator('.research-navigation').getByText('创新点时间线',{exact:true}).click();
  const timeline=page.locator('#innovation-timeline');
  await timeline.locator('[data-timeline-all]').click();
  const years=timeline.getByRole('region',{name:'创新点时间线'});
  await years.waitFor();
  const bounds=await years.evaluate(el=>({
   overflow:getComputedStyle(el).overflowY,
   scrollable:el.scrollHeight>el.clientHeight,
   scrollbar:el.offsetWidth-el.clientWidth
  }));
  assert.equal(bounds.overflow,'auto');
  assert.ok(bounds.scrollable&&bounds.scrollbar>0);
  const toolbar=timeline.locator('.timeline-toolbar');
  const top=(await toolbar.boundingBox()).y;
  await years.hover();
  await page.mouse.wheel(0,500);
  await page.waitForFunction(()=>document.querySelector('.timeline-years').scrollTop>0);
  await years.focus();
  await page.keyboard.press('End');
  await page.waitForFunction(()=>{
   const list=document.querySelector('.timeline-years');
   return list.scrollHeight-list.clientHeight-list.scrollTop<=1;
  });
  const last=await years.locator('.timeline-point').last().boundingBox();
  const viewport=await years.boundingBox();
  assert.ok(last.y>=viewport.y&&last.y+last.height<=viewport.y+viewport.height);
  assert.equal((await toolbar.boundingBox()).y,top);
 });
 await check('browser catalog upgrade removes old extraction results and retains recorded innovations',async()=>{
  const migrationPage=await browser.newPage();
  try{
   await migrationPage.route('**/legacy-catalog-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html>'}));
   await migrationPage.goto('http://127.0.0.1:'+server.address().port+'/legacy-catalog-fixture');
   const catalog=await migrationPage.evaluate(async()=>{
    const {DB_NAME,getPapers,getSetting}=await import('/storage.js');
    await new Promise((resolve,reject)=>{
     const request=indexedDB.open(DB_NAME,1);
     request.onupgradeneeded=()=>{
      const db=request.result;
      db.createObjectStore('papers',{keyPath:'id'}).put({id:'paper',title:'Paper',innovations:['Recorded innovation']});
      db.createObjectStore('settings',{keyPath:'key'}).put({key:'module:innovation-sea',value:{version:1}});
     };
     request.onsuccess=()=>{request.result.close();resolve();};
     request.onerror=()=>reject(request.error);
    });
    return {retired:await getSetting('module:innovation-sea'),innovations:(await getPapers())[0].innovations};
   });
   assert.equal(catalog.retired,undefined);
   assert.deepEqual(catalog.innovations,['Recorded innovation']);
  }finally{await migrationPage.close();}
 });
 await check('all main views render without clipping at desktop size',async()=>{await captureAll('after');assert.equal(await page.locator('.view-tabs').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);});
 await check('quick actions open by button and keyboard and navigate without losing focus',async()=>{
  await page.locator('#workspace-command').click();await shot('after-quick-actions');await page.locator('#workspace-command-input').fill('文献');assert.ok(await page.locator('[data-workspace-command-id]').count()>0);await page.keyboard.press('Escape');assert.equal(await page.locator('#workspace-command').evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Control+k');await page.locator('#workspace-command-input').fill('材料');await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('[data-view="materials"]').getAttribute('aria-current')==='page');
  await page.keyboard.press('Control+k');await page.locator('#workspace-command-input').fill('退火工艺对磁芯');await page.keyboard.press('Enter');assert.equal(await page.locator('[data-view="list"]').getAttribute('aria-selected'),'true');assert.ok((await page.locator('#detail-panel').textContent()).includes('退火工艺对磁芯'));
 });
 await check('one click clears search and Escape clears only the active search',async()=>{
  await page.locator('#search').fill('不会匹配的字符串');await page.locator('#clear-workspace-search').click();assert.equal(await page.locator('#search').inputValue(),'');assert.equal(await page.locator('#search').evaluate(el=>el===document.activeElement),true);
  await page.locator('#search').fill('退火');await page.keyboard.press('Escape');assert.equal(await page.locator('#search').inputValue(),'');
 });
 await check('view tabs have roving focus and support arrow keys, Home and End',async()=>{
  await page.locator('[data-view="list"]').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('[data-view="graph"]').getAttribute('aria-selected'),'true');
  await page.keyboard.press('End');assert.equal(await page.locator('[data-view="list"]').getAttribute('aria-selected'),'true');await page.keyboard.press('Home');assert.equal(await page.locator('[data-view="graph"]').getAttribute('aria-selected'),'true');
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
