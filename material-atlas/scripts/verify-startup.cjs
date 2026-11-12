const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
  const root=path.resolve(__dirname,'..'),output=path.join(root,'.local/startup-preview');
  await fs.mkdir(output,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:path.join(process.env.ProgramFiles,'Google/Chrome/Application/chrome.exe')});
  try{
    const page=await browser.newPage({viewport:{width:560,height:440},deviceScaleFactor:2});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.join(root,'dist/startup.html')).href);
    await page.waitForFunction(()=>document.querySelector('.pet').style.backgroundPosition==='-576px 0px');
    await page.screenshot({path:path.join(output,'startup.png')});
    assert.equal(await page.locator('h1').textContent(),'少女祈願中...');
    assert.equal(await page.locator('.pet').evaluate(async el=>{const img=new Image();img.src=getComputedStyle(el).backgroundImage.slice(5,-2);await img.decode();return img.naturalWidth;}),1152);
    const positions=new Set();for(let i=0;i<10;i++){positions.add(await page.locator('.pet').evaluate(el=>el.style.backgroundPosition));await page.waitForTimeout(100);}
    assert.ok(positions.size>=5,'Original sprite frames should advance');
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.pet').evaluate(el=>el.style.backgroundPosition),'0px 0px');
    for(let i=0;i<6;i++){
      await page.locator('.pet').evaluate((el,index)=>{el.style.backgroundPosition=`${-192*index}px 0px`;},i);
      await page.screenshot({path:path.join(output,`frame-${i}.png`)});
    }
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(()=>document.documentElement.classList.add('depart'));
    await page.waitForTimeout(480);
    assert.equal(await page.locator('main').evaluate(el=>getComputedStyle(el).opacity),'0');
    assert.deepEqual(errors,[]);
    console.log('Startup illustration, motion preference and fade verified.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
