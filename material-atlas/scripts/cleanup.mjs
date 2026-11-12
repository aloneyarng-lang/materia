import {readdir,lstat,realpath,rm,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
const apply=process.argv.includes('--apply');
// Only disposable packaging inputs and obsolete releases. Never sweep all of .local:
// it also contains the ML runtime, profiles, research data and source assets.
const generated=/^(?:desktop-stage(?:-.*)?|ui-stage-\d+|builds|canvas-(?:arrange|tools)-build-[a-f0-9]+|continuous-reader-build-[a-f0-9]+|(?:german-interface|german-translation|i18n|i18n-build-final|i18n-ready|translation-targets)-build-[\d.]+|i18n-build-[\d.]+|icon-build-\d+-\d+|visual-refresh-build)$/;
await access(path.join(root,'release/current/Materia-win32-x64/Materia.exe'));
await access(path.join(root,'release/current/Materia-win32-x64/resources/app/package.json'));
const candidates=[];
for(const [folder,match] of [['.local',name=>generated.test(name)],['release',name=>/^v\d+\.\d+\.\d+$/.test(name)||name==='Materia-win32-x64']]){
  for(const entry of await readdir(path.join(root,folder),{withFileTypes:true})){
    if(!entry.isDirectory()||entry.isSymbolicLink()||!match(entry.name))continue;
    const target=await realpath(path.join(root,folder,entry.name));
    if(!target.startsWith(root+path.sep)||path.dirname(target)!==path.join(root,folder))throw Error('Unsafe cleanup path: '+target);
    candidates.push(target);
  }
}
if(apply&&process.platform==='win32'){
  const result=spawnSync('powershell.exe',['-NoProfile','-Command',"if(Get-Process Materia,electron -ErrorAction SilentlyContinue){exit 9}"],{windowsHide:true});
  if(result.status!==0)throw Error('Close Materia and Electron before cleanup.');
}
async function measure(target){
  const name=path.basename(target);
  if(['文献库','笔记库','记忆库','图片库','papers','backups','desktop-profile'].includes(name)||/^(?:library(?:\.previous)?|preferences|ai-agent|ai-chats.*|research-canvases.*|prediction-workspace.*)\.json$/.test(name))throw Error('Contains personal data: '+target);
  const info=await lstat(target);
  if(info.isSymbolicLink())throw Error('Refusing linked cleanup content: '+target);
  if(info.isDirectory()&&Date.now()-info.mtimeMs<60*60*1000)throw Error('Recently modified; may still be in use: '+target);
  if(!info.isDirectory())return info.size;
  let bytes=0;
  for(const name of await readdir(target))bytes+=await measure(path.join(target,name));
  return bytes;
}
let total=0,processed=0;
for(const target of candidates){
  let bytes;
  try{bytes=await measure(target);}catch(error){console.log('Skipped '+path.relative(root,target)+': '+error.message);continue;}
  if(apply)await rm(target,{recursive:true,force:true});
  total+=bytes;
  processed++;
  console.log(`${apply?'Removed':'Would remove'} ${path.relative(root,target)} (${(bytes/1048576).toFixed(1)} MiB)`);
}
console.log(`${apply?'Freed':'Reclaimable'} ${(total/1073741824).toFixed(2)} GiB; ${processed} directories. ${apply?'':'Run npm run cleanup -- --apply to remove.'}`);
