import {createHash,randomUUID} from 'node:crypto';
import {lstat,mkdir,readdir,readFile,rename,unlink,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {NOTE_LIMIT,notePath,noteBody} from '../dist/notes-vault-model.js';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const inspect=async file=>lstat(file).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});

export class NotesVault {
  constructor(root){
    this.root=path.resolve(root);
    this.queue=Promise.resolve();
  }
  async directory(parts=[],create=false){
    let target=this.root;
    for(const part of ['',...parts]){
      if(part)target=path.join(target,part);
      let info=await inspect(target);
      if(!info&&create){
        await mkdir(target).catch(error=>{if(error.code!=='EEXIST')throw error;});
        info=await inspect(target);
      }
      if(!info)return null;
      if(info.isSymbolicLink()||!info.isDirectory())throw Error('笔记目录包含不支持的链接或文件。');
    }
    return target;
  }
  async read(file,id,info){
    if(!info?.isFile()||info.isSymbolicLink()||info.size>NOTE_LIMIT)throw Error('无法读取笔记，文件须为 512 KB 以内的 UTF-8 Markdown。');
    const bytes=await readFile(file);
    if(bytes.length>NOTE_LIMIT)throw Error('笔记文件超过 512 KB。');
    let body;
    try{body=noteBody(decoder.decode(bytes));}catch{throw Error('笔记须为 UTF-8 Markdown。');}
    return {id,body,revision:hash(bytes),updatedAt:info.mtimeMs};
  }
  async image(note,reference){
    const id=notePath(note);
    if(typeof reference!=='string'||reference.length>500||/[\\:\u0000-\u001f]/.test(reference)||reference.startsWith('/'))return null;
    const parts=id.split('/').slice(0,-1);
    for(const part of reference.split('/')){
      if(part==='..'){if(!parts.length)return null;parts.pop();}
      else if(part&&part!=='.'){if(part.startsWith('.'))return null;parts.push(part);}
    }
    try{notePath(parts.join('/'));}catch{return null;}
    const file=parts.pop();
    const types={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp'};
    const type=types[file?.split('.').at(-1).toLowerCase()];
    if(!type)return null;
    const directory=await this.directory(parts);
    if(!directory)return null;
    const target=path.join(directory,file),info=await inspect(target);
    if(!info?.isFile()||info.isSymbolicLink()||info.size>8*1024*1024)return null;
    const bytes=await readFile(target);
    return bytes.length<=8*1024*1024?{type,bytes}:null;
  }
  async list(){
    await this.queue;
    const root=await this.directory([],true),notes=[];
    let skipped=0;
    let bytes=0;
    const scan=async(dir,prefix,depth)=>{
      for(const entry of await readdir(dir,{withFileTypes:true})){
        if(entry.name.startsWith('.')||entry.isSymbolicLink())continue;
        const file=path.join(dir,entry.name),id=prefix+entry.name;
        if(entry.isDirectory()&&depth<9){await scan(file,id+'/',depth+1);continue;}
        if(!entry.isFile()||!/\.md$/i.test(entry.name))continue;
        try{
          if(notePath(id)!==id||notes.length>=2000)throw Error();
          const info=await lstat(file);
          if(bytes+info.size>24*1024*1024)throw Error();
          notes.push(await this.read(file,id,info));
          bytes+=info.size;
        }catch{skipped++;}
      }
    };
    await scan(root,'',0);
    return {notes,skipped};
  }
  save(payload){
    const id=notePath(payload?.id),body=noteBody(payload?.body),expected=payload?.revision;
    if(expected!==null&&!/^[a-f\d]{64}$/.test(expected))throw Error('笔记版本无效，请刷新。');
    const operation=this.queue.then(async()=>{
      const parts=id.split('/'),name=parts.pop();
      const parent=await this.directory(parts,expected===null);
      if(!parent)throw Error('笔记目录已移除，请刷新笔记列表。');
      const file=path.join(parent,name);
      if(expected===null){
        try{await writeFile(file,body,{encoding:'utf8',flag:'wx'});}
        catch(error){if(error.code==='EEXIST')throw Error('已有同名笔记，请换一个名称。');throw error;}
      }else{
        const check=async()=>{
          const info=await inspect(file);
          if(!info||expected!==(await this.read(file,id,info)).revision)throw Error('笔记已在外部修改或移除。请先导出当前草稿，再重新载入文件。');
        };
        await check();
        const temp=path.join(parent,'.materia-note-'+randomUUID()+'.tmp');
        try{
          await writeFile(temp,body,{encoding:'utf8',flag:'wx'});
          await check();
          await rename(temp,file);
        }catch(error){await unlink(temp).catch(()=>{});throw error;}
      }
      const info=await lstat(file);
      return {id,body,revision:hash(Buffer.from(body)),updatedAt:info.mtimeMs};
    });
    this.queue=operation.catch(()=>{});
    return operation;
  }
}
