const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));

(async()=>{
  const root=path.resolve(__dirname,'../dist');
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:940},reducedMotion:'reduce',serviceWorkers:'block'});
    // Serve fixtures directly from disk: no server, real library, or network required.
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname!=='localhost')return route.abort();
      const target=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
      if(!target.startsWith(root+path.sep))return route.abort();
      try{const types={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2','.png':'image/png'};
        await route.fulfill({status:200,contentType:types[path.extname(target)]||'application/octet-stream',body:await fs.readFile(target)});
      }catch{await route.fulfill({status:404,body:''});}
    });
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://localhost:17425/');
    await page.waitForFunction(()=>document.querySelector('.import-main')?.disabled===false);
    await page.evaluate(async()=>{
      const s=await import('./storage.js');
      await s.putPapers([...Array.from({length:36},(_,i)=>({id:'domain-'+i,title:['Magnetic alloys','Polymer chemistry','Battery cathodes'][Math.floor(i/12)]+' study '+i,tags:['Materials','Analysis','Field '+Math.floor(i/12),'Method '+Math.floor(i/12),'Detail '+i%3]})),{id:'isolated',title:'Unclassified paper',tags:[]}]);
      await s.setSetting('graphPreferences',{mode:'similarity',similarityThreshold:.5,colorBy:'community'});
    });
    await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.paper-node').length===37);
    assert.match(await page.locator('#network-stats').textContent(),/3 个星团/);
    assert.equal(await page.locator('.community-label').count(),3);
    assert.match(await page.locator('.community-label').first().textContent(),/Field/);
    assert.equal(await page.locator('#graph-mode-help').isVisible(),false);
    await page.locator('#filter-button').click();
    const names=page.locator('[data-graph-setting="showCommunityLabels"]');
    await names.evaluate(el=>el.closest('details').open=true);
    await names.uncheck();assert.equal(await page.locator('.community-labels').isVisible(),false);
    await page.waitForTimeout(650);await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.paper-node').length===37);
    assert.equal(await page.locator('.community-labels').isVisible(),false);
    await page.locator('#filter-button').click();await names.evaluate(el=>el.closest('details').open=true);await names.check();
    await page.locator('[data-action="close-filters"]').last().click();
    assert.equal(await page.locator('.community-labels').isVisible(),true);
    const low=await page.locator('.network-edges path').count();
    await page.locator('#graph-neighbors').selectOption('8');
    await page.waitForFunction(n=>document.querySelectorAll('.network-edges path').length>n,low);
    const high=await page.locator('.network-edges path').count();
    await page.locator('[data-graph-setting="mutualKnn"]').check();
    assert.ok(await page.locator('.network-edges path').count()<=high);
    assert.match(await page.locator('#network-stats').textContent(),/3 个星团/);
    await page.waitForTimeout(650);await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.paper-node').length===37);
    assert.equal(await page.locator('#graph-neighbors').inputValue(),'8');assert.equal(await page.locator('[data-graph-setting="mutualKnn"]').isChecked(),true);
    await page.locator('[data-action="graph-arrange"]').first().click();
    await page.waitForFunction(()=>document.querySelector('#star-map').dataset.naturalLayout==='settled',{},{timeout:35000});
    await fs.mkdir(path.resolve(__dirname,'../.local/research-graph-verification'),{recursive:true});
    await page.screenshot({path:path.resolve(__dirname,'../.local/research-graph-verification/communities.png')});
    for(const width of [1440,900,650]){await page.setViewportSize({width,height:940});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
    await page.locator('#graph-mode').selectOption('tags');assert.equal(await page.locator('[data-graph-setting="mutualKnn"]').isVisible(),false);
    await page.locator('#graph-mode').selectOption('shared-tags');assert.equal(await page.locator('#graph-shared-tags-control').isVisible(),true);
    await page.locator('#graph-mode').selectOption('similarity');await page.waitForFunction(()=>document.querySelectorAll('.paper-node').length===37);
    await page.setViewportSize({width:1440,height:940});
    const views=await page.locator('.view-tabs [data-view]').evaluateAll(nodes=>nodes.map(n=>({view:n.dataset.view,panel:n.dataset.panel})));
    for(const {view,panel} of views){await page.locator(`.view-tabs [data-view="${view}"]`).click();await page.waitForFunction(id=>!document.getElementById(id).hidden,panel);await page.waitForTimeout(200);assert.ok(!(await page.locator('#'+panel).textContent()).includes('功能暂时无法打开'));}
    assert.deepEqual(errors,[]);
    const startup=await context.newPage();await startup.goto('http://localhost:17425/startup.html');
    const colors=await startup.evaluate(()=>({background:getComputedStyle(document.querySelector('main')).backgroundColor,foreground:getComputedStyle(document.querySelector('h1')).color,brand:getComputedStyle(document.querySelector('.wordmark')).color}));
    assert.deepEqual(colors,{background:'rgb(238, 119, 36)',foreground:'rgb(255, 255, 255)',brand:'rgb(255, 255, 255)'});
    await startup.setViewportSize({width:560,height:440});await startup.screenshot({path:path.resolve(__dirname,'../.local/research-graph-verification/startup-orange.png')});await startup.close();
    console.log('PASS community grouping, isolated paper, display density, mutual KNN, persistence, natural arrangement, three modes, responsive widths and no browser errors');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
