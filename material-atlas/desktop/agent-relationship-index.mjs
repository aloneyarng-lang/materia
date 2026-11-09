import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,rename,unlink,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {CHARACTER_MEMORY_IDS,profileFor} from '../dist/agent-character-memory.js';

// This catalog can always be rebuilt from the source library's atomic chat file.
export async function refreshRelationshipIndex(memoryRoot, libraryRoot, state) {
  if(!memoryRoot)return;
  const identity=path.resolve(libraryRoot);
  const key=createHash('sha256').update(process.platform==='win32'?identity.toLowerCase():identity).digest('hex');
  for(const characterId of CHARACTER_MEMORY_IDS){
  const directory=path.join(memoryRoot,'relationship',characterId);
  const file=path.join(directory,key+'.json');
  const profile=profileFor(state,characterId);
  const text=JSON.stringify({format:'materia-character-relationship',version:1,characterId,
    libraryKey:key,source:'ai-chats.json',replyLanguage:profile?.replyLanguage||'zh-CN',
    episodes:profile?.episodes||[],notes:profile?.notes||[],memoryEdits:profile?.memoryEdits||{},migratedCount:profile?.migrated?.length||0})+'\n';
  try{if(await readFile(file,'utf8')===text)continue;}catch(error){if(error.code!=='ENOENT')throw error;}
  await mkdir(directory,{recursive:true});
  const temp=path.join(directory,'.relationship-'+randomUUID()+'.tmp');
  try{
    await writeFile(temp,text,{encoding:'utf8',flag:'wx',mode:0o600});
    await rename(temp,file);
  }catch(error){await unlink(temp).catch(()=>{});throw error;}
  }
}
