// Exercise the notes tab and compact reading filter with an isolated library.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const{chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),out=path.join(root,'.local/library-notes-verification'),checks=[],errors=[];
let browser,child,page;
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function waitCount(n){await page.waitForFunction(n=>document.querySelectorAll('#notes-library .note-card').length===n,n);}
(async()=>{
 await fs.mkdir(out,{recursive:true});const run=await fs.mkdtemp(path.join(out,'run-')),profile=path.join(run,'profile'),library=path.join(run,'library');
 const{LocalLibrary}=await import(pathToFileURL(path.join(root,'desktop/library.mjs')).href),lib=await new LocalLibrary(library).init();
 await import(pathToFileURL(path.join(root,'tests/make-fixtures.mjs')).href);const pdf=await fs.readFile(path.join(root,'.local/materia-test-1.pdf'));
 await lib.putPapers(Array.from({length:3},(_,i)=>({id:'n'+i,title:'Notes fixture '+i,tags:['Common'],year:String(2023+i),readingStatus:i===1?'reading':'unread',filename:'notes-'+i+'.pdf',fileBytes:Buffer.concat([pdf,Buffer.from('\n% Notes fixture '+i)])})));
 await lib.setSetting('notes',{'paper:n0':[{id:'a',body:'Unique text <img src=x onerror=alert(1)>',createdAt:1,updatedAt:1}],'paper:n1':[{id:'b',body:'Second research note',createdAt:2,updatedAt:2}],'tag:Common':[{id:'c',body:'Shared tag note',createdAt:3,updatedAt:3}]});
 const env={...process.env,MATERIA_HEADLESS:'1',MATERIA_PROFILE_DIR:profile,MATERIA_LIBRARY_DIR:library};delete env.ELECTRON_RUN_AS_NODE;
 const exe=process.env.MATERIA_RELEASE_EXE||path.join(root,'node_modules/electron/dist/electron.exe');
 child=spawn(exe,[...(process.env.MATERIA_RELEASE_EXE?[]:[root]),'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--disable-gpu'],{env,windowsHide:true,stdio:'ignore'});
 let port;for(let i=0;i<150;i++){try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break;}catch{}if(child.exitCode!==null)throw Error('Isolated app exited '+child.exitCode);await new Promise(r=>setTimeout(r,100));}assert.ok(port);
 browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);const context=browser.contexts()[0];page=context.pages()[0]||await context.waitForEvent('page');page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1440,height:940});await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('.import-main')?.disabled===false);
 await check('notes tab aggregates paper and tag notes safely',async()=>{
  await page.locator('[data-view="notes"]').click();await page.locator('[data-notes-tab="papers"]').click();await waitCount(3);assert.equal(await page.locator('#notes-library img').count(),0);assert.equal(await page.locator('#graph-wrap').isVisible(),false);assert.equal(await page.locator('#paper-list').isVisible(),false);assert.equal(await page.locator('#notes-library .note-body').first().innerText(),'Shared tag note');
 });
 await check('reading status dropdown has five counted choices and intersects note search',async()=>{
  assert.equal(await page.locator('#reading-status-filter option').count(),5);assert.equal(await page.locator('#reading-status-filters').count(),0);
  await page.locator('#filter-button').click();await page.locator('#reading-status-filter').selectOption('reading');await page.locator('[data-action="close-filters"]').last().click();
  await waitCount(2);await page.locator('#search').fill('Second');await waitCount(1);
  await page.locator('#filter-button').click();await page.locator('#advanced-filter-dialog [data-action="reset-filters"]').first().click();await page.locator('[data-action="close-filters"]').last().click();
  await waitCount(3);assert.equal(await page.locator('#reading-status-filter').inputValue(),'');
 });
 await check('notes can be created, edited and removed without leaving a stale list',async()=>{
  await page.locator('[data-note-start]').click();await page.locator('#notes-library-owner').selectOption('n0');await page.locator('[data-note-create]').click();await page.locator('#note-body').fill('New saved note');await page.locator('[data-note-action="save"]').click();await page.waitForFunction(()=>document.querySelectorAll('#notes-library .note-card').length===4);await page.locator('#modal [data-action="close-modal"]').last().click();
  const card=page.locator('#notes-library .note-card').filter({hasText:'New saved note'});await card.locator('[data-note-open-id]').click();await page.locator('#note-body').fill('Updated saved note');await page.locator('[data-note-action="save"]').click();await page.waitForFunction(()=>document.querySelector('#notes-library').textContent.includes('Updated saved note'));await page.locator('#modal [data-action="close-modal"]').last().click();
  await page.locator('#notes-library .note-card').filter({hasText:'Updated saved note'}).locator('[data-note-open-id]').click();const remove=page.locator('#modal .note-card').filter({hasText:'Updated saved note'}).locator('[data-note-delete]');await remove.click();await remove.click();await page.waitForFunction(()=>document.querySelectorAll('#notes-library .note-card').length===3);await page.locator('#modal [data-action="close-modal"]').last().click();
 });
 await check('dictionary icon opens vocabulary and notes can return to their PDF',async()=>{
  assert.equal(await page.locator('[data-action="vocabulary"] svg[data-icon-name="dictionary"]').count(),1);await page.locator('[data-action="vocabulary"]').click();assert.equal(await page.locator('#vocabulary-dialog').isVisible(),true);await page.locator('[data-vocab-close]').click();await page.locator('#notes-library [data-note-paper="n0"]').click();await page.waitForFunction(()=>document.querySelector('.pdf-reader')?.open);await page.locator('[data-reader-action="close"]').click();await page.waitForFunction(()=>!document.querySelector('.pdf-reader')?.open);
 });
 await check('notes and filter layout fit compact windows',async()=>{
  await page.setViewportSize({width:1024,height:768});assert.equal(await page.evaluate(()=>document.body.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,'notes-compact.png'),animations:'disabled'});
 });
 await check('many notes remain reachable with wheel and keyboard at both window sizes',async()=>{
  await page.evaluate(()=>window.materiaDesktop.setSetting('notes',{'paper:n0':Array.from({length:18},(_,i)=>({id:'scroll-'+i,body:('研究笔记 '+i+'：对照不同测试条件，记录实验结果与后续问题。\n').repeat(4),createdAt:i+1,updatedAt:i+1}))}));
  await page.reload();await page.waitForFunction(()=>document.querySelector('.import-main')?.disabled===false);await page.locator('[data-view="notes"]').click();await page.locator('[data-notes-tab="papers"]').click();await waitCount(18);
  for(const size of [{width:1440,height:940},{width:1024,height:768}]){
   await page.setViewportSize(size);
   const region=page.locator('#notes-library');
   const dimensions=await region.evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight,bottom:el.getBoundingClientRect().bottom}));
   assert.ok(dimensions.height>100&&dimensions.scroll>dimensions.height,'notes need a bounded scroll viewport');assert.ok(dimensions.bottom<=size.height,'notes viewport must stay inside window');
   await region.evaluate(el=>el.scrollTop=0);await region.hover();await page.mouse.wheel(0,600);await page.waitForFunction(()=>document.querySelector('#notes-library').scrollTop>0);
   await region.focus();await page.keyboard.press('Control+End');await page.waitForFunction(()=>{const el=document.querySelector('#notes-library');return el.scrollTop+el.clientHeight>=el.scrollHeight-2;});
   assert.ok(await region.locator('.note-card').last().evaluate(el=>{const r=el.getBoundingClientRect(),p=el.closest('#notes-library').getBoundingClientRect();return r.bottom<=p.bottom+2&&r.bottom>p.top;}));
  }
  await page.locator('#notes-library .note-card').last().locator('[data-note-open-id]').click();
  await page.locator('#modal .note-card').last().scrollIntoViewIfNeeded();await page.locator('#modal .note-card').last().locator('[data-note-edit]').click();assert.equal(await page.locator('#note-body').inputValue(),('研究笔记 0：对照不同测试条件，记录实验结果与后续问题。\n').repeat(4));
  await page.locator('#modal [data-action="close-modal"]').click();
 });
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'report.json'),JSON.stringify({passed:checks.length,checks,errors,isolatedLibrary:true},null,2));
})().catch(async e=>{console.error(e);process.exitCode=1;await fs.writeFile(path.join(out,'failure.txt'),e.stack);await page?.screenshot({path:path.join(out,'failure.png'),timeout:10000}).catch(()=>{});}).finally(async()=>{await browser?.close();if(child?.exitCode===null){const ended=new Promise(r=>child.once('exit',r));child.kill();await ended;}});
