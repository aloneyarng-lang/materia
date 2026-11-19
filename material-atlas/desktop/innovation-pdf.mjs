import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {workbenchPython} from './literature-workbench.mjs';
import {innovationPageTextLimit,innovationPageCount} from '../dist/modules/beta/innovation-sea/model.js';

const execute = promisify(execFile);
const script = fileURLToPath(new URL('./literature-workbench/innovation_text.py',import.meta.url));

export async function extractInnovationPdf(file,signal) {
  const {executable,args} = workbenchPython();
  try {
    const {stdout} = await execute(executable,[...args,'-B',script,file,String(innovationPageCount),String(innovationPageTextLimit)],{
      signal,windowsHide:true,timeout:30000,maxBuffer:512*1024,env:{...process.env,PYTHONUTF8:'1'},
    });
    return JSON.parse(stdout);
  } catch (error) {
    signal.throwIfAborted();
    if (error.killed) throw Error('大型 PDF 的后台文本提取超时，可单独重试。');
    throw Error('后台 PDF 文本提取失败，请检查文件或 AI 工作室的 PDF 组件。');
  }
}
