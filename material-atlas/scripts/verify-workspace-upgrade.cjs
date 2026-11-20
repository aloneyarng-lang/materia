const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),out=path.join(root,'.local/workspace-upgrade-verification'),packaged=process.argv.includes('--packaged'),quick=process.argv.includes('--skip-theme-tour');
let browser,page,child,profile,library;const checks=[],errors=[];
const waitFor=(fn,arg,options={})=>page.waitForFunction(fn,arg,{polling:100,...options});
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function capture(name){await page.waitForTimeout(200);for(let attempt=0;attempt<3;attempt++){try{await page.screenshot({path:path.join(out,(packaged?'packaged-':'')+name),timeout:15000,animations:'disabled'});return;}catch(error){if(attempt===2)throw error;}}}
async function themes(){if(await page.locator('.theme-grid').isVisible())return;if(await page.locator('#modal').evaluate(e=>e.open))await closeModal();await page.locator('[data-menu-toggle="workspace-menu"]').click();if(!(await page.locator('.theme-grid').isVisible()))await page.locator('#ribbon-theme').click();}
async function closeModal(){await page.locator('#modal [data-action="close-modal"]').last().click();await waitFor(()=>!document.querySelector('#modal').open);}
async function settings(){await page.locator('[data-menu-toggle="workspace-menu"]').click();await page.locator('#library-location').click();await page.locator('#settings-import-activity').waitFor();}
async function start(){
  const env={...process.env,MATERIA_HEADLESS:'1',MATERIA_PROFILE_DIR:profile,MATERIA_LIBRARY_DIR:library};delete env.ELECTRON_RUN_AS_NODE;
  await fs.unlink(path.join(profile,'DevToolsActivePort')).catch(e=>{if(e.code!=='ENOENT')throw e;});
  const exe=packaged?(process.env.MATERIA_RELEASE_EXE||path.join(root,'release/v'+require(path.join(root,'package.json')).version+'/Materia-win32-x64/Materia.exe')):path.join(root,'node_modules/electron/dist/electron.exe');
  child=spawn(exe,[...(packaged?[]:[root]),'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--disable-gpu','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows'],{env,windowsHide:true,stdio:'ignore'});
  let port;for(let i=0;i<150;i++){try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break;}catch{}if(child.exitCode!==null)throw Error('Test app exited '+child.exitCode);await new Promise(r=>setTimeout(r,100));}
  assert.ok(port,'debug port');browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);const context=browser.contexts()[0];page=context.pages()[0]||await context.waitForEvent('page');page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:940});await waitFor(()=>document.querySelector('.import-main')?.disabled===false);assert.equal(path.resolve((await page.evaluate(()=>materiaDesktop.info())).path),path.resolve(library));
  await page.emulateMedia({reducedMotion:'reduce'});
}
async function stop(){await browser?.close();browser=null;if(child?.exitCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill();await exited;}child=null;}
(async()=>{
  await fs.mkdir(out,{recursive:true});const run=await fs.mkdtemp(path.join(out,'run-'));profile=path.join(run,'profile');library=path.join(run,'library');
  const {LocalLibrary}=await import(pathToFileURL(path.join(root,'desktop/library.mjs')).href),{dayKey}=await import(pathToFileURL(path.join(root,'dist/import-activity.js')).href);const lib=await new LocalLibrary(library).init();
  await lib.setSetting('collections',[{id:'folder-a',name:'空天材料',color:'#005bac'},{id:'folder-b',name:'界面研究',color:'#705095'}]);
  await lib.putPapers(Array.from({length:8},(_,i)=>({id:'fixture-'+i,title:'Verification paper '+(i+1)+' · 材料研究',filename:'sample-'+i+'.pdf',authors:'Researcher A',journal:'Materials',year:'2025',tags:['材料','界面'],addedAt:Date.now()-i*86400000,collection:i<4?'folder-a':'folder-b',fileBytes:Buffer.from('%PDF-1.4\n% Synthetic '+i+'\n%%EOF')})));
  await lib.setSetting('notes',{'paper:fixture-0':[{id:'n1',body:'Keep this original note',createdAt:1,updatedAt:1}]});
  const history=lib.getSetting('importActivity');for(let i=0;i<180;i++){const date=dayKey(Date.now()-i*86400000);if(i%4!==0)history.days[date]=i%13+1;}await lib.save(lib.data);
  await lib.setSetting('themePreferences',{selected:'buaa-blue'});await start();
  await check('quick note button and shortcut append to the same dated Markdown file',async()=>{
    const dialog=page.locator('#quick-tip-dialog'),body=dialog.locator('textarea');
    const button=page.locator('#workspace-tip');
    assert.equal(await button.evaluate(element=>element.previousElementSibling.id),'workspace-command');
    await button.click();
    await dialog.waitFor();
    const id=await dialog.locator('output').evaluate(element=>element.value);
    assert.match(id,/^tip_\d{6}\.md$/);
    await body.fill('First quick note');
    await body.press('Control+Enter');
    await dialog.waitFor({state:'hidden'});
    await page.keyboard.press('Control+Alt+n');
    await dialog.waitFor();
    assert.equal(await body.evaluate(element=>element===document.activeElement),true);
    await body.fill('Second quick note');
    await dialog.locator('#quick-tip-save').click();
    await dialog.waitFor({state:'hidden'});
    assert.equal(await fs.readFile(path.join(run,'笔记库',id),'utf8'),'First quick note\n\n---\n\nSecond quick note\n');
  });
  if(process.argv.includes('--quick-tip-only')){assert.deepEqual(errors,[]);return;}
  await check('curated themes share glass appearances with loaded built-in fonts or explicit portable fallbacks and no glass switch',async()=>{
    await themes();assert.equal(await page.locator('.theme-card').count(),7);assert.equal(await page.locator('[data-liquid-glass-toggle]').count(),0);
    for(const id of quick?['buaa-blue']:['liquid-glass','buaa-blue','paper','academic-purple','sand','reimu-day']){
      await page.locator('[data-theme-id="'+id+'"]').click();
      for(const mode of ['light','dark']){await page.locator('button[data-theme-mode-choice="'+mode+'"]').click();await waitFor(([id,mode])=>document.documentElement.dataset.theme===id&&document.documentElement.dataset.themeMode===mode,[id,mode]);
        const style=await page.locator('.library-surface').evaluate(e=>({radius:getComputedStyle(e).borderRadius,filter:getComputedStyle(e).backdropFilter,glass:document.documentElement.dataset.liquidGlass}));assert.equal(style.glass,'true');assert.match(style.filter,/blur/);assert.ok(parseFloat(style.radius)>=16);
      }
    }
    await page.locator('[data-theme-id="buaa-blue"]').click();await page.locator('button[data-theme-mode-choice="light"]').click();await waitFor(()=>['loaded','fallback'].includes(document.documentElement.dataset.themeFonts));
    assert.ok(await page.evaluate(async()=>!!(await document.fonts.load('400 13px "Materia Inter"')).length&&!!(await document.fonts.load('400 13px "Materia Source Han Sans"')).length));await capture('01-themes-light.png');await closeModal();
  });
  await check('list and graph context menus expose group, notes, parameters and filesystem actions',async()=>{
    await page.locator('[data-view="list"]').click();const row=page.locator('[data-select="fixture-0"]');await row.click({button:'right'});await page.locator('[data-paper-command="collections"]').click();assert.equal(await page.locator('[data-paper-command="folder"]').count(),2);await page.keyboard.press('Escape');
    await row.click({button:'right'});await page.locator('[data-paper-command="more"]').click();assert.ok(await page.locator('[data-paper-command="locate"]').isVisible());assert.ok(await page.locator('[data-paper-command="parameters"]').isVisible());await page.keyboard.press('Escape');
    assert.equal(await row.locator('[data-favorite]').count(),0);await page.locator('[data-view="graph"]').click();await page.locator('.paper-node[data-paper-id="fixture-0"]').dispatchEvent('contextmenu',{clientX:500,clientY:400});await page.locator('[data-paper-command="more"]').click();assert.ok(await page.locator('[data-paper-command="hide"]').isVisible());await page.keyboard.press('Escape');await page.locator('[data-view="list"]').click();await capture('02-buaa-workspace.png');
  });
  await check('a disk move refreshes the UI automatically without changing paper metadata or import counts',async()=>{
    const before=await page.evaluate(async()=>({papers:await materiaDesktop.getPapers(),activity:await materiaDesktop.getSetting('importActivity'),notes:await materiaDesktop.getSetting('notes')})),paper=before.papers.find(p=>p.id==='fixture-0');
    await fs.rename(path.join(library,paper.pdfPath),path.join(library,'papers/界面研究/renamed.pdf'));
    await waitFor(()=>document.querySelector('[data-select="fixture-0"] .paper-row-folder')?.textContent.includes('界面研究'),null,{timeout:15000});
    const after=await page.evaluate(async()=>({paper:(await materiaDesktop.getPapers()).find(p=>p.id==='fixture-0'),activity:await materiaDesktop.getSetting('importActivity'),notes:await materiaDesktop.getSetting('notes')}));
    for(const key of ['id','title','tags','filename','addedAt','authors','materials'])assert.deepEqual(after.paper[key],paper[key]);assert.deepEqual(after.notes,before.notes);assert.deepEqual(after.activity,before.activity);
  });
  await check('Explorer-created folders and PDFs appear automatically, and activity records exactly one new import',async()=>{
    const before=await page.evaluate(()=>materiaDesktop.getSetting('importActivity'));await fs.mkdir(path.join(library,'papers/新分组'));await fs.writeFile(path.join(library,'papers/新分组/external.pdf'),'%PDF-1.4\n% New external test\n%%EOF');
    await waitFor(()=>document.querySelectorAll('.paper-row').length===9,null,{timeout:15000});const after=await page.evaluate(()=>materiaDesktop.getSetting('importActivity'));assert.equal(after.days[dayKey()],before.days[dayKey()]+1);
    if(await page.locator('body').evaluate(e=>e.classList.contains('sidebar-collapsed')))await page.locator('#toggle-sidebar').click();
    const group=page.locator('[data-collection]').filter({hasText:'新分组'});await group.click({button:'right'});await page.locator('[data-group-command="rename"]').click();await page.locator('#rename-group-form [name=name]').fill('新分组改名');await page.locator('#rename-group-form [type=submit]').click();await waitFor(()=>!document.querySelector('#modal').open);await fs.access(path.join(library,'papers/新分组改名/external.pdf'));
    if(!(await page.locator('body').evaluate(e=>e.classList.contains('sidebar-collapsed'))))await page.locator('#toggle-sidebar').click();
  });
  await check('settings show the green daily calendar at the bottom, with year browsing and day details',async()=>{
    await settings();assert.equal(await page.locator('.activity-day').count(),365);assert.ok(await page.locator('.activity-day[data-level="4"]').count()>0);await page.locator('#settings-import-activity').scrollIntoViewIfNeeded();await page.locator('.activity-day:not(:disabled)').last().click();assert.match(await page.locator('[data-activity-detail]').innerText(),/导入/);await capture('03-import-activity.png');await closeModal();
    await themes();await page.locator('button[data-theme-mode-choice="dark"]').click();await capture('04-themes-dark.png');await closeModal();await settings();await page.locator('#settings-import-activity').scrollIntoViewIfNeeded();await capture('05-activity-dark.png');await closeModal();
  });
  await check('saved theme mode and physical group memberships survive a full process restart',async()=>{
    const previous=await page.evaluate(()=>materiaDesktop.getPapers());await stop();await start();assert.equal(await page.locator('html').getAttribute('data-theme-mode'),'dark');assert.equal(await page.locator('html').getAttribute('data-theme'),'buaa-blue');assert.deepEqual(await page.evaluate(()=>materiaDesktop.getPapers()),previous);
    await page.setViewportSize({width:1024,height:768});await settings();const overflow=await page.evaluate(()=>({body:document.body.scrollWidth>innerWidth,modal:document.querySelector('#modal').scrollWidth>document.querySelector('#modal').clientWidth+2}));assert.equal(overflow.body,false);assert.equal(overflow.modal,false);await capture('06-compact-settings.png');
  });
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,(packaged?'packaged-':'')+'report.json'),JSON.stringify({passed:checks.length,checks,errors,isolatedLibrary:true,packaged,themeModesVerified:quick?2:12},null,2));
})().catch(async error=>{console.error(error);process.exitCode=1;await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,(packaged?'packaged-':'')+'failure.txt'),error.stack);await page?.screenshot({path:path.join(out,(packaged?'packaged-':'')+'failure.png'),timeout:10000}).catch(()=>{});}).finally(stop);
