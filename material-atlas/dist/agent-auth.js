import {t as tr,html,msg} from './i18n.js';
import {providerRequiresKey} from './agent-providers.js';
// Public auth state and safe messages only; never include credential values.
export function cleanAgentKey(value){
  let key=String(value||'').trim();
  if(/^authorization\s*:/i.test(key))throw new Error(tr('密钥栏只填写 API 密钥本身，请不要粘贴 Authorization 请求头。'));
  key=key.replace(/^Bearer\s+/i,'').trim();
  if(/[\s"'“”‘’]/.test(key)||/[^\x21-\x7e]/.test(key))throw new Error(tr('API 密钥中有空格、引号或非英文字符。请只粘贴完整密钥，不要包含引号、说明文字或隐藏的换行。'));
  if(/[*•●…]/.test(key))throw new Error(tr('看起来粘贴了遮盖后的密钥。请使用创建密钥时显示的完整值，不要复制星号或圆点。'));
  if(key.length>4096||/[\r\n]/.test(key))throw new Error(tr('API 密钥格式无效，请只填写密钥本身。'));
  return key;
}
export function isGeminiCompatible(baseUrl){
  try{const url=new URL(baseUrl);return url.hostname==='generativelanguage.googleapis.com'&&/^\/v1(?:beta)?\/openai\/?$/.test(url.pathname);}catch{return false;}
}
export function normalizeAgentModel(model,baseUrl){
  const value=String(model||'').trim();return isGeminiCompatible(baseUrl)?value.replace(/^models\//,''):value;
}
export function agentCredentialIssue(config={}){
  if(config.connection==='antigravity')return config.clientPath?'':tr('请先在服务设置中检测并保存本地反重力客户端。');
  if(!config.model)return tr('请先在 AI 服务设置中填写地址和模型。');
  let host;try{host=new URL(config.baseUrl).hostname;}catch{return tr('请在 AI 服务设置中填写有效的 API 地址。');}
  if(host==='generativelanguage.googleapis.com'){
    if(!isGeminiCompatible(config.baseUrl))return tr('Google Gemini 请填写官方 OpenAI 兼容地址：https://generativelanguage.googleapis.com/v1beta/openai。');
    if(config.protocol==='responses')return tr('Google Gemini 官方兼容接口请使用 Chat Completions 协议，当前选择的 Responses 不能用于此配置。请修改协议后重新测试并保存。');
  }
  const required=providerRequiresKey(config)||host==='generativelanguage.googleapis.com',hasKey=config.hasKey??Boolean(config.apiKey);
  return required&&!hasKey?tr('当前未提供 API 密钥。请在「AI 研究助手 → 服务设置」重新填写并保存；未勾选系统加密记住密钥时，重启后需要重新填写。'):'';
}
export function agentHTTPError(status,hasKey){
  const hint=status===401?(hasKey?tr('服务未接受当前 API 密钥（认证失败）。请确认密钥属于当前 API 地址、仍有效，并在服务设置中重新填写保存。'):tr('本次请求未提供 API 密钥。请在服务设置中重新填写并保存；未记住的密钥在重启后会清除。')):
    status===403?tr('当前密钥或账号没有访问权限，请检查模型授权及服务方的访问限制。'):
    status===402?tr('服务账号余额不足，请在服务方控制台检查余额。'):
    status===429?tr('请求限流或额度不足，请稍后重试并检查服务额度。'):
    tr('请检查 API 地址、模型名称和 API 协议。');
  return msg`AI 服务返回 HTTP ${status}。${hint}`;
}
