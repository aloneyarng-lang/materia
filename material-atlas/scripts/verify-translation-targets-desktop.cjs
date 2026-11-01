// Hidden Electron profile, empty synthetic library, local mock provider only.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {_electron}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),output=path.join(root,'.local/translation-targets-desktop');
let app,mock;const requests=[],errors=[];
(async()=>{
  await fs.mkdir(output,{recursive:true});const run=await fs.mkdtemp(path.join(output,'run-')),profile=path.join(run,'profile'),library=path.join(run,'library');
  mock=http.createServer(async(req,res)=>{
    try{let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw),label=body.messages[0].content.match(/翻译成(简体中文|英语|日语|德语)/)?.[1];
      assert.ok(label);assert.equal(body.tools,undefined);assert.equal(req.headers.authorization,'Bearer synthetic-translation-key');requests.push(label);
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:label+' synthetic result'}}]}));
    }catch(error){errors.push(error.message);res.writeHead(500);res.end('Synthetic provider assertion failed');}
  });await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
  async function start(){
    app=await _electron.launch({executablePath:process.env.MATERIA_TEST_EXE||path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.MATERIA_TEST_EXE?[]:[root],env:{...process.env,MATERIA_HEADLESS:'1',MATERIA_PROFILE_DIR:profile,MATERIA_LIBRARY_DIR:library}});
    const page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));await page.waitForFunction(()=>!document.querySelector('.import-main').disabled);return page;
  }
  let page=await start();
  await page.evaluate(async baseUrl=>{
    await materiaDesktop.agentSaveConfig({provider:'custom',baseUrl,model:'synthetic-translator',protocol:'chat',apiKey:'synthetic-translation-key',rememberKey:false});
    await(await import('./i18n.js')).setLocale('en');
  },`http://127.0.0.1:${mock.address().port}/v1`);
  for(const [targetLanguage,label]of [['zh-CN','简体中文'],['en','英语'],['ja','日语'],['de','德语']])for(const mode of ['selection','page']){
    const result=await page.evaluate(({targetLanguage,mode})=>materiaDesktop.translateText({id:crypto.randomUUID(),request:{targetLanguage,mode,text:'Strength of alloy',title:'Synthetic paper',context:''}}),{targetLanguage,mode});
    assert.equal(result.error,undefined);assert.equal(result.targetLanguage,targetLanguage);assert.equal(result.text,label+' synthetic result');
  }
  const study=await page.evaluate(()=>materiaDesktop.studyRead());
  await page.evaluate(libraryKey=>materiaDesktop.studyUpdate({libraryKey,operation:{kind:'preferences',preferences:{targetLanguage:'de',instant:false}}}),study.libraryKey);
  await app.close();app=null;page=await start();
  assert.equal((await page.evaluate(()=>materiaDesktop.studyRead())).preferences.targetLanguage,'de');
  assert.equal(await page.getAttribute('html','lang'),'en');assert.equal(requests.length,8);assert.deepEqual(errors,[]);
  assert.ok(!(await fs.readFile(path.join(library,'library.json'),'utf8')).includes('synthetic-translation-key'));
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify({passed:true,executable:process.env.MATERIA_TEST_EXE||'source',requests,errors,preferenceAfterRestart:'de',interfaceAfterRestart:'en'},null,2));
  console.log('PASS native Chinese/English/Japanese/German selection and page requests; independent target preference survives restart');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await app?.close();mock?.closeAllConnections();await new Promise(resolve=>mock?mock.close(resolve):resolve());});
