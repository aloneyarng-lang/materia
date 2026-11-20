import {readFile,writeFile,mkdir,rename,copyFile,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {CHARACTER_MEMORY_IDS} from '../dist/agent-character-memory.js';

export function createCorpusEdits(memoryRoot){
  let queue=Promise.resolve();
  const fileFor=id=>{
    if(!CHARACTER_MEMORY_IDS.includes(id)||!memoryRoot)throw Error('当前角色不支持记忆编辑。');
    return path.join(memoryRoot,'canon',id,'personal-edits.json');
  };
  async function read(id){
    try{
      const raw=await readFile(fileFor(id),'utf8');
      if(raw.length>8*1024*1024)throw Error('修订文件过大。');
      const data=JSON.parse(raw);
      if(data.format!=='materia-canon-edits'||data.characterId!==id||!Number.isInteger(data.revision)||!data.edits||Array.isArray(data.edits))throw Error('修订格式错误。');
      return data;
    }catch(e){if(e.code==='ENOENT')return {format:'materia-canon-edits',version:1,characterId:id,revision:0,edits:{}};throw Error('个人修订无法读取，原文件已保留。');}
  }
  function apply(payload,data,{includeDeleted=false}={}){
    return {...payload,records:payload.records.flatMap(record=>{
      const edit=Object.hasOwn(data.edits,record.id)?data.edits[record.id]:null;
      if(edit?.deleted&&!includeDeleted)return [];
      if(!edit)return [record];
      return [{...record,personalDeleted:edit.deleted===true,originalLines:record.lines,
        ...(edit.lines?{lines:edit.lines,source:{...record.source,userEdited:true,
          evidence:'User correction; edited wording is not an authenticated original quote. '+(record.source.evidence||'')}}:{}),
        personalUpdatedAt:edit.updatedAt}];
    })};
  }
  function update(request,payload){
    const run=queue.then(async()=>{
      const id=request.characterId,record=payload.records.find(r=>r.id===request.recordId);
      if(!record)throw Error('这条记忆已不存在。');
      const data=await read(id);
      if(request.revision!==data.revision)throw Error('资料已更新，请刷新后再保存。');
      if(request.action==='restore')delete data.edits[record.id];
      else if(request.action==='delete')data.edits[record.id]={...data.edits[record.id],deleted:true,updatedAt:Date.now()};
      else if(request.action==='edit'){
        if(!Array.isArray(request.lines)||request.lines.length!==record.lines.length)throw Error('台词数量无效。');
        const lines=request.lines.map((line,i)=>{
          const texts={};
          for(const locale of ['zh-CN','en','ja']){
            const text=line.texts?.[locale];
            if(typeof text!=='string'||!text.trim()||text.length>12000)throw Error('请完整填写三种语言，每段最多12000字。');
            texts[locale]=text.trim();
          }
          return {...record.lines[i],texts,officialLanguages:[],transcribedLanguages:[],revisedLanguages:[],translatedLanguages:[],personalEdited:true};
        });
        data.edits[record.id]={lines,deleted:false,updatedAt:Date.now()};
      }else throw Error('不支持的编辑操作。');
      data.revision++;
      const file=fileFor(id),temp=file+'.'+randomUUID()+'.tmp',serialized=JSON.stringify(data);
      if(serialized.length>8*1024*1024)throw Error('个人修订已满。');
      await mkdir(path.dirname(file),{recursive:true});
      try{
        await writeFile(temp,serialized,{encoding:'utf8',flag:'wx'});
        try{await copyFile(file,file+'.previous');}catch(e){if(e.code!=='ENOENT')throw e;}
        await rename(temp,file);
      }catch(e){await unlink(temp).catch(()=>{});throw e;}
      return {revision:data.revision};
    });
    queue=run.catch(()=>{});return run;
  }
  return {read,apply,update};
}
