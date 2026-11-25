import {cleanCanvasStore, serializeCanvasRules} from '../dist/research-canvas-model.js';
import {buildPaperCanvasPrompt, findExistingPaperCanvas, standardCanvasName, upsertPaperCanvas} from './literature-workbench-canvas.mjs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {request as httpRequest} from 'node:http';
import path from 'node:path';
import {createInterface} from 'node:readline';
import {renderReport, unwrapMarkdown} from './literature-workbench/web/markdown.js';

const origin = 'materia-workbench://local';
const markdownAssets = new Map([
  ['/paper-canvas.css', ['desktop/literature-workbench/web/paper-canvas.css', 'text/css']],
  ['/paper-canvas.js', ['desktop/literature-workbench/web/paper-canvas.js', 'text/javascript']],
  ['/takeaway-card.js', ['desktop/literature-workbench/web/takeaway-card.js', 'text/javascript']],
  ['/takeaway-card.css', ['desktop/literature-workbench/web/takeaway-card.css', 'text/css']],
  ['/markdown.js', ['desktop/literature-workbench/web/markdown.js', 'text/javascript']],
  ['/report.css', ['desktop/literature-workbench/web/report.css', 'text/css']],
  ['/dist/vendor/markdown-it.mjs', ['dist/vendor/markdown-it.mjs', 'text/javascript']],
  ['/dist/markdown-math.js', ['dist/markdown-math.js', 'text/javascript']],
  ['/dist/vendor/katex/katex.mjs', ['dist/vendor/katex/katex.mjs', 'text/javascript']],
]);
const routes = new Map([
  ['GET', new Set(['/', '/takeaway-card', '/paper-canvas', '/study-tool.js', '/app.js', '/style.css'])],
  ['POST', new Set(['/paper-text', '/extract', '/render', '/interpret', '/process', '/report', '/outline', '/cancel', '/saved-report', '/follow-up', '/edit-report', '/export-report', '/presets', '/display-preferences'])],
]);

async function readWorkerResponse(response, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of response) {
    size += chunk.length;
    if (size > limit) throw new Error('AI 工作室返回的结果过大。');
    chunks.push(chunk);
  }
  if (!response.complete) throw new Error('AI 工作室连接在响应完成前中断。');
  const headers = new Headers(response.headers);
  headers.delete('connection');
  headers.delete('transfer-encoding');
  return new Response(Buffer.concat(chunks, size), {status:response.statusCode, headers});
}

function requestWorker({port, pathname, method, headers, body, signal}) {
  return new Promise((resolve, reject) => {
    // The Python worker closes its HTTP/1.0 connection after each response.
    // Keep cancellation and incomplete responses on the Node HTTP error path.
    const timeout = pathname === '/outline' ? 900000 : 360000;
    const outgoing = httpRequest({hostname:'127.0.0.1', port, path:pathname, method, headers, agent:false,
      signal:AbortSignal.any([signal, AbortSignal.timeout(timeout)])}, response => {
      const limit = (pathname === '/export-report' ? 128 : 32) * 1024 * 1024;
      readWorkerResponse(response, limit).then(resolve, reject);
    });
    outgoing.once('error', reject);
    outgoing.end(body);
  });
}

export function workbenchPython() {
  const windows = process.platform === 'win32';
  const venv = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'LiteratureWorkbench', 'venv', 'Scripts', 'python.exe')
    : '';
  const executable = process.env.MATERIA_WORKBENCH_PYTHON || (windows && existsSync(venv) ? venv : windows ? 'py' : 'python3');
  return {executable,args:executable === 'py' ? ['-3'] : []};
}

