import { translateText } from './translation.mjs';
import { completeWithProvider,testAgentConnection,listAgentModels } from './agent.mjs';
import { AGENT_TOOLS } from '../dist/ai-agent-core.js';

// Preview uses a same-origin, loopback-only proxy; credentials remain session-only.
export async function handleAgentRequest(req, res) {
  if (!['/api/ai-agent/complete','/api/ai-agent/test','/api/ai-agent/models','/api/translation'].includes(req.url)) return false;
  const host = req.headers.host || '';
  const validHost = /^(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host);
  if (!validHost || req.method !== 'POST' || req.headers['x-materia-agent'] !== '1' || !String(req.headers['content-type']).startsWith('application/json') || req.headers.origin !== `http://${host}`) {
    res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: '只接受来自本机 Materia 页面的请求。' })); return true;
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  req.once('aborted', abort); res.once('close', abort);
  try {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 1024 * 1024) throw new Error('本次上下文过大，请新建对话。'); chunks.push(chunk); }
    // Decode only after all chunks to preserve split UTF-8 sequences.
    let payload;
    try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('请求格式无效。'); }
    if(payload.config?.connection==='antigravity')throw Error('本地反重力接入仅在 Materia 桌面版中可用。');
    if(req.url==='/api/ai-agent/models'){const result=await listAgentModels(payload.config,{signal:controller.signal});res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(result));return true;}
    if(req.url==='/api/ai-agent/test'){const result=await testAgentConnection(payload.config,{signal:controller.signal});res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(result));return true;}
    if(req.url==='/api/translation'){const result=await translateText(payload.config,payload.request,{signal:controller.signal});res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(result));return true;}
    if (!Array.isArray(payload.messages) || payload.messages.length > 100 || payload.messages.some(m => !m || !['system','user','assistant','tool'].includes(m.role))) throw new Error('对话格式无效。');
    const result = await completeWithProvider(payload.config, { messages: payload.messages, tools: AGENT_TOOLS, signal: controller.signal });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(result));
  } catch (error) {
    if (!res.destroyed) { res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error: error.message })); }
  } finally { req.removeListener('aborted', abort); res.removeListener('close', abort); }
  return true;
}
