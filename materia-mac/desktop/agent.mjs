import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {cleanAgentKey,agentCredentialIssue,agentHTTPError,isGeminiCompatible,normalizeAgentModel} from '../dist/agent-auth.js';
import {providerEndpoint} from '../dist/agent-providers.js';
import {discoverAgentModels,agentHeaders} from './agent-models.mjs';
import {cleanAntigravityConfig,completeWithAntigravity} from './agent-antigravity.mjs';

export function normalizeAgentConfig(value = {}, {requireModel=true}={}) {
  if(value.connection==='antigravity')return cleanAntigravityConfig(value);
  const {baseUrl,provider,protocol}=providerEndpoint(value);
  const model=normalizeAgentModel(value.model,baseUrl);
  if ((requireModel&&!model)||model.length>200) throw new Error('请填写服务支持的模型名称。');
  if (!['chat','responses','anthropic'].includes(protocol)) throw new Error('API 协议无效。');
  return {baseUrl,provider,model,protocol,apiKey:cleanAgentKey(value.apiKey),rememberKey:Boolean(value.rememberKey)};
}

// Kept in the desktop profile, outside library.json and library backups.
export class AgentSettings {
  constructor(profile, encryption) { this.file = path.join(profile, 'ai-agent.json'); this.encryption = encryption; this.config = null; this.profiles={}; this.queue = Promise.resolve(); this.canRememberKey = false; }
  async encryptionAvailable() { this.canRememberKey = Boolean(await (this.encryption?.isAsyncEncryptionAvailable?.() ?? this.encryption?.isEncryptionAvailable?.())); return this.canRememberKey; }
  async load() {
    await this.encryptionAvailable();
    let saved;
    try { saved = JSON.parse(await readFile(this.file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw new Error('AI 配置文件无法读取，请检查桌面配置目录。'); }
    if (saved?.model||saved?.connection==='antigravity') {
      for(const source of [saved.profiles?.api,saved.profiles?.antigravity,saved].filter(Boolean)){
      const config = normalizeAgentConfig({ ...source, apiKey: '' });
      if (source.encryptedKey && this.canRememberKey && config.connection!=='antigravity') {
        try { const encrypted=Buffer.from(source.encryptedKey,'base64'); const decoded=await (this.encryption.decryptStringAsync ? this.encryption.decryptStringAsync(encrypted) : this.encryption.decryptString(encrypted)); config.apiKey=typeof decoded==='string'?decoded:decoded.result; } catch { config.rememberKey = false; }
      }
      if (!config.apiKey) config.rememberKey = false;
      this.profiles[config.connection==='antigravity'?'antigravity':'api']=config;
      this.config=config;
      }
    }
    return this.publicConfig();
  }
  publicConfig() {
    const { apiKey, ...config } = this.config || { baseUrl: 'https://api.openai.com/v1', model: '', protocol: 'chat', apiKey: '', rememberKey: false };
    const profiles=Object.fromEntries(Object.entries(this.profiles).map(([name,{apiKey,...profile}])=>[name,{...profile,hasKey:Boolean(apiKey)}]));
    return { ...config, hasKey: Boolean(apiKey), canRememberKey: this.canRememberKey,profiles };
  }
  resolve(value,options){const clean=normalizeAgentConfig(value,options);if(clean.connection==='antigravity')return clean;const previous=this.profiles.api||this.config;return{...clean,apiKey:value.clearKey?'':(clean.apiKey||(previous?.baseUrl===clean.baseUrl?previous.apiKey:''))};}
  save(value) {
    const operation = this.queue.then(async () => {
      const next = this.resolve(value);
      if (next.rememberKey && !await this.encryptionAvailable()) throw new Error('系统加密不可用。请取消“记住密钥”，仅在本次运行使用。');
      const profiles={...this.profiles,[next.connection==='antigravity'?'antigravity':'api']:next},serialized={};
      for(const [name,{apiKey,...profile}] of Object.entries(profiles)){
        if(apiKey&&profile.rememberKey)profile.encryptedKey=(await(this.encryption.encryptStringAsync?this.encryption.encryptStringAsync(apiKey):this.encryption.encryptString(apiKey))).toString('base64');
        serialized[name]=profile;
      }
      const stored={...serialized[next.connection==='antigravity'?'antigravity':'api'],profiles:serialized};
      await mkdir(path.dirname(this.file), { recursive: true });
      const temp = `${this.file}.${randomUUID()}.tmp`;
      await writeFile(temp, JSON.stringify(stored, null, 2), { mode: 0o600 });
      await rename(temp, this.file);
      this.config = next;
      this.profiles=profiles;
      return this.publicConfig();
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}

export async function listAgentModels(value,options={},fetcher=fetch){
  if(value?.connection==='antigravity')return{ok:false,message:'本地反重力请使用“检测客户端”，模型可留空使用客户端默认设置。'};
  let config;try{config=normalizeAgentConfig(value,{requireModel:false});}catch(error){return{ok:false,stage:'configuration',message:error.message};}
  return discoverAgentModels(config,options,fetcher);
}
// Connection diagnostics deliberately omit the model roster from their public result.
export async function testAgentConnection(value,options={},fetcher=fetch){
  let config;try{config=normalizeAgentConfig(value);}catch(error){return{ok:false,stage:'configuration',message:error.message};}
  const {models,...result}=await discoverAgentModels(config,options,fetcher);
  if(!result.ok)return result;
  const modelAvailable=models.some(row=>normalizeAgentModel(row.id,config.baseUrl)===config.model);
  if(isGeminiCompatible(config.baseUrl)){const ids=models.map(row=>normalizeAgentModel(row.id,config.baseUrl)).filter(id=>/^gemini-[a-z\d][a-z\d._-]{0,180}$/i.test(id));const availableModels=ids.slice(0,40);return{...result,modelAvailable,availableModels,modelListTruncated:ids.length>40,message:modelAvailable?'连接检测通过，当前模型在返回列表中。':'认证已通过，当前模型未匹配。可用模型：'+availableModels.slice(0,8).join('、')};}
  return {...result,modelAvailable,message:modelAvailable?'连接检测通过，服务接受了本次请求，当前模型在返回列表中。':'服务接受了本次请求，但列表中没有当前模型，请核对模型名称。'};
}

function providerBody(config, messages, tools) {
  if(config.protocol==='anthropic'){
    const system=messages.filter(m=>m.role==='system').map(m=>m.content).filter(Boolean).join('\n'),input=[];
    for(const message of messages){
      if(message.role==='system')continue;
      let role=message.role==='assistant'?'assistant':'user',content=[];
      if(message.role==='tool')content=[{type:'tool_result',tool_use_id:message.tool_call_id,content:message.content||''}];
      else if(role==='assistant'&&Array.isArray(message.providerOutput))content=message.providerOutput.filter(b=>['text','tool_use','thinking','redacted_thinking'].includes(b.type));
      else{
        if(message.content)content.push({type:'text',text:message.content});
        for(const call of message.tool_calls||[]){let args;try{args=JSON.parse(call.function.arguments||'{}');}catch{throw new Error('工具参数格式无效，请重新提问。');}content.push({type:'tool_use',id:call.id,name:call.function.name,input:args});}
      }
      if(!content.length)continue;
      if(input.at(-1)?.role===role)input.at(-1).content.push(...content);else input.push({role,content});
    }
    return{model:config.model,max_tokens:8192,system,messages:input,...(tools.length?{tools:tools.map(t=>({name:t.name,description:t.description,input_schema:t.parameters}))}:{}),stream:false};
  }
  if (config.protocol === 'chat') return { model: config.model, messages: messages.map(({providerOutput,...message})=>({...message,...(message.role==='assistant'&&providerOutput&&!Array.isArray(providerOutput)?Object.fromEntries(['reasoning_content','reasoning_details','extra_content'].filter(k=>providerOutput[k]!==undefined).map(k=>[k,providerOutput[k]])):{})})), ...(tools.length?{tools:tools.map(tool => ({ type: 'function', function: tool })),tool_choice:'auto'}:{}), stream: false };
  const input = [];
  for (const message of messages) {
    if (message.role === 'tool') input.push({ type: 'function_call_output', call_id: message.tool_call_id, output: message.content });
    else if (message.role === 'assistant' && Array.isArray(message.providerOutput)) input.push(...message.providerOutput.filter(item => ['reasoning','message','function_call'].includes(item.type)));
    else {
      if (message.content) input.push({ role: message.role === 'system' ? 'developer' : message.role, content: message.content });
      for (const call of message.tool_calls || []) input.push({ type: 'function_call', call_id: call.id, name: call.function.name, arguments: call.function.arguments });
    }
  }
  return { model: config.model, input, ...(tools.length?{tools:tools.map(tool => ({ type: 'function', ...tool, strict: false })),tool_choice:'auto'}:{}), store: false, include: ['reasoning.encrypted_content'], stream: false };
}

export async function completeWithProvider(configValue, { messages, tools = [], signal }, fetcher = fetch) {
  if(configValue?.connection==='antigravity')return completeWithAntigravity(configValue,{messages,tools,signal});
  const config = normalizeAgentConfig(configValue);
  const issue=agentCredentialIssue(config);if(issue)throw new Error(issue);
  const abort = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(90000)]);
  let response;
  try {
    response = await fetcher(`${config.baseUrl}/${config.protocol==='anthropic'?'messages':config.protocol === 'responses' ? 'responses' : 'chat/completions'}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...agentHeaders(config) }, body: JSON.stringify(providerBody(config, messages, tools)), signal: abort, redirect: 'error' });
  } catch (error) {
    if (signal?.aborted) throw new DOMException('已停止生成。', 'AbortError');
    if (abort.aborted) throw new Error('AI 服务响应超时，请重试。');
    throw new Error('无法连接 AI 服务，请检查 API 地址、网络和证书。');
  }
  if (!response.ok) { await response.body?.cancel(); throw new Error(agentHTTPError(response.status,Boolean(config.apiKey))); }
  const reader = response.body.getReader(); let size = 0, raw = ''; const decoder = new TextDecoder();
  try {
    while (true) { const {done,value} = await reader.read(); if (done) break; size += value.length; if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new Error('AI 服务返回的内容过大。'); } raw += decoder.decode(value, { stream: true }); }
    raw += decoder.decode();
  } catch (error) { if (signal?.aborted) throw new DOMException('已停止生成。','AbortError'); if (abort.aborted) throw new Error('AI 服务响应超时，请重试。'); throw error; }
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error('AI 服务未返回 JSON，请检查 API 地址及协议。'); }
  if(config.protocol==='anthropic'){
    if(!Array.isArray(data.content)||['max_tokens','pause_turn'].includes(data.stop_reason)||data.error)throw new Error('Claude 返回不完整，请缩小问题范围或检查模型设置。');
    return {content:data.content.filter(b=>b.type==='text').map(b=>b.text).join('\n'),tool_calls:data.content.filter(b=>b.type==='tool_use').map(b=>({id:b.id,type:'function',function:{name:b.name,arguments:JSON.stringify(b.input)}})),providerOutput:data.content};
  }
  if (config.protocol === 'chat') {
    const choice = data.choices?.[0];
    if (!choice?.message || choice.finish_reason === 'length') throw new Error('模型返回不完整，请缩小问题范围或更换模型。');
    const message=choice.message,providerOutput={};
    for(const field of ['reasoning_content','reasoning_details','extra_content'])if(message[field]!==undefined)providerOutput[field]=message[field];
    return {...message,...(Object.keys(providerOutput).length?{providerOutput}:{})};
  }
  if (!Array.isArray(data.output) || data.status === 'incomplete' || data.error) throw new Error('Responses API 返回不完整，请检查模型与服务支持。');
  return { content: data.output.filter(o => o.type === 'message').flatMap(o => o.content || []).filter(c => c.type === 'output_text').map(c => c.text).join('\n'), tool_calls: data.output.filter(o => o.type === 'function_call').map(o => ({ id: o.call_id, type: 'function', function: { name: o.name, arguments: o.arguments } })), providerOutput: data.output };
}