export function createLiteratureWorkbench(appRoot, profile, output, {complete, checkService, canvasStore: resolveCanvasStore = () => null} = {}) {
  let child;
  let starting;

  function start() {
    if (starting) return starting;
    const directory = path.join(appRoot, 'desktop', 'literature-workbench');
    const {executable,args} = workbenchPython();
    const worker = spawn(executable, [...args, '-B', path.join(directory, 'app.py')], {
      windowsHide: true,
      env: {...process.env, PYTHONUTF8: '1', MATERIA_WORKBENCH_SETTINGS: path.join(profile, 'literature-workbench.json'),
        MATERIA_WORKBENCH_OUTPUT: output},
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    child = worker;
    worker.stdin.on('error', () => {});
    const lines = createInterface({input: worker.stdout});
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 10000);
    worker.once('exit', () => {
      abort.abort();
      lines.close();
      if (child === worker) {
        child = undefined;
        starting = undefined;
      }
    });
    starting = Promise.race([once(lines, 'line', {signal: abort.signal}), once(worker, 'error').then(([error]) => { throw error; })])
      .then(([line]) => {
        const address = JSON.parse(line);
        const lifetime = new AbortController();
        const active = new Map();
        worker.once('exit', () => lifetime.abort());
        lines.on('line', async line => {
          let call;
          try { call = JSON.parse(line); } catch { return; }
          if (call.cancel) {
            active.get(call.cancel)?.abort();
            return;
          }
          if (!Number.isSafeInteger(call.id)) return;
          const controller = call.operation ? new AbortController() : null;
          if (controller) active.set(call.operation, controller);
          let response;
          try {
            if (call.method === 'renderReport') {
              const css = await readFile(path.join(directory, 'web', 'report.css'), 'utf8');
              response = {html:renderReport(call.title, call.markdown, call.figures, css)};
            } else {
              const signal = controller ? AbortSignal.any([lifetime.signal, controller.signal]) : lifetime.signal;
              const result = await complete(call.prompt, call.images, signal);
              signal.throwIfAborted();
              response = {...result, answer:unwrapMarkdown(result.answer)};
            }
          } catch (error) {
            response = {error:error.message};
          } finally {
            if (controller && active.get(call.operation) === controller) active.delete(call.operation);
          }
          if (worker.stdin.writable) worker.stdin.write(JSON.stringify({id:call.id, ...response}) + '\n');
        });
        return address;
      })
      .catch(() => {
        lines.close();
        worker.stdin.end();
        if (child === worker) {
          child = undefined;
          starting = undefined;
        }
        throw new Error('文献工作台启动失败。请确认已安装 Python 和 PyMuPDF，或设置 MATERIA_WORKBENCH_PYTHON 指向已安装依赖的 Python。');
      })
      .finally(() => {
        clearTimeout(timeout);
      });
    return starting;
  }

  return {
    async open() {
      await start();
      return origin + '/';
    },
    close() {
      child?.stdin.end();
    },
    async handle(request) {
      const {hostname, pathname, searchParams} = new URL(request.url);
      const asset = request.method === 'GET' && hostname === 'local' && markdownAssets.get(pathname);
      if (asset) {
        const [file, media] = asset;
        return new Response(await readFile(path.join(appRoot, file)), {headers:{
          'Content-Type': media + '; charset=utf-8', 'X-Content-Type-Options':'nosniff',
        }});
      }
      if (hostname === 'local' && pathname === '/paper-canvas' && searchParams.has('paperId') && request.method === 'GET') {
        try {
          const storeApi = resolveCanvasStore();
          if (!storeApi) return Response.json({board: null});
          const store = cleanCanvasStore(await storeApi.load());
          const paperId = searchParams.get('paperId') || '';
          const paperTitle = searchParams.get('title') || '';
          const year = searchParams.get('year') || '';
          const name = standardCanvasName({paperTitle, year});
          const board = findExistingPaperCanvas(store, {paperId, canvasName: name});
          if (!board) return Response.json({board: null, name});
          return Response.json({board, rules: serializeCanvasRules(board), name: board.name});
        } catch (error) {
          return Response.json({error: error.message}, {status: 500});
        }
      }
      if (hostname === 'local' && pathname === '/paper-canvas' && request.method === 'POST') {
        try {
          const storeApi = resolveCanvasStore();
          if (!storeApi) return Response.json({error: '当前未连接研究画布存储（请在 main.mjs 传入 canvasStore）。'}, {status: 503});
          const payload = await request.json();
          const canvasName = standardCanvasName({paperTitle: payload.paperTitle, year: payload.year});
          const prompt = buildPaperCanvasPrompt({...payload, canvasName});
          const aiResult = await complete(prompt, [], request.signal);
          request.signal?.throwIfAborted();
          if (storeApi !== resolveCanvasStore()) throw Error("文献库已切换，请重新生成。");
          const saved = await upsertPaperCanvas({
            canvasStore: storeApi,
            paperId: payload.paperId,
            paperTitle: payload.paperTitle,
            year: payload.year,
            rulesSource: aiResult?.answer || '',
            createNewCopy: Boolean(payload.createNewCopy),
          });
          return Response.json(saved);
        } catch (error) {
          return Response.json({error: error.message || '生成研究画布失败。'}, {status: 500});
        }
      }
      if (hostname === 'local' && pathname === '/service' && request.method === 'GET') {
        try {
          const config = await checkService(searchParams.get('vision') === '1', request.signal);
          return Response.json({ready:true, model:config.model || '客户端默认模型',
            service:config.connection === 'antigravity' ? 'Antigravity' : 'API'});
        } catch (error) {
          return Response.json({error:error.message}, {status:503});
        }
      }
      if (hostname !== 'local' || !routes.get(request.method)?.has(pathname)) {
        return new Response(null, {status: 404});
      }
      try {
        const {port, key} = await start();
        const headers = {'X-Materia-Workbench': key};
        let body;
        if (request.method === 'POST') {
          body = Buffer.from(await request.arrayBuffer());
          headers['Content-Type'] = request.headers.get('Content-Type') || 'application/json';
          headers['Content-Length'] = body.length;
          headers['X-Workbench'] = request.headers.get('X-Workbench') || '';
        }
        return await requestWorker({port, pathname, method:request.method, headers, body, signal:request.signal});
      } catch (error) {
        const interrupted = ['ABORT_ERR', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE'].includes(error.code);
        return Response.json({error: interrupted ? 'AI 工作室连接已中断，请重试。' : error.message}, {status: 503});
      }
    },
  };
}
