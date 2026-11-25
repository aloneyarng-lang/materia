import {execFile,spawn} from 'node:child_process';
import {access,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createInterface} from 'node:readline';
import {promisify} from 'node:util';

const execFileAsync=promisify(execFile);
const MAX_SESSIONS=16;
const daemons=new Map();
let shuttingDown=false;

export function parseWindowsProxy(regOutput=''){
  if(!/ProxyEnable\s+REG_DWORD\s+0x1\b/i.test(regOutput))return null;
  const match=/ProxyServer\s+REG_SZ\s+([^\r\n]+)/i.exec(regOutput);
  const raw=match?.[1]?.trim();
  if(!raw||/[\s"'`;&|<>]/.test(raw.replace(/;/g,'')))return null;
  const normalize=(addr,defaultScheme='http')=>{
    if(!addr)return '';
    if(/^[a-z][a-z0-9+.-]*:\/\//i.test(addr))return addr;
    return `${defaultScheme}://${addr}`;
  };
  if(raw.includes('=')){
    const pairs=Object.fromEntries(
      raw.split(';').map(part=>part.trim().split('=',2)).filter(kv=>kv.length===2)
    );
    const httpsProxy=pairs.https?normalize(pairs.https,'http'):pairs.http?normalize(pairs.http,'http'):pairs.socks?normalize(pairs.socks,'socks5'):'';
    const httpProxy=pairs.http?normalize(pairs.http,'http'):httpsProxy;
    return httpsProxy?{HTTP_PROXY:httpProxy,HTTPS_PROXY:httpsProxy}:null;
  }
  const url=normalize(raw,'http');
  return {HTTP_PROXY:url,HTTPS_PROXY:url};
}

async function resolveSpawnEnv(baseEnv=process.env){
  const env={...baseEnv};
  if(process.platform!=='win32')return env;
  if(env.HTTPS_PROXY||env.https_proxy||env.HTTP_PROXY||env.http_proxy||env.ALL_PROXY||env.all_proxy)return env;
  try{
    const {stdout}=await execFileAsync('reg.exe',['query','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'],{windowsHide:true,timeout:2000});
    const proxy=parseWindowsProxy(stdout);
    if(proxy){
      env.HTTP_PROXY=proxy.HTTP_PROXY;
      env.HTTPS_PROXY=proxy.HTTPS_PROXY;
      env.NO_PROXY=env.NO_PROXY||env.no_proxy||'127.0.0.1,localhost,::1';
    }
  }catch{}
  return env;
}

export function findAgyBinary(env=process.env){
  const candidates=[
    env.LOCALAPPDATA&&path.join(env.LOCALAPPDATA,'agy','bin','agy.exe'),
    path.join(os.homedir(),'.local','bin',process.platform==='win32'?'agy.exe':'agy'),
  ].filter(Boolean);
  return candidates[0];
}

function killProcessTree(child){
  if(!child||child.killed)return;
  if(process.platform==='win32'&&child.pid){
    try{
      const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
      killer.unref();
      return;
    }catch{}
  }
  try{child.kill();}catch{}
}

function destroyDaemon(daemon,reason){
  if(!daemon||daemons.get(daemon.binary)!==daemon)return;
  daemons.delete(daemon.binary);
  for(const {reject,timer} of daemon.pending.values()){
    clearTimeout(timer);
    reject(reason||Error('反重力后台连接已断开，请重试。'));
  }
  daemon.pending.clear();
  daemon.listeners.clear();
  daemon.sessions.clear();
  daemon.spareSession=null;
  daemon.sparePromise=null;
  killProcessTree(daemon.child);
}

export function closeCliWorkers(){
  shuttingDown=true;
  for(const daemon of [...daemons.values()]){
    destroyDaemon(daemon,Error('反重力连接已关闭。'));
  }
}

function createRpcClient(binary,cwd,env){
  const args=['acp','--include-default-customizations=false'];
  const child=spawn(binary,args,{windowsHide:true,cwd,env,stdio:['pipe','pipe','pipe']});
  // Drain stderr continuously so Go's logger never blocks on a full OS pipe buffer on Windows.
  child.stderr.resume();
  const daemon={
    binary,
    cwd,
    child,
    nextId:1,
    pending:new Map(),
    listeners:new Map(),
    sessions:new Map(),
    spareSession:null,
    sparePromise:null,
    models:[],
    imageSupported:false,
    bootPromise:null,
  };
  const failAll=()=>destroyDaemon(daemon,Error('反重力后台连接中断，请检查 Google 账号登录状态及网络。'));
  child.once('error',failAll);
  child.once('close',failAll);
  child.stdin.on('error',failAll);
  child.stdout.on('error',failAll);

  const lines=createInterface({input:child.stdout,crlfDelay:Infinity});
  lines.on('line',line=>{
    if(!line.trim())return;
    let msg;
    try{msg=JSON.parse(line);}catch{return;}
    if(msg.id!==undefined&&daemon.pending.has(msg.id)){
      const entry=daemon.pending.get(msg.id);
      daemon.pending.delete(msg.id);
      clearTimeout(entry.timer);
      if(msg.error)entry.reject(Error(msg.error.message||'反重力后台请求失败。'));
      else entry.resolve(msg.result);
      return;
    }
    if(msg.method==='session/update'){
      const sid=msg.params?.sessionId;
      if(sid)daemon.listeners.get(sid)?.(msg.params.update);
      return;
    }
    if(msg.id!==undefined){
      // Never allow native CLI/ACP file, shell, or MCP tools inside Materia conversations.
      try{
        child.stdin.write(JSON.stringify({
          jsonrpc:'2.0',
          id:msg.id,
          error:{code:-32601,message:'Native agent tools are disabled in Materia.'},
        })+'\n');
      }catch{}
    }
  });

  daemon.rpc=(method,params={},timeoutMs=45000,signal)=>new Promise((resolve,reject)=>{
    if(shuttingDown||daemons.get(binary)!==daemon){
      reject(Error('反重力后台连接未就绪。'));
      return;
    }
    if(signal?.aborted){
      reject(signal.reason);
      return;
    }
    const id=daemon.nextId++;
    const onAbort=()=>{
      if(!daemon.pending.has(id))return;
      daemon.pending.delete(id);
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer=timeoutMs>0?setTimeout(()=>{
      daemon.pending.delete(id);
      signal?.removeEventListener('abort',onAbort);
      reject(Error('反重力后台响应超时，请检查网络或账号状态。'));
    },timeoutMs):null;
    timer?.unref?.();
    if(signal)signal.addEventListener('abort',onAbort,{once:true});
    daemon.pending.set(id,{
      resolve:value=>{signal?.removeEventListener('abort',onAbort);resolve(value);},
      reject:err=>{signal?.removeEventListener('abort',onAbort);reject(err);},
      timer,
    });
    try{
      child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
    }catch(error){
      daemon.pending.delete(id);
      clearTimeout(timer);
      signal?.removeEventListener('abort',onAbort);
      reject(error);
    }
  });

  return daemon;
}

function replenishSpare(daemon){
  if(shuttingDown||daemons.get(daemon.binary)!==daemon||daemon.spareSession||daemon.sparePromise)return daemon.sparePromise;
  daemon.sparePromise=daemon.rpc('session/new',{cwd:daemon.cwd,mcpServers:[]},45000)
    .then(res=>{
      if(daemons.get(daemon.binary)===daemon&&res?.sessionId){
        daemon.spareSession=res.sessionId;
      }
      return res?.sessionId;
    })
    .catch(()=>null)
    .finally(()=>{daemon.sparePromise=null;});
  return daemon.sparePromise;
}

async function ensureDaemon(binary,signal){
  if(shuttingDown)throw Error('反重力连接已关闭。');
  let daemon=daemons.get(binary);
  if(!daemon){
    const cwd=path.join(os.tmpdir(),'materia-antigravity-acp');
    await mkdir(cwd,{recursive:true});
    const env=await resolveSpawnEnv(process.env);
    if(daemons.has(binary)){
      daemon=daemons.get(binary);
    }else{
      daemon=createRpcClient(binary,cwd,env);
      daemons.set(binary,daemon);
      daemon.bootPromise=(async()=>{
        const init=await daemon.rpc('initialize',{protocolVersion:1,clientCapabilities:{}},25000);
        daemon.imageSupported=Boolean(init?.agentCapabilities?.promptCapabilities?.image);
        const first=await daemon.rpc('session/new',{cwd,mcpServers:[]},60000);
        const rawModels=first?.models?.availableModels||[];
        daemon.models=rawModels
          .filter(m=>typeof m?.modelId==='string'&&typeof m?.name==='string')
          .map(m=>({
            id:m.modelId,
            name:m.name.slice(0,200),
            remaining:null,
            supportsPng:daemon.imageSupported&&/^(?:gemini-|claude-)/i.test(m.modelId),
          }));
        if(!daemon.models.length){
          throw Error('反重力后台未返回可用模型。请在终端运行 agy 完成 Google 账号登录。');
        }
        if(first?.sessionId)daemon.spareSession=first.sessionId;
        return daemon;
      })().catch(error=>{
        destroyDaemon(daemon,error);
        throw error;
      });
    }
  }
  if(signal){
    return await Promise.race([
      daemon.bootPromise,
      new Promise((_,reject)=>{
        if(signal.aborted)reject(signal.reason);
        else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
      }),
    ]);
  }
  return await daemon.bootPromise;
}

export async function acpModels(binary,signal,{refresh=false}={}){
  try{await access(binary);}catch{return null;}
  const daemon=await ensureDaemon(binary,signal);
  if(refresh&&!daemon.spareSession&&!daemon.sparePromise){
    void replenishSpare(daemon);
  }
  return {models:daemon.models,imageSupported:daemon.imageSupported};
}

export async function prepareCli(binary,model){
  shuttingDown=false;
  const daemon=await ensureDaemon(binary);
  if(model&&daemon.spareSession){
    await daemon.rpc('session/set_model',{sessionId:daemon.spareSession,modelId:model},10000).catch(()=>{});
  }else if(!daemon.spareSession){
    void replenishSpare(daemon);
  }
}

async function allocateSession(daemon,model,signal){
  let sessionId=daemon.spareSession;
  if(sessionId){
    daemon.spareSession=null;
  }else if(daemon.sparePromise){
    sessionId=await daemon.sparePromise;
    if(daemon.spareSession===sessionId)daemon.spareSession=null;
  }
  if(!sessionId){
    const created=await daemon.rpc('session/new',{cwd:daemon.cwd,mcpServers:[]},45000,signal);
    sessionId=created?.sessionId;
  }
  if(!sessionId)throw Error('反重力后台未能建立会话，请重试。');
  void replenishSpare(daemon);
  if(model){
    await daemon.rpc('session/set_model',{sessionId,modelId:model},15000,signal);
  }
  return sessionId;
}

function closeSessionQuietly(daemon,sessionId){
  if(!sessionId||daemons.get(daemon.binary)!==daemon)return;
  daemon.listeners.delete(sessionId);
  void daemon.rpc('session/close',{sessionId},5000).catch(()=>{});
}

function extractPreview(partial){
  const prefix=/^\s*(?:```(?:json)?\s*)?\{\s*"content"\s*:\s*"((?:[^"\\]|\\["\\/bfnrt]|\\u[\da-fA-F]{4})*)/.exec(partial);
  if(prefix){
    try{return JSON.parse('"'+prefix[1]+'"').split(/[<{]/)[0].trim().slice(0,180);}catch{}
  }
  return '';
}

export async function runCliTurn(binary,model,input,signal,onPreview,context,media=[]){
  const daemon=await ensureDaemon(binary,signal);
  let sessionId;
  let reusedEntry=null;
  const existing=context?.key?daemon.sessions.get(context.key):null;
  if(existing&&!existing.busy&&existing.model===model&&context.prefixMatches(existing.count,existing.digest)){
    reusedEntry=existing;
    reusedEntry.busy=true;
    daemon.sessions.delete(context.key);
    daemon.sessions.set(context.key,reusedEntry);
    sessionId=reusedEntry.sessionId;
    input=context.continuation(reusedEntry.count);
  }else{
    if(existing&&!existing.busy){
      daemon.sessions.delete(context.key);
      closeSessionQuietly(daemon,existing.sessionId);
    }
    sessionId=await allocateSession(daemon,model,signal);
  }

  let partial='',lastPreview='',aborted=false;
  daemon.listeners.set(sessionId,update=>{
    if(update?.sessionUpdate==='agent_message_chunk'&&typeof update.content?.text==='string'){
      if(partial.length<120000)partial+=update.content.text;
      if(onPreview&&partial.length<12000){
        const preview=extractPreview(partial);
        if(preview&&preview!==lastPreview){lastPreview=preview;onPreview(preview);}
      }
    }
  });

  const onAbort=()=>{
    aborted=true;
    if(context?.key&&daemon.sessions.get(context.key)?.sessionId===sessionId){
      daemon.sessions.delete(context.key);
    }
    daemon.listeners.delete(sessionId);
    void daemon.rpc('session/cancel',{sessionId},4000).catch(()=>{});
    closeSessionQuietly(daemon,sessionId);
  };
  signal?.addEventListener('abort',onAbort,{once:true});

  try{
    signal?.throwIfAborted();
    const promptBlocks=[
      ...media.map(item=>({type:'image',data:item.inlineData,mimeType:item.mimeType||'image/png'})),
      {type:'text',text:input},
    ];
    await daemon.rpc('session/prompt',{sessionId,prompt:promptBlocks},115000,signal);
    const response=partial.trim();
    if(!response)throw Error('反重力后台未返回有效回答。');

    if(context?.key){
      const digest=context.digestWithReply(response);
      const record={sessionId,model,count:context.count,digest,busy:false};
      daemon.sessions.delete(context.key);
      daemon.sessions.set(context.key,record);
      while(daemon.sessions.size>MAX_SESSIONS){
        const [oldestKey,oldest]=daemon.sessions.entries().next().value;
        if(oldest.busy)break;
        daemon.sessions.delete(oldestKey);
        closeSessionQuietly(daemon,oldest.sessionId);
      }
    }else{
      closeSessionQuietly(daemon,sessionId);
    }
    return response;
  }catch(error){
    if(!aborted){
      if(context?.key&&daemon.sessions.get(context.key)?.sessionId===sessionId){
        daemon.sessions.delete(context.key);
      }
      closeSessionQuietly(daemon,sessionId);
    }
    throw error;
  }finally{
    signal?.removeEventListener('abort',onAbort);
    daemon.listeners.delete(sessionId);
    if(reusedEntry)reusedEntry.busy=false;
  }
}
