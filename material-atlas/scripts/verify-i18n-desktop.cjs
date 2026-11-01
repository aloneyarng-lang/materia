// Hidden Electron instance with a new, isolated profile and library.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron}=require(process.env.MATERIA_PLAYWRIGHT||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),output=path.join(root,'.local/i18n-desktop-verification');
let app;const errors=[];
(async()=>{
  await fs.mkdir(output,{recursive:true});const fixture=await fs.mkdtemp(path.join(output,'run-')),profile=path.join(fixture,'profile'),library=path.join(fixture,'library');
  async function launch(){
    app=await _electron.launch({executablePath:process.env.MATERIA_TEST_EXE||path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.MATERIA_TEST_EXE?[]:[root],env:{...process.env,MATERIA_HEADLESS:'1',MATERIA_PROFILE_DIR:profile,MATERIA_LIBRARY_DIR:library},timeout:30000});
    const page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));await page.waitForFunction(()=>!document.querySelector('.import-main').disabled);return page;
  }
  let page=await launch();
  for(const [locale,title]of [['en','Settings'],['ja','設定'],['de','Einstellungen'],['zh-CN','设置'],['de','Einstellungen']]){
    await page.locator('[data-action="settings"]').first().evaluate(node=>node.click());await page.locator('#interface-language').waitFor();await page.selectOption('#interface-language',locale);
    await page.waitForFunction(locale=>document.documentElement.lang===locale,locale);
    await page.waitForFunction(()=>!document.querySelector('#interface-language')?.disabled);
    assert.equal(await page.locator('#modal h2').textContent(),title);
    assert.equal(await page.evaluate(()=>materiaDesktop.getLocale()),locale);
    const preferences=JSON.parse(await fs.readFile(path.join(profile,'preferences.json'),'utf8'));assert.equal(preferences.locale,locale);assert.equal(path.resolve(preferences.libraryPath),library);
    await page.locator('#modal [data-action="close-modal"]').first().evaluate(node=>node.click());
  }
  await app.close();app=null;page=await launch();assert.equal(await page.getAttribute('html','lang'),'de');
  assert.equal(await page.evaluate(()=>materiaDesktop.getLocale()),'de');
  await assert.rejects(page.evaluate(()=>materiaDesktop.setLocale('invalid')),/Invalid interface language/);
  assert.equal(await page.evaluate(()=>materiaDesktop.getLocale()),'de');
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify({passed:true,errors,executable:process.env.MATERIA_TEST_EXE||'source',checks:['four native locales','preferences preserve library path','German survives full restart','invalid locale rejected']},null,2));
  console.log('PASS native language switching, preference persistence, full restart, and library-path preservation');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await app?.close();});
