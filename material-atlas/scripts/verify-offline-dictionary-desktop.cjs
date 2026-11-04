const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..');let app;
(async()=>{
 const run=await fs.mkdtemp(path.join(root,'.local/offline-native-'));
 app=await _electron.launch({executablePath:path.join(root,'release/current/Materia-win32-x64/Materia.exe'),args:[],env:{...process.env,MATERIA_HEADLESS:'1',MATERIA_PROFILE_DIR:path.join(run,'profile'),MATERIA_LIBRARY_DIR:path.join(run,'library')}});
 const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(/^https?:\/\//,route=>route.abort());
 await page.waitForFunction(()=>!document.querySelector('.import-main').disabled);
 const results=await page.evaluate(async()=>{
   const d=await import('./offline-dictionary.js');const out=[];
   for(const word of ['apple','photosynthesis','serendipity'])for(const language of ['zh-CN','en'])out.push(await d.lookupOfflineDictionary(word,language));
   for(const [word,language] of [['猫','en'],['ねこ','en'],['apple','ja'],['Haus','en'],['house','de'],['Straße','en'],['猫','zh-CN'],['Haus','zh-CN']])out.push(await d.lookupOfflineDictionary(word,language));
   const ui=await import('./offline-dictionary-ui.js');const root=document.createElement('section');root.id='offline-test';root.innerHTML=ui.offlineDictionaryShell();root.style.cssText='position:fixed;inset:0;z-index:100000;background:var(--panel);overflow:auto;padding:20px';document.body.append(root);
   const view=ui.createOfflineDictionaryView(root,{escape:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')});await view.initialize();
   return out;
 });assert.ok(results.every(r=>r.found));
 await page.locator('#offline-test [data-offline-query]').fill('apple');await page.waitForFunction(()=>document.querySelector('#offline-test .offline-dictionary-card')?.textContent.includes('ECDICT'));
 await page.locator('#offline-test [data-offline-target]').selectOption('en');await page.waitForFunction(()=>document.querySelector('#offline-test .offline-dictionary-card')?.textContent.includes('WordNet'));
 await page.locator('#offline-test [data-offline-target]').selectOption('ja');await page.waitForFunction(()=>document.querySelector('#offline-test .offline-dictionary-card')?.textContent.includes('JMdict'));
 await page.locator('#offline-test [data-offline-query]').fill('house');await page.locator('#offline-test [data-offline-target]').selectOption('de');await page.waitForFunction(()=>document.querySelector('#offline-test .offline-dictionary-card')?.textContent.includes('Ding'));
 await page.locator('#offline-test [data-offline-query]').fill('猫');await page.locator('#offline-test [data-offline-target]').selectOption('en');await page.waitForFunction(()=>document.querySelector('#offline-test .offline-dictionary-card')?.textContent.includes('cat'));
 await page.evaluate(async()=>{
   const module=await import('./reader-study.js');const host=document.createElement('main');host.id='offline-reader-test';host.innerHTML=module.readerStudyHTML();document.querySelector('#offline-test').remove();host.style.cssText='position:fixed;inset:0;z-index:100000;background:var(--panel);overflow:auto;padding:20px';document.body.append(host);
   window.offlineAiCalls=0;
   window.offlineReader=module.createReaderStudy(host,{escape:s=>s,context:()=>({paper:{id:'synthetic',title:'Synthetic',fingerprint:''},loaded:false}),serviceStatus:async()=>({ready:true}),translate:async()=>{window.offlineAiCalls++;return {text:'Synthetic AI result'};},toast:()=>{}});
   await window.offlineReader.initialize();window.offlineReader.selectionChanged({text:'apple',page:1,rect:{left:20,bottom:40}});
 });
 await page.waitForFunction(()=>document.querySelector('#offline-reader-test #reader-selection-translation .study-translation')?.textContent.includes('苹果'));
 assert.equal(await page.evaluate(()=>window.offlineAiCalls),0);assert.equal(await page.locator('#offline-reader-test [data-study-action="offline"]').count(),0);
 await page.locator('#offline-reader-test #reader-selection-language').selectOption('ja');await page.waitForFunction(()=>document.querySelector('#offline-reader-test #reader-selection-translation .study-translation')?.textContent.includes('りんご'));
 await page.evaluate(()=>{window.offlineReader.selectionChanged({text:'apple',page:1});window.offlineReader.selectionChanged({text:'water',page:1});});
 await page.waitForFunction(()=>document.querySelector('#offline-reader-test #reader-selection-translation .study-translation')?.textContent.includes('水'));
 assert.equal(await page.evaluate(()=>window.offlineAiCalls),0);
 await page.locator('#offline-reader-test [data-study-action="selection"]').click();await page.waitForFunction(()=>document.querySelector('#offline-reader-test #reader-selection-translation .study-translation')?.textContent==='Synthetic AI result');
 assert.equal(await page.evaluate(()=>window.offlineAiCalls),1);
 await page.evaluate(()=>window.offlineReader.selectionChanged({text:'zzzzunknownentry',page:1}));await page.waitForFunction(()=>document.querySelector('#offline-reader-test #reader-selection-translation .study-translation')?.textContent.includes('暂无此词条'));
 assert.equal(await page.evaluate(()=>window.offlineAiCalls),1);
 await page.evaluate(()=>{window.offlineReader.selectionChanged({text:'photosynthesis',page:1});window.offlineReader.dispose();});
 assert.equal(await page.locator('#offline-reader-test #reader-selection-translation').count(),0);
 assert.deepEqual(errors,[]);const report={passed:true,queries:results.length,automaticLookup:true,languageChange:true,rapidSelections:true,aiOnlyOnClick:true};await fs.writeFile(path.join(run,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await app?.close()});



