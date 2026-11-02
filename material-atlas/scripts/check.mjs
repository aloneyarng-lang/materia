import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
let count=0;
async function check(folder){for(const entry of await readdir(folder,{withFileTypes:true})){if(['vendor','fonts'].includes(entry.name))continue;const file=path.join(folder,entry.name);if(entry.isDirectory()){await check(file);continue;}if(!/\.(mjs|cjs|js)$/.test(file))continue;const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8',windowsHide:true});if(result.status!==0){process.stderr.write(result.stderr);process.exit(result.status||1);}count++;}}
for(const folder of ['dist','desktop','scripts'])await check(folder);
console.log(`Syntax checked ${count} source files.`);
