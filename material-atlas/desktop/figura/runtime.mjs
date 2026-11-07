import {BrowserWindow, session} from 'electron';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

export const figureProtocol = 'materia-figure';
const html = '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0}svg{display:block}</style><body></body>';
const policy = "default-src 'none'; script-src 'self'; worker-src 'self'; style-src 'unsafe-inline'; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

export function createFigureRuntime(dist) {
  const partition = session.fromPartition('materia-figura-runtime');
  const jobs = new Map();
  partition.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  partition.setPermissionCheckHandler(() => false);
  partition.webRequest.onBeforeRequest({urls:['<all_urls>']}, ({url}, callback) => {
    const request = new URL(url);
    callback({cancel:request.protocol !== figureProtocol + ':' || !jobs.has(request.hostname)});
  });
  partition.protocol.handle(figureProtocol, request => {
    const url = new URL(request.url), assets = jobs.get(url.hostname);
    const content = assets?.get(url.pathname);
    if (!content) return new Response('Unavailable', {status:404});
    return new Response(content, {headers:{
      'Content-Type':url.pathname.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8',
      'Content-Security-Policy':policy, 'X-Content-Type-Options':'nosniff', 'Cache-Control':'no-store',
    }});
  });

  async function run(assets, operation, timeout, message) {
    const id = randomUUID(), origin = figureProtocol + '://' + id;
    assets.set('/index.html', html);
    jobs.set(id, assets);
    const window = new BrowserWindow({show:false, webPreferences:{
      session:partition, sandbox:true, contextIsolation:true, nodeIntegration:false, backgroundThrottling:false, devTools:false,
    }});
    window.webContents.setWindowOpenHandler(() => ({action:'deny'}));
    window.webContents.on('will-navigate', event => event.preventDefault());
    let timer;
    try {
      return await Promise.race([(async () => {
        await window.loadURL(origin + '/index.html');
        return operation(window.webContents, origin);
      })(), new Promise((_, reject) => {timer = setTimeout(() => reject(Error(message)), timeout);})]);
    } finally {
      clearTimeout(timer);
      if (!window.isDestroyed()) window.destroy();
      jobs.delete(id);
    }
  }

  return {
    async render(assets, scheme, input) {
      assets.set('/plot-worker.js', await readFile(path.join(dist, 'plot-worker.js')));
      const result = await run(assets, (page, origin) => {
        const request = JSON.stringify({url:origin + '/schemes/' + scheme.id, input});
        return page.executeJavaScript(`new Promise((resolve) => {
          const worker = new Worker('/plot-worker.js', {type:'module'});
          worker.onmessage = event => resolve(event.data);
          worker.onerror = event => resolve({error:event.message || '方案依赖无法加载。'});
          worker.postMessage(${request});
        })`);
      }, 11000, '绘图超时，请检查方案或减少数据。');
      if (typeof result?.svg !== 'string') throw Error(result?.error || '方案没有生成 SVG。');
      return result.svg;
    },
    async pdf(svg, size) {
      const assets = new Map([['/svg.js', await readFile(path.join(dist, 'svg.js'))]]);
      return run(assets, async page => {
        const args = JSON.stringify([svg, size]);
        await page.executeJavaScript(`(async () => {
          const {parseSVG} = await import('/svg.js');
          const style = document.createElement('style');
          style.textContent = '@page {size:${size.width}px ${size.height}px;margin:0}';
          document.head.append(style);
          document.body.append(document.importNode(parseSVG(...${args}), true));
          await document.fonts.ready;
        })()`);
        return page.printToPDF({printBackground:true, preferCSSPageSize:true, margins:{top:0, right:0, bottom:0, left:0}});
      }, 15000, '生成 PDF 超时。');
    },
  };
}
