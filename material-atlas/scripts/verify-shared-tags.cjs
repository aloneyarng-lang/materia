const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));

(async()=>{
  const {createPreviewServer}=await import('../server.mjs');
  const server=createPreviewServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({headless:true,channel:'msedge'});
    const page=await browser.newPage({viewport:{width:1440,height:940}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.waitForFunction(()=>document.querySelector('.import-main')?.disabled===false);
    await page.evaluate(async()=>{
      const {putPapers,setSetting}=await import('./storage.js');
      await putPapers([
        {id:'a',title:'共同标签验证 A',tags:['合金','热处理','晶界','磁性','粉末','烧结','强度','塑性']},
        {id:'b',title:'共同标签验证 B',tags:['合金','热处理','晶界','磁性','粉末','烧结','强度','塑性']},
        {id:'c',title:'共同标签验证 C',tags:['合金','热处理','晶界','磁性','烧结','强度','塑性']},
        {id:'d',title:'独立文献',tags:[]}
      ]);
      await setSetting('graphPreferences',{appearance:'flow',sharedTagThreshold:1});
    });
    await page.reload();
    await page.waitForFunction(()=>document.querySelectorAll('.paper-node').length===4&&document.querySelector('.import-main')?.disabled===false);
    await page.locator('#graph-mode').selectOption('shared-tags');
    assert.equal(await page.locator('.relation-node').count(),0);
    assert.equal(await page.locator('.network-edges path').count(),3);
    assert.equal(await page.locator('#graph-neighbors-control').isVisible(),false);
    const threshold=page.locator('[data-graph-setting="sharedTagThreshold"]');
    assert.equal(await threshold.isVisible(),true);
    assert.equal(await threshold.inputValue(),'6');
    assert.equal(await threshold.getAttribute('min'),'6');
    await threshold.fill('7');
    await page.waitForFunction(()=>document.querySelectorAll('.network-edges path').length===1);
    assert.equal(await page.locator('.paper-node').count(),4);
    assert.match(await page.locator('#graph-mode-help').textContent(),/大于 7/);
    await threshold.blur();
    let saved;
    for(let attempt=0;attempt<30;attempt++){
      saved=await page.evaluate(async()=>(await import('./storage.js')).getSetting('graphPreferences'));
      if(saved?.sharedTagThreshold===7&&saved.mode==='shared-tags')break;
      await page.waitForTimeout(100);
    }
    assert.equal(saved?.mode,'shared-tags');
    assert.equal(saved?.sharedTagThreshold,7);
    await page.reload();
    await page.waitForFunction(()=>document.querySelectorAll('.paper-node').length===4&&document.querySelector('.import-main')?.disabled===false);
    assert.equal(await page.locator('#graph-mode').inputValue(),'shared-tags');
    assert.equal(await threshold.inputValue(),'7');
    assert.equal(await page.locator('.network-edges path').count(),1);
    await page.locator('#graph-mode').selectOption('similarity');
    assert.equal(await page.locator('#graph-neighbors').inputValue(),'3');
    assert.equal(await threshold.isVisible(),false);
    await page.locator('#graph-mode').selectOption('shared-tags');
    assert.equal(await threshold.inputValue(),'7');
    await page.locator('#graph-arrange').click();
    await page.waitForFunction(()=>document.querySelector('#star-map').dataset.naturalLayout==='settled');
    assert.equal(await page.locator('.network-edges path').count(),1);
    assert.deepEqual(errors,[]);
    console.log('PASS third mode, exclusive threshold, isolated nodes, independent controls, persistence, natural layout');
  }finally{
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
