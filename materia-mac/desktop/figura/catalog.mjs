import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {lstat, mkdir, readFile, readdir, rename, rm, writeFile} from 'node:fs/promises';
import {schemeID, validateScheme} from '../../dist/figura/model.js';

const megabyte = 1024 * 1024;
const allowedFile = /^[a-z0-9_][a-z0-9_.-]*\.(?:m?js|json|csv|svg|png|jpe?g|md|txt)$/i;
const allowedFolder = /^[a-z0-9_][a-z0-9_.-]*$/i;
const supportedCover = {'.svg':'svg+xml', '.png':'png', '.jpg':'jpeg', '.jpeg':'jpeg'};
const helpers = ['shared.js', 'gallery-utils.js', 'paper-style.js', 'reference-styles.js', 'figure-themes.js'];
export const customFolder = root => path.join(root, 'figura-schemes');

async function readPackage(folder) {
  const files = new Map();
  let total = 0;
  if (!(await lstat(folder)).isDirectory()) throw Error('方案必须是实际文件夹。');
  async function collect(relative = '', depth = 0) {
    const entries = await readdir(path.join(folder, relative), {withFileTypes:true});
    if (entries.length > 100 || depth > 4) throw Error('方案文件过多，或子目录层级过深。');
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const name = relative + entry.name, file = path.join(folder, name);
      if (entry.isSymbolicLink()) throw Error('方案文件夹不能包含链接。');
      if (entry.isDirectory() && allowedFolder.test(entry.name)) await collect(name + '/', depth + 1);
      if (!entry.isFile() || !allowedFile.test(entry.name)) continue;
      const size = (await lstat(file)).size;
      total += size;
      if (size > 3 * megabyte || total > 6 * megabyte || files.size >= 100) throw Error('单个方案最多 100 个文件、6 MB。');
      files.set(name, await readFile(file));
    }
  }
  await collect();
  if (!['manifest.json', 'plot.js', 'example.csv'].every(name => files.has(name))) throw Error('方案缺少 manifest.json、plot.js 或 example.csv。');
  const id = path.basename(folder);
  const scheme = validateScheme(JSON.parse(files.get('manifest.json').toString('utf8').replace(/^\uFEFF/, '')), id);
  const cover = files.get(scheme.cover);
  if (!cover?.length || cover.length > megabyte) throw Error('方案封面缺失或超过 1 MB。');
  return {scheme, files};
}

async function directories(folder) {
  const entries = await readdir(folder, {withFileTypes:true}).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  return entries.filter(entry => entry.isDirectory() && !entry.name.startsWith('.')).map(entry => entry.name).sort();
}

export async function schemeCatalog(bundled, installed) {
  const native = await directories(bundled), custom = await directories(installed);
  const rows = await Promise.all([...native.map(id => [id, bundled, false]), ...custom.slice(0, 40).map(id => [id, installed, true])].map(async ([id, folder, user]) => {
    try {
      if (user && native.includes(id)) throw Error('与内置方案 ID 重复。');
      const {scheme, files} = await readPackage(path.join(folder, id));
      const content = files.get(scheme.cover).toString('base64');
      return {...scheme, user, coverURL:'data:image/' + supportedCover[path.extname(scheme.cover).toLowerCase()] + ';base64,' + content,
        samples:[...files.keys()].filter(name => !name.includes('/') && name.endsWith('.csv')).sort()};
    } catch (error) {
      return {id, name:id, user, error:error.message};
    }
  }));
  return rows;
}

export async function loadScheme(bundled, installed, id, version) {
  if (typeof id !== 'string' || !schemeID.test(id)) throw Error('无效的方案 ID。');
  const builtin = (await directories(bundled)).includes(id);
  const {scheme, files} = await readPackage(path.join(builtin ? bundled : installed, id));
  if (scheme.version !== version) throw Error('方案版本已变化，请重新扫描方案。');
  return {scheme, files};
}

export async function plotAssets(bundled, id, files) {
  const assets = new Map();
  for (const [name, bytes] of files) if (/\.m?js$/i.test(name)) assets.set('/schemes/' + id + '/' + name, bytes);
  for (const name of helpers) assets.set('/schemes/' + name, await readFile(path.join(bundled, name)));
  return assets;
}

export async function installScheme(folder, bundled, installed) {
  const {scheme, files} = await readPackage(folder);
  const id = scheme.id, native = await directories(bundled), custom = await directories(installed);
  if (native.includes(id) || custom.includes(id)) throw Error('该方案 ID 已存在，请先备份原方案，或为新版本使用新的 ID。');
  if (custom.length >= 40) throw Error('已达到 40 个自定义方案的上限。');
  await mkdir(installed, {recursive:true});
  const temporary = path.join(installed, '.install-' + randomUUID());
  await mkdir(temporary);
  try {
    for (const [name, bytes] of files) {
      const file = path.join(temporary, name);
      await mkdir(path.dirname(file), {recursive:true});
      await writeFile(file, bytes, {flag:'wx'});
    }
    await rename(temporary, path.join(installed, id));
  } finally {
    await rm(temporary, {recursive:true, force:true});
  }
  return {id, name:scheme.name};
}
