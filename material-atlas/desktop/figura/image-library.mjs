import path from 'node:path';
import {lstat,mkdir,open,readFile,readdir,unlink,writeFile} from 'node:fs/promises';
import {dialog,shell} from 'electron';

const formats={'.png':'png','.jpg':'jpeg','.jpeg':'jpeg','.svg':'svg'};
const imageName=name=>typeof name==='string'&&name.length<=255&&!/[<>:"/\\|?*\x00-\x1f]/.test(name)&&Object.hasOwn(formats,path.extname(name).toLowerCase());
const cap=24*1024*1024;
const pngSignature='89504e470d0a1a0a';

function checkRaster(bytes,format) {
  let width,height;
  if(format==='png'&&bytes.length>=24&&bytes.subarray(0,8).toString('hex')===pngSignature&&bytes.toString('ascii',12,16)==='IHDR'){
    width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20);
  }else if(format==='jpeg'&&bytes[0]===0xff&&bytes[1]===0xd8){
    for(let i=2;i+8<bytes.length;){
      if(bytes[i++]!==0xff)break;
      while(bytes[i]===0xff)i++;
      if(i+3>bytes.length)break;
      const marker=bytes[i++],length=bytes.readUInt16BE(i);
      if(length<2||i+length>bytes.length||marker===0xda)break;
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=7){
        height=bytes.readUInt16BE(i+3);width=bytes.readUInt16BE(i+5);break;
      }
      i+=length;
    }
  }
  if(!width||!height||width*height>64000000)throw Error('图片格式无效或超过 6400 万像素。');
}

async function sourceImage(file) {
  const name=path.basename(file), format=formats[path.extname(file).toLowerCase()];
  if(!imageName(name))throw Error('请选择 PNG、JPEG 或 SVG 图片。');
  const info=await lstat(file);
  if(!info.isFile()||info.size>cap)throw Error('图片文件不可读或超过 24 MB。');
  const bytes=await readFile(file);
  if(bytes.length>cap)throw Error('图片文件超过 24 MB。');
  if(format!=='svg')checkRaster(bytes,format);
  return {name,format,bytes};
}

function safeName(filename,type) {
  let stem=String(filename??'').replace(/\.[^.]+$/,'').trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,110).replace(/[. ]+$/,'');
  if(/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem))stem='_'+stem;
  return (stem||'materia-figure')+'.'+type;
}

async function uniqueWrite(root,name,bytes) {
  const ext=path.extname(name), stem=path.basename(name,ext);
  for(let n=1;n<=10000;n++){
    const filename=n===1?name:stem+' ('+n+')'+ext, file=path.join(root,filename);
    let handle;
    try{handle=await open(file,'wx');}catch(error){if(error.code==='EEXIST')continue;throw error;}
    try{await handle.writeFile(bytes);await handle.close();}
    catch(error){await handle.close().catch(()=>{});await unlink(file).catch(()=>{});throw error;}
    return {filename,path:file,canceled:false};
  }
  throw Error('同名图片过多，请更改图稿名称。');
}

export function createImageLibrary(root,window) {
  const ensure=()=>mkdir(root,{recursive:true});
  return {
    async imageList(){
      await ensure();
      return (await readdir(root,{withFileTypes:true})).filter(item=>item.isFile()&&imageName(item.name))
        .map(item=>item.name).sort((a,b)=>a.localeCompare(b,'zh-CN',{numeric:true}));
    },
    async imageRead(name){
      if(!imageName(name))throw Error('图片名称无效。');
      const {format,bytes}=await sourceImage(path.join(root,name));
      return {name,format,content:bytes.toString(format==='svg'?'utf8':'base64')};
    },
    async imageOpen(){
      await ensure();
      const error=await shell.openPath(root);
      if(error)throw Error(error);
    },
    async imageStore({name,bytes}){
      if(!imageName(name)||!(bytes instanceof Uint8Array)||bytes.length>cap)throw Error('图片格式无效或超过 24 MB。');
      const format=formats[path.extname(name).toLowerCase()];
      if(format!=='svg')checkRaster(Buffer.from(bytes),format);
      await ensure();
      return (await uniqueWrite(root,safeName(name,path.extname(name).slice(1).toLowerCase()),bytes)).filename;
    },
    async imageImport(){
      await ensure();
      const result=await dialog.showOpenDialog(window,{title:'导入到图片库',defaultPath:root,properties:['openFile','multiSelections'],filters:[{name:'图片',extensions:['png','jpg','jpeg','svg']}]});
      if(result.canceled)return null;
      const added=[],errors=[];
      for(const file of result.filePaths){
        try{
          const source=await sourceImage(file);
          if(path.resolve(path.dirname(file)).toLowerCase()===path.resolve(root).toLowerCase()){added.push(source.name);continue;}
          added.push((await uniqueWrite(root,source.name,source.bytes)).filename);
        }catch(error){errors.push(path.basename(file)+' · '+error.message);}
      }
      return {added,errors};
    },
    async saveFigure({filename,type,svg,bytes,automatic}){
      const name=safeName(filename,type);
      let content;
      if(type==='svg'&&typeof svg==='string'&&Buffer.byteLength(svg)<=30*1024*1024&&/^<svg(?:\s|>)/.test(svg))content=svg;
      if(type==='png'&&bytes instanceof Uint8Array&&bytes.length<=128*1024*1024&&Buffer.from(bytes.subarray(0,8)).toString('hex')===pngSignature)content=bytes;
      if(type==='pdf'&&bytes instanceof Uint8Array&&bytes.length<=32*1024*1024&&Buffer.from(bytes.subarray(0,5)).toString()==='%PDF-')content=bytes;
      if(!content)throw Error('图稿导出格式无效或过大。');
      await ensure();
      if(automatic===true)return uniqueWrite(root,name,content);
      const choice=await dialog.showSaveDialog(window,{title:'保存绘图',defaultPath:path.join(root,name),filters:[{name:type.toUpperCase(),extensions:[type]}]});
      if(!choice.canceled)await writeFile(choice.filePath,content);
      return {canceled:choice.canceled};
    },
  };
}
