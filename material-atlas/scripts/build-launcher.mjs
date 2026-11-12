import {spawnSync} from 'node:child_process';
import {access,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.platform!=='win32')throw Error('The desktop launcher must be built on Windows.');
const compiler=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
await access(compiler);
const output=path.resolve(root,'../Materia.exe');
await mkdir(path.join(root,'.local/launcher'),{recursive:true});
const temporary=path.join(root,'.local/launcher/Materia.exe');
const result=spawnSync(compiler,['/nologo','/target:winexe','/optimize+','/reference:System.Windows.Forms.dll',`/win32icon:${path.join(root,'desktop/materia.ico')}`,`/out:${temporary}`,path.join(root,'desktop/launcher.cs')],{encoding:'utf8',windowsHide:true});
if(result.status!==0)throw Error(result.stdout||result.stderr||'Launcher compilation failed.');
await rename(temporary,output);
console.log(output);
