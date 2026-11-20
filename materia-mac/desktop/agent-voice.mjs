import {spawn} from 'node:child_process';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {KURISU_ID,REZE_ID,GANYU_ID,DEEPSEEK_VOICE_ID} from '../dist/agent-character-memory.js';

const worker=fileURLToPath(new URL('./agent-voice-worker.py',import.meta.url));
const marker='MATERIA_VOICE ';
const unavailable='当前角色配音暂不可用。';
const configs=Object.freeze({[KURISU_ID]:'kurisu.json',[REZE_ID]:'reze.json',[GANYU_ID]:'ganyu.json',[DEEPSEEK_VOICE_ID]:'deepseek.json'});
export const isVoiceLanguage=value=>['follow','zh-CN','en','ja'].includes(value);
const validLanguages=['zh','en','ja','auto'];
const warmKey=p=>JSON.stringify([p.language,p.prompt]);

export async function readVoiceProfile(directory,id,language='ja'){
  if(!Object.hasOwn(configs,id)||!validLanguages.includes(language))throw Error('配音请求格式无效。');
  const file=path.join(directory,configs[id]);
  const base=JSON.parse(await readFile(file,'utf8'));
  const config={...base,...base.voices?.[language]};
  for(const key of ['runtime','gpt','sovits','reference','transcript']){
    if(typeof config[key]!=='string'||!config[key].trim())throw Error('角色配音配置不完整。');
  }
  const runtime=path.resolve(directory,config.runtime);
  const gpt=path.resolve(directory,config.gpt),sovits=path.resolve(directory,config.sovits);
  const reference=path.resolve(directory,config.reference);
  const paths=[gpt,sovits,reference,path.join(runtime,'runtime','python.exe')];
  const stamps=await Promise.all(paths.map(async name=>{
    const info=await stat(name);if(!info.isFile())throw Error(unavailable);
    return [info.size,info.mtimeMs];
  }));
  const modelKey=JSON.stringify([runtime,gpt,stamps[0],sovits,stamps[1],config.version||'v2Pro',config.isHalf!==false,config.cudaGraph===true]);
  const prompt={
    reference,transcript:config.transcript,
    promptLanguage:config.promptLanguage||'ja',
    textSplitMethod:config.textSplitMethod||'cut0',
    limitGeneratedSilence:config.limitGeneratedSilence===true,
    parallelInfer:config.parallelInfer===true,
    sampling:config.sampling||{},
  };
  return {file,runtime,language,modelKey,prompt,
    cacheKey:JSON.stringify([id,language,modelKey,prompt,stamps[2]]),
    defaultLanguage:isVoiceLanguage(base.defaultLanguage)?base.defaultLanguage:'follow'};
}

export function createAgentVoice(directory,{spawnWorker=spawn,maxWorkers=2}={}){
  const residents=new Map(),audioCache=new Map();
  let closed=false,queue=Promise.resolve(),launches=0,cacheHits=0;
  function schedule(run){
    const next=queue.catch(()=>{}).then(()=>{if(closed)throw Error(unavailable);return run();});
    queue=next.catch(()=>{});
    return next;
  }
  async function available(id=KURISU_ID){
    try{await readVoiceProfile(directory,id);return true;}catch{return false;}
  }
  async function status(id=KURISU_ID){
    try{const p=await readVoiceProfile(directory,id);return {available:true,defaultLanguage:p.defaultLanguage};}
    catch{return {available:false,defaultLanguage:'follow'};}
  }
  function stopWorker(state){
    residents.delete(state.key);state.pending?.(Error(unavailable));state.child.kill();
  }
  function close(){closed=true;audioCache.clear();for(const state of [...residents.values()])stopWorker(state);}
  function waitForReply(state,timeout){
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{state.pending=null;reject(Error(unavailable));stopWorker(state);},timeout);
      state.pending=(error,response)=>{
        clearTimeout(timer);state.pending=null;
        if(error)reject(error);else resolve(response);
      };
    });
  }
  async function ensure(profile){
    let state=residents.get(profile.modelKey);
    if(state&&!state.child.killed){
      residents.delete(profile.modelKey);residents.set(profile.modelKey,state);return state;
    }
    while(residents.size>=Math.max(1,Math.min(2,maxWorkers))){
      const oldest=residents.values().next().value;stopWorker(oldest);
    }
    const bin=path.join(profile.runtime,'runtime');
    const child=spawnWorker(path.join(bin,'python.exe'),['-X','utf8','-u',worker,profile.file,profile.language],{
      cwd:profile.runtime,windowsHide:true,
      env:{...process.env,PATH:bin+path.delimiter+process.env.PATH,HF_HUB_OFFLINE:'1'},
      stdio:['pipe','pipe','pipe'],
    });
    state={child,pending:null,key:profile.modelKey,prepared:new Set()};residents.set(state.key,state);launches++;
    const exited=()=>{state.pending?.(Error(unavailable));if(residents.get(state.key)===state)residents.delete(state.key);};
    child.once('error',exited);child.once('exit',exited);
    child.stdin.on('error',()=>child.kill());child.stderr.resume();
    createInterface({input:child.stdout,crlfDelay:Infinity}).on('line',line=>{
      if(!line.startsWith(marker)||!state.pending)return;
      try{
        if(line.length>8_000_000)throw Error(unavailable);
        const response=JSON.parse(line.slice(marker.length));
        state.pending(response.error?Error(unavailable):null,response);
      }catch{state.pending?.(Error(unavailable));child.kill();}
    });
    try{
      const response=await waitForReply(state,120_000);
      if(!response.ready)throw Error(unavailable);
      state.prepared.add(warmKey(profile));
      state.graphValidated=response.graphValidated;state.graphMaxError=response.graphMaxError;
      return state;
    }catch(error){stopWorker(state);throw error;}
  }
  function prepare(id=KURISU_ID,language='ja'){
    if(!Object.hasOwn(configs,id))return Promise.reject(Error(unavailable));
    return schedule(async()=>{
      const profile=await readVoiceProfile(directory,id,language),state=await ensure(profile);
      if(!state.prepared.has(warmKey(profile))){
        const reply=waitForReply(state,60_000);
        state.child.stdin.write(JSON.stringify({prepare:true,language,profile:profile.prompt})+'\n');
        await reply;state.prepared.add(warmKey(profile));
      }
      return state;
    });
  }
  async function synthesize({text,language,characterId=KURISU_ID}={}){
    if(typeof text!=='string'||!text.trim()||[...text].length>240||
      !validLanguages.includes(language)||!Object.hasOwn(configs,characterId))throw Error('配音请求格式无效。');
    return schedule(async()=>{
      const profile=await readVoiceProfile(directory,characterId,language);
      const key=JSON.stringify([profile.cacheKey,text]);
      if(audioCache.has(key)){cacheHits++;return audioCache.get(key);}
      const state=await ensure(profile),reply=waitForReply(state,60_000);
      state.child.stdin.write(JSON.stringify({text,language,profile:profile.prompt})+'\n');
      const {wav}=await reply;
      state.prepared.add(warmKey(profile));
      if(typeof wav!=='string'||!wav.startsWith('UklGR'))throw Error(unavailable);
      if(wav.length<=1_000_000){
        if(audioCache.size===16)audioCache.delete(audioCache.keys().next().value);
        audioCache.set(key,wav);
      }
      return wav;
    });
  }
  return {available,status,prepare,synthesize,close,
    diagnostics:()=>({workers:residents.size,launches,cacheHits,graphs:[...residents.values()].map(s=>({validated:s.graphValidated??null,maxError:s.graphMaxError??null}))})};
}

