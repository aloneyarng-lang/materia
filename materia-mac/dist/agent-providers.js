// Endpoint presets only. Model IDs always come from the service, never a bundled roster.
export const AGENT_PROVIDERS = Object.freeze([
  {id:'deepseek',name:'DeepSeek',baseUrl:'https://api.deepseek.com/v1',docs:'https://api-docs.deepseek.com/api/list-models/'},
  {id:'qwen',name:'阿里云百炼 · 通义千问（中国内地）',baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1',docs:'https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope'},
  {id:'qwen-intl',name:'阿里云百炼 · 通义千问（新加坡）',baseUrl:'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',modelsUrl:'https://dashscope-intl.aliyuncs.com/api/v1/models',modelsQuery:'capabilities=TG&capabilities=Reasoning&page_no=1&page_size=100',docs:'https://help.aliyun.com/zh/model-studio/list-models'},
  {id:'moonshot',name:'月之暗面 · Kimi（中国站）',baseUrl:'https://api.moonshot.cn/v1',docs:'https://platform.moonshot.cn/docs/api/models'},
  {id:'zhipu',name:'智谱 · GLM',baseUrl:'https://open.bigmodel.cn/api/paas/v4',docs:'https://docs.bigmodel.cn/cn/guide/develop/openai/introduction'},
  {id:'doubao',name:'字节跳动 · 豆包 / 火山方舟',baseUrl:'https://ark.cn-beijing.volces.com/api/v3',docs:'https://www.volcengine.com/docs/82379/1330626'},
  {id:'qianfan',name:'百度千帆 · 文心',baseUrl:'https://qianfan.baidubce.com/v2',docs:'https://cloud.baidu.com/doc/qianfan-api/s/Dmba8k71y'},
  {id:'hunyuan',name:'腾讯混元',baseUrl:'https://api.hunyuan.cloud.tencent.com/v1',docs:'https://cloud.tencent.com.cn/document/product/1729/111007'},
  {id:'minimax',name:'MiniMax（中国站）',baseUrl:'https://api.minimax.cn/v1',docs:'https://platform.minimax.cn/docs/api-reference/text-openai-api'},
  {id:'siliconflow',name:'硅基流动 · SiliconFlow',baseUrl:'https://api.siliconflow.cn/v1',modelsQuery:'sub_type=chat',docs:'https://api-docs.siliconflow.cn/docs/api/models-get'},
  {id:'openai',name:'OpenAI',baseUrl:'https://api.openai.com/v1',protocol:'responses',docs:'https://developers.openai.com/api/reference/resources/models/methods/list'},
  {id:'anthropic',name:'Anthropic · Claude',baseUrl:'https://api.anthropic.com/v1',protocol:'anthropic',docs:'https://platform.claude.com/docs/en/api/models/list'},
  {id:'gemini',name:'Google · Gemini',baseUrl:'https://generativelanguage.googleapis.com/v1beta/openai',docs:'https://ai.google.dev/gemini-api/docs/openai'},
  {id:'xai',name:'xAI · Grok',baseUrl:'https://api.x.ai/v1',docs:'https://docs.x.ai/developers/rest-api-reference/inference/models'},
  {id:'mistral',name:'Mistral AI',baseUrl:'https://api.mistral.ai/v1',docs:'https://docs.mistral.ai/api/endpoint/models'},
  {id:'groq',name:'Groq',baseUrl:'https://api.groq.com/openai/v1',docs:'https://console.groq.com/docs/models'},
  {id:'openrouter',name:'OpenRouter',baseUrl:'https://openrouter.ai/api/v1',modelsPath:'/models/user',docs:'https://openrouter.ai/docs/api/api-reference/models/list-models-user-filtered'},
].map(p=>Object.freeze({protocol:'chat',...p})));

export function canonicalAgentUrl(value){
  let url;try{url=new URL(String(value||'https://api.openai.com/v1').trim());}catch{throw new Error('请输入有效的 API 地址。');}
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if((url.protocol!=='https:'&&!(url.protocol==='http:'&&local))||url.username||url.password||url.search||url.hash)throw new Error('API 地址需要 HTTPS；本机服务可用 HTTP。地址中不能包含密钥、查询参数或账号。');
  return url.href.replace(/\/(?:chat\/completions|responses|messages)\/?$/,'').replace(/\/$/,'');
}
export function agentProvider(id){return AGENT_PROVIDERS.find(p=>p.id===id);}
export function providerForConfig(config={}){
  if(config.provider==='custom')return 'custom';
  let base;try{base=canonicalAgentUrl(config.baseUrl);}catch{return 'custom';}
  // Preserve older user settings, including custom model IDs and protocol choices.
  return AGENT_PROVIDERS.find(p=>p.baseUrl===base)?.id||'custom';
}
export function providerEndpoint(value={}){
  const preset=agentProvider(value.provider);
  const baseUrl=canonicalAgentUrl(value.baseUrl||preset?.baseUrl);
  if(preset&&preset.baseUrl!==baseUrl)throw new Error('厂商与 API 地址不一致，请重新选择厂商，或选择“自定义服务”。');
  return {baseUrl,provider:value.provider==='custom'?'custom':preset?.id||providerForConfig({baseUrl}),protocol:value.protocol||preset?.protocol||'chat'};
}
export function agentModelsUrl(config){
  const preset=agentProvider(config.provider),url=new URL(preset?.modelsUrl||config.baseUrl+(preset?.modelsPath||'/models'));
  if(preset?.modelsQuery)url.search=preset.modelsQuery;
  if(config.protocol==='anthropic')url.searchParams.set('limit','1000');
  return url;
}
export function providerRequiresKey(config){return config.provider!=='custom'&&Boolean(agentProvider(config.provider))||AGENT_PROVIDERS.some(p=>new URL(p.baseUrl).origin===new URL(config.baseUrl).origin);}
