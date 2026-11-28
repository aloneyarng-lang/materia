import path from 'node:path';
import {cp, lstat, mkdir, readdir, realpath, rename, rm} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const html = name => /\.html?$/i.test(name);
const inside = (root, file) => {
  const relative = path.relative(root, file);
  return relative && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
};
export function exhibitionLibrary(root) {
  async function list() {
    await mkdir(root, {recursive:true});
    const works = [];
    for (const dir of await readdir(root, {withFileTypes:true})) {
      if (!dir.isDirectory() || dir.name.startsWith('.')) continue;
      const files = await readdir(path.join(root, dir.name), {withFileTypes:true});
      const pages = files.filter(f => f.isFile() && html(f.name)).map(f => f.name).sort();
      const entry = pages.find(f => /^index\.html?$/i.test(f)) || pages[0];
      if (entry) works.push({name:dir.name, entry, id:createHash('sha256').update(dir.name).digest('hex')});
    }
    return works.sort((a,b) => a.name.localeCompare(b.name,'zh-CN',{numeric:true}));
  }
  async function add(source, directory) {
    await mkdir(root,{recursive:true});
    const origin = await realpath(source);
    const base = await realpath(root);
    if (directory && (origin === base || inside(origin, base))) throw Error('请选择单个作品的文件夹。');
    if (directory && !(await readdir(origin,{withFileTypes:true})).some(f=>f.isFile() && html(f.name))) throw Error('所选文件夹顶层需要包含 HTML 入口。');
    if (!directory && !html(origin)) throw Error('请选择 HTML 文件。');
    const name = directory ? path.basename(origin) : path.parse(origin).name;
    if (!name || name.startsWith('.')) throw Error('作品名称不能以点开头。');
    const stage = path.join(root,'.import-'+randomUUID());
    await mkdir(stage);
    try {
      await cp(origin, directory ? stage : path.join(stage,path.basename(origin)), {recursive:directory, filter:async file=>{
        if ((await lstat(file)).isSymbolicLink()) throw Error('作品包含链接文件，请改用实际资源。');
        return true;
      }});
      for (let n=1;;n++) {
        const title = n===1 ? name : name+' ('+n+')';
        const dest = path.join(root,title);
        try { await lstat(dest); continue; } catch(e) { if(e.code!=='ENOENT') throw e; }
        try { await rename(stage,dest); return title; } catch(e) { if(!['EEXIST','ENOTEMPTY'].includes(e.code)) throw e; }
      }
    } finally { await rm(stage,{recursive:true,force:true}); }
  }
  async function resolve(id, pathname) {
    const work = (await list()).find(item=>item.id===id);
    if (!work) throw Error();
    const base = await realpath(path.join(root,work.name));
    const parts = decodeURIComponent(pathname).slice(1).split('/');
    if(parts.some(p=> !p || p==='.' || p==='..' || /[\\:\x00]/.test(p))) throw Error();
    const file = await realpath(path.join(base,...parts));
    if (!inside(base,file) || !(await lstat(file)).isFile()) throw Error();
    return pathToFileURL(file).href;
  }
  return {list,add,resolve};
}
