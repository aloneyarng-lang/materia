import {readFile,writeFile,rename,mkdir,copyFile,stat,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {cleanAgentHistory,emptyAgentHistory,HISTORY_MAX_BYTES} from '../dist/agent-history.js';
import {refreshRelationshipIndex} from './agent-relationship-index.mjs';

export class AgentHistoryFile {
  constructor(libraryRoot,{memoryRoot}={}){this.root=path.resolve(libraryRoot);this.file=path.join(this.root,'ai-chats.json');this.memoryRoot=memoryRoot;this.queue=Promise.resolve();}
  async refreshMemory(state){
    await refreshRelationshipIndex(this.memoryRoot,this.root,state).catch(()=>console.warn('无法刷新角色相处记忆索引。'));
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
