import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {dialog, shell} from 'electron';
import {dimensions, preparePlot, readDraft} from '../../dist/figura/model.js';
import {montageSvgLimit,svgLimit} from '../../dist/figura/svg.js';
import {customFolder, installScheme, loadScheme, plotAssets, schemeCatalog} from './catalog.mjs';
import {createFigureRuntime} from './runtime.mjs';
import {createImageLibrary} from './image-library.mjs';

export function createFigureService({appRoot, getRoot, imageRoot, window}) {
  const dist = path.join(appRoot, 'dist', 'figura'), bundled = path.join(dist, 'schemes');
  let runtime;
  const engine = () => runtime ??= createFigureRuntime(dist);
  const handlers = {
    ...createImageLibrary(imageRoot,window),
    catalog: (_, root) => schemeCatalog(bundled, customFolder(root)),
    async sample({id, version, name}, root) {
      const {files} = await loadScheme(bundled, customFolder(root), id, version);
      const bytes = /^[a-z0-9_.-]+\.csv$/i.test(name) && files.get(name);
      if (!bytes) throw Error('方案没有此示例数据。');
      return bytes.toString('utf8');
    },
    async install(_, root) {
      const choice = await dialog.showOpenDialog(window, {title:'选择绘图方案文件夹', properties:['openDirectory']});
      if (choice.canceled) return null;
      if (root !== getRoot()) throw Error('文献库已切换，请重新安装方案。');
      return installScheme(choice.filePaths[0], bundled, customFolder(root));
    },
    async openFolder(_, root) {
      const directory = customFolder(root);
      await mkdir(directory, {recursive:true});
      const error = await shell.openPath(directory);
      if (error) throw Error(error);
    },
    async render(value, root) {
      const draft = readDraft(value);
      if (Buffer.byteLength(JSON.stringify(draft)) > 24 * 1024 * 1024) throw Error('绘图数据超过 24 MB。');
      const {scheme, files} = await loadScheme(bundled, customFolder(root), draft.schemeId, draft.schemeVersion);
      const input = preparePlot(scheme, draft);
      const assets = await plotAssets(bundled, scheme.id, files);
      return engine().render(assets, scheme, input);
    },
    async pdf({svg, width, height, montage=false}) {
      const size = dimensions(width, height);
      if (typeof svg !== 'string' || svg.length > (montage?montageSvgLimit:svgLimit)) throw Error('SVG 无效或过大。');
      return new Uint8Array(await engine().pdf(svg,size,montage===true));
    },
  };
  return (action, payload, libraryKey) => {
    const root = getRoot();
    if (!Object.hasOwn(handlers, action) || libraryKey !== root) throw Error('绘图功能不可用或文献库已切换。');
    return handlers[action](payload, root);
  };
}
