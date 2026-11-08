// Isolated browser verification with synthetic literature and a local mock AI service.
const {chromium}=require(process.env.MATERIA_PLAYWRIGHT||require('node:path').join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.local','agent-verification');
const checks=[],errors=[],requests=[],connectionRequests=[];
let browser,page,preview,mock;
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
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(output,'report.json'),JSON.stringify({passed:checks.length,checks,pageErrors:errors,mockRequests:requests.length},null,2));
}
function outputDir(){return output;}
main().catch(async error=>{console.error(error);process.exitCode=1;await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({error:error.stack,checks,errors},null,2));await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}).finally(async()=>{await browser?.close();for(const server of [preview,mock])if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}});
