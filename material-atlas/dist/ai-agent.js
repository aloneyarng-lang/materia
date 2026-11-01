import {t as tr,html,msg} from './i18n.js';
import {bindStaticDOM,getLocale} from './i18n.js';
import {icon} from './icons.js';
import {actionMenu} from './action-menus.js';
import { runResearchAgent } from './ai-agent-core.js';
import { renderChatMarkdown } from './agent-markdown.js';
import { cleanAgentHistory, emptyAgentHistory, chatTitle } from './agent-history.js';
import {agentCredentialIssue} from './agent-auth.js';
import {createAgentServiceSettings} from './agent-service-settings.js';
import {canonicalAgentUrl} from './agent-providers.js';

const labels = { get library_overview(){return tr('正在查看文献目录…');}, get search_library(){return tr('正在检索相关文献…');}, get read_papers(){return tr('正在阅读笔记与参数…');}, get compare_parameters(){return tr('正在整理性能观测…');} };
export function createAgentController(options) {
  const native = globalThis.materiaDesktop;
  const desktop = Boolean(native?.agentRun);
  const ribbonButton=document.createElement('button'); ribbonButton.type='button'; ribbonButton.className='ribbon-button'; ribbonButton.dataset.action='ai-agent'; ribbonButton.title=tr('AI 研究助手'); ribbonButton.setAttribute('aria-label',tr('AI 研究助手')); ribbonButton.setAttribute('aria-controls','ai-agent-panel'); ribbonButton.setAttribute('aria-expanded','false'); ribbonButton.innerHTML=icon('assistant');
  document.querySelector('.workspace-ribbon')?.insertBefore(ribbonButton,document.querySelector('.ribbon-spacer'));
  bindStaticDOM(ribbonButton,{translated:true});
  const panel = document.createElement('aside');
  panel.id = 'ai-agent-panel'; panel.className = 'agent-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', tr('AI 研究助手'));
  panel.innerHTML = html`<header class="agent-header"><div><small>MATERIA AGENT</small><h2>${icon('assistant')}AI 研究助手</h2></div><button type="button" class="icon-button" data-agent-action="close" aria-label="关闭 AI 研究助手" title="关闭 AI 研究助手">${icon('close')}</button></header>
    <div class="agent-toolbar"><label>文献范围<select id="agent-scope"><option value="all">整个文献库</option><option value="selected">当前选中文献</option></select></label><button type="button" class="text-button" data-agent-action="new">新对话</button>${actionMenu('agent-conversation-menu',tr('对话操作'),'<button type="button" data-agent-action="history" aria-expanded="false" aria-controls="agent-history">'+icon('clock')+tr('<span data-agent-history-label>历史记录</span></button><button type="button" data-agent-action="settings">',false)+icon('settings')+tr('服务设置</button>',false),{iconOnly:true,className:'icon-button'})}</div>
    <div class="agent-chatbar"><span id="agent-chat-title">新对话</span></div>
    <details id="agent-settings" class="agent-settings"><summary>配置 AI 服务</summary><form id="agent-config-form"><div class="agent-config-fields">
      <label>AI 服务厂商<select id="agent-provider" aria-describedby="agent-provider-hint"></select></label>
      <p id="agent-provider-hint" class="agent-help"></p>
      <div id="agent-custom-settings"><label>API 地址<input id="agent-base-url" type="url" placeholder="https://api.example.com/v1" autocomplete="off"></label><label>API 协议<select id="agent-protocol"><option value="chat">Chat Completions</option><option value="responses">Responses</option><option value="anthropic">Claude Messages</option></select></label></div>
      <label>API 密钥<input id="agent-key" type="password" placeholder="填写所选厂商的 API Key" maxlength="4096" autocomplete="off" spellcheck="false"></label>
      <label id="agent-model-picker-field">可用模型<select id="agent-model-select" aria-describedby="agent-connection-status"></select></label>
      <label class="agent-remember"><input id="agent-model-manual" type="checkbox">手动填写模型 ID</label>
      <label id="agent-manual-model-field">模型名称<input id="agent-model" placeholder="填写服务提供的模型 ID" maxlength="200" autocomplete="off"></label>
      <label class="agent-remember"><input id="agent-remember" type="checkbox">用系统加密记住密钥（仅桌面版）</label>
      <p class="agent-help">研究对话需模型支持工具调用，翻译无需。自动获取仅查询模型列表，不产生对话。本机服务可使用 http://localhost 地址。密钥不写入文献库或备份。</p>
      </div><div class="agent-config-actions"><button type="button" class="text-button" data-agent-action="forget">清除密钥</button><button class="primary" type="submit">保存设置</button></div>
    </form></details>
    <p id="agent-data-notice" class="agent-data-notice"></p>
    <section id="agent-history" class="agent-history" aria-label="历史聊天记录" hidden><div class="agent-history-heading"><strong>历史聊天记录</strong><button type="button" class="text-button" data-agent-action="back">返回对话</button></div><input id="agent-history-search" type="search" placeholder="搜索标题或聊天内容" aria-label="搜索聊天历史"><div id="agent-history-list" class="agent-history-list"></div></section>
    <div id="agent-messages" class="agent-messages" role="log" aria-label="研究对话" aria-live="polite"></div>
    <div id="agent-status" class="agent-status" role="status"></div>
    <form id="agent-question-form" class="agent-composer"><label class="sr-only" for="agent-question">向研究助手提问</label><textarea id="agent-question" maxlength="8000" rows="3" placeholder="查找文献、梳理笔记、比较性能参数…" required></textarea><div><small id="agent-range-label"></small><button type="button" class="outline-button" data-agent-action="stop" hidden>停止</button><button class="primary" id="agent-send" type="submit">发送</button></div></form>`;
  document.body.append(panel);
  bindStaticDOM(panel,{translated:true});
  const $ = selector => panel.querySelector(selector);
  $('.agent-config-actions').insertAdjacentHTML('afterbegin',tr('<button type="button" class="outline-button" data-agent-action="test-connection">刷新模型</button>'));
  const connectionStatus=document.createElement('p');connectionStatus.id='agent-connection-status';connectionStatus.className='agent-help';connectionStatus.setAttribute('role','status');$('.agent-config-actions').before(connectionStatus);
  const status = message => { $('#agent-status').textContent = message; };
  let config = { baseUrl: 'https://api.openai.com/v1', model: '', protocol: 'chat', hasKey: false, canRememberKey: false, rememberKey: false };
  let browserKey = '', entries = [], busy = false, controller, requestId = '', generation = 0, initialized = false, returnFocus, contextIdentity = '';
  let chats=emptyAgentHistory(),historyReady=false,historyKey='',saveQueue=Promise.resolve(),libraryEpoch=0;
  const serviceSettings=createAgentServiceSettings(panel,{getConfig:()=>config,getBrowserKey:()=>browserKey,native:desktop?native:null,isBusy:()=>busy});
  const sources = new Map();
  const activeChat = () => chats.conversations.find(chat=>chat.id===chats.activeId);
  const scopeIds = () => $('#agent-scope').value === 'selected' ? (activeChat()?.scopeIds || [...new Set(options.getSelectedIds())]) : null;
  const identity = () => JSON.stringify(scopeIds());
  const history = () => entries.filter(e => e.role !== 'error').map(({role, content}) => ({role,content}));
  const notice = () => {
    let host = config.baseUrl; try { host = new URL(config.baseUrl).host; } catch {}
    $('#agent-data-notice').textContent = msg`发送后，问题及检索到的文献元数据、材料、笔记和性能参数将发送至 ${host}。不发送 PDF 文件，不修改文献库。`;
    const ids = scopeIds(); $('#agent-range-label').textContent = msg`${ids ? ids.length : options.getPapers().length} 篇文献 · ${ids && activeChat()?tr('该对话范围'):tr('本地检索')}`;
  };
  function syncChat(){const chat=activeChat();if(chat){chat.entries=entries;chat.title=chatTitle(entries);chat.updatedAt=Date.now();}}
  function chatbar(){
    const chat=activeChat();$('#agent-chat-title').textContent=chat?.title||tr('新对话');$('#agent-chat-title').title=chat?.title||tr('新对话');
    $('[data-agent-history-label]').textContent=msg`历史记录${chats.conversations.length?` · ${chats.conversations.length}`:''}`;
    $('#agent-scope option[value="selected"]').textContent=chat?.scopeIds?msg`该对话文献（${chat.scopeIds.length} 篇）`:tr('当前选中文献');
  }
  function showHistory(value){
    $('#agent-history').hidden=!value;$('#agent-messages').hidden=value;$('#agent-question-form').hidden=value;
    $('[data-agent-action="history"]').setAttribute('aria-expanded',String(value));if(value){renderHistory();$('#agent-history-search').focus();}
  }
  function renderHistory(){
    const list=$('#agent-history-list'),query=$('#agent-history-search').value.trim().toLocaleLowerCase();list.replaceChildren();
    const matching=[...chats.conversations].sort((a,b)=>b.updatedAt-a.updatedAt).filter(chat=>!query||chat.title.toLocaleLowerCase().includes(query)||chat.entries.some(e=>e.content.toLocaleLowerCase().includes(query)));
    if(!matching.length){const empty=document.createElement('p');empty.className='agent-history-empty';empty.textContent=chats.conversations.length?tr('没有匹配的历史聊天。'):tr('还没有历史聊天。发送问题后会自动保存在本机。');list.append(empty);return;}
    for(const chat of matching){
      const row=document.createElement('article');row.className='agent-history-row';row.classList.toggle('is-current',chat.id===chats.activeId);
      const open=document.createElement('button');open.type='button';open.dataset.historyOpen=chat.id;
      const title=document.createElement('strong');title.textContent=chat.title;
      const meta=document.createElement('small');meta.textContent=msg`${new Date(chat.updatedAt).toLocaleString(getLocale(),{hour12:false,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})} · ${chat.entries.length} 条消息 · ${chat.scopeIds===null?tr('全库'):msg`${chat.scopeIds.length} 篇文献`}`;
      open.append(title,meta);const remove=document.createElement('button');remove.type='button';remove.className='text-button';remove.dataset.historyDelete=chat.id;remove.textContent=tr('删除');remove.setAttribute('aria-label',msg`删除聊天：${chat.title}`);row.append(open,remove);list.append(row);
    }
  }
  function persistHistory(){
    if(!historyReady)return Promise.reject(new Error(tr('聊天历史尚未读取，未覆盖原有记录。')));
    syncChat();const snapshot=cleanAgentHistory(chats),key=historyKey,epoch=libraryEpoch;
    const operation=saveQueue.catch(()=>{}).then(()=>desktop?native.agentSaveHistory({libraryKey:key,state:snapshot}):options.setSetting('agentChatHistory',snapshot));
    saveQueue=operation.catch(()=>{});chatbar();
    return operation.catch(()=>{if(epoch===libraryEpoch)throw new Error(tr('聊天历史保存失败，请检查本地存储空间与权限；本次内容仍保留在窗口中。'));});
  }
  async function loadHistory(){
    const epoch=libraryEpoch;
    const result=desktop?await native.agentGetHistory():{libraryKey:'browser',state:(await options.getSetting('agentChatHistory'))||emptyAgentHistory()};
    if(epoch!==libraryEpoch)return;
    chats=cleanAgentHistory(result.state);historyKey=result.libraryKey;historyReady=true;
    const chat=activeChat();entries=chat?.entries||[];contextIdentity=chat?JSON.stringify(chat.scopeIds):'';
    if(chat)$('#agent-scope').value=chat.scopeIds===null?'all':'selected';render();notice();
  }
  function busyState(value) {
    busy = value;
    $('#agent-send').disabled = value; $('#agent-scope').disabled = value;
    $('[data-agent-action="history"]').disabled=value;
    $('[data-agent-action="stop"]').hidden = !value;
    $('#agent-settings').querySelectorAll('input,select,button').forEach(el => { el.disabled = value || (el.id === 'agent-remember' && !config.canRememberKey); });
    serviceSettings.sync();
  }
  function render() {
    chatbar();
    const target = $('#agent-messages');
    if (!entries.length) {
      target.innerHTML = html`<div class="agent-welcome">${icon('assistant')}<h3>从你的文献中寻找线索</h3><p>我能检索文献与材料、梳理笔记，并按材料保留单位和测试条件比较性能参数。</p><button type="button" data-agent-prompt="概览当前范围内的文献主题与已录入性能参数。">概览我的文献库</button><button type="button" data-agent-prompt="对比当前范围内各材料的性能参数，保留材料名称、单位、条件及来源。">比较性能参数</button><button type="button" data-agent-prompt="根据已有笔记梳理研究线索，区分证据与推断，并指出信息缺口。">从笔记梳理研究线索</button><small>只依据已录入资料；尚不读取 PDF 全文。对话自动保存在本机，可从历史记录继续。</small></div>`;
      target.scrollTop=0; return;
    }
    target.replaceChildren(); sources.clear();
    for (const entry of entries) {
      const article = document.createElement('article'); article.className = `agent-message agent-${entry.role}`;
      const heading = document.createElement('small'); heading.textContent = entry.role === 'user' ? tr('你') : entry.role === 'error' ? tr('请求未完成') : 'Materia Agent';
      const content = document.createElement('div'); content.className = 'agent-message-body';
      if (entry.role === 'error') content.textContent=entry.content;
      else { content.classList.add('agent-markdown'); content.innerHTML=renderChatMarkdown(entry.content,entry.sources || []); }
      article.append(heading,content);
      if (entry.sources?.length) {
        const list = document.createElement('details'); list.className='agent-sources';
        const summary = document.createElement('summary'); summary.textContent=msg`本次检索来源 · ${entry.sources.length} 篇`; list.append(summary);
        for (const ref of entry.sources) { sources.set(ref.id,ref); const button=document.createElement('button'); button.type='button'; button.dataset.agentSource=ref.id; button.textContent=[ref.title,ref.year].filter(Boolean).join(' · '); list.append(button); }
        article.append(list);
      }
      target.append(article);
    }
    target.scrollTop=target.scrollHeight;
  }
  function fillConfig() {
    if(config.appVersion)$('.agent-header small').textContent='MATERIA AGENT · v'+config.appVersion;
    $('#agent-base-url').value=config.baseUrl; $('#agent-model').value=config.model; $('#agent-protocol').value=config.protocol;
    $('#agent-key').value=''; $('#agent-key').placeholder=config.hasKey?tr('已有密钥，留空保留；输入新密钥替换'):tr('可留空用于无需密钥的本机服务');
    $('#agent-remember').checked=config.rememberKey; $('#agent-remember').disabled=!config.canRememberKey;
    let keyStatus=$('#agent-key-status');if(!keyStatus){keyStatus=document.createElement('p');keyStatus.id='agent-key-status';keyStatus.className='agent-help';keyStatus.setAttribute('role','status');$('#agent-key').closest('label').after(keyStatus);}
    keyStatus.textContent=config.hasKey?(config.rememberKey?tr('密钥已载入，使用系统加密保存。'):tr('密钥仅在本次运行有效，重启后需重新填写。')):tr('当前未载入密钥；已有的地址和模型设置不会代替密钥。');
    serviceSettings.fill();notice();
  }
  const modelField=()=>$('#agent-model-manual').checked?$('#agent-model'):$('#agent-model-select');
  async function open() {
    returnFocus=document.activeElement; panel.hidden=false;
    document.querySelectorAll('[data-action="ai-agent"]').forEach(b => {b.setAttribute('aria-expanded','true');b.classList.add('active');});
    if (!initialized) {
      try {
        config=desktop?await native.agentGetConfig():{...config,...(await options.getSetting('agentPreferences') || {})};
        await loadHistory();initialized=true;fillConfig();const issue=agentCredentialIssue(config);$('#agent-settings').open=Boolean(issue);if(issue)status(issue);
      } catch {status(tr('AI 设置或聊天历史无法读取，原记录已保留。请检查文献库或重新打开助手。'));}
    }
    notice(); (agentCredentialIssue(config)?(config.model?$('#agent-key'):modelField()):$('#agent-question')).focus();
  }
  function close() {
    panel.hidden=true; document.querySelectorAll('[data-action="ai-agent"]').forEach(b=>{b.setAttribute('aria-expanded','false');b.classList.remove('active');}); returnFocus?.focus();
  }
  function stop() { controller?.abort(); if (desktop && requestId) native.agentCancel(requestId).catch(()=>{}); if(busy) status(tr('正在停止…')); }
  function reset() {
    if(busy)entries.push({role:'error',content:tr('本次回答已停止。')});syncChat();generation++;stop();entries=[];chats.activeId='';sources.clear();contextIdentity='';showHistory(false);render();status('');busyState(false);notice();
    return historyReady?persistHistory():Promise.resolve();
  }
  async function changeLibrary(){
    generation++;libraryEpoch++;stop();entries=[];chats=emptyAgentHistory();historyReady=false;historyKey='';sources.clear();contextIdentity='';showHistory(false);busyState(false);render();status('');
    await saveQueue.catch(()=>{});if(initialized){try{await loadHistory();}catch{initialized=false;status(tr('此文献库的聊天历史无法读取，原文件已保留。文献仍可正常使用。'));}}notice();
  }
  async function resumeChat(id){
    if(busy)return;const chat=chats.conversations.find(item=>item.id===id);if(!chat)return;
    chats.activeId=id;entries=chat.entries;contextIdentity=JSON.stringify(chat.scopeIds);$('#agent-scope').value=chat.scopeIds===null?'all':'selected';showHistory(false);render();notice();await persistHistory();status(tr('已恢复历史聊天，可以继续提问。'));$('#agent-question').focus();
  }
  async function saveConfig(clearKey=false) {
    const value={...serviceSettings.draft(),clearKey};
    if (!value.model) throw new Error(tr('请选择模型，或勾选“手动填写模型 ID”。'));
    value.baseUrl=canonicalAgentUrl(value.baseUrl);
    if (desktop) config=await native.agentSaveConfig(value);
    else {
      const nextKey=clearKey?'':(value.apiKey || (config.baseUrl===value.baseUrl?browserKey:''));
      const prefs={provider:value.provider,baseUrl:value.baseUrl,model:value.model,protocol:value.protocol};
      await options.setSetting('agentPreferences',prefs); browserKey=nextKey;
      config={...prefs,hasKey:Boolean(browserKey),canRememberKey:false,rememberKey:false};
    }
    await reset(); fillConfig();const issue=agentCredentialIssue(config);$('#agent-settings').open=Boolean(issue);status(clearKey?tr('密钥已清除。'):issue||tr('设置已保存，可以开始提问。'));
  }
  async function testConnection(){return serviceSettings.refresh();}
  async function ask() {
    if(busy) return;
    if(!historyReady){status(tr('请先重新打开助手读取聊天历史，避免覆盖已有记录。'));return;}
    const question=$('#agent-question').value.trim(); if(!question) return;
    const credentialIssue=agentCredentialIssue(config);if(credentialIssue){$('#agent-settings').open=true;status(credentialIssue);(config.model?$('#agent-key'):modelField()).focus();return;}
    const ids=scopeIds(); if(ids && !ids.length){status(tr('请先在文献列表勾选文献，或打开一篇文献，再使用当前选中范围。'));return;}
    if (!options.isReady()) {status(tr('文献库尚未就绪，请稍后重试。'));return;}
    const currentIdentity=identity(); if(contextIdentity && contextIdentity!==currentIdentity) await reset();
    contextIdentity=currentIdentity; const prior=history();
    if(!activeChat()) {const now=Date.now(),chat={id:crypto.randomUUID(),title:chatTitle([{role:'user',content:question}]),scopeIds:ids,createdAt:now,updatedAt:now,entries};chats.conversations.push(chat);chats.activeId=chat.id;}
    entries.push({role:'user',content:question}); render(); $('#agent-question').value=''; busyState(true);
    const turn=++generation; requestId=crypto.randomUUID(); controller=new AbortController();
    const progress=p=>{if(turn===generation)status(p.stage==='tool'?(labels[p.name]||tr('正在检索…')):tr('正在整理回答…'));};
    let unsubscribe;
    try {
      await persistHistory();if(turn!==generation)return;
      let result;
      if(desktop){unsubscribe=native.onAgentProgress(p=>{if(p.id===requestId)progress(p);});result=await native.agentRun({id:requestId,question,history:prior,scopeIds:ids});if(result.error)throw new Error(result.error);}
      else {
        const signal=controller.signal, provider={provider:config.provider,baseUrl:config.baseUrl,model:config.model,protocol:config.protocol,apiKey:browserKey};
        result=await runResearchAgent({question,history:prior,context:{papers:structuredClone(options.getPapers()),notes:structuredClone(options.getNotes()),scopeIds:ids},signal,onProgress:progress,complete:async input=>{
          const response=await fetch('/api/ai-agent/complete',{method:'POST',headers:{'Content-Type':'application/json','X-Materia-Agent':'1'},body:JSON.stringify({config:provider,messages:input.messages}),signal:input.signal});
          let data;try{data=await response.json();}catch{throw new Error(tr('预览服务不支持 AI 请求，请使用 npm run preview 启动本项目。'));}
          if(!response.ok)throw new Error(data.error||tr('AI 服务请求失败。'));return data;
        }});
      }
      if(turn!==generation)return;
      entries.push({role:'assistant',content:result.answer,sources:result.sources});render();await persistHistory();if(turn!==generation)return;status(tr('回答完成。可点击引用查看文献。'));
    } catch(error) {
      if(turn!==generation)return;
      const stopped=controller.signal.aborted;
      entries.push({role:'error',content:stopped?tr('已停止生成。'):(error.message||tr('请求失败，请重试。'))});render();status(stopped?tr('已停止。'):tr('可修改设置或问题后重试。'));
      if(!stopped&&/HTTP 401\b/.test(error.message||'')){$('#agent-settings').open=true;status(tr('API 认证失败，请在服务设置中重新填写当前服务的有效密钥。'));$('#agent-key').focus();}
      $('#agent-question').value=question;
      await persistHistory().catch(error=>status(error.message));
    } finally {unsubscribe?.();if(turn===generation){busyState(false);requestId='';controller=null;notice();}}
  }
  $('#agent-config-form').addEventListener('submit',event=>{event.preventDefault();saveConfig().catch(e=>status(e.message));});
  $('#agent-question-form').addEventListener('submit',event=>{event.preventDefault();ask().catch(e=>{busyState(false);status(e.message);});});
  $('#agent-scope').addEventListener('change',()=>reset().catch(error=>status(error.message)));
  $('#agent-history-search').addEventListener('input',renderHistory);
  panel.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();}if(event.target.id==='agent-question'&&event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();ask();}});
  panel.addEventListener('click',event=>{
    const link=event.target.closest('.agent-markdown a[href]');
    if(link && desktop){event.preventDefault();native.agentOpenLink(link.href).catch(()=>status(tr('链接未能打开，请稍后重试。')));return;}
    const button=event.target.closest('button');if(!button)return;
    const action=button.dataset.agentAction;
    if(action==='close')close(); if(action==='stop')stop(); if(action==='new')reset().catch(e=>status(e.message));
    if(action==='history'&&!busy)showHistory($('#agent-history').hidden);
    if(action==='back')showHistory(false);
    if(button.dataset.historyOpen)resumeChat(button.dataset.historyOpen).catch(e=>status(e.message));
    if(button.dataset.historyDelete&&!busy){
      if(!button.dataset.confirmed){button.dataset.confirmed='true';button.textContent=tr('确认删除');return;}
      const id=button.dataset.historyDelete;chats.conversations=chats.conversations.filter(chat=>chat.id!==id);
      if(chats.activeId===id){chats.activeId='';entries=[];contextIdentity='';sources.clear();render();notice();}
      renderHistory();persistHistory().then(()=>status(tr('已删除这条历史聊天。'))).catch(e=>status(e.message));
    }
    if(action==='settings')$('#agent-settings').open=!$('#agent-settings').open;
    if(action==='test-connection')testConnection();
    if(action==='forget')saveConfig(true).catch(e=>status(e.message));
    if(button.dataset.agentPrompt){$('#agent-question').value=button.dataset.agentPrompt;$('#agent-question').focus();}
    if(button.dataset.agentSource && sources.has(button.dataset.agentSource)){close();options.openPaper(button.dataset.agentSource);}
  });
  render(); notice();
  async function serviceStatus(){
    if(desktop)config=await native.agentGetConfig();
    else if(!config.model){const saved=await options.getSetting('agentPreferences');if(saved)config={...config,baseUrl:saved.baseUrl,model:saved.model,protocol:saved.protocol||'chat'};}
    if(!desktop)config.hasKey=Boolean(browserKey);const message=agentCredentialIssue(config);return{ready:!message,model:config.model||'',message};
  }
  async function translate(request,{signal}={}){
    signal?.throwIfAborted();const service=await serviceStatus();signal?.throwIfAborted();
    if(!service.ready)throw new Error(service.message);
    if(desktop){
      if(!native.translateText)throw new Error(tr('请重新启动新版 Materia，以启用翻译。'));
      const id=crypto.randomUUID(),cancel=()=>{native.translationCancel(id).catch(()=>{});};
      signal?.addEventListener('abort',cancel,{once:true});
      try{const result=await native.translateText({id,request});signal?.throwIfAborted();if(result.error)throw new Error(result.error);return result;}
      finally{signal?.removeEventListener('abort',cancel);}
    }
    const response=await fetch('/api/translation',{method:'POST',headers:{'Content-Type':'application/json','X-Materia-Agent':'1'},body:JSON.stringify({config:{provider:config.provider,baseUrl:config.baseUrl,model:config.model,protocol:config.protocol,apiKey:browserKey},request}),signal});
    let result;try{result=await response.json();}catch{throw new Error(tr('翻译服务不可用，请使用新版 Materia 或本项目的预览服务。'));}
    if(!response.ok)throw new Error(result.error||tr('翻译失败，请重试。'));return result;
  }
  async function openSettings(){await open();$('#agent-settings').open=true;(config.model&&!config.hasKey?$('#agent-key'):modelField()).focus();}
  function refreshLanguage(){render();notice();chatbar();serviceSettings.sync();panel.setAttribute('aria-label',tr('AI 研究助手'));}
  return {open,close,reset,changeLibrary,serviceStatus,translate,openSettings,refreshLanguage,isBusy:()=>busy};
}
