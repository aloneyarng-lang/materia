import {agentCredentialIssue,agentHTTPError} from '../dist/agent-auth.js';
import {agentModelsUrl} from '../dist/agent-providers.js';

export function agentHeaders(config){
  return {Accept:'application/json',...(config.protocol==='anthropic'?{'anthropic-version':'2023-06-01',...(config.apiKey?{'x-api-key':config.apiKey}:{})}:config.apiKey?{Authorization:`Bearer ${config.apiKey}`}:{})};
}
export async function readAgentJSON(response,limit=4*1024*1024){
  const reader=response.body.getReader(),decoder=new TextDecoder();let size=0,raw='';
  try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new Error('too large');raw+=decoder.decode(value,{stream:true});}return JSON.parse(raw+decoder.decode());}
  catch{await reader.cancel().catch(()=>{});throw new Error('invalid response');}
  finally{reader.releaseLock();}
}
function modelRows(data){
  if(Array.isArray(data?.data))return data.data;
  if(Array.isArray(data?.data?.models))return data.data.models;
  if(Array.isArray(data?.output?.models))return data.output.models;
  return null;
}
function cleanModel(row,config){
  let id=row?.id||row?.model_id||row?.model;
  if(config.provider==='gemini'&&typeof id==='string')id=id.replace(/^models\//,'');
  if(typeof id!=='string'||! /^[a-z\d][a-z\d._:/+@~-]{0,199}$/i.test(id)||config.apiKey&&id.includes(config.apiKey))return null;
  const modalities=row.output_modalities||row.inference_metadata?.response_modality;
  if(row.lifecycle==='retired'||row.capabilities?.completion_chat===false||Array.isArray(modalities)&&!modalities.some(m=>String(m).toLowerCase()==='text'))return null;
  // Explicit non-chat APIs are unusable by both research and translation.
  if(/^(?:text-embedding|embedding|whisper|tts|dall-e|gpt-image|omni-moderation|text-moderation|sora)(?:[-/:]|$)/i.test(id))return null;
  if(/(?:^|[-/])(?:realtime|transcribe|transcription|tts)(?:[-/]|$)/i.test(id))return null;
  const name=String(row.display_name||row.name||id).replace(/[\x00-\x1f\x7f]/g,'').slice(0,160);
  return {id,name:config.apiKey&&name.includes(config.apiKey)?id:name};
}
// Discovery never sends a prompt, persists a key, or follows a provider-supplied URL.
export async function discoverAgentModels(config,{signal}={},fetcher=fetch){
  const keyProvided=Boolean(config.apiKey),base={host:new URL(config.baseUrl).hostname,keyProvided,model:config.model};
  const issue=agentCredentialIssue({...config,model:config.model||'model-discovery'});
  if(issue)return{...base,ok:false,stage:'configuration',message:issue};
  const abort=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(30000)]),url=agentModelsUrl(config),models=new Map(),cursors=new Set();let received=0;
  for(let page=0;page<10;page++){
    let response;
    try{response=await fetcher(url.href,{method:'GET',headers:agentHeaders(config),signal:abort,redirect:'error'});}
    catch{return{...base,ok:false,stage:'network',message:abort.aborted?'模型获取已停止或超时，请检查网络后重试。':'无法连接服务，请检查地址、网络或证书。'};}
    if(!response.ok){await response.body?.cancel();return{...base,ok:false,stage:'http',httpStatus:response.status,message:[404,405,501].includes(response.status)?'该服务未开放兼容的模型列表接口。可手动填写模型，或在自定义服务中配置其他地址。':agentHTTPError(response.status,keyProvided)};}
    let data;try{data=await readAgentJSON(response);}catch{return{...base,ok:false,stage:'response',httpStatus:response.status,message:'模型列表未返回可识别的 JSON。请检查地址，或手动填写模型。'};}
    const rows=modelRows(data);
    if(!rows)return{...base,ok:false,stage:'response',httpStatus:response.status,message:'模型列表格式无法识别。请确认服务支持模型查询，或手动填写模型。'};
    for(const row of rows){const model=cleanModel(row,config);if(model)models.set(model.id,model);}
    received+=rows.length;
    if(url.searchParams.has('page_no')&&Number.isSafeInteger(data.output?.total)&&received<data.output.total){
      if(!rows.length||page===9)return{...base,ok:false,stage:'response',message:'模型列表分页未能完整读取，请稍后刷新，或手动填写模型。'};
      url.searchParams.set('page_no',String(page+2));continue;
    }
    if(data.has_more===true){
      const cursor=data.last_id||rows.at(-1)?.id;
      if(typeof cursor!=='string'||!cursor||cursor.length>200||cursors.has(cursor)||page===9)return{...base,ok:false,stage:'response',message:'模型列表分页未能完整读取，请稍后刷新，或手动填写模型。'};
      cursors.add(cursor);url.searchParams.set(config.protocol==='anthropic'?'after_id':'after',cursor);continue;
    }
    if(!models.size)return{...base,ok:false,stage:'empty',httpStatus:response.status,message:'服务没有返回可用于文本对话的模型。请检查开通权限，或手动填写模型。'};
    return{...base,ok:true,stage:'authenticated',httpStatus:response.status,models:[...models.values()],message:`已获取 ${models.size} 个文本模型。列表以服务返回为准，实际调用仍取决于账号权限与模型能力。`};
  }
}
