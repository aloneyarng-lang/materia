// Synthetic fixtures live only in an isolated library. No user's literature is opened or modified.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium,_electron}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),output=path.join(root,'.local/prediction-verification');
let browser,app,page,server,mlEngine;const errors=[],checks=[],settings={};let stored=null,failSave=false;
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function openPanel(name){await page.locator(`[data-prediction-panel="${name}"]`).first().click();}
async function launch(){
 const {MachineLearningEngine}=await import(pathToFileURL(path.join(root,'desktop/ml-engine.mjs')));mlEngine=new MachineLearningEngine({onProgress:progress=>page?.evaluate(value=>globalThis.__mlProgress?.(value),progress).catch(()=>{})});
 if(process.env.MATERIA_VERIFY_DESKTOP){const desktopRoot=await fs.mkdtemp(path.join(output,'desktop-'));const env={...process.env,MATERIA_HEADLESS:'1',MATERIA_PROFILE_DIR:path.join(desktopRoot,'profile'),MATERIA_LIBRARY_DIR:path.join(desktopRoot,'library')};delete env.ELECTRON_RUN_AS_NODE;
  app=await _electron.launch({executablePath:process.env.MATERIA_VERIFY_DESKTOP==='source'?path.join(root,'node_modules/electron/dist/electron.exe'):process.env.MATERIA_VERIFY_DESKTOP,args:process.env.MATERIA_VERIFY_DESKTOP==='source'?[root]:[],env,timeout:30000});page=await app.firstWindow();
 }else{
  const {createPreviewServer}=await import(pathToFileURL(path.join(root,'server.mjs')));server=createPreviewServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({headless:true,executablePath:process.env.MATERIA_CHROME||path.join(process.env['ProgramFiles(x86)'],'Microsoft/Edge/Application/msedge.exe')});page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('__predictionFixture',async(method,payload,storePayload)=>{if(method==='mlStatus')return mlEngine.run('status');if(method==='mlRun'){const {action,id,...body}=payload;return mlEngine.run(action,body,id);}if(method==='mlCancel')return mlEngine.cancel(payload);if(method==='moduleLoad')return{libraryKey:'ISOLATED',state:stored};if(method==='moduleSave'){payload=storePayload;if(failSave)throw Error('模拟磁盘写入失败');assert.equal(payload.libraryKey,'ISOLATED');stored=structuredClone(payload.state);return{saved:true};}if(method==='saveText'){assert.ok(payload.content.length);return{saved:true};}if(method==='getPapers')return[];if(method==='getSetting')return structuredClone(settings[payload]);if(method==='setSetting'){settings[payload]=structuredClone(storePayload);return true;}if(method==='info')return{path:'ISOLATED'};if(method==='canvasReady'||method==='canvasConfirmClose')return true;throw Error('Unexpected API '+method);});
  await page.addInitScript(()=>{globalThis.materiaDesktop=Object.fromEntries(['mlStatus','mlRun','mlCancel','moduleLoad','moduleSave','getPapers','getSetting','setSetting','info','canvasReady','canvasConfirmClose','saveText'].map(k=>[k,async(...args)=>{const r=await __predictionFixture(k,...args);if(k==='saveText'){globalThis.__predictionExport=args[0].filename;globalThis.__predictionExportContent=args[0].content;};return r;}]));materiaDesktop.onCanvasClose=()=>()=>{};const callbacks=new Set();materiaDesktop.onMLProgress=fn=>{callbacks.add(fn);return()=>callbacks.delete(fn);};globalThis.__mlProgress=value=>callbacks.forEach(fn=>fn(value));});
  await page.goto('http://127.0.0.1:'+server.address().port);
 }
 page.on('pageerror',e=>errors.push(e.message));await page.locator('.import-main:not([disabled])').waitFor({state:'attached'});await page.locator('[data-view="prediction"]').click();await page.locator('#prediction-form').waitFor();
}
(async()=>{
 await fs.mkdir(output,{recursive:true});
 await launch();
 await check('fifth home tab follows notes, opens an empty prediction workspace and leaves old views usable',async()=>{
  const views=await page.locator('.view-tabs [data-view]').evaluateAll(ns=>ns.map(n=>n.dataset.view));assert.deepEqual(views,['graph','list','materials','notes','prediction']);
  assert.equal(await page.locator('#prediction-form button[type=submit]').isDisabled(),true);assert.equal(await page.locator('#detail-panel').isVisible(),false);
  if(!app)await page.screenshot({path:path.join(output,'empty.png')});
  await page.locator('[data-view="notes"]').click();assert.equal(await page.locator('#prediction-workspace').isVisible(),false);await page.locator('[data-view="prediction"]').click();
 });
 await check('actual XLSX headers, Unicode and cached formulas can be read without modifying the source',async()=>{
  const source=process.env.MATERIA_PREDICTION_WORKBOOK;if(!source)return;const before=await fs.readFile(source);
  await openPanel('datasets');await page.locator('#prediction-upload').setInputFiles(source);await page.locator('#prediction-import-form').waitFor();
  assert.equal(await page.locator('[data-mapping-role="1"]').inputValue(),'composition');assert.equal(await page.locator('[data-mapping-id="4"]').inputValue(),'Tg');assert.equal(await page.locator('[data-mapping-id="9"]').inputValue(),'E');
  assert.ok((await page.locator('#prediction-workspace').textContent()).includes('16 个公式'));assert.deepEqual(await fs.readFile(source),before);await page.locator('[data-prediction-action="close-import"]').click();
 });
 const rows=['composition,particleSize,Tg,Tx,Hc,DOI',...Array.from({length:60},(_,i)=>`Fe${70+i*.3}B${30-i*.3},${10+i%5},${500+i*5},${540+i*5},${120-i},synthetic-${i}`)];const csv=path.join(output,'SYNTHETIC-TEST-ONLY.csv');await fs.writeFile(csv,rows.join('\n'));
 await check('CSV preview preserves shape and unit confirmation, then saves measured data',async()=>{
  await openPanel('datasets');await page.locator('#prediction-upload').setInputFiles(csv);await page.locator('#prediction-import-form').waitFor();await page.locator('#prediction-import-form [name=form]').fill('powder');await page.locator('#prediction-import-form [name=verified]').check();
  await page.locator('#prediction-import-form button[type=submit]').click();await page.locator('[data-prediction-action="confirm-import"]').waitFor();assert.ok((await page.locator('.prediction-import-report').textContent()).includes('60 条可导入'));
  assert.equal(await page.locator('#prediction-import-form [name=form]').inputValue(),'powder');assert.equal(await page.locator('#prediction-import-form [name=verified]').isChecked(),true);
  await page.locator('[data-prediction-action="confirm-import"]').click();await page.waitForFunction(()=>!document.querySelector('#prediction-import-form'));assert.ok((await page.locator('#prediction-workspace').textContent()).includes('SYNTHETIC-TEST-ONLY'));
 });
 await check('three official scikit-learn models expose nested held-out metrics and survive page reload',async()=>{
  await openPanel('models');await page.waitForFunction(()=>document.querySelector('.prediction-engine-status')?.textContent.includes('已就绪'),{},{timeout:60000});await page.getByText('高级设置 · 候选算法与计算参数',{exact:true}).click();for(const item of await page.locator('[name=algorithm]').all())await item.uncheck();await page.locator('[name=algorithm][value=ridge]').check();for(const id of ['Tg','Tx','Hc'])await page.locator(`#prediction-train-form [name=target][value="${id}"]`).check();await page.locator('#prediction-train-form button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#prediction-train-status')?.textContent.includes('已完成 3 项'),{},{timeout:180000});assert.equal(await page.locator('[data-model-details]').count(),3);
  await page.reload();await page.locator('[data-view="prediction"]').click();await page.locator('#prediction-form').waitFor();await openPanel('models');assert.equal(await page.locator('[data-model-details]').count(),3);
 });
 await check('training report renders diagnostics, algorithm ranking and reproducible metadata',async()=>{
  await page.locator('[data-model-details]').first().click();await page.locator('.prediction-model-report svg').first().waitFor();
  assert.equal(await page.locator('.prediction-model-report svg').count(),2);
  assert.ok((await page.locator('.prediction-model-report').textContent()).includes('外层 5 折'));
  if(!app){assert.ok(stored.models.every(m=>m.algorithm==='sklearn-regression-v1'&&m.validationPoints.length===60));await page.screenshot({path:path.join(output,'sklearn-report.png'),fullPage:true});}
 });
 await check('composition and measured conditions yield predictions, derived deltaTx and per-target availability',async()=>{
  await openPanel('predict');await page.locator('#prediction-form [name=formula]').fill('Fe80B20');await page.locator('#prediction-form [name="feature:particleSize"]').fill('12');await page.locator('#prediction-form button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelectorAll('.prediction-result b').length===4,{},{timeout:120000});assert.equal(await page.locator('.prediction-result b').count(),4);assert.ok((await page.locator('.prediction-result-list').textContent()).includes('由 Tx − Tg 计算'));assert.ok((await page.locator('.prediction-result-list').textContent()).includes('待训练'));
  if(!app)await page.screenshot({path:path.join(output,'prediction.png')});
  await page.locator('#prediction-form [name=formula]').fill('Fe80Cu20');await page.locator('#prediction-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('.prediction-result-list')?.textContent.includes('训练数据未包含元素'),{},{timeout:120000});assert.equal(await page.locator('.prediction-result b').count(),0);assert.ok((await page.locator('.prediction-result-list').textContent()).includes('训练数据未包含元素'));
  await page.locator('#prediction-form [name=basis]').selectOption('wt');assert.equal(await page.locator('#prediction-form button[type=submit]').isDisabled(),true);
 });
 await check('batch predictions preserve valid rows and invalid-row reasons',async()=>{
  if(app)return;await page.locator('#prediction-form [name=basis]').selectOption('at');
  const batch=path.join(output,'SYNTHETIC-BATCH.csv');await fs.writeFile(batch,'composition,particleSize\nFe80B20,12\nFe80Cu20,12\nFe80B10,12');
  await page.locator('#prediction-batch').setInputFiles(batch);await page.waitForFunction(()=>globalThis.__predictionExport==='materia-batch-predictions.csv',{},{timeout:120000});
  const content=await page.evaluate(()=>globalThis.__predictionExportContent);assert.ok(content.includes('训练数据未包含元素'));assert.ok(content.includes('应为 100%'));assert.ok(content.includes('Fe80B20'));
 });
 await check('custom properties persist without changing source code and exports work',async()=>{
  await openPanel('properties');await page.locator('#prediction-field-form [name=name]').fill('新增测试性能');await page.locator('#prediction-field-form [name=unit]').fill('unit');await page.locator('#prediction-field-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('.prediction-field-list')?.textContent.includes('新增测试性能'));
  await page.reload();await page.locator('[data-view="prediction"]').click();await page.locator('#prediction-form').waitFor();await openPanel('properties');assert.ok((await page.locator('#prediction-workspace').textContent()).includes('新增测试性能'));
  if(!app){await openPanel('datasets');await page.locator('[data-prediction-action="export-workspace"]').click();await page.waitForFunction(()=>globalThis.__predictionExport==='materia-prediction-workspace.json');}
 });
 await check('optional module disable, restart and re-enable preserve its datasets and trained models',async()=>{
  await page.keyboard.press('Control+k');await page.locator('#workspace-command-input').fill('功能管理');await page.keyboard.press('Enter');await page.locator('[data-workspace-module="prediction"]').uncheck();await page.waitForFunction(()=>!document.querySelector('[data-view="prediction"]'));
  assert.equal(await page.locator('.view-tabs [data-view]').count(),4);await page.locator('#modal [data-action="close-modal"]').last().click();await page.reload();await page.locator('.import-main:not([disabled])').waitFor({state:'attached'});assert.equal(await page.locator('[data-view="prediction"]').count(),0);
  await page.keyboard.press('Control+k');await page.locator('#workspace-command-input').fill('功能管理');await page.keyboard.press('Enter');await page.locator('[data-workspace-module="prediction"]').check();await page.locator('[data-view="prediction"]').waitFor();await page.locator('#modal [data-action="close-modal"]').last().click();await page.locator('[data-view="prediction"]').click();await page.locator('#prediction-form').waitFor();await openPanel('models');assert.equal(await page.locator('[data-model-details]').count(),3);
  await openPanel('properties');assert.ok((await page.locator('#prediction-workspace').textContent()).includes('新增测试性能'));
 });
 await check('browser save failures stay visible and cannot replace the last successful dataset state',async()=>{
  if(app)return;failSave=true;const count=stored.properties.length;await openPanel('properties');await page.locator('#prediction-field-form [name=name]').fill('保存失败测试');await page.locator('#prediction-field-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('.prediction-feedback')?.textContent.includes('未保存'));assert.equal(stored.properties.length,count);failSave=false;
 });
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(output,'report'+(app?'-desktop':'')+'.json'),JSON.stringify({checks,errors},null,2));console.log('All '+checks.length+' UI checks passed.');
})().catch(async e=>{console.error(e);console.error(errors);if(page)console.error(await page.locator('.storage-error').allTextContents());process.exitCode=1;}).finally(async()=>{mlEngine?.cancelAll();if(app)await app.close();if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));});
