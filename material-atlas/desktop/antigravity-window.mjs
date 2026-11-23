import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

let active=false;
export async function askWindow(clientPath,messages,tools,jsonOutput,signal){
  if(active)throw Error('反重力桌面窗口正在处理另一个问题。');
  if(messages.some(m=>Array.isArray(m.content)&&m.content.some(part=>part.type!=='text')))throw Error('桌面窗口接入目前支持文本。');
  const id=randomUUID();
  const begin='BEGIN_'+id,end='END_'+id;
  const prompt='请仅回复文本，不使用客户端工具。回复起止标记分别由 BEGIN_、END_ 紧接编号 '+id+' 构成，各占一行。标记之间'+(jsonOutput?'按消息要求输出 JSON。':'输出 JSON 对象 {"content":"回答","tool_calls":[]}，需要 Materia 工具时输出 {"id":"唯一ID","name":"工具名","arguments":"JSON字符串"}。')+' 消息和可用工具 '+JSON.stringify({messages,tools});
  if(prompt.length>80000)throw Error('桌面会话上下文过长，请缩小文献范围。');
  active=true;
  try{
    return await new Promise((resolve,reject)=>{
      const child=execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./antigravity-window.ps1',import.meta.url))],{windowsHide:true,signal,maxBuffer:512000},(error,stdout,stderr)=>{
        if(error)reject(Error(stderr.split(/\r?\n/)[0]?.slice(0,250)||'反重力桌面会话已中断。'));
        else resolve(stdout.trim());
      });
      child.stdin.on('error',()=>{});
      child.stdin.end(JSON.stringify({clientPath,prompt,begin,end}));
    });
  }finally{active=false;}
}
