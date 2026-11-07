import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {copyFile, mkdir, readFile, rename, stat, unlink, writeFile} from 'node:fs/promises';
import {emptyWorkspace, readWorkspace} from '../../dist/figura/model.js';

const maxBytes = 64 * 1024 * 1024;

export class FigureFile {
  constructor(root) {
    this.root = path.resolve(root);
    this.file = path.join(this.root, 'figura-workspace.json');
    this.queue = Promise.resolve();
  }

  async load() {
    await this.queue;
    try {
      if ((await stat(this.file)).size > maxBytes) throw Error('绘图工作区超过 64 MB。');
      return readWorkspace(JSON.parse(await readFile(this.file, 'utf8')));
    } catch (error) {
      if (error.code === 'ENOENT') return emptyWorkspace();
      throw Error('无法读取绘图工作区，原文件已保留：' + error.message);
    }
  }

  save(value) {
    const content = JSON.stringify(readWorkspace(value));
    if (Buffer.byteLength(content) > maxBytes) throw Error('绘图工作区超过 64 MB，请备份后移出部分项目。');
    const operation = this.queue.then(async () => {
      await mkdir(this.root, {recursive:true});
      const temporary = path.join(this.root, '.figura-' + randomUUID() + '.tmp');
      try {
        await writeFile(temporary, content, {encoding:'utf8', flag:'wx'});
        await copyFile(this.file, path.join(this.root, 'figura-workspace.previous.json')).catch(error => {
          if (error.code !== 'ENOENT') throw error;
        });
        await rename(temporary, this.file);
        return {saved:true};
      } finally {
        await unlink(temporary).catch(() => {});
      }
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
