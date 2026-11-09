// Isolated browser verification with synthetic literature and a local mock AI service.
const {chromium}=require(process.env.MATERIA_PLAYWRIGHT||require('node:path').join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.local','agent-verification');
const checks=[],errors=[],requests=[],connectionRequests=[];
let browser,page,preview,mock,automaticRequests=0,automaticCanceled=false;
const call=(name,args,id)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
async function listen(server){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${server.address().port}`;}
async function check(name,run){await run();checks.push(name);console.log('PASS '+name);}
async function ask(question){await page.locator('#agent-question').fill(question);await page.locator('#agent-send').click();}
async function completed(){await page.locator('#agent-status').filter({hasText:'回答完成'}).waitFor({timeout:15000});}
async function agentAction(action){await page.locator('[data-menu-toggle="agent-conversation-menu"]').click();await page.locator('[data-agent-action="'+action+'"]').click();}
async function main(){
  await fs.mkdir(output,{recursive:true});
  mock=http.createServer(async(req,res)=>{
    if(req.method==='GET'&&req.url==='/v1/models'){connectionRequests.push({url:req.url});res.setHeader('Content-Type','application/json');if(req.headers.authorization!=='Bearer synthetic-test-key'){res.writeHead(401);res.end('synthetic-test-key MUST NOT APPEAR');return;}res.end(JSON.stringify({data:[{id:'mock-model'}]}));return;}
    const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks));requests.push({url:req.url,body,authorization:req.headers.authorization});
    const messages=body.messages||[],user=messages.findLastIndex(m=>m.role==='user'),question=messages[user]?.content||'';
    if(messages[0]?.content.includes('Galgame 自动对话')){
      automaticRequests++;
      if(automaticRequests===2){res.on('close',()=>{automaticCanceled=true;});return;}
      const extra=Array.from({length:8},(_,i)=>'她接着讲第 '+(i+3)+' 句。');
      const result={lines:[...(automaticRequests===1?['红莉栖先聊棋局。','她又说了一句。']:['那就接着聊时间旅行。','还可以换个角度看。']),...extra],recap:'从棋局聊到时间旅行。'};
      if(messages[0].content.includes('加入 "choices"')){
        result.lines=['说到时间旅行，我想到一个挺麻烦的问题。',...extra,'如果能见到十年后的自己，你最想问什么？'];
        result.choices=['先聊时间悖论。','问未来的自己过得怎么样。','先聊点轻松的。'];
      }
      res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}));return;
    }
    if(question==='等等，聊时间旅行吧。'){
      res.end(JSON.stringify({choices:[{message:{content:'行，那就换到时间旅行。'}}]}));return;
    }
    if(question==='问未来的自己过得怎么样。'){
      res.end(JSON.stringify({choices:[{message:{content:'这个问题倒是比问彩票号码认真多了。'}}]}));return;
    }
    if(/测试林|环形磁芯/.test(question)){
      res.end(JSON.stringify({choices:[{message:{content:'That fits our earlier discussion.'}}]}));return;
    }
    if(question.includes('慢请求'))return;
    if(question.includes('鉴权错误')){res.writeHead(401);res.end('synthetic-test-key MUST NOT APPEAR');return;}
    const results=messages.slice(user+1).filter(m=>m.role==='tool').map(m=>JSON.parse(m.content));let message;
    if(!results.length)message={tool_calls:[call('search_library',{query:'高熵'},'s1')]};
    else if(results.length===1)message={tool_calls:[call('read_papers',{ids:results[0].papers.map(p=>p.id)},'r1')]};
    else if(results.length===2)message={tool_calls:[call('compare_parameters',{name:'屈服强度',ids:results[0].papers.map(p=>p.id)},'c1')]};
    else message={content:['## 研究结论','','**原始观测**需要按单位与测试条件区分。',results[0].papers.map(p=>'['+p.id+']').join(' '),'','- 保留样品与来源','- 不直接混合不同单位','','| 样品 | 屈服强度 | 条件 |','| --- | ---: | --- |','| A | 1000 MPa | 室温 |','| B | 1.1 GPa | 高温 |','','> 下表仅为模拟服务验证内容。','','[资料链接](https://example.com/research)','','```js','const citation = "[p1]";','```','','<img src=x onerror="window.agentUnsafe=true">'].join('\n')};
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{finish_reason:message.tool_calls?'tool_calls':'stop',message}]}));
  });
  const mockUrl=await listen(mock);
  const {createPreviewServer}=await import(pathToFileURL(path.join(root,'server.mjs')).href);preview=createPreviewServer();const appUrl=await listen(preview);
  const executable=process.env.MATERIA_CHROME||path.join(process.env['ProgramFiles(x86)']||'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe');
  browser=await chromium.launch({headless:true,executablePath:executable});page=await browser.newPage({viewport:{width:1395,height:960}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(appUrl);await page.locator('.import-main:not([disabled])').waitFor({state:'attached'});
  await page.evaluate(async()=>{
    const s=await import('/storage.js');
    const m=(value,unit,conditions)=>({id:'m1',name:'屈服强度',value,unit,conditions,source:'Synthetic fixture',sample:'S1',qualifier:'',uncertainty:null});
    await s.putPapers([{id:'p1',title:'高熵合金 A（验证样本）',authors:'Ada',authorDetails:[],year:'2024',journal:'Test Journal',tags:['合金'],measurements:[m(1000,'MPa','室温')],filename:'a.pdf',addedAt:1},{id:'p2',title:'高熵合金 B（验证样本）',authors:'Bo',authorDetails:[],year:'2025',journal:'Test Journal',tags:['合金'],measurements:[m(1.1,'GPa','高温')],filename:'b.pdf',addedAt:2}]);
    await s.setSetting('notes',{'paper:p1':[{id:'n1',body:'用于研究助手界面测试的合成笔记',createdAt:1,updatedAt:1}]});
  });await page.reload();await page.locator('.import-main:not([disabled])').waitFor({state:'attached'});
  await check('ribbon entry opens a usable settings panel',async()=>{
    await page.locator('.workspace-ribbon [data-action="ai-agent"]').click();await page.locator('#agent-provider').selectOption('custom');await page.locator('#agent-model').waitFor();
    assert.equal(await page.locator('#agent-remember').isDisabled(),true);
    await page.locator('#agent-base-url').fill(mockUrl+'/v1');await page.locator('#agent-model').fill('mock-model');await page.locator('#agent-key').fill('synthetic-test-key');await page.locator('#agent-config-form button[type="submit"]').click();
    await page.locator('#agent-status').filter({hasText:'设置已保存'}).waitFor();assert.equal(await page.locator('#agent-key').inputValue(),'');
    const prefs=await page.evaluate(async()=>(await import('/storage.js')).getSetting('agentPreferences'));assert.ok(!JSON.stringify(prefs).includes('synthetic-test-key'));
  });
  await check('connection test reuses a saved key, tests unsaved replacements without changing config, and reports redacted 401 diagnostics',async()=>{
    await agentAction('settings');const before=requests.length;await page.locator('[data-agent-action="test-connection"]').click();await page.locator('#agent-connection-status').filter({hasText:'连接检测通过'}).waitFor();assert.match(await page.locator('#agent-connection-status').innerText(),/已附带密钥/);assert.equal(connectionRequests.length,1);assert.equal(requests.length,before);
    await page.locator('#agent-key').fill('provider-secret');await page.locator('[data-agent-action="test-connection"]').click();await page.locator('#agent-connection-status').filter({hasText:'HTTP 401'}).waitFor();assert.equal(connectionRequests.length,2);assert.ok(!(await page.locator('#agent-connection-status').innerText()).includes('synthetic-test-key'));assert.ok(!(await page.locator('#agent-connection-status').innerText()).includes('provider-secret'));
    await page.locator('#agent-key').fill('');await page.locator('[data-agent-action="test-connection"]').click();await page.locator('#agent-connection-status').filter({hasText:'连接检测通过'}).waitFor();assert.equal(requests.length,before);await agentAction('settings');
  });
  await check('real UI performs search, read and comparison tool rounds and renders safe citations',async()=>{
    await ask('**比较高熵合金**的屈服强度');await completed();assert.equal(requests.length,4);assert.ok(requests.every(r=>r.authorization==='Bearer synthetic-test-key'));
    assert.equal(await page.locator('.agent-assistant').count(),1);assert.equal(await page.locator('.agent-assistant .agent-citation').count(),2);assert.equal(await page.locator('.agent-message img').count(),0);assert.equal(await page.evaluate(()=>Boolean(window.agentUnsafe)),false);
    assert.equal(await page.locator('.agent-assistant h2').innerText(),'研究结论');assert.equal(await page.locator('.agent-assistant table tbody tr').count(),2);assert.equal(await page.locator('.agent-assistant pre code.language-js').count(),1);assert.equal(await page.locator('.agent-assistant pre .agent-citation').count(),0);assert.equal(await page.locator('.agent-user strong').innerText(),'比较高熵合金');assert.equal(await page.locator('.agent-assistant a').getAttribute('rel'),'noopener noreferrer');
    const output=requests.at(-1).body.messages.filter(m=>m.role==='tool').at(-1).content;assert.ok(output.includes('MPa')&&output.includes('GPa')&&output.includes('室温')&&output.includes('高温'));
    await page.screenshot({path:path.join(outputDir(),'agent-research.png')});
  });
  await check('citation opens the actual document detail and conversation remains available',async()=>{
    await page.locator('#search').fill('no matching literature');await page.waitForTimeout(180);await page.locator('.agent-stage-answer .agent-citation').first().click();assert.equal(await page.locator('#search').inputValue(),'');assert.equal(await page.locator('#ai-agent-panel').isHidden(),true);await page.locator('#detail-panel').filter({hasText:'高熵合金 A'}).waitFor();
    await page.locator('.workspace-ribbon [data-action="ai-agent"]').click();assert.equal(await page.locator('.agent-assistant').count(),1);
  });
  await check('empty selected scope blocks network requests and keeps the question',async()=>{
    // Citation opened p1, so clear it by navigating to the library before selecting scope.
    await page.locator('[data-agent-action="close"]').click();await page.locator('.view-tabs [data-view="list"]').click();await page.locator('#search').fill('no-matching-fixture');await page.locator('#detail-panel.detail-empty').waitFor({state:'attached'});await page.locator('.workspace-ribbon [data-action="ai-agent"]').click();
    await page.locator('#agent-scope').selectOption('selected');const before=requests.length;await ask('仅比较选中');await page.locator('#agent-status').filter({hasText:'请先在文献列表'}).waitFor();assert.equal(requests.length,before);
  });
  await check('selected-scope tool results contain only checked literature',async()=>{
    await page.locator('[data-agent-action="close"]').click();await page.locator('#search').fill('');await page.locator('[data-select="p1"]').click();await page.locator('.workspace-ribbon [data-action="ai-agent"]').click();const before=requests.length;
    await ask('比较所选高熵合金');await completed();const latest=requests.slice(before);assert.equal(latest.length,4);
    const search=JSON.parse(latest[1].body.messages.at(-1).content);assert.deepEqual(search.papers.map(p=>p.id),['p1']);assert.equal(await page.locator('.agent-assistant .agent-citation').count(),1);
  });
  await check('follow-up keeps conversation and stopping re-enables the composer',async()=>{
    await ask('慢请求，请继续');await page.locator('[data-agent-action="stop"]').waitFor();assert.ok((await page.locator('.agent-user').count())>=2);
    await page.locator('[data-agent-action="stop"]').click();await page.locator('#agent-status').filter({hasText:'已停止'}).waitFor();await page.locator('#agent-send:not([disabled])').waitFor();assert.equal(await page.locator('#agent-send').isEnabled(),true);
  });
  await check('service failures are actionable and do not display API secrets',async()=>{
    await ask('鉴权错误');await page.locator('.agent-error').filter({hasText:'HTTP 401'}).waitFor({state:'attached'});await page.locator('#agent-send:not([disabled])').waitFor();assert.ok(!(await page.locator('.agent-messages').innerText()).includes('synthetic-test-key'));
  });
  await check('reload restores Markdown history, references and original selected scope; follow-up uses that conversation',async()=>{
    await page.reload();await page.locator('.import-main:not([disabled])').waitFor({state:'attached'});await page.locator('.workspace-ribbon [data-action="ai-agent"]').click();
    await page.locator('.agent-assistant table').waitFor({state:'attached'});assert.equal(await page.locator('#agent-scope').inputValue(),'selected');assert.equal(await page.locator('.agent-assistant .agent-citation').count(),1);assert.equal(await page.locator('.agent-user').count(),3);
    await page.locator('[data-agent-action="close"]').click();await page.locator('.view-tabs [data-view="list"]').click();await page.locator('[data-select="p2"]').click();await page.locator('.workspace-ribbon [data-action="ai-agent"]').click();
    const before=requests.length;await ask('继续历史对话，解释测试条件');await completed();
    const first=requests[before].body.messages;assert.ok(first.some(m=>m.role==='user'&&m.content==='比较所选高熵合金'));assert.ok(first.some(m=>m.role==='assistant'));
    const results=JSON.parse(requests[before+1].body.messages.at(-1).content);assert.deepEqual(results.papers.map(p=>p.id),['p1']);
  });
  await check('history lists, searches and resumes separate conversations without network activity',async()=>{
    const before=requests.length;await page.locator('[data-agent-action="new"]').click();await agentAction('history');await page.locator('[data-history-open]').first().waitFor();
    assert.equal(await page.locator('[data-history-open]').count(),2);await page.locator('#agent-history-search').fill('比较所选高熵合金');assert.equal(await page.locator('[data-history-open]').count(),1);
    await page.screenshot({path:path.join(outputDir(),'agent-chat-history.png')});await page.locator('[data-history-open]').click();await page.locator('#agent-status').filter({hasText:'已恢复历史聊天'}).waitFor();assert.equal(await page.locator('.agent-assistant').count(),2);assert.equal(requests.length,before);
  });
  await check('narrow layout stays inside the viewport and Escape restores ribbon focus',async()=>{
    await page.setViewportSize({width:1000,height:720});await page.locator('[data-agent-action="new"]').click();await agentAction('settings');
    const bounds=await page.locator('#ai-agent-panel').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=1000&&bounds.y+bounds.height<=720);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(output,'agent-settings-1000.png')});await page.locator('#agent-model').press('Escape');assert.equal(await page.locator('#ai-agent-panel').isHidden(),true);assert.equal(await page.evaluate(()=>document.activeElement?.dataset.action),'ai-agent');
  });
  await check('settings shares one panel for service and role controls',async()=>{
    await page.locator('.workspace-ribbon [data-action="ai-agent"]').click();
    const settings=page.locator('#agent-settings'),service=settings.locator('#agent-service-page'),role=settings.locator('#agent-role-page');
    if(await settings.getAttribute('open')!==null)await settings.locator('summary').click();
    await page.locator('[data-character="settings"]').click();
    assert.equal(await service.isVisible(),true);assert.equal(await role.isHidden(),true);
    await settings.locator('[data-agent-settings-tab="role"]').click();
    assert.equal(await service.isHidden(),true);assert.equal(await role.locator('[name="personality"]').isVisible(),true);
    assert.equal(await role.locator('[data-character="motion"]').isVisible(),true);
    assert.equal(await page.locator('.agent-character-tools [data-character="edit"],.agent-character-tools [data-character="context"]').count(),0);
    await page.screenshot({path:path.join(output,'agent-role-settings-1000.png')});
    await settings.locator('[data-agent-settings-tab="service"]').click();
    assert.equal(await service.locator('#agent-model').inputValue(),'mock-model');
    await settings.locator('summary').click();
    assert.equal(await settings.getAttribute('open'),null);
  });
  await check('refresh restores model settings and history while keeping the browser key session-only',async()=>{
    await page.reload();await page.locator('.import-main:not([disabled])').waitFor({state:'attached'});await page.locator('.workspace-ribbon [data-action="ai-agent"]').click();await agentAction('settings');
    assert.equal(await page.locator('#agent-model').inputValue(),'mock-model');assert.equal(await page.locator('#agent-key').inputValue(),'');assert.ok(!(await page.locator('#agent-key').getAttribute('placeholder')).includes('已有密钥'));assert.equal(await page.locator('.agent-message').count(),0);
    await agentAction('settings');await agentAction('history');await page.locator('#agent-history-search').fill('');assert.equal(await page.locator('[data-history-open]').count(),2);
  });
  await check('confirmed deletion persists across refresh and keeps the other conversation intact',async()=>{
    const remove=page.getByRole('button',{name:'删除聊天：比较高熵合金的屈服强度',exact:true});await remove.click();await remove.click();await page.locator('#agent-status').filter({hasText:'已删除'}).waitFor();assert.equal(await page.locator('[data-history-open]').count(),1);
    await page.reload();await page.locator('.import-main:not([disabled])').waitFor({state:'attached'});await page.locator('.workspace-ribbon [data-action="ai-agent"]').click();await agentAction('history');assert.equal(await page.locator('[data-history-open]').count(),1);
    await page.locator('[data-history-open]').click();await page.locator('.agent-assistant table').first().waitFor({state:'attached'});assert.equal(await page.locator('.agent-assistant').count(),2);
  });
  await check('Amadeus plays one line at a time, pauses, yields to an interruption, resumes, and saves only displayed dialogue',async()=>{
    await page.clock.install();
    await page.evaluate(()=>{Math.random=()=>0.5;});
    await page.locator('[data-character="new"]').click();
    await page.locator('#agent-scope').selectOption('all');
    const autoplay=page.locator('[data-character="autoplay"]'),stage=page.locator('.agent-stage-answer');
    const line=text=>stage.filter({hasText:text}).waitFor({timeout:5000});
    await autoplay.click();await line('红莉栖先聊棋局。');
    assert.equal(automaticRequests,1);assert.equal(requests.at(-1).body.tools,undefined);
    assert.equal(await page.locator('.agent-message').count(),1);
    const log=page.locator('#agent-log'),logButton=page.locator('[data-character="log"]');
    await logButton.click();
    assert.equal(await autoplay.getAttribute('aria-pressed'),'true');
    assert.ok((await log.boundingBox()).x>500);
    assert.notEqual(await log.evaluate(el=>getComputedStyle(el).backdropFilter),'none');
    await autoplay.click();await page.clock.fastForward(13000);
    assert.equal(await autoplay.getAttribute('aria-pressed'),'false');assert.equal(await page.locator('.agent-message').count(),1);
    await autoplay.click();await line('她又说了一句。');assert.equal(automaticRequests,1);
    assert.equal(await log.isVisible(),true);
    await log.getByRole('button',{name:'关闭记录'}).click();
    assert.equal(await autoplay.getAttribute('aria-pressed'),'true');
    for(let i=3;i<=10;i++){await page.clock.fastForward(9000);await line('她接着讲第 '+i+' 句。');}
    await page.clock.fastForward(9000);
    await page.locator('#agent-status').filter({hasText:'她停下来等你接话'}).waitFor();
    assert.equal(await page.locator('.agent-message').count(),10);
    assert.equal(await autoplay.getAttribute('aria-pressed'),'false');
    assert.equal(automaticRequests,1);
    const next=page.waitForRequest(req=>req.url().endsWith('/api/ai-agent/complete')&&req.postDataJSON()?.companion===true);
    await autoplay.click();await next;
    await page.locator('#agent-status').filter({hasText:'正在准备下一句'}).waitFor();
    await ask('等等，聊时间旅行吧。');await line('行，那就换到时间旅行。');await completed();
    assert.equal(automaticCanceled,true);
    assert.ok(requests.at(-1).body.messages.some(m=>m.role==='assistant'&&m.content==='她又说了一句。'));
    await page.clock.fastForward(9000);await line('那就接着聊时间旅行。');
    const context=JSON.parse(requests.at(-1).body.messages.at(-1).content);
    assert.ok(context.recent.some(m=>m.role==='user'&&m.content==='等等，聊时间旅行吧。'));
    assert.ok(context.recap.includes('棋局'));
    await page.locator('[data-agent-action="close"]').click();await page.clock.fastForward(18000);
    const saved=await page.evaluate(async()=>(await import('/storage.js')).getSetting('agentChatHistory'));
    const chat=saved.conversations.find(c=>c.id===saved.activeId);
    assert.deepEqual(chat.entries.map(m=>[m.role,m.content,m.automatic??false]),[
      ['assistant','红莉栖先聊棋局。',true],['assistant','她又说了一句。',true],
      ...Array.from({length:8},(_,i)=>['assistant','她接着讲第 '+(i+3)+' 句。',true]),
      ['user','等等，聊时间旅行吧。',false],['assistant','行，那就换到时间旅行。',false],['assistant','那就接着聊时间旅行。',true],
    ]);
    assert.equal(automaticRequests,3);
    await page.reload();await page.locator('.import-main:not([disabled])').waitFor({state:'attached'});
    await page.locator('.workspace-ribbon [data-action="ai-agent"]').click();await line('那就接着聊时间旅行。');
    assert.equal(await autoplay.getAttribute('aria-pressed'),'false');assert.equal(await page.locator('.agent-message').count(),13);
  });
  await check('an automatic choice waits without pausing and lets the chosen reply continue the scene',async()=>{
    const autoplay=page.locator('[data-character="autoplay"]'),options=page.locator('.agent-scene-choices');
    const before=automaticRequests;
    await page.evaluate(()=>{Math.random=()=>0.01;});
    await autoplay.click();
    await page.locator('.agent-stage-answer').filter({hasText:'我想到一个挺麻烦的问题'}).waitFor();
    await page.locator('[data-character="log"]').click();
    for(let i=0;i<9;i++)await page.clock.fastForward(9000);
    await options.getByRole('button').last().waitFor();
    assert.equal(await options.getByRole('button').count(),3);
    await page.clock.fastForward(45000);
    assert.equal(automaticRequests,before+1);
    assert.equal(await autoplay.getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#agent-log .agent-past-choices li').count(),3);
    await page.screenshot({path:path.join(output,'agent-automatic-choice-log.png')});
    const messages=page.locator('#agent-messages');
    assert.ok(await messages.evaluate(el=>el.scrollTop>0));
    await messages.evaluate(el=>{el.scrollTop=0;});
    await page.locator('#agent-question').fill('这一句我想留着');
    await options.getByRole('button',{name:'问未来的自己过得怎么样。'}).click();
    await page.locator('.agent-stage-answer').filter({hasText:'比问彩票号码认真多了'}).waitFor();
    assert.equal(await page.locator('#agent-question').inputValue(),'这一句我想留着');
    await page.evaluate(()=>{Math.random=()=>0.5;});
    await page.clock.fastForward(9000);
    await page.locator('.agent-stage-answer').filter({hasText:'那就接着聊时间旅行。'}).waitFor();
    assert.equal(automaticRequests,before+2);
    assert.equal(await messages.evaluate(el=>el.scrollTop),0);
    await autoplay.click();
  });
  await check('completed chats are automatically indexed, searchable canon is separate, and reply language carries across chats',async()=>{
    await page.locator('[data-character="new"]').click();
    await ask('我叫测试林，最近在研究环形磁芯退火。');await completed();
    const before=requests.length;
    const saved=await page.evaluate(async()=>(await import('/storage.js')).getSetting('agentChatHistory'));
    assert.ok(saved.characterMemory.roles['makise-kurisu'].episodes.some(item=>item.chatId===saved.activeId));
    await page.locator('[data-character="settings"]').click();
    await page.locator('[data-agent-settings-tab="memory"]').click();
    await page.locator('#agent-memory-episodes').filter({hasText:'测试林'}).waitFor();
    await page.locator('[data-agent-settings-tab="language"]').click();
    await page.locator('#agent-reply-language').selectOption('en');
    await page.locator('#agent-status').filter({hasText:'回复语言已保存'}).waitFor();
    assert.equal(requests.length,before);
    if(await fs.access(path.join(root,'dist/assets/characters/makise-kurisu/corpus.json')).then(()=>true,()=>false)){
      await page.locator('[data-agent-settings-tab="memory"]').click();
      await page.locator('#agent-corpus-status').filter({hasText:/19,?772/}).waitFor();
      await page.locator('#agent-corpus-query').fill('プリン');
      await page.locator('#agent-corpus-form button').click();
      await page.locator('#agent-corpus-results li').first().waitFor();
      assert.match(await page.locator('#agent-corpus-results').innerText(),/pudding/i);
    }
    await page.locator('[data-character="settings"]').click();
    await page.locator('[data-character="new"]').click();
    await ask('你还记得环形磁芯退火吗？');await completed();
    assert.match(requests.at(-1).body.messages[0].content,/测试林/);
    assert.match(requests.at(-1).body.messages[0].content,/使用 English/);
    await page.locator('[data-character="settings"]').click();
    await page.locator('[data-agent-settings-tab="language"]').click();
    assert.equal(await page.locator('#agent-reply-language').inputValue(),'en');
  });
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(output,'report.json'),JSON.stringify({passed:checks.length,checks,pageErrors:errors,mockRequests:requests.length},null,2));
}
function outputDir(){return output;}
main().catch(async error=>{console.error(error);process.exitCode=1;await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({error:error.stack,checks,errors},null,2));await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}).finally(async()=>{await browser?.close();for(const server of [preview,mock])if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}});
