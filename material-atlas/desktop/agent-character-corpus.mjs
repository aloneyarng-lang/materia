import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {createCharacterCorpus,validateCharacterCorpus} from '../dist/agent-character-corpus.js';
import {KURISU_ID,REZE_ID,GANYU_ID,CHARACTER_MEMORY_IDS} from '../dist/agent-character-memory.js';
import {createCorpusEdits} from './agent-memory-corpus.mjs';
const bundled={
 [GANYU_ID]:new URL('../dist/assets/characters/genshin-ganyu/corpus.json',import.meta.url),
 [KURISU_ID]:new URL('../dist/assets/characters/makise-kurisu/corpus.json',import.meta.url),
 [REZE_ID]:new URL('../dist/assets/characters/chainsawman-reze/corpus.json',import.meta.url),
};
export function createDesktopCorpus(memoryRoot){
 const baseCache=new Map(),edits=memoryRoot?createCorpusEdits(memoryRoot):null;
 async function base(id){
  if(!CHARACTER_MEMORY_IDS.includes(id))return null;
  if(!baseCache.has(id))baseCache.set(id,(async()=>{
   const local=memoryRoot&&path.join(memoryRoot,'canon',id,'corpus.json');
   for(const file of [local,bundled[id]]){
    if(!file)continue;
    try{if((await stat(file)).size>40*1024*1024)throw Error('角色语料文件过大。');return validateCharacterCorpus(JSON.parse(await readFile(file,'utf8')),id);}
    catch(e){if(e.code==='ENOENT')continue;if(file===bundled[id])throw e;console.warn('根目录角色语料无法读取，将使用安装副本。');}
   }return null;
  })().catch(e=>{baseCache.delete(id);throw e;}));
  return baseCache.get(id);
 }
 const finder=()=>createCharacterCorpus(async id=>{const data=await base(id);const merged=data&&edits?edits.apply(data,await edits.read(id)):data;return merged?.records.length?merged:null;});
 let find=finder();
 const api=request=>find(request);
 api.list=async request=>{
  const id=request?.characterId,data=await base(id);if(!data)return {count:0,total:0,records:[],revision:0};
  const personal=edits?await edits.read(id):{revision:0,edits:{}};
  const merged=edits?edits.apply(data,personal,{includeDeleted:true}):data;
  const count=merged.records.filter(r=>!r.personalDeleted).length,q=String(request?.query||'').normalize('NFKC').toLowerCase().slice(0,140),trash=request?.trash===true;
  const filtered=merged.records.filter(r=>!!r.personalDeleted===trash&&(!request?.kind||r.kind===request.kind)&&(!q||
    [r.scene,r.work,...(r.tags||[]),...r.lines.flatMap(l=>Object.values(l.texts))].join(' ').normalize('NFKC').toLowerCase().includes(q)));
  filtered.sort((a,b)=>(a.kind==='dialogue'?0:a.kind==='canon_summary'?1:2)-(b.kind==='dialogue'?0:b.kind==='canon_summary'?1:2));
  const offset=Math.max(0,Math.min(60000,Math.floor(Number(request?.offset)||0))),limit=Math.max(1,Math.min(50,Math.floor(Number(request?.limit)||20)));
  return {count,total:filtered.length,revision:personal.revision,records:filtered.slice(offset,offset+limit)};
 };
 api.update=async request=>{
  if(!edits)throw Error('当前没有可写的角色记忆目录。');
  const data=await base(request?.characterId);if(!data)throw Error('当前角色没有资料。');
  const result=await edits.update(request,data);find=finder();return result;
 };
 return api;
}
export const browseDesktopCorpus=createDesktopCorpus();
