import {readFile,writeFile,rename,mkdir,copyFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {freshWorkspace,validateWorkspace} from '../dist/prediction-model.js';
export class PredictionFile {
 constructor(root){this.root=path.resolve(root);this.file=path.join(this.root,'prediction-workspace.json');this.queue=Promise.resolve();}
 async load(){await this.queue;try{if((await stat(this.file)).size>30*1024*1024)throw Error('预测工作区超过 30 MB。');return validateWorkspace(JSON.parse(await readFile(this.file,'utf8')));}catch(e){if(e.code==='ENOENT')return freshWorkspace();throw Error('预测工作区无法读取，原文件已保留：'+e.message);}}
 save(value){
  const state=validateWorkspace(value),content=JSON.stringify(state);if(content.length>30*1024*1024)throw Error('预测工作区过大，请导出并拆分。');
  const operation=this.queue.then(async()=>{await mkdir(this.root,{recursive:true});const temp=path.join(this.root,'.prediction-'+randomUUID()+'.tmp');await writeFile(temp,content,{encoding:'utf8',flag:'wx'});
   try{await copyFile(this.file,path.join(this.root,'prediction-workspace.previous.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
   await rename(temp,this.file);return{saved:true};});this.queue=operation.catch(()=>{});return operation;
 }
}
