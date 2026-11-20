import path from 'node:path';
import {existsSync} from 'node:fs';
import {cp,mkdir,readFile,writeFile,rename,access} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
export function resolveLibraryRoot({envRoot,configuredRoot,previousRoot,defaultRoot},exists=existsSync){
  if(envRoot)return envRoot;
  if(configuredRoot&&exists(path.join(configuredRoot,'library.json')))return configuredRoot;
  if(previousRoot&&exists(path.join(previousRoot,'library.json')))return previousRoot;
  return defaultRoot;
}
export function portableLibraryRoot(appRoot,exeDirectory){
  const normalized=path.resolve(appRoot),parts=normalized.split(path.sep),index=parts.lastIndexOf('material-atlas');
  // The distributed workspace has a single library alongside its launch shortcut.
  return path.join(index>=0?parts.slice(0,index).join(path.sep):exeDirectory,'文献库');
}
const identity=value=>path.resolve(value).toLocaleLowerCase();
async function validLibrary(root){if(!root)return false;try{const data=JSON.parse(await readFile(path.join(root,'library.json'),'utf8'));return data.format==='materia-library'&&Array.isArray(data.papers);}catch(e){if(e.code==='ENOENT')return false;throw e;}}
export async function prepareLibraryLocation({envRoot,configuredRoot,defaultRoot,legacyRoots=[]}){
  if(envRoot)return envRoot;
  const known=new Set(legacyRoots.filter(Boolean).map(identity));
  if(configuredRoot&&!known.has(identity(configuredRoot))&&identity(configuredRoot)!==identity(defaultRoot)&&await validLibrary(configuredRoot))return configuredRoot;
  if(await validLibrary(defaultRoot))return defaultRoot;
  const candidates=[configuredRoot,...legacyRoots].filter(Boolean);
  for(const source of candidates){
    if(identity(source)===identity(defaultRoot)||!await validLibrary(source))continue;
    // Copy the entire library, including PDFs, notes, canvases, conversations and restore records.
    // Publication is atomic; the old library remains as the migration backup.
    const parent=path.dirname(path.resolve(defaultRoot));await mkdir(parent,{recursive:true});
    const stage=path.join(parent,'.materia-library-migration-'+randomUUID());
    const before=await readFile(path.join(source,'library.json'));
    await cp(source,stage,{recursive:true,errorOnExist:true,force:false,filter:async file=>{const {lstat}=await import('node:fs/promises');if((await lstat(file)).isSymbolicLink())throw Error('文献库包含符号链接，原目录已保留。');return true;}});
    const after=await readFile(path.join(source,'library.json'));if(!before.equals(after))throw Error('原文献库仍在写入，请完全退出旧版 Materia 后重新启动。迁移副本已保留。');
    await writeFile(path.join(stage,'.migration.json'),JSON.stringify({format:'materia-library-migration',version:1,from:path.resolve(source),at:new Date().toISOString(),sha256:createHash('sha256').update(before).digest('hex')},null,2));
    try{await access(defaultRoot);throw Error('目标文献库目录已存在但没有有效的 library.json，原目录未改动。');}catch(e){if(e.code!=='ENOENT')throw e;}
    await rename(stage,defaultRoot);return defaultRoot;
  }
  return defaultRoot;
}
