import {readFile,writeFile,rename,mkdir,copyFile,stat,unlink} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {cleanAgentHistory,emptyAgentHistory,HISTORY_MAX_BYTES} from '../dist/agent-history.js';
import {refreshRelationshipIndex} from './agent-relationship-index.mjs';

export class AgentHistoryFile {
  constructor(libraryRoot,{memoryRoot}={}){this.root=path.resolve(libraryRoot);this.file=path.join(this.root,'ai-chats.json');this.memoryRoot=memoryRoot;this.queue=Promise.resolve();}
  async refreshMemory(state){
    await refreshRelationshipIndex(this.memoryRoot,this.root,state).catch(()=>console.warn('无法刷新角色相处记忆索引。'));
  }
  voicePath(id){
    if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))throw Error('语音记录标识无效。');
    return path.join(this.root,'.agent-voice',id+'.wav');
  }
  async storeVoice(wav){
    if(typeof wav!=='string'||wav.length>8_000_000)throw Error('语音记录格式无效。');
    const data=Buffer.from(wav,'base64');
    if(data.length<44||data.toString('ascii',0,4)!=='RIFF'||data.toString('ascii',8,12)!=='WAVE')throw Error('语音记录格式无效。');
    const id=createHash('sha256').update(data).digest('hex'),file=this.voicePath(id);
    try{await stat(file);return id;}catch(error){if(error.code!=='ENOENT')throw error;}
    await mkdir(path.dirname(file),{recursive:true});
    const temp=file+'.'+randomUUID()+'.tmp';
    try{
      await writeFile(temp,data,{flag:'wx',mode:0o600});
      await rename(temp,file);
    }catch(error){
      await unlink(temp).catch(()=>{});
      if((await stat(file).catch(()=>null))?.size!==data.length)throw error;
    }
    return id;
  }
  async readVoice(id){
    const file=this.voicePath(id);
    if((await stat(file)).size>6_000_000)throw Error('语音记录过大。');
    return (await readFile(file)).toString('base64');
  }
  async load({refresh=true}={}){
    let state;
    try {
      if((await stat(this.file)).size>HISTORY_MAX_BYTES)throw new Error('聊天历史文件过大。');
      state=cleanAgentHistory(JSON.parse(await readFile(this.file,'utf8')));
    } catch(error){
      if(error.code!=='ENOENT')throw new Error('聊天历史无法读取，原文件已保留。请检查文献库中的 ai-chats.json。');
      state=emptyAgentHistory();
    }
    if(refresh)await this.refreshMemory(state);
    return state;
  }
  save(value){
    const next=cleanAgentHistory(value);
    const operation=this.queue.then(async()=>{
      await this.load({refresh:false}); // Refuse to overwrite an existing corrupt history file.
      await mkdir(this.root,{recursive:true});
      const temp=path.join(this.root,`.ai-chats-${randomUUID()}.tmp`);
      try {
        await writeFile(temp,JSON.stringify(next),{encoding:'utf8',flag:'wx',mode:0o600});
        try {await copyFile(this.file,path.join(this.root,'ai-chats.previous.json'));}catch(error){if(error.code!=='ENOENT')throw error;}
        await rename(temp,this.file);
      }catch(error){await unlink(temp).catch(()=>{});throw error;}
      await this.refreshMemory(next);
      return next;
    });
    this.queue=operation.catch(()=>{});return operation;
  }
}
