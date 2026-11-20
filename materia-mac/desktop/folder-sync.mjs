import {readdir,readFile,writeFile,mkdir,stat,lstat,copyFile,unlink,access,rename} from 'node:fs/promises';
import {constants,createReadStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';

const marker='.materia-group.json',posix=value=>value.split(path.sep).join('/');
const same=(a,b)=>a.toLocaleLowerCase()===b.toLocaleLowerCase();
export const safeFolderName=value=>String(value||'未命名').normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[. ]+$/g,'').replace(/^(CON|PRN|AUX|NUL|COM\d|LPT\d)(\..*)?$/i,'_$1$2').slice(0,100)||'未命名';
function inside(root,relative){const target=path.resolve(root,relative);if(!target.startsWith(path.resolve(root)+path.sep))throw Error('分组路径超出文献库。');return target;}
async function exists(file){try{await access(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function safeDirectory(root,relative='papers'){
  const pieces=relative.split(/[\\/]/).filter(Boolean);let current=root;
  for(const piece of pieces){if(piece==='.'||piece==='..')throw Error('分组路径无效。');current=inside(root,path.relative(root,path.join(current,piece)));await mkdir(current,{recursive:true});if((await lstat(current)).isSymbolicLink())throw Error('文献文件夹不能使用符号链接。');}
  return current;
}
export class FolderSync {
  constructor(root){this.root=root;this.cache=new Map();}
  async digest(relative){
    const absolute=inside(this.root,relative),info=await lstat(absolute);if(!info.isFile()||info.isSymbolicLink())throw Error('跳过非普通 PDF 文件。');
    const cached=this.cache.get(relative);if(cached&&cached.size===info.size&&cached.mtime===info.mtimeMs)return cached;
    const hash=createHash('sha256');let header=Buffer.alloc(0),tail=Buffer.alloc(0);for await(const chunk of createReadStream(absolute)){if(header.length<1024)header=Buffer.concat([header,chunk.subarray(0,1024-header.length)]);tail=Buffer.concat([tail,chunk]).subarray(-4096);hash.update(chunk);}
    const after=await stat(absolute);if(after.size!==info.size||after.mtimeMs!==info.mtimeMs)throw Error('PDF 正在写入，稍后重试。');
    const result={relative,size:info.size,mtime:info.mtimeMs,fingerprint:hash.digest('hex'),valid:header.toString('latin1').includes('%PDF-'),complete:tail.toString('latin1').includes('%%EOF')};this.cache.set(relative,result);return result;
  }
  async scan(){
    const files=[],directories=[];await safeDirectory(this.root);
    const walk=async(relative,depth=0)=>{
      if(depth>32)return;
      for(const entry of await readdir(inside(this.root,relative),{withFileTypes:true})){
        if(entry.isSymbolicLink()||entry.name.startsWith('.'))continue;
        const next=relative+'/'+entry.name;
        if(entry.isDirectory()){
          let identity=null;try{identity=JSON.parse(await readFile(inside(this.root,next+'/'+marker),'utf8'));}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
          directories.push({relative:next.slice(7),id:typeof identity?.id==='string'&&/^[\w-]{1,120}$/.test(identity.id)?identity.id:'',name:next.slice(7).split('/').join(' / ')});await walk(next,depth+1);
        }else if(entry.isFile()&&/\.pdf$/i.test(entry.name)){try{const file=await this.digest(next);if(file.valid)files.push(file);}catch(e){if(!['ENOENT','EBUSY','EACCES','EPERM'].includes(e.code)&&!e.message.includes('正在写入'))throw e;}}
      }
    };
    await walk('papers');return {files,directories};
  }
  async import(data,prepare){
    const before=JSON.stringify([data.papers,data.settings.collections,data.settings.folderSync]);
    const {files,directories}=await this.scan(),folders=data.settings.collections||[],assigned=new Set(),byPath=new Map(),oldPaths=data.settings.folderSync?.paths||{},names={...data.settings.folderSync?.names};
    for(const dir of directories){
      const preferred=oldPaths[dir.id],hasOriginal=preferred&&directories.some(d=>same(d.relative,preferred));
      let folder=folders.find(c=>c.id===dir.id&&!assigned.has(c.id)&&(!hasOriginal||same(dir.relative,preferred)))||folders.find(c=>same(oldPaths[c.id]||'',dir.relative)&&!assigned.has(c.id));
      if(!folder){folder={id:'folder-'+randomUUID(),name:dir.name,color:'#527ca4'};folders.push(folder);}
      else if(oldPaths[folder.id]&&oldPaths[folder.id]!==dir.relative)folder.name=dir.name;
      assigned.add(folder.id);byPath.set(dir.relative,folder);oldPaths[folder.id]=dir.relative;
      names[folder.id]=folder.name;
      if(dir.id!==folder.id)await writeFile(inside(this.root,'papers/'+dir.relative+'/'+marker),JSON.stringify({format:'materia-group',version:1,id:folder.id}));
    }
    const used=new Set(),added=[],byFingerprint=new Map();for(const file of files){const list=byFingerprint.get(file.fingerprint)||[];list.push(file);byFingerprint.set(file.fingerprint,list);}
    for(const paper of data.papers){
      const candidates=byFingerprint.get(paper.fingerprint)||[],exact=files.find(f=>same(f.relative,paper.pdfPath||''));
      // A different PDF replacing an existing path is a new document, never an overwrite of its metadata.
      const file=exact&&(!paper.fingerprint||exact.fingerprint===paper.fingerprint)?exact:candidates.find(f=>!used.has(f.relative));
      if(!file)continue;
      used.add(file.relative);paper.pdfPath=file.relative;paper.fingerprint||=file.fingerprint;
      const parent=posix(path.dirname(file.relative)).slice(7);paper.collection=byPath.get(parent)?.id||'';
      // Keep original filename, title, addedAt, tags, notes, measurements and reader anchors intact.
    }
    const known=new Set(data.papers.map(p=>p.fingerprint)),ignored=new Set(data.settings.folderSync?.ignored||[]);
    for(const file of files){if(!file.complete||used.has(file.relative)||known.has(file.fingerprint)||ignored.has(file.fingerprint))continue;
      const filename=path.basename(file.relative),parent=posix(path.dirname(file.relative)).slice(7);
      const paper=await prepare({id:'paper-'+randomUUID(),title:filename.replace(/\.pdf$/i,''),filename,collection:byPath.get(parent)?.id||'',tags:[],addedAt:Date.now()}, {pdfPath:file.relative,size:file.size,fingerprint:file.fingerprint,filename});
      data.papers.push(paper);added.push(paper);known.add(file.fingerprint);
    }
    data.settings.collections=folders.filter(c=>!oldPaths[c.id]||assigned.has(c.id)||data.papers.some(p=>p.collection===c.id));
    const keep=new Set(data.settings.collections.map(c=>c.id));data.settings.folderSync={version:1,paths:Object.fromEntries(Object.entries(oldPaths).filter(([id])=>keep.has(id))),names:Object.fromEntries(Object.entries(names).filter(([id])=>keep.has(id))),ignored:[...ignored]};
    return {changed:before!==JSON.stringify([data.papers,data.settings.collections,data.settings.folderSync]),added};
  }
  async preserveLegacyFiles(data){
    const known=new Set(data.papers.map(p=>p.fingerprint)),ignored=new Set(data.settings.folderSync?.ignored||[]);
    // Older versions deliberately retained removed/replaced hash-named PDFs. Do not re-import them.
    for(const file of (await this.scan()).files)if(/^[a-f\d]{64}\.pdf$/i.test(path.basename(file.relative))&&!known.has(file.fingerprint))ignored.add(file.fingerprint);
    data.settings.folderSync={...data.settings.folderSync,ignored:[...ignored]};
  }
  async export(data){
    const folders=data.settings.collections||[],state=data.settings.folderSync||{version:1,paths:{},ignored:[]},paths={...state.paths},names={...state.names},occupied=new Set();
    for(const folder of folders){
      let relative=paths[folder.id];
      if(relative&&names[folder.id]&&names[folder.id]!==folder.name){
        const original=relative,base=posix(path.dirname(relative)),parent=base==='.'?'':base+'/',leaf=safeFolderName(folder.name.split(' / ').at(-1));let proposed=parent+leaf,n=2;
        while(!same(proposed,original)&&await exists(inside(this.root,'papers/'+proposed)))proposed=parent+leaf+' ('+(n++)+')';
        if(proposed!==original){await rename(inside(this.root,'papers/'+original),inside(this.root,'papers/'+proposed));for(const paper of data.papers)if(paper.pdfPath.startsWith('papers/'+original+'/'))paper.pdfPath='papers/'+proposed+'/'+paper.pdfPath.slice(('papers/'+original+'/').length);for(const [id,value]of Object.entries(paths))if(value.startsWith(original+'/')){paths[id]=proposed+'/'+value.slice(original.length+1);const child=folders.find(c=>c.id===id);if(child){child.name=paths[id].split('/').join(' / ');names[id]=child.name;}}relative=proposed;if(parent)folder.name=proposed.split('/').join(' / ');}
      }
      if(!relative||occupied.has(relative.toLowerCase())){const base=folder.name.split(' / ').map(safeFolderName).join('/');relative=base;let n=2;while(occupied.has(relative.toLowerCase())||await exists(inside(this.root,'papers/'+relative)))relative=base+' ('+(n++)+')';}
      await safeDirectory(this.root,'papers/'+relative);occupied.add(relative.toLowerCase());paths[folder.id]=relative;
      names[folder.id]=folder.name;
      await writeFile(inside(this.root,'papers/'+relative+'/'+marker),JSON.stringify({format:'materia-group',version:1,id:folder.id}));
    }
    const moves=[];
    for(const paper of data.papers){
      if(!paper.pdfPath)continue;const desired=paths[paper.collection]||'',parent=posix(path.dirname(paper.pdfPath)).slice(7);
      if(paper.pdfPath.startsWith('papers/')&&parent===desired)continue;
      const source=inside(this.root,paper.pdfPath);if(!await exists(source))continue;
      const original=path.basename(paper.pdfPath),filename=/^[a-f\d]{64}\.pdf$/i.test(original)?safeFolderName(String(paper.filename||'document.pdf').replace(/\.pdf$/i,''))+'.pdf':original;
      const base='papers/'+(desired?desired+'/':'');let destination=base+filename,n=2;
      while(await exists(inside(this.root,destination))){if(same(destination,paper.pdfPath))break;const ext=path.extname(filename);destination=base+filename.slice(0,-ext.length)+' ('+(n++)+')'+ext;}
      if(same(destination,paper.pdfPath))continue;
      await copyFile(source,inside(this.root,destination),constants.COPYFILE_EXCL);
      const copied=await this.digest(destination);if(paper.fingerprint&&copied.fingerprint!==paper.fingerprint)throw Error('PDF 校验失败，原文件已保留。');
      moves.push({source:paper.pdfPath,destination,fingerprint:copied.fingerprint});paper.pdfPath=destination;
    }
    data.settings.folderSync={version:1,paths:Object.fromEntries(Object.entries(paths).filter(([id])=>folders.some(c=>c.id===id))),names:Object.fromEntries(Object.entries(names).filter(([id])=>folders.some(c=>c.id===id))),ignored:state.ignored||[]};
    return moves;
  }
  async finish(moves,data){
    for(const move of moves){if(data.papers.some(p=>same(p.pdfPath,move.source)))continue;
      try{if((await this.digest(move.source)).fingerprint===move.fingerprint)await unlink(inside(this.root,move.source));}catch(e){if(!['ENOENT','EBUSY','EACCES','EPERM'].includes(e.code))throw e;}
    }
  }
}
