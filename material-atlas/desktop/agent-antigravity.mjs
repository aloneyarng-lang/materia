import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {access,mkdir,readFile,rename,unlink,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import https from 'node:https';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const links=new Map();
const sessionId=value=>typeof value==='string'&&/^[a-z\d_-]{1,120}$/i.test(value);

// Save only the client conversation ID, keyed by library, chat and service.
export class AntigravityChatLinks {
  constructor(profile){
    this.file=path.join(profile,'antigravity-chat-links.json');
    this.records=null;
    this.queue=Promise.resolve();
  }
  async forChat(libraryRoot,chatId,config,scopeIds){
    if(!sessionId(chatId))return {};
    await this.queue;
    if(!this.records){
      let saved={};
      try{saved=JSON.parse(await readFile(this.file,'utf8'));}catch{}
      this.records=new Map(Object.entries(saved||{}).filter(([key,id])=>/^[a-f\d]{64}$/.test(key)&&sessionId(id)).slice(-1000));
    }
    const key=createHash('sha256').update(JSON.stringify([libraryRoot,chatId,config.clientPath,config.model,scopeIds])).digest('hex');
    return {
      previousId:this.records.get(key),
      remember:async id=>{
        this.records.delete(key);
        if(id)this.records.set(key,id);
        if(this.records.size>1000)this.records.delete(this.records.keys().next().value);
        const snapshot=Object.fromEntries(this.records);
        const operation=this.queue.then(async()=>{
          const temp=this.file+'.'+randomUUID()+'.tmp';
          await mkdir(path.dirname(this.file),{recursive:true});
          try{await writeFile(temp,JSON.stringify(snapshot),{mode:0o600});await rename(temp,this.file);}
          catch(error){await unlink(temp).catch(()=>{});throw error;}
        });
        this.queue=operation.catch(()=>{});
        await this.queue;
      }
    };
  }
}

// The desktop client owns login. Its ephemeral local CSRF token stays in memory;
// no OAuth tokens, account databases or API keys are read or persisted here.
export function cleanAntigravityConfig(value={}){
  const clientPath=String(value.clientPath||'').trim(),model=String(value.model||'').trim();
  if(clientPath.length>2000||/[\r\n\0]/.test(clientPath)||clientPath&&(!path.isAbsolute(clientPath)||!/^Antigravity\.exe$/i.test(path.basename(clientPath))))throw Error('请选择反重力桌面客户端的 Antigravity.exe。');
  if(model.length>200||model&&!/^[a-z\d][a-z\d._:/+@~-]*$/i.test(model))throw Error('反重力模型 ID 无效，请重新检测客户端并选择模型。');
  return{connection:'antigravity',provider:'antigravity',baseUrl:'',protocol:'antigravity',model,clientPath,apiKey:'',rememberKey:false};
}
export async function findAntigravity(explicit='',env=process.env){
  if(explicit){cleanAntigravityConfig({clientPath:explicit});try{await access(explicit);return explicit;}catch{throw Error('找不到反重力客户端，请重新选择程序。');}}
  const candidates=[env.LOCALAPPDATA&&path.join(env.LOCALAPPDATA,'Programs','antigravity','Antigravity.exe'),env.ProgramFiles&&path.join(env.ProgramFiles,'Antigravity','Antigravity.exe')].filter(Boolean);
  for(const file of candidates)try{await access(file);return file;}catch{}
  throw Error('未找到反重力客户端，请点击“选择程序”指定 Antigravity.exe。');
}
const processQuery=`$items=@();Get-CimInstance Win32_Process -Filter "Name = 'language_server.exe'" -ErrorAction Stop | ForEach-Object { $p=$_; if($p.CommandLine -match '--override_ide_name[= ]+antigravity') { $m=[regex]::Match($p.CommandLine,'--csrf_token[= ]+([^ "]+)'); if($m.Success) { $ports=@(Get-NetTCPConnection -OwningProcess $p.ProcessId -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort -Unique);$items+=@{pid=$p.ProcessId;token=$m.Groups[1].Value;ports=$ports;binary=$p.ExecutablePath} } } };ConvertTo-Json -InputObject @($items) -Compress`;
export async function discoverAntigravity({signal,exec=promisify(execFile)}={}){
  signal?.throwIfAborted();if(process.platform!=='win32')throw Error('当前桌面客户端直连暂支持 Windows。');
  let rows;
  try{const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',processQuery],{windowsHide:true,timeout:12000,maxBuffer:200000,signal});rows=JSON.parse(stdout);}
  catch{signal?.throwIfAborted();throw Error('无法检测反重力进程，请打开客户端后重试。');}
  return (Array.isArray(rows)?rows:[]).flatMap(row=>Number.isInteger(row.pid)&&typeof row.token==='string'&&/^[a-z\d-]{16,150}$/i.test(row.token)&&typeof row.binary==='string'?(row.ports||[]).filter(p=>Number.isInteger(p)&&p>0&&p<65536).map(port=>({port,token:row.token,pid:row.pid,clientPath:path.resolve(path.dirname(row.binary),'../..','Antigravity.exe')})):[]);
}
export function antigravityRPC(connection,method,body={},signal){
  signal?.throwIfAborted();
  return new Promise((resolve,reject)=>{
    let raw='',size=0;const decoder=new TextDecoder();
    // Self-signed TLS is accepted only for this authenticated loopback request.
    const request=https.request({host:'127.0.0.1',port:connection.port,path:'/exa.language_server_pb.LanguageServerService/'+method,method:'POST',rejectUnauthorized:false,headers:{'Content-Type':'application/json','connect-protocol-version':'1','x-codeium-csrf-token':connection.token},signal,timeout:12000},response=>{
      response.on('data',chunk=>{size+=chunk.length;if(size>4*1024*1024){request.destroy(Error('反重力返回内容过大。'));return;}raw+=decoder.decode(chunk,{stream:true});});
      response.on('error',()=>reject(Error('反重力连接已中断，请重新检测客户端。')));
      response.on('end',()=>{
        if(response.statusCode!==200){
          let code;try{code=JSON.parse(raw).code;}catch{}
          const expired=response.statusCode===401||response.statusCode===403;
          reject(Object.assign(Error(expired?'反重力连接已失效，请重新检测客户端。':'反重力客户端不支持此对话请求，请检测连接或更新客户端。'),{code:expired?'stale_connection':code}));
          return;
        }
        try{resolve(JSON.parse(raw+decoder.decode()));}catch{reject(Error('反重力客户端返回格式无效。'));}
      });
    });
    request.on('timeout',()=>request.destroy());
    request.on('error',()=>reject(signal?.aborted?new DOMException('已停止生成。','AbortError'):Object.assign(Error('无法连接反重力客户端，请保持客户端打开并登录后重新检测。'),{code:'stale_connection'})));
    request.end(JSON.stringify(body));
  });
}
export function antigravityModels(status){
  const rows=status?.userStatus?.cascadeModelConfigData?.clientModelConfigs||[];
  return rows.filter(row=>!row.disabled&&typeof row.label==='string'&&row.modelOrAlias&&(row.modelId||row.modelOrAlias.model||row.modelOrAlias.alias)).map(row=>({id:String(row.modelId||row.modelOrAlias.model||row.modelOrAlias.alias),name:row.label.slice(0,200),selector:row.modelOrAlias,remaining:typeof row.quotaInfo?.remainingFraction==='number'?Math.max(0,Math.min(1,row.quotaInfo.remainingFraction)):null}));
}
async function connect(value,options={}){
  const config=cleanAntigravityConfig(value),rpc=options.rpc||antigravityRPC;
  const cacheable=!options.rpc&&!options.discover;
  const key=config.clientPath.toLowerCase(),cached=cacheable?links.get(key):null;
  if(!options.refresh&&cached&&Date.now()<cached.until)return cached;
  const rows=await(options.discover||discoverAntigravity)(options);
  const candidates=rows.filter(row=>!config.clientPath||path.resolve(row.clientPath).toLowerCase()===path.resolve(config.clientPath).toLowerCase());
  const probes=new AbortController(),signal=AbortSignal.any([probes.signal,...(options.signal?[options.signal]:[])]);
  try{
    const linked=await Promise.any(candidates.map(async connection=>{
      const status=await rpc(connection,'GetUserStatus',{},signal);
      const models=antigravityModels(status);
      if(!status.userStatus)throw Error('not a client');
      if(!models.length)throw Error('反重力尚未提供可用模型，请在客户端登录后重试。');
      return{connection,models,rpc,until:Date.now()+5*60*1000};
    }));
    if(cacheable){links.set(key,linked);links.set(linked.connection.clientPath.toLowerCase(),linked);}
    return linked;
  }catch(error){
    options.signal?.throwIfAborted();
    const loggedOut=error.errors?.find(item=>/尚未提供/.test(item.message));
    if(loggedOut)throw loggedOut;
    throw Error('未连接到运行中的反重力客户端。请先打开并登录反重力，再点击“检测客户端”。');
  }finally{
    probes.abort();
  }
}
export async function inspectAntigravity(value={},options={}){
  const {connection,models}=await connect(value,{...options,refresh:true});
  return{ok:true,clientPath:connection.clientPath,models:models.map(({selector,...row})=>row),message:'已连接反重力桌面客户端，模型列表与额度已读取。使用现有客户端账号，无需 API 密钥。'};
}
export function readAntigravityReply(text,tools=[]){
  let value;try{value=JSON.parse(text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/,'$1'));}catch{
    if(!text.trim()||text.length>60000)throw Error('反重力未返回有效回答。');
    return{content:text,tool_calls:[]};
  }
  if(typeof value?.content!=='string'||value.content.length>60000||!Array.isArray(value.tool_calls)||value.tool_calls.length>8)throw Error('反重力返回内容无效，请重新提问。');
  const names=new Set(tools.map(t=>t.name)),ids=new Set();
  const calls=value.tool_calls.map(call=>{
    if(!names.has(call.name)||typeof call.id!=='string'||!call.id||call.id.length>200||ids.has(call.id)||typeof call.arguments!=='string'||call.arguments.length>20000)throw Error('反重力返回了无效的文献检索请求。');
    ids.add(call.id);let args;try{args=JSON.parse(call.arguments);}catch{throw Error('反重力检索参数格式无效。');}if(!args||Array.isArray(args)||typeof args!=='object')throw Error('反重力检索参数无效。');
    return{id:call.id,type:'function',function:{name:call.name,arguments:call.arguments}};
  });
  if(!value.content.trim()&&!calls.length)throw Error('反重力未返回回答，请重试。');
  return{content:value.content,tool_calls:calls};
}
export function createAntigravityCompletion(value,options={}){
  const config=cleanAntigravityConfig(value);
  let session,stepOffset=0,sentCount=0,attached=false;
  return async({messages,tools=[],signal})=>{
    const combined=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(options.timeout||120000)]);
    let waiting=false;
    try{
      if(!session){
        let linked=await connect(config,{...options,signal:combined});
        let id=options.previousId;
        if(id){
          // Establish the baseline before sending. After a restart or canceled
          // turn the trajectory may contain steps Materia has not seen.
          const inspect=()=>linked.rpc(linked.connection,'GetCascadeTrajectory',{cascadeId:id},combined);
          try{
            let state;
            try{state=await inspect();}catch(error){
              if(error.code!=='stale_connection')throw error;
              linked=await connect(config,{...options,signal:combined,refresh:true});
              state=await inspect();
            }
            if(!state.trajectory)id=undefined;
            else{
              if(!isIdle(state.status))throw Error('这段反重力对话仍在生成，请稍后再发送。');
              stepOffset=state.trajectory.steps?.length||0;
              attached=stepOffset>0;
            }
          }catch(error){if(error.code!=='not_found')throw error;id=undefined;}
        }
        const selected=config.model?linked.models.find(m=>m.id===config.model):linked.models.find(m=>m.remaining===null||m.remaining>0)||linked.models[0];
        if(!selected)throw Error('所选反重力模型已不可用，请重新检测并选择模型。');
        if(selected.remaining===0)throw Error('所选反重力模型的额度已用完，请更换模型或等待额度恢复。');
        const cascadeConfig={plannerConfig:{requestedModel:selected.selector,toolConfig:{forceDisableToolCalling:true},customAgent:{toolNames:[]}}};
        if(!id){
          const started=await linked.rpc(linked.connection,'StartCascade',{source:'CORTEX_TRAJECTORY_SOURCE_CASCADE_CLIENT',customAgentSpec:{customTools:[],mcpServers:[],commandExecutionPolicy:'off',cascadeConfig}},combined);
          id=started.cascadeId;
          if(!sessionId(id))throw Error('反重力未能建立对话，请更新客户端后重试。');
          // Update the in-memory link immediately and save in the background.
          void options.remember?.(id);
        }
        session={...linked,id,cascadeConfig};
      }
      const protocol='只输出 JSON 对象 {"content":"回答文本","tool_calls":[]}。直接回答时 tool_calls 留空。需要检索时将工具调用写为 {"id":"唯一标识","name":"工具名","arguments":"JSON字符串"}，由 Materia 执行。不要使用客户端工具，不读写文件，不执行命令。';
      const prompt=sentCount
        ? '这是本轮 Materia 只读检索的结果。根据新结果继续，资料足够就回答。'+protocol+'\n'+JSON.stringify({messages:messages.slice(sentCount+1)})
        : '按本轮 messages 的角色和顺序继续对话，system 为最高优先级。'+protocol+'\n'+JSON.stringify({messages:attached&&!options.fullContext?[messages[0],messages.at(-1)]:messages,tools});
      if(Buffer.byteLength(prompt)>800000)throw Error('上下文过大，请新建对话或缩小文献范围。');
      waiting=true;
      await session.rpc(session.connection,'SendUserCascadeMessage',{cascadeId:session.id,items:[{text:prompt}],cascadeConfig:session.cascadeConfig,blocking:false,clientType:1},combined);
      sentCount=messages.length;
      while(true){
        combined.throwIfAborted();
        const state=await session.rpc(session.connection,'GetCascadeTrajectory',{cascadeId:session.id},combined);
        const steps=state.trajectory?.steps||[],fresh=steps.slice(stepOffset);
        const errors=fresh.filter(step=>step.errorMessage||step.error?.message);
        if(errors.length)throw Error('反重力本次对话失败，请在客户端查看账号额度、模型及网络状态。');
        if(fresh.some(step=>/WAITING|PENDING_APPROVAL/.test(step.status||'')))throw Error('反重力正在等待客户端确认，请在反重力中处理后重试。');
        const responses=fresh.map(step=>step.plannerResponse?.modifiedResponse||step.plannerResponse?.response||'').filter(Boolean);
        if(isIdle(state.status)&&responses.length){stepOffset=steps.length;waiting=false;return readAntigravityReply(responses.at(-1),tools);}
        await delay(options.pollInterval||250,undefined,{signal:combined});
      }
    }catch(error){
      if(error.code==='stale_connection'){links.clear();}
      if(signal?.aborted)throw new DOMException('已停止生成。','AbortError');
      if(combined.aborted)throw Error('反重力本次响应超时，请在客户端检查模型和额度后重试。');
      throw error;
    }
    finally{if(waiting&&session)await session.rpc(session.connection,'CancelCascadeInvocation',{cascadeId:session.id},AbortSignal.timeout(3000)).catch(()=>{});}
  };
}
const isIdle=status=>status==='CASCADE_RUN_STATUS_IDLE'||status===1;
export async function completeWithAntigravity(value,input,options={}){return createAntigravityCompletion(value,options)(input);}
