import {readFile,writeFile,mkdir,copyFile,rename,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {walkFiles,validatePackagedAssets} from '../desktop/package-assets.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const exists=p=>stat(p).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});
const sha=async p=>{const h=createHash('sha256');for await(const chunk of createReadStream(p))h.update(chunk);return h.digest('hex');};
const psQuote=s=>"'"+s.replaceAll("'","''")+"'";
export async function deployLocal({source,target,backupRoot,shortcuts=[],checkRunning=true}){
  source=path.resolve(source);target=path.resolve(target);
  if(source===target||source.startsWith(target+path.sep)||target.startsWith(source+path.sep))throw Error('构建目录与使用目录必须相互独立。');
  const pkg=JSON.parse(await readFile(path.join(source,'resources/app/package.json'),'utf8'));
  if(!/^\d+\.\d+\.\d+$/.test(pkg.version)||!await exists(path.join(source,'Materia.exe')))throw Error('构建目录缺少有效的 Materia 程序。');
  await validatePackagedAssets(path.join(source,'resources/app'));
  if(checkRunning&&process.platform==='win32'){
    const result=spawnSync('powershell.exe',['-NoProfile','-Command',`$taskExe=${psQuote(path.join(target,'Materia.exe'))}; $taskRunning=@(Get-Process Materia -ErrorAction SilentlyContinue | Where-Object Path -EQ $taskExe); if($taskRunning.Count){exit 9}`],{encoding:'utf8',windowsHide:true});
    if(result.status!==0)throw Error('请保存内容并完全退出正在使用的 Materia，再运行更新。');
  }
  const files=await walkFiles(source);
  for(const name of files)if(name.split(path.sep).some(p=>['文献库','papers','backups','.local','desktop-profile'].includes(p))||/^(?:ai-agent|ai-chats.*|library(?:\.previous)?|preferences|research-canvases.*|prediction-workspace.*)\.json$/.test(path.basename(name)))throw Error('构建目录混入个人数据，更新已停止：'+name);
  const changes=[];for(const name of files){const dest=path.join(target,name);if(!await exists(dest)||await sha(path.join(source,name))!==await sha(dest))changes.push(name);}
  const backup=path.join(path.resolve(backupRoot),new Date().toISOString().replaceAll(':','-')+'-'+randomUUID().slice(0,6));await mkdir(backup,{recursive:true});
  for(const name of changes){const dest=path.join(target,name);if(await exists(dest)){await mkdir(path.dirname(path.join(backup,name)),{recursive:true});await copyFile(dest,path.join(backup,name));}}
  for(const name of changes){const dest=path.join(target,name);await mkdir(path.dirname(dest),{recursive:true});const temporary=dest+'.update-'+randomUUID();await copyFile(path.join(source,name),temporary);await rename(temporary,dest);}
  for(const name of files)if(await sha(path.join(source,name))!==await sha(path.join(target,name)))throw Error('更新后校验不一致：'+name);
  if(process.platform==='win32'&&shortcuts.length){
    for(const [i,link]of shortcuts.entries())if(await exists(link))await copyFile(link,path.join(backup,`shortcut-${i}.lnk`));
    const script=`$taskShell=New-Object -ComObject WScript.Shell; ${shortcuts.map(link=>`$taskLink=$taskShell.CreateShortcut(${psQuote(link)}); $taskLink.TargetPath=${psQuote(path.join(target,'Materia.exe'))}; $taskLink.WorkingDirectory=${psQuote(target)}; $taskLink.Save();`).join(' ')}`;
    const result=spawnSync('powershell.exe',['-NoProfile','-Command',script],{encoding:'utf8',windowsHide:true});if(result.status!==0)throw Error('程序已更新，但快捷方式更新失败，请从程序文件夹启动。');
  }
  const report={version:pkg.version,target,source,backup,changedFiles:changes,verifiedFiles:files.length,shortcuts};await writeFile(path.join(backup,'deployment-report.json'),JSON.stringify(report,null,2));await writeFile(path.join(target,'deployment-info.json'),JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};const{version}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
  let buildSource;
  if(!args.includes('--no-build')){const buildOut=path.join(root,'.local/builds',version+'-'+randomUUID());buildSource=path.join(buildOut,'Materia-win32-x64');const env={...process.env,MATERIA_PACKAGE_OUT:buildOut};if(await exists(path.join(root,'.local',`electron-v45.0.0-win32-x64.zip`)))env.MATERIA_ELECTRON_ZIP_DIR=path.join(root,'.local');const result=spawnSync(process.execPath,[path.join(root,'desktop/package.mjs')],{cwd:root,env,stdio:'inherit',windowsHide:true});if(result.status!==0)process.exit(result.status||1);}
  const workspace=path.resolve(root,'../..'),target=path.resolve(option('--target')||path.join(workspace,'Materia-win32-x64'));
  const report=await deployLocal({source:option('--source')||buildSource||path.join(root,`release/v${version}/Materia-win32-x64`),target,backupRoot:path.join(root,'.local/program-backups'),shortcuts:args.includes('--skip-shortcuts')?[]:[path.join(workspace,'Materia 最新版.lnk'),path.resolve(root,'../Materia.exe - 快捷方式.lnk')]});
  await writeFile(path.join(root,'.local/local-install-current.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({version:report.version,target:report.target,updatedFiles:report.changedFiles.length,verifiedFiles:report.verifiedFiles,backup:report.backup}));
}
