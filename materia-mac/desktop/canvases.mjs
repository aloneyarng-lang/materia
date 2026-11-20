import {readFile,writeFile,rename,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {cleanCanvasStore,CANVAS_LIMITS} from '../dist/research-canvas-model.js';
export class CanvasFile {
 constructor(root){this.root=path.resolve(root);this.file=path.join(this.root,'research-canvases.json');this.queue=Promise.resolve();}
 async load(){
  await this.queue;let value;try{value=await readFile(this.file,'utf8');}catch(e){if(e.code==='ENOENT')return cleanCanvasStore();throw e;}
  try{if(value.length>CANVAS_LIMITS.storeBytes)throw Error('画布库过大。');return cleanCanvasStore(JSON.parse(value));}catch(e){throw Error('画布库无法读取，原文件已保留：'+e.message);}
 }
 save(value){
  const state=cleanCanvasStore(value),operation=this.queue.then(async()=>{
   await mkdir(this.root,{recursive:true});const temp=path.join(this.root,'.research-canvases-'+randomUUID()+'.tmp');
   await writeFile(temp,JSON.stringify(state,null,2),{encoding:'utf8',flag:'wx'});
   try{await copyFile(this.file,path.join(this.root,'research-canvases.previous.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
   await rename(temp,this.file);return{saved:true};
  });this.queue=operation.catch(()=>{});return operation;
 }
}
