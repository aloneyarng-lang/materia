const path=require('node:path'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
 const root=process.cwd();const {createPreviewServer}=await import(require('node:url').pathToFileURL(path.join(root,'server.mjs')).href);
 const server=createPreviewServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:980}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.locator('.import-main:not([disabled])').waitFor({state:'attached'});
 await page.locator('.workspace-ribbon [data-action=ai-agent]').click();
 await page.locator('.agent-actor-switch').selectOption('reze');
 await page.waitForFunction(()=>document.querySelector('.agent-stage').classList.contains('agent-reze-scene-ready'));
 await page.evaluate(()=>document.querySelector('#agent-settings').open=false);
 await page.locator('#ai-agent-panel').screenshot({path:path.join(root,'.local/reze-integration/reze-preview.png')});
 const a=await page.locator('.agent-reze-canvas').screenshot();
 await page.waitForTimeout(200);
 const b=await page.locator('.agent-reze-canvas').screenshot();
 assert.ok(!a.equals(b),'dynamic mask should update the image');
 await page.evaluate(()=>document.querySelector('[data-character=motion]').click());
 await page.waitForTimeout(100);
 const c=await page.locator('.agent-reze-canvas').screenshot();
 await page.waitForTimeout(200);
 assert.ok((await page.locator('.agent-reze-canvas').screenshot()).equals(c),'static frame must remain unchanged');
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(root,'.local/reze-integration/browser-check.json'),JSON.stringify({passed:true,animated:true,staticPause:true,errors}));
 console.log('BROWSER_SCENE_OK');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

