import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

let active=false;
export async function askWindow(clientPath,messages,tools,jsonOutput,signal,model=''){
  if(active)throw Error('反重力桌面窗口正在处理另一个问题。');
  if(messages.some(m=>Array.isArray(m.content)&&m.content.some(part=>part.type!=='text')))throw Error('桌面窗口接入目前支持文本。');
  const id=randomUUID().replaceAll('-', '');
  const begin='MateriaReplyStart'+id,end='MateriaReplyEnd'+id;
  const format=jsonOutput?'根据消息要求输出 JSON。':'输出单行 JSON 对象 {"content":"回答","tool_calls":[]}。需要 Materia 工具时，tool_calls 中每项包含 id、name 和 JSON 字符串 arguments。';
  const prompt='请仅回复文本，不调用客户端工具；不要解释格式，不要加 Markdown、引号或代码围栏。'
    +'严格回复三行：第一行原样输出 '+begin+'，第二行'+format+' 第三行原样输出 '+end+'。'
    +' 消息和可用工具：'+JSON.stringify({messages,tools});
  if(prompt.length>80000)throw Error('桌面会话上下文过长，请缩小文献范围。');
  active=true;
  try{
    return await runWindow({clientPath,prompt,begin,end,model,gemini:clientPath==='local-gemini'},signal);
  }finally{active=false;}
}

function runWindow(request,signal){
    return new Promise((resolve,reject)=>{
      const child=execFile('powershell.exe',['-NoProfile','-NonInteractive','-Sta','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./antigravity-window.ps1',import.meta.url))],{windowsHide:true,signal,maxBuffer:512000},(error,stdout,stderr)=>{
        if(error)reject(Error(stderr.split(/\r?\n/)[0]?.slice(0,250)||'反重力桌面会话已中断。'));
        else resolve(stdout.trim());
      });
      child.stdin.on('error',()=>{});
      child.stdin.end(JSON.stringify(request));
    });
}

export async function windowModels(clientPath,signal){
  const output=await runWindow({clientPath,gemini:clientPath==='local-gemini',inspect:true},signal);
  const names=JSON.parse(output);
  return [{id:'desktop-current',name:'桌面端当前模型',remaining:null},...names.map(name=>({
    id:'window-'+Buffer.from(name).toString('base64url'),name,remaining:null
  }))];
}
