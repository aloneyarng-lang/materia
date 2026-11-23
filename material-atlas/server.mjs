import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleAgentRequest } from './desktop/agent-http.mjs';
import { createGoAnalysis } from './desktop/go-analysis.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const port = Number(process.env.PORT || 4173);
const mime = { '.mjs':'text/javascript; charset=utf-8', '.wasm':'application/wasm', '.bcmap':'application/octet-stream', '.ttf':'font/ttf', '.pfb':'application/octet-stream', '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json; charset=utf-8' };
export function createPreviewServer() {
const go = createGoAnalysis();
const server = http.createServer(async (req, res) => {
  try {
    if (await handleAgentRequest(req, res)) return;
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/api/flow-go/analyze') {
      const host = req.headers.host || '';
      if (req.method !== 'POST' || !/^(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host) ||
          req.headers.origin !== `http://${host}` || req.headers['x-materia-go'] !== '1') {
        res.writeHead(403).end();
        return;
      }
      try {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 256 * 1024) throw new Error('Go history is too large');
          chunks.push(chunk);
        }
        const result = await go.analyze(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        res.writeHead(200, {'Content-Type':'application/json', 'Cache-Control':'no-store'}).end(JSON.stringify(result));
      } catch (error) {
        if (!res.destroyed) res.writeHead(400).end(error.message);
      }
      return;
    }
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    const info=await stat(file);if (!info.isFile()) throw new Error('Not found');
    if(path.extname(file)==='.mp4'){
      const range=req.headers.range,match=range&&/^bytes=(\d*)-(\d*)$/.exec(range);
      let start=0,end=info.size-1;
      if(range){
        if(match&&(match[1]||match[2])){
          start=match[1]?Number(match[1]):Math.max(0,info.size-Number(match[2]));
          end=match[1]&&match[2]?Math.min(Number(match[2]),info.size-1):info.size-1;
        }else start=NaN;
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=info.size){
          res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return;
        }
      }
      res.writeHead(range?206:200,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':end-start+1,
        ...(range?{'Content-Range':`bytes ${start}-${end}/${info.size}`}:{}),'Cache-Control':'no-cache'});
      if(req.method==='HEAD'){res.end();return;}
      const stream=createReadStream(file,{start,end});res.on('close',()=>stream.destroy());stream.on('error',()=>res.destroy());stream.pipe(res);return;
    }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); }
});
server.on('close', () => go.close());
return server;
}
if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const server = createPreviewServer();
  server.listen(port, '127.0.0.1', () => console.log(`Materia is ready: http://localhost:${server.address().port}`));
}
