const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{pathToFileURL}=require('node:url'),{createHash}=require('node:crypto');
const deps=path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'),{chromium}=require(path.join(deps,'playwright')),{PDFDocument,StandardFonts}=require(path.join(deps,'pdf-lib'));
const root=path.resolve(__dirname,'..'),out=path.join(root,'.local/continuous-reader-verification'),checks=[],errors=[];let browser,page,child;
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
 await check('vertical continuous reading shows equally crisp pages without changing their size',async()=>{
  assert.equal(await page.locator('#reader-flow').inputValue(),'vertical');assert.equal(await page.locator('.reader-page-slot').count(),24);
  const styles=await page.locator('.reader-page-slot>.reader-spread').evaluateAll(els=>els.map(el=>({active:el.parentElement.classList.contains('is-active'),opacity:getComputedStyle(el).opacity,transform:getComputedStyle(el).transform})));
  assert.ok(styles.some(s=>s.active&&Number(s.opacity)===1));assert.ok(styles.every(s=>Number(s.opacity)===1&&s.transform==='none'));
  await page.locator('#reader-page-number').fill('3');await page.locator('#reader-page-number').press('Enter');await at(3);await page.screenshot({path:path.join(out,'vertical.png'),timeout:15000});
  await page.locator('#reader-scroll').hover();await page.mouse.wheel(0,1500);await page.waitForFunction(()=>Number(document.querySelector('#reader-page-number').value)>3);
 });
 await check('long-distance jumps retain bounded canvases, selectable text and mixed-page annotation alignment',async()=>{
  await page.locator('#reader-page-number').fill('9');await page.locator('#reader-page-number').press('Enter');await at(9);
  await page.waitForFunction(()=>document.querySelector('[data-reader-page="9"] .reader-mark'));
  const metrics=await page.locator('[data-reader-page="9"]').evaluate(f=>{const r=f.getBoundingClientRect(),m=f.querySelector('.reader-mark').getBoundingClientRect();return{x:(m.x-r.x)/r.width,y:(m.y-r.y)/r.height};});assert.ok(Math.abs(metrics.x-.1)<.005&&Math.abs(metrics.y-.2)<.005);
  assert.ok(await page.locator('#reader-stage canvas').count()<=3);
  await page.locator('[data-reader-page="9"] .textLayer span').first().evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(range);});assert.match(await page.evaluate(()=>getSelection().toString()),/Continuous/);await page.evaluate(()=>getSelection().removeAllRanges());
  await page.locator('#reader-page-number').fill('24');await page.locator('#reader-page-number').press('Enter');await at(24);assert.equal(await page.locator('#reader-next').isDisabled(),true);assert.ok(await page.locator('#reader-stage canvas').count()<=3);
  await page.locator('[data-reader-edit="anchor-nine"]').click();await at(9);assert.ok(await page.locator('[data-reader-page="9"] .reader-mark').count());
  await page.locator('[data-reader-action="zoom-in"]').click();await ready();assert.ok(await page.locator('[data-reader-page="9"] .reader-mark').count());assert.equal(await page.locator('#reader-page-number').inputValue(),'9');
 });
 await check('horizontal mode supports wheel travel, dual-page groups and first/last navigation',async()=>{
  await page.locator('#reader-flow').selectOption('horizontal');await ready();await page.locator('#reader-layout').selectOption('spread');await ready();
  await page.locator('#reader-page-number').fill('5');await page.locator('#reader-page-number').press('Enter');await at(5);assert.equal(await page.locator('.reader-page-slot.is-active .reader-page').count(),2);
  await page.screenshot({path:path.join(out,'horizontal-spread.png'),timeout:15000});await page.locator('#reader-scroll').hover();await page.mouse.wheel(0,1100);await page.waitForFunction(()=>Number(document.querySelector('#reader-page-number').value)>5);
  assert.ok(await page.locator('#reader-stage canvas').count()<=6);await page.locator('#reader-scroll').focus();await page.keyboard.press('Home');await at(1);assert.equal(await page.locator('#reader-prev').isDisabled(),true);
  await page.locator('#reader-scroll').focus();await page.keyboard.press('End');await at(24);
 });
 await check('flow, layout and progress survive close/reopen; legacy paged rendering still works',async()=>{
  await page.locator('[data-reader-action="close"]').click();await page.waitForFunction(()=>!document.querySelector('#pdf-reader').open);await page.locator('#detail-panel [data-action="open-pdf"]').click();await at(24);assert.equal(await page.locator('#reader-flow').inputValue(),'horizontal');assert.equal(await page.locator('#reader-layout').inputValue(),'spread');
  await page.locator('#reader-flow').selectOption('paged');await ready();assert.equal(await page.locator('.reader-page-slot').count(),0);assert.equal(await page.locator('#reader-stage .reader-page').count(),2);
  await page.locator('#reader-flow').selectOption('vertical');await ready();await page.locator('#reader-layout').selectOption('book');await ready();await page.locator('#reader-page-number').fill('1');await page.locator('#reader-page-number').press('Enter');await at(1);assert.equal(await page.locator('.reader-page-slot.is-active .reader-page').count(),1);
  await page.setViewportSize({width:1024,height:768});await page.waitForTimeout(350);await ready();assert.equal(await page.evaluate(()=>document.querySelector('#pdf-reader').scrollWidth>document.querySelector('#pdf-reader').clientWidth),false);await page.screenshot({path:path.join(out,'compact-book.png'),timeout:15000});
  assert.deepEqual(await page.evaluate(()=>materiaDesktop.getSetting('notes')),originalNotes);assert.equal(createHash('sha256').update(await fs.readFile(await lib.pdfPath('continuous'))).digest('hex'),originalHash);
 });
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'report.json'),JSON.stringify({checks,passed:checks.length,pageErrors:errors,isolatedLibrary:true},null,2));
})().catch(async e=>{console.error(e);process.exitCode=1;await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'failure.txt'),e.stack);await page?.screenshot({path:path.join(out,'failure.png'),timeout:5000}).catch(()=>{});}).finally(async()=>{await browser?.close();if(child?.exitCode===null){const ended=new Promise(r=>child.once('exit',r));child.kill();await ended;}});
