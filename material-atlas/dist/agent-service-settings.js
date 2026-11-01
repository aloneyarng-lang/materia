import {t as tr,html,msg} from './i18n.js';
import {bindStaticDOM} from './i18n.js';
import {AGENT_PROVIDERS,agentProvider,providerForConfig,canonicalAgentUrl} from './agent-providers.js';
import {cleanAgentKey} from './agent-auth.js';

export function createAgentServiceSettings(panel,{getConfig,getBrowserKey,native,isBusy}){
  const $=selector=>panel.querySelector(selector),provider=$('#agent-provider'),key=$('#agent-key'),model=$('#agent-model'),picker=$('#agent-model-select'),manual=$('#agent-model-manual'),status=$('#agent-connection-status'),refresh=$('[data-agent-action="test-connection"]');
  for(const preset of AGENT_PROVIDERS){const option=document.createElement('option');option.value=preset.id;option.textContent=tr(preset.name);provider.append(option);}
  const custom=document.createElement('option');custom.value='custom';custom.textContent=tr('自定义服务 / 本机模型');provider.append(custom);
  bindStaticDOM(provider,{translated:true});
  let revision=0,timer,controller,fetching=false,lastFingerprint='',manualChoice=false;
  const endpoint=()=>{try{return canonicalAgentUrl($('#agent-base-url').value);}catch{return '';}};
  const sameSavedEndpoint=()=>endpoint()===getConfig().baseUrl;
  function draft(){return{provider:provider.value,baseUrl:$('#agent-base-url').value.trim(),protocol:$('#agent-protocol').value,model:model.value.trim(),apiKey:cleanAgentKey(key.value),rememberKey:$('#agent-remember').checked};}
  function fingerprint(){const value=draft();return JSON.stringify([value.provider,value.baseUrl,value.protocol,value.apiKey]);}
  function cancel(){
    revision++;clearTimeout(timer);controller?.abort();controller=null;
    if(fetching&&native?.agentCancelModels)native.agentCancelModels().catch(()=>{});
    fetching=false;refresh.disabled=Boolean(isBusy());refresh.textContent=tr('刷新模型');
  }
  function sync(){
    const customMode=provider.value==='custom';$('#agent-custom-settings').hidden=!customMode;
    $('#agent-manual-model-field').hidden=!manual.checked;$('#agent-model-picker-field').hidden=manual.checked;
    model.required=manual.checked;picker.required=!manual.checked;
    $('#agent-base-url').required=customMode;
    if(!manual.checked)model.value=picker.value;
    refresh.disabled=Boolean(isBusy())||fetching;
    const preset=agentProvider(provider.value);
    $('#agent-provider-hint').textContent=preset?msg`${new URL(preset.baseUrl).host} · 填入密钥后自动获取模型。请使用该站点的 API 密钥；订阅或其他地区的密钥可能需要自定义地址。`:tr('保留自定义地址、模型与 API 协议；本机服务可不填密钥，也可点击“刷新模型”查询。');
  }
  function showModels(models,selected){
    picker.replaceChildren();
    if(selected&&!models.some(m=>m.id===selected)){
      const option=document.createElement('option');option.value=selected;option.textContent=msg`${selected}（当前设置，列表未确认）`;picker.append(option);
    }
    for(const row of models){const option=document.createElement('option');option.value=row.id;option.textContent=row.name&&row.name!==row.id?`${row.name} · ${row.id}`:row.id;picker.append(option);}
    if(!picker.options.length){const option=document.createElement('option');option.value='';option.textContent=tr('输入密钥后自动获取，或手动填写');picker.append(option);}
    picker.value=selected||models[0]?.id||'';
  }
  function resetModels(selected=''){lastFingerprint='';showModels([],selected);model.value=selected;}
  function fill(){
    cancel();const config=getConfig();provider.value=providerForConfig(config);
    $('#agent-base-url').value=config.baseUrl;$('#agent-protocol').value=config.protocol||agentProvider(provider.value)?.protocol||'chat';
    key.value='';manualChoice=false;manual.checked=provider.value==='custom';resetModels(config.model||'');status.textContent='';sync();
    if(provider.value!=='custom'&&config.hasKey)schedule();
  }
  function schedule(){
    clearTimeout(timer);if(isBusy()||provider.value==='custom'||(!key.value.trim()&&!(sameSavedEndpoint()&&getConfig().hasKey)))return;
    timer=setTimeout(()=>refreshModels(false),750);
  }
  async function refreshModels(force=true){
    clearTimeout(timer);if(isBusy())return;
    let value,stamp;try{value=draft();stamp=fingerprint();}catch(error){status.textContent=error.message;return;}
    if(!force&&stamp===lastFingerprint)return;
    cancel();const turn=revision;controller=new AbortController();const signal=controller.signal;
    fetching=true;refresh.disabled=true;refresh.textContent=tr('正在获取…');status.textContent=tr('正在查询厂商模型列表，不发送问题或文献，不生成内容…');
    try{
      let result;
      if(native){if(!native.agentListModels)throw new Error(tr('请退出并重新打开新版 Materia，以启用自动获取模型。'));result=await native.agentListModels(value);}
      else{
        value.apiKey=value.apiKey||(sameSavedEndpoint()?getBrowserKey():'');
        const response=await fetch('/api/ai-agent/models',{method:'POST',headers:{'Content-Type':'application/json','X-Materia-Agent':'1'},body:JSON.stringify({config:value}),signal});
        try{result=await response.json();}catch{throw new Error(tr('模型查询服务不可用，请重新启动新版 Materia。'));}
        if(!response.ok)throw new Error(result.error||tr('模型获取失败。'));
      }
      if(turn!==revision||stamp!==fingerprint())return;
      if(!result.ok){status.textContent=result.message+(result.httpStatus?`（HTTP ${result.httpStatus}）`:'');return;}
      const selected=model.value.trim();showModels(result.models,selected);
      // A failed discovery never overwrites a manually entered or previously saved ID.
      if(!manualChoice&&provider.value!=='custom')manual.checked=false;
      lastFingerprint=stamp;sync();
      status.textContent=msg`连接检测通过。${result.message}\n本次请求${result.keyProvided?tr('已附带'):tr('未附带')}密钥。选择模型后点击“保存设置”。`;
    }catch(error){if(turn===revision&&!signal.aborted)status.textContent=error.message||tr('模型获取失败，请重试。');}
    finally{if(turn===revision){fetching=false;controller=null;refresh.textContent=tr('刷新模型');sync();}}
  }
  provider.addEventListener('change',()=>{
    cancel();const preset=agentProvider(provider.value);
    // Do not carry a typed credential or a model ID into a different service.
    key.value='';$('#agent-remember').checked=false;
    key.placeholder=tr('请输入所选厂商的 API 密钥');const keyStatus=$('#agent-key-status');if(keyStatus)keyStatus.textContent=tr('切换厂商后请填写对应密钥，保存前不会更改现有服务。');
    if(preset){$('#agent-base-url').value=preset.baseUrl;$('#agent-protocol').value=preset.protocol;}
    else{$('#agent-base-url').value='';$('#agent-protocol').value='chat';}
    manual.checked=!preset;manualChoice=false;resetModels();status.textContent='';sync();schedule();
  });
  key.addEventListener('input',()=>{cancel();lastFingerprint='';status.textContent='';resetModels(model.value.trim());schedule();});
  for(const id of ['#agent-base-url','#agent-protocol'])$(id).addEventListener('input',()=>{cancel();resetModels(model.value.trim());status.textContent='';});
  manual.addEventListener('change',()=>{
    manualChoice=true;
    if(!manual.checked&&model.value.trim()&&![...picker.options].some(o=>o.value===model.value.trim())){
      const option=document.createElement('option');option.value=model.value.trim();option.textContent=option.value+tr('（手动填写）',false);picker.append(option);picker.value=option.value;
    }
    sync();(manual.checked?model:picker).focus();
  });
  picker.addEventListener('change',()=>{model.value=picker.value;});
  return{fill,draft,refresh:refreshModels,cancel,sync};
}
