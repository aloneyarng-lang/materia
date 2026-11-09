import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {AntigravityChatLinks,cleanAntigravityConfig,inspectAntigravity,createAntigravityCompletion,readAntigravityReply,discoverAntigravity} from '../desktop/agent-antigravity.mjs';
import {AgentSettings,normalizeAgentConfig} from '../desktop/agent.mjs';
import {agentCredentialIssue} from '../dist/agent-auth.js';
import {runResearchAgent} from '../dist/ai-agent-core.js';
import {translateVoiceLines} from '../desktop/translation.mjs';

const clientPath=path.resolve('Antigravity.exe'),connection={clientPath,port:12345,token:'ephemeral-local-token',pid:7};
const userStatus={email:'private@example.test',cascadeModelConfigData:{clientModelConfigs:[{label:'Client model',modelId:'client-model',modelOrAlias:{model:'MODEL_PLACEHOLDER_M1'},quotaInfo:{remainingFraction:.75}},{label:'Unavailable',modelId:'disabled',modelOrAlias:{model:'MODEL_DISABLED'},disabled:true}]}};
const discover=async()=>[connection],status=()=>({userStatus});

test('desktop connection needs neither CLI nor API keys and keeps only explicit public configuration',()=>{
  const config=normalizeAgentConfig({connection:'antigravity',clientPath,apiKey:'must-be-discarded',rememberKey:true});
  assert.equal(config.apiKey,'');assert.equal(config.rememberKey,false);assert.equal(config.model,'');assert.equal(agentCredentialIssue(config),'');
  assert.throws(()=>cleanAntigravityConfig({clientPath:path.resolve('agy.exe')}),/桌面客户端/);
  assert.throws(()=>cleanAntigravityConfig({clientPath:'Antigravity.exe'}),/请选择/);
});
test('detection returns current model quotas without account identity, port or local session tokens',async()=>{
  const result=await inspectAntigravity({}, {discover,rpc:async()=>status()});
  assert.deepEqual(result.models,[{id:'client-model',name:'Client model',remaining:.75}]);
  assert.ok(!JSON.stringify(result).includes(userStatus.email));assert.ok(!JSON.stringify(result).includes(connection.token));assert.equal(result.port,undefined);
  await assert.rejects(inspectAntigravity({},{discover:async()=>[]}),/打开并登录/);
});
test('process discovery uses a fixed command and filters unusable process records without returning raw commands',async()=>{
  const rows=await discoverAntigravity({exec:async(file,args,options)=>{
    assert.equal(file,'powershell.exe');assert.equal(options.windowsHide,true);assert.ok(args.at(-1).includes('Get-CimInstance'));
    return{stdout:JSON.stringify([{pid:7,token:'01234567-1234-1234-1234-012345678901',ports:[0,12345,'bad',65536],binary:path.join(path.dirname(clientPath),'resources','bin','language_server.exe')},{pid:'bad',token:'secret',ports:[123]}])};
  }});
  assert.equal(rows.length,1);assert.equal(rows[0].port,12345);assert.equal(rows[0].clientPath,clientPath);
});
test('research reuses its own desktop conversation across tool rounds and preserves scope, sources and choices',async()=>{
  const calls=[],steps=[];let round=0;
  const complete=createAntigravityCompletion({model:'client-model'},{discover,pollInterval:1,rpc:async(c,method,body)=>{
    calls.push({method,body});
    if(method==='GetUserStatus')return status();
    if(method==='StartCascade'){assert.equal(body.customAgentSpec.cascadeConfig.plannerConfig.toolConfig.forceDisableToolCalling,true);return{cascadeId:'owned-session'};}
    if(method==='SendUserCascadeMessage'){
      assert.equal(body.cascadeId,'owned-session');assert.deepEqual(body.cascadeConfig.plannerConfig.requestedModel,{model:'MODEL_PLACEHOLDER_M1'});
      const content=round++===0?JSON.stringify({content:'',tool_calls:[{id:'read-1',name:'read_papers',arguments:'{"ids":["p1"]}'}]}):JSON.stringify({content:'强度为 123 MPa [p1]。\n<materia_choices>["比较条件","查看材料","讨论下一步"]</materia_choices>',tool_calls:[]});
      steps.push({plannerResponse:{response:content}});return{};
    }
    if(method==='GetCascadeTrajectory')return{status:'CASCADE_RUN_STATUS_IDLE',trajectory:{steps:[...steps]}};
    throw Error('Unexpected RPC '+method);
  }});
  const result=await runResearchAgent({question:'查看强度，并给我三个下一步选项',context:{papers:[{id:'p1',title:'授权文献'},{id:'p2',title:'范围外文献'}],scopeIds:['p1']},complete});
  assert.equal(calls.filter(c=>c.method==='StartCascade').length,1);assert.equal(calls.filter(c=>c.method==='SendUserCascadeMessage').length,2);
  assert.match(result.answer,/123 MPa/);assert.deepEqual(result.choices,['比较条件','查看材料','讨论下一步']);assert.deepEqual(result.sources.map(s=>s.id),['p1']);
  assert.ok(!calls.some(c=>JSON.stringify(c.body).includes('范围外文献')));
});
test('a resumed Materia chat reuses the stored client conversation and sends only the new turn',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'materia-agy-link-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const config={model:'client-model',clientPath},steps=[{plannerResponse:{response:'旧回复'}}];
  const original=new AntigravityChatLinks(root);
  await (await original.forChat('library','chat-1',config,null)).remember('owned-session');
  const reopened=new AntigravityChatLinks(root);
  const link=await reopened.forChat('library','chat-1',config,null);
  assert.equal(link.previousId,'owned-session');
  assert.equal((await reopened.forChat('library','chat-2',config,null)).previousId,undefined);
  assert.equal((await reopened.forChat('other-library','chat-1',config,null)).previousId,undefined);
  assert.equal((await reopened.forChat('library','chat-1',config,['p1'])).previousId,undefined);
  const complete=createAntigravityCompletion(config,{...link,discover,rpc:async(_,method,body)=>{
    if(method==='GetUserStatus')return status();
    assert.equal(body.cascadeId,'owned-session');
    if(method==='GetCascadeTrajectory')return{status:'CASCADE_RUN_STATUS_IDLE',trajectory:{steps:[...steps]}};
    if(method==='SendUserCascadeMessage'){
      assert.match(body.items[0].text,/继续上次话题/);
      assert.doesNotMatch(body.items[0].text,/旧回复/);
      steps.push({plannerResponse:{response:'续聊成功'}});
      return{};
    }
    throw Error('Unexpected RPC '+method);
  }});
  const reply=await complete({messages:[{role:'system',content:'系统规则'},{role:'assistant',content:'旧回复'},{role:'user',content:'继续上次话题'}]});
  assert.equal(reply.content,'续聊成功');
});
test('cancel stops only the conversation created by Materia; unavailable models never create a conversation',async()=>{
  const controller=new AbortController(),canceled=[];
  const complete=createAntigravityCompletion({},{discover,rpc:async(c,method,body,signal)=>{
    if(method==='GetUserStatus')return status();if(method==='StartCascade')return{cascadeId:'owned-session'};
    if(method==='SendUserCascadeMessage'){controller.abort();return{};}
    if(method==='CancelCascadeInvocation'){canceled.push(body.cascadeId);return{};}await delay(20,undefined,{signal});
  }});
  await assert.rejects(complete({messages:[],signal:controller.signal}),{name:'AbortError'});assert.deepEqual(canceled,['owned-session']);
  await assert.rejects(createAntigravityCompletion({model:'missing'},{discover,rpc:async()=>status()})({messages:[]}),/已不可用/);
});
test('local adapter rejects unauthorized tool calls and malformed arguments instead of executing native client actions',()=>{
  assert.throws(()=>readAntigravityReply('{"content":"","tool_calls":[{"id":"1","name":"run_command","arguments":"{}"}]}',[]),/无效/);
  assert.throws(()=>readAntigravityReply('{"content":"","tool_calls":[{"id":"1","name":"read_papers","arguments":"[]"}]}',[{name:'read_papers'}]),/参数无效/);
  assert.equal(readAntigravityReply('普通中文回复').content,'普通中文回复');
});
test('voice translation uses the Antigravity text envelope and preserves line alignment',async()=>{
  const lines=['先确认实验条件。','再检查测量误差。'];
  const japanese=['まず実験条件を確認する。','次に測定誤差を調べる。'];
  const config={model:'client-model'};
  const complete=createAntigravityCompletion(config,{discover,rpc:async(_,method,body)=>{
    if(method==='GetUserStatus')return status();
    if(method==='StartCascade')return{cascadeId:'voice-translation'};
    if(method==='SendUserCascadeMessage'){
      const prompt=body.items[0].text;
      const payload=JSON.parse(prompt.slice(prompt.indexOf('\n')+1));
      assert.match(payload.messages[0].content,/日语/);
      assert.deepEqual(JSON.parse(payload.messages[1].content),{lines});
      assert.deepEqual(payload.tools,[]);
      return{};
    }
    if(method==='GetCascadeTrajectory')return{status:'CASCADE_RUN_STATUS_IDLE',trajectory:{steps:[
      {plannerResponse:{response:JSON.stringify({content:JSON.stringify(japanese),tool_calls:[]})}},
    ]}};
    throw Error('Unexpected RPC '+method);
  }});
  assert.deepEqual(await translateVoiceLines(config,{lines,targetLanguage:'ja'},{complete:(_,input)=>complete(input)}),{lines:japanese});
  await assert.rejects(translateVoiceLines(config,{lines,targetLanguage:'ja'},{complete:async()=>({content:'[]'})}),/完整的配音译文/);
});
test('API and desktop profiles survive switching and restart; encrypted API credentials never appear in public state or local profile',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'materia-agy-settings-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const encryption={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s.split('').reverse().join('')),decryptString:b=>b.toString().split('').reverse().join('')};
  const settings=new AgentSettings(root,encryption);await settings.load();
  const api={provider:'deepseek',model:'old-model',apiKey:'synthetic-private-key',rememberKey:true};await settings.save(api);
  await settings.save({connection:'antigravity',clientPath,model:'client-model'});
  assert.equal(settings.publicConfig().profiles.api.hasKey,true);assert.ok(!JSON.stringify(settings.publicConfig()).includes(api.apiKey));
  assert.ok(!(await readFile(settings.file,'utf8')).includes(api.apiKey));
  const reopened=new AgentSettings(root,encryption);await reopened.load();assert.equal(reopened.config.connection,'antigravity');
  await reopened.save({...reopened.publicConfig().profiles.api,apiKey:''});assert.equal(reopened.config.apiKey,api.apiKey);assert.equal(reopened.config.model,'old-model');
  assert.equal(reopened.publicConfig().profiles.antigravity.clientPath,clientPath);
});
