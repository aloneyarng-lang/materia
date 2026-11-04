const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{pathToFileURL}=require('node:url'),{createHash}=require('node:crypto');
const deps=path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'),{chromium}=require(path.join(deps,'playwright')),{PDFDocument,StandardFonts}=require(path.join(deps,'pdf-lib'));
const root=path.resolve(__dirname,'..'),out=path.join(root,'.local/reader-comfort-verification'),checks=[],errors=[];let browser,page,child;
const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name);};
async function ready(){await page.waitForFunction(()=>!document.querySelector('#pdf-reader').dataset.rendering&&document.querySelector('#reader-stage .is-active .reader-page[data-rendered="true"], #reader-stage>.reader-spread .reader-page[data-rendered="true"]'));}
async function at(number){await page.waitForFunction(n=>Number(document.querySelector('#reader-page-progress').value)===n&&document.querySelector(`.reader-page-slot.is-active [data-reader-page="${n}"][data-rendered="true"],#reader-stage>.reader-spread [data-reader-page="${n}"][data-rendered="true"]`),number);await ready();}
(async()=>{
 await fs.mkdir(out,{recursive:true});const run=await fs.mkdtemp(path.join(out,'run-')),profile=path.join(run,'profile'),library=path.join(run,'library');
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
 for(let n=1;n<=24;n++){const p=pdf.addPage(n===9?[792,612]:[612,792]);p.drawText('Continuous reading / page '+n,{x:45,y:550,size:22,font});for(let i=0;i<10;i++)p.drawText('Research evidence and annotations remain on their original page.',{x:45,y:510-i*22,size:11,font});}
 const bytes=Buffer.from(await pdf.save()),{LocalLibrary}=await import(pathToFileURL(path.join(root,'desktop/library.mjs'))),lib=await new LocalLibrary(library).init();await lib.putPapers([{id:'continuous',title:'Continuous reader fixture',filename:'continuous.pdf',fileBytes:bytes}]);
 await lib.setSetting('notes',{'paper:continuous':[{id:'anchor-nine',body:'Landscape page note',createdAt:1,updatedAt:1,anchor:{page:9,kind:'region',rect:{x:.1,y:.2,width:.3,height:.1},color:'teal'}}]});
 const originalNotes=lib.getSetting('notes'),originalHash=createHash('sha256').update(bytes).digest('hex');
 const env={...process.env,MATERIA_HEADLESS:'0',MATERIA_PROFILE_DIR:profile,MATERIA_LIBRARY_DIR:library};delete env.ELECTRON_RUN_AS_NODE;
 const exe=process.env.MATERIA_RELEASE_EXE||path.join(root,'node_modules/electron/dist/electron.exe');
 child=spawn(exe,[...(process.env.MATERIA_RELEASE_EXE?[]:[root]),'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--disable-gpu'],{env,windowsHide:true,stdio:'ignore'});
 let port;for(let i=0;i<150;i++){try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break;}catch{}if(child.exitCode!==null)throw Error('App exited '+child.exitCode);await new Promise(r=>setTimeout(r,100));}assert.ok(port);
 browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);const context=browser.contexts()[0];for(let i=0;i<150;i++){page=context.pages().find(p=>p.url().includes('/dist/index.html'));if(page)break;await new Promise(r=>setTimeout(r,100));}assert.ok(page,'Main application window');page.on('pageerror',e=>errors.push(e.message));await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:1440,height:960});page.setDefaultTimeout(15000);
 await page.waitForFunction(()=>document.querySelector('.import-main')?.disabled===false);await page.locator('#detail-panel [data-action="open-pdf"]').click();await ready();
 const selectLines=async(count=2)=>{
  await page.locator('.reader-page-slot.is-active .textLayer span').nth(1).scrollIntoViewIfNeeded();
  await page.locator('.reader-page-slot.is-active .textLayer').evaluate((layer,count)=>{const spans=[...layer.querySelectorAll('span')].filter(el=>el.textContent.trim());const range=document.createRange();range.setStart(spans[1].firstChild,0);range.setEnd(spans[count].firstChild,spans[count].textContent.length);getSelection().removeAllRanges();getSelection().addRange(range);},count);
  await page.locator('#reader-selection-translation [data-study-action="highlight"]').waitFor();
 };
 const savedMarks=()=>page.evaluate(async()=>Object.values(await materiaDesktop.getSetting('notes')).flat().filter(n=>['highlight','underline'].includes(n.anchor?.kind)));
 let marked;
 await check('stable fit-width pages, crisp raster, and one-screen keyboard scrolling',async()=>{
  const metrics=await page.locator('.reader-page-slot.is-active .reader-page').evaluate(el=>({width:el.offsetWidth,height:el.offsetHeight,ratio:el.querySelector('canvas').width/el.offsetWidth,available:document.querySelector('#reader-scroll').clientWidth}));
  assert.ok(metrics.width>metrics.available*.85);assert.ok(metrics.ratio>1.99);
  assert.ok(await page.locator('.reader-page-slot>.reader-spread').evaluateAll(els=>els.every(el=>getComputedStyle(el).opacity==='1'&&getComputedStyle(el).transform==='none')));
  await page.locator('#reader-scroll').focus();await page.keyboard.press('PageDown');await page.waitForTimeout(150);
  assert.ok(await page.locator('#reader-scroll').evaluate(el=>el.scrollTop>100));
  await page.locator('#reader-page-number').fill('1');await page.locator('#reader-page-number').press('Enter');await at(1);
 });
 await check('multi-line highlight saves immediately, colors persist, original text stays selectable',async()=>{
  await selectLines(3);await page.locator('[data-study-color="teal"]').click();await page.locator('[data-study-action="highlight"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('.reader-highlight').length>=3);
  marked=(await savedMarks())[0];assert.equal(marked.anchor.color,'teal');assert.ok(marked.anchor.rects.length>=3);assert.match(marked.body,/Research evidence/);
  const source=await page.locator('.reader-page-slot.is-active .textLayer span').nth(1).boundingBox();
  assert.ok(await page.evaluate(r=>Boolean(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.textLayer')),source));
  await page.locator('#reader-annotation-tools [data-annotation-color="rose"]').click();await page.waitForFunction(async()=>Object.values(await materiaDesktop.getSetting('notes')).flat().some(n=>n.anchor?.kind==='highlight'&&n.anchor.color==='rose'));
  marked=(await savedMarks())[0];await page.screenshot({path:path.join(out,'highlight.png')});
 });
 await check('keyboard underline and undo only remove the newly created mark',async()=>{
  await selectLines(2);await page.locator('#reader-scroll').focus();await page.keyboard.press('u');
  await page.waitForFunction(()=>document.querySelector('.reader-underline'));assert.equal((await savedMarks()).length,2);
  await page.keyboard.press('Control+z');await page.waitForFunction(()=>!document.querySelector('.reader-underline'));assert.equal((await savedMarks()).length,1);
 });
 await check('long selections use compact tools, expansion retains translation and dictionary controls',async()=>{
  await selectLines(5);await page.locator('.selection-compact').waitFor();
  assert.equal(await page.locator('[data-study-action="selection"]').isVisible(),false);
  await page.locator('[data-study-action="expand-selection"]').click();assert.equal(await page.locator('[data-study-action="selection"]').isVisible(),true);
  await page.locator('[data-study-action="dismiss"]').click();await page.evaluate(()=>getSelection().removeAllRanges());
 });
 await check('focus mode and zoom preserve text-mark coordinates and sidebar choice',async()=>{
  await page.locator('.reader-toolbar [data-reader-action="focus"]').click();await ready();assert.equal(await page.locator('.reader-sidebar').isVisible(),false);
  await page.screenshot({path:path.join(out,'focus.png')});await page.locator('.reader-focus-exit').click();await ready();assert.equal(await page.locator('.reader-sidebar').isVisible(),true);
  await page.locator('[data-reader-action="zoom-in"]').click();await ready();
  const geometry=await page.locator('.reader-highlight').first().evaluate(el=>{const r=el.getBoundingClientRect(),f=el.closest('.reader-page').getBoundingClientRect();return{x:(r.x-f.x)/f.width,y:(r.y-f.y)/f.height};});
  assert.ok(Math.abs(geometry.x-marked.anchor.rects[0].x)<.001);assert.ok(Math.abs(geometry.y-marked.anchor.rects[0].y)<.001);
 });
 await check('marks survive closing and reopening; compact and dark layouts remain usable',async()=>{
  await page.locator('[data-reader-action="close"]').click();await page.locator('#detail-panel [data-action="open-pdf"]').click();await ready();
  assert.deepEqual((await savedMarks())[0],marked);assert.ok(await page.locator('.reader-highlight').count()>=3);
  await page.setViewportSize({width:1024,height:768});await page.waitForTimeout(400);await ready();
  assert.equal(await page.locator('#pdf-reader').evaluate(el=>el.scrollWidth>el.clientWidth),false);
  assert.ok(await page.locator('#reader-scroll').evaluate(el=>el.clientHeight>350));await page.screenshot({path:path.join(out,'compact.png')});
  await page.evaluate(()=>document.documentElement.dataset.themeMode='dark');await page.screenshot({path:path.join(out,'dark.png')});
  assert.equal(createHash('sha256').update(await fs.readFile(await lib.pdfPath('continuous'))).digest('hex'),originalHash);
 });
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'report.json'),JSON.stringify({checks,passed:checks.length,pageErrors:errors,isolatedLibrary:true},null,2));
})().catch(async e=>{console.error(e);console.log(await page?.evaluate(()=>({popup:document.querySelector('#reader-selection-translation')?.outerHTML,scroll:document.querySelector('#reader-scroll')?.getBoundingClientRect().toJSON(),frame:document.querySelector('.reader-page-slot.is-active .reader-page')?.getBoundingClientRect().toJSON(),selection:getSelection()?.getRangeAt(0)?.getBoundingClientRect().toJSON()})).catch(()=>null));process.exitCode=1;await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'failure.txt'),e.stack);await page?.screenshot({path:path.join(out,'failure.png'),timeout:5000}).catch(()=>{});}).finally(async()=>{await browser?.close();if(child?.exitCode===null){const ended=new Promise(r=>child.once('exit',r));child.kill();await ended;}});
