// Isolated UI verification: synthetic library, no credentials or external services.
const {chromium}=require(process.env.MATERIA_PLAYWRIGHT||require('node:path').join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.local','typography-verification');
const data={papers:[{id:'font-fixture',title:'材料的结构与性能 · Structure and Properties',authors:'Ada',authorDetails:[],year:'2026',journal:'Synthetic Journal',tags:['材料'],measurements:[],filename:'fixture.pdf',file:{desktop:true,size:1000},addedAt:1}],settings:{notes:{},collections:[]}};
const checks=[],errors=[];let browser,page,server,failSave=false;
const clone=value=>value==null?value:structuredClone(value);
async function check(name,run){await run();checks.push(name);console.log('PASS '+name);}
const size=selector=>page.locator(selector).first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
async function ready(){await page.locator('.import-main:not([disabled])').waitFor({state:'attached'});}
async function open(){await page.locator('[data-menu-toggle="workspace-menu"]').click();await page.locator('#library-location').click();await page.locator('#ribbon-theme').click();if(!await page.locator('.theme-fonts').evaluate(el=>el.open))await page.locator('.theme-fonts>summary').click();}
async function close(){await page.locator('#modal [data-action="close-modal"]').last().click();}
async function settled(){await page.waitForFunction(()=>!document.querySelector('[data-theme-font-scale]')?.disabled);}
async function changeScale(value){await page.locator('[data-theme-font-scale]').evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);await settled();}
async function capture(name){await page.screenshot({path:path.join(output,name+'.png')});}
async function main(){
  await fs.mkdir(output,{recursive:true});
  const {PDFDocument,StandardFonts}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pdf-lib'));
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);pdf.addPage([612,792]).drawText('Synthetic typography fixture',{x:40,y:700,size:16,font});const pdfBytes=await pdf.save();
  const {createPreviewServer}=await import(pathToFileURL(path.join(root,'server.mjs')));server=createPreviewServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath:process.env.MATERIA_CHROME||path.join(process.env['ProgramFiles(x86)']||'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe')});
  page=await browser.newPage({viewport:{width:1395,height:960}});page.on('pageerror',error=>errors.push(error.message));
  const methods={getPapers:()=>clone(data.papers),getSetting:key=>clone(data.settings[key]),setSetting:(key,value)=>{if(key==='themePreferences'&&failSave)throw Error('Simulated save failure');data.settings[key]=clone(value);return true;},info:()=>({path:'ISOLATED TYPOGRAPHY TEST',paperCount:1,materialsVersion:1,themeSchemaVersion:2,graphThemeVersion:4,readerNotesVersion:1,readerAnnotationsVersion:1,readerDraftsVersion:1}),readPdf:()=>Array.from(pdfBytes)};
  await page.exposeFunction('__fixtureAPI',(name,args)=>methods[name](...args));
  await page.addInitScript(names=>{globalThis.materiaDesktop=Object.fromEntries(names.map(name=>[name,(...args)=>__fixtureAPI(name,args)]));},Object.keys(methods));
  await page.goto(`http://127.0.0.1:${server.address().port}`);await ready();
  const original=JSON.stringify(data.papers),bodySize=await size('body'),titleSize=await size('.paper-title');
  await open();
  await check('live preview changes actual UI typography before saving; release persists the choice',async()=>{
    assert.equal(await page.locator('[data-theme-font-scale]').inputValue(),'100');
    await page.locator('[data-theme-font-scale]').evaluate(el=>{el.value='125';el.dispatchEvent(new Event('input',{bubbles:true}));});
    assert.equal(await size('body'),bodySize*1.25);assert.equal(data.settings.themePreferences,undefined);
    assert.equal(await page.locator('#theme-font-scale-value').textContent(),'125%');
    await page.locator('[data-theme-font-scale]').dispatchEvent('change');await settled();assert.equal(data.settings.themePreferences.fontScale,125);
    assert.equal(await size('.paper-title'),titleSize*1.25);await capture('settings-125');
  });
  await check('keyboard reaches both limits; changing theme, font family and reopening preserves size',async()=>{
    const slider=page.locator('[data-theme-font-scale]');await slider.focus();await slider.press('Home');await settled();assert.equal(data.settings.themePreferences.fontScale,85);
    await slider.press('End');await settled();assert.equal(data.settings.themePreferences.fontScale,150);
    await page.locator('[data-theme-id="academic-purple"]').click();await settled();await page.locator('.theme-fonts>summary').click();assert.equal(await slider.inputValue(),'150');
    await page.locator('[data-theme-font="body"]').selectOption('yahei');await settled();assert.equal(data.settings.themePreferences.fontScale,150);
    await page.reload();await ready();assert.equal(await size('body'),19.5);await open();assert.equal(await slider.inputValue(),'150');
    await capture('settings-150-dark');
  });
  await check('failed persistence restores the last saved size and leaves font and palette unchanged',async()=>{
    const before=clone(data.settings.themePreferences);failSave=true;await changeScale(110);failSave=false;
    assert.deepEqual(data.settings.themePreferences,before);assert.equal(await size('body'),19.5);
    assert.equal(await page.locator('[data-theme-font-scale]').inputValue(),'150');await page.locator('#toast-region').filter({hasText:'字号未更改'}).waitFor();
  });
  await check('large UI stays within desktop and narrow windows, including Markdown chat and menus',async()=>{
    await close();await page.locator('[data-view="list"]').click();
    await page.locator('.workspace-ribbon [data-action="ai-agent"]').click();
    await page.locator('.agent-settings').evaluate(el=>el.open=false);
    await page.locator('.toast').evaluateAll(elements=>elements.forEach(el=>el.remove()));
    await page.locator('[data-character="log"]').click();
    await page.locator('#agent-messages').evaluate(async el=>{const {renderChatMarkdown}=await import('/agent-markdown.js');el.innerHTML='<article class="agent-message agent-assistant"><div class="agent-markdown agent-message-body">'+renderChatMarkdown('## 研究记录\n\n材料的结构与性能，保留单位和测试条件。\n\n| 样品 | 性能 |\n| --- | --- |\n| A | 100 MPa |',[])+'</div></article>';});
    assert.equal(await size('.agent-message-body'),19.5);assert.ok(await size('.paper-row h3')>=await size('body'));
    for(const width of [1395,1000,600]){
      await page.setViewportSize({width,height:960});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      const box=await page.locator('#ai-agent-panel').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);
      assert.equal(await page.locator('.agent-message-body p').isVisible(),true);
      await capture('chat-150-'+width);
    }
    await page.locator('[data-agent-action="close"]').click();
    await open();await page.locator('[data-menu-toggle="theme-font-menu"]').scrollIntoViewIfNeeded();await capture('settings-150-narrow');
    assert.equal(await page.locator('#modal').evaluate(el=>el.scrollWidth>el.clientWidth),false);
    await page.setViewportSize({width:1395,height:960});
  });
  await check('reset only restores size; PDF page geometry and text keep their original dimensions',async()=>{
    await close();await page.locator('[data-action="open-pdf"]').click();
    await page.waitForFunction(()=>document.querySelector('#reader-stage .reader-page[data-rendered="true"]'));
    const dimensions=()=>page.locator('#reader-stage .reader-page[data-rendered="true"]').first().evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,canvasWidth:el.querySelector('canvas').width}));
    const before=await dimensions();
    // A modal may be opened above the reader through the same appearance action.
    await page.evaluate(()=>document.querySelector('#library-location').click());await page.locator('#ribbon-theme').click();await page.locator('.theme-fonts>summary').click();
    await page.locator('[data-menu-toggle="theme-font-menu"]').click();await page.locator('[data-theme-action="reset-font-scale"]').click();await settled();assert.equal(await size('body'),13);
    assert.equal(data.settings.themePreferences.fontScale,undefined);assert.equal(data.settings.themePreferences.selected,'academic-purple');assert.equal(data.settings.themePreferences.fonts.body,'yahei');
    await close();assert.deepEqual(await dimensions(),before);await page.locator('[data-reader-action="close"]').click();
    await page.reload();await ready();assert.equal(await size('body'),13);assert.equal(JSON.stringify(data.papers),original);
  });
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(output,'report.json'),JSON.stringify({passed:checks.length,checks,errors,syntheticDataOnly:true},null,2));
}
main().catch(async error=>{console.error(error);if(page)await capture('failure').catch(()=>{});process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(resolve=>server?server.close(resolve):resolve());});
