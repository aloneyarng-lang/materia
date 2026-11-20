import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateWorkspace} from '../dist/prediction-model.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export class MachineLearningEngine {
 constructor({appRoot=root,onProgress=()=>{}}={}){this.appRoot=appRoot;this.onProgress=onProgress;this.jobs=new Map();}
 executable(){
  const candidates=[path.join(this.appRoot,'ml/runtime/python.exe'),path.join(this.appRoot,'.local/ml-runtime/python.exe')];
  const executable=candidates.find(existsSync);if(!executable)throw Error('机器学习运行环境未安装，请运行 npm run setup:ml 后重新打包。');return executable;
 }
 async run(action,payload={},id=crypto.randomUUID()){
  if(!['status','train','predict'].includes(action))throw Error('未知机器学习操作。');
  if(typeof id!=='string'||!id||id.length>100||this.jobs.has(id))throw Error('机器学习任务编号无效。');
  if(action==='train'){
   if([...this.jobs.values()].some(j=>j.action==='train'))throw Error('已有训练正在运行，请先停止或等待完成。');
   payload={...payload,workspace:validateWorkspace(payload.workspace)};
  }
  const executable=this.executable();
  return new Promise((resolve,reject)=>{
   const child=spawn(executable,['-I','-X','utf8',path.join(this.appRoot,'ml/engine.py')],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONUTF8:'1',OMP_NUM_THREADS:'4',OPENBLAS_NUM_THREADS:'4',MKL_NUM_THREADS:'4'}});
   const job={child,action,cancelled:false};this.jobs.set(id,job);
   let buffer='',stderr='',result,engineError='',settled=false;
   const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);this.jobs.delete(id);error?reject(error):resolve(result);};
   const timer=setTimeout(()=>{child.kill();finish(Error('机器学习任务超过 24 小时，已停止。'));},24*60*60*1000);timer.unref();
   child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
   child.stdout.on('data',chunk=>{buffer+=chunk;if(buffer.length>512*1024*1024){child.kill();finish(Error('模型超过内存传输上限，请减少树数量或拆分目标。'));return;}
    let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;
     try{const message=JSON.parse(line);if(message.progress)this.onProgress({id,message:message.progress});if('result'in message)result=message.result;if(message.error)engineError=message.error;}
     catch{child.kill();finish(Error('机器学习引擎返回了无效数据。'));return;}
    }
   });
   child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-6000);});
   child.on('error',e=>finish(Error('无法启动机器学习引擎：'+e.message)));
   child.on('close',code=>finish(job.cancelled?Error('训练已停止，已完成的模型保留。'):engineError?Error(engineError):code!==0||result===undefined?Error('机器学习引擎退出：'+(stderr||code)):null));
   child.stdin.on('error',()=>{});
   child.stdin.end(JSON.stringify({...payload,action}));
  });
 }
 cancel(id){const job=this.jobs.get(id);if(!job)return false;job.cancelled=true;job.child.kill();return true;}
 cancelAll(){for(const id of this.jobs.keys())this.cancel(id);}
}
