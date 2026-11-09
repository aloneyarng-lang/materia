import {t as tr,html,msg} from './i18n.js';
import {bindStaticDOM,getLocale} from './i18n.js';
import {icon} from './icons.js';
import {actionMenu} from './action-menus.js';
import { runResearchAgent } from './ai-agent-core.js';
import { runCompanionTurn } from './agent-companion.js';
import { renderChatMarkdown } from './agent-markdown.js';
import { cleanAgentHistory, emptyAgentHistory, chatTitle } from './agent-history.js';
import {agentCredentialIssue} from './agent-auth.js';
import {createAgentServiceSettings} from './agent-service-settings.js';
import {canonicalAgentUrl} from './agent-providers.js';
import {createCharacterStage} from './agent-character.js';
import {entryText} from './agent-choices.js';
import {hasCharacterMemory} from './agent-persona.js';
import {characterIdFor,cleanReplyLanguage,profileFor,recallCharacterMemory} from './agent-character-memory.js';
import {browsePreviewCorpus} from './agent-character-corpus.js';
import {createReplyVoice} from './agent-voice.js';
import {createMemoryLibrary} from './agent-memory-library.js';

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
  panel.innerHTML = html`<header class="agent-header"><div><small>MATERIA AGENT</small><h2>${icon('assistant')}Amadeus · AI 助手</h2></div><button type="button" class="icon-button" data-agent-action="close" aria-label="关闭 AI 研究助手" title="关闭 AI 研究助手">${icon('close')}</button></header>
    <div class="agent-toolbar"><label>文献范围<select id="agent-scope"><option value="all">整个文献库</option><option value="selected">当前选中文献</option></select></label><button type="button" class="text-button" data-agent-action="new">新对话</button>${actionMenu('agent-conversation-menu',tr('对话操作'),'<button type="button" data-agent-action="history" aria-expanded="false" aria-controls="agent-history">'+icon('clock')+tr('<span data-agent-history-label>历史记录</span></button><button type="button" data-agent-action="settings">',false)+icon('settings')+tr('服务设置</button>',false),{iconOnly:true,className:'icon-button'})}</div>
    <div class="agent-chatbar"><span id="agent-chat-title">新对话</span></div>
    <details id="agent-settings" class="agent-settings"><summary class="agent-settings-heading">${icon('settings')}<span>设置</span>${icon('close')}</summary>
    <div class="agent-settings-inner">
    <div class="agent-settings-tabs" role="group" aria-label="伴侣设置"><button type="button" data-agent-settings-tab="service" aria-pressed="true" aria-controls="agent-service-page">${icon('network')} AI 服务</button><button type="button" data-agent-settings-tab="role" aria-pressed="false" aria-controls="agent-role-page">${icon('assistant')} 角色卡</button><button type="button" data-agent-settings-tab="language" aria-pressed="false" aria-controls="agent-language-page">${icon('speaker')} 语言</button><button type="button" data-agent-settings-tab="memory" aria-pressed="false" aria-controls="agent-memory-page">${icon('notes')} 记忆库</button></div>
    <section id="agent-service-page"><form id="agent-config-form"><div class="agent-config-fields">
      <label>接入方式<select id="agent-connection"><option value="api">API 服务</option><option value="antigravity">本地反重力 · Antigravity</option></select></label>
      <section id="agent-antigravity-settings" hidden>
        <p class="agent-help">直接连接正在运行的反重力桌面客户端，使用客户端已登录账号的模型额度。无需 CLI，也无需在 Materia 填写 API 密钥；模型回复仍需要联网。</p>
        <label>客户端程序<input id="agent-client-path" placeholder="自动查找 Antigravity.exe，也可选择程序" maxlength="2000" autocomplete="off" spellcheck="false"></label>
        <div class="agent-local-actions"><button type="button" class="text-button" data-local-agent="open">启动反重力</button><button type="button" class="text-button" data-local-agent="choose">选择程序</button><button type="button" class="text-button" data-local-agent="test">测试对话</button></div>
        <label>客户端可用模型<select id="agent-client-model"><option value="">使用客户端列表首个可用模型</option></select></label>
        <p class="agent-help">保持反重力打开并登录 → 检测客户端 → 选择模型 → 保存。检测只读取模型及额度；“测试对话”会发送一句测试消息并使用少量额度。角色卡、历史、文献检索及阅读翻译均可继续使用。当前为客户端兼容接入，客户端升级后可能需要更新 Materia。</p>
      </section>
      <div id="agent-api-settings">
      <label>AI 服务厂商<select id="agent-provider" aria-describedby="agent-provider-hint"></select></label>
      <p id="agent-provider-hint" class="agent-help"></p>
      <div id="agent-custom-settings"><label>API 地址<input id="agent-base-url" type="url" placeholder="https://api.example.com/v1" autocomplete="off"></label><label>API 协议<select id="agent-protocol"><option value="chat">Chat Completions</option><option value="responses">Responses</option><option value="anthropic">Claude Messages</option></select></label></div>
      <div class="agent-settings-columns"><div class="agent-settings-field-group">
      <label>API 密钥<input id="agent-key" type="password" placeholder="填写所选厂商的 API Key" maxlength="4096" autocomplete="off" spellcheck="false"></label>
      <label class="agent-remember"><input id="agent-remember" type="checkbox">用系统加密记住密钥（仅桌面版）</label>
      </div><div class="agent-settings-field-group">
      <label id="agent-model-picker-field">可用模型<select id="agent-model-select" aria-describedby="agent-connection-status"></select></label>
      <label id="agent-manual-model-field">模型名称<input id="agent-model" placeholder="填写服务提供的模型 ID" maxlength="200" autocomplete="off"></label>
      <label class="agent-remember"><input id="agent-model-manual" type="checkbox">手动填写模型 ID</label>
      </div></div>
      <p class="agent-help">研究对话需模型支持工具调用，翻译无需。自动获取仅查询模型列表，不产生对话。本机服务可使用 http://localhost 地址。密钥不写入文献库或备份。</p>
      </div>
      </div><div class="agent-config-actions"><button type="button" class="text-button" data-agent-action="forget">清除密钥</button><button class="primary" type="submit">保存设置</button></div>
    </form><p id="agent-data-notice" class="agent-data-notice"></p></section>
    <section id="agent-role-page" class="agent-character-editor" hidden></section>
    <section id="agent-language-page" class="agent-memory-page" hidden>
      <label id="agent-reply-language-setting">回复语言<select id="agent-reply-language"><option value="zh-CN">简体中文</option><option value="en">English</option><option value="ja">日本語</option></select></label>
      <label id="agent-voice-language-setting" hidden>配音语言<select id="agent-voice-language"><option value="follow">跟随回复</option><option value="zh-CN">简体中文</option><option value="en">English</option><option value="ja">日本語</option></select></label>
      <p id="agent-voice-language-help" class="agent-help" hidden>当前 AI 服务同时生成回复和朗读稿。台词随语音显示，完整回复保存在记录中。</p>
    </section>
    <section id="agent-memory-page" class="agent-memory-page" hidden></section>
    </div></details>
    <section id="agent-history" class="agent-history" aria-label="历史聊天记录" hidden><div class="agent-history-heading"><strong>历史聊天记录</strong><button type="button" class="text-button" data-agent-action="back">返回对话</button></div><input id="agent-history-search" type="search" placeholder="搜索标题或聊天内容" aria-label="搜索聊天历史"><div id="agent-history-list" class="agent-history-list"></div></section>
    <section id="agent-log" class="agent-log" aria-label="记录" hidden><header class="agent-log-heading"><strong>${icon('notes')} 记录</strong><button type="button" class="icon-button" data-agent-action="close-log" title="关闭记录" aria-label="关闭记录">${icon('close')}</button></header><div id="agent-messages" class="agent-messages" role="log" aria-label="对话记录" aria-live="polite" tabindex="0"></div></section>
    <div id="agent-status" class="agent-status" role="status"></div>
    <form id="agent-question-form" class="agent-composer"><label class="sr-only" for="agent-question">向研究助手提问</label><textarea id="agent-question" maxlength="8000" rows="3" placeholder="和 Amadeus 聊聊，或一起讨论文献与研究…" required></textarea><div><small id="agent-range-label"></small><button type="button" class="outline-button" data-agent-action="stop" hidden>停止</button><button class="primary" id="agent-send" type="submit">发送</button></div></form>`;
  document.body.append(panel);
  bindStaticDOM(panel,{translated:true});
  const $ = selector => panel.querySelector(selector);
  $('.agent-config-actions').insertAdjacentHTML('afterbegin',tr('<button type="button" class="outline-button" data-agent-action="test-connection">刷新模型</button>'));
  const connectionStatus=document.createElement('p');connectionStatus.id='agent-connection-status';connectionStatus.className='agent-help';connectionStatus.setAttribute('role','status');$('.agent-config-actions').before(connectionStatus);
  const status = message => { $('#agent-status').textContent = message; };
  let voiceAvailable=false, voiceEnabled=false, voicePlayback, voiceSubtitle=null;
  let voiceLanguage='follow', voiceLanguageSaving=false,voiceSettingEpoch=0,voiceCharacterId;
  function showVoiceError() {
    voiceButton.querySelector('small').textContent = 'ERROR';
    voiceButton.title = tr('配音暂不可用，文字回复仍可阅读。');
  }
  const replyVoice = createReplyVoice({
    synthesize:request=>native.agentVoiceSynthesize(request), getCharacterId:()=>characterIdFor(currentCharacter()), translate:translateVoice, onError:showVoiceError,
  });
  function syncVoiceButton() {
    voiceButton.hidden = false;
    voiceButton.disabled = !voiceAvailable;
    voiceButton.querySelector('small').textContent = voiceEnabled ? 'ON' : 'OFF';
    voiceButton.title = tr(!voiceAvailable?'当前角色配音暂不可用':voiceEnabled?'配音已开':'配音已关');
    voiceButton.setAttribute('aria-pressed', String(voiceEnabled));
  }
  async function loadVoiceSetting() {
    if(!native?.agentVoiceStatus)return;
    const selected=characterIdFor(currentCharacter());
    const turn=++voiceSettingEpoch;
    const {available,enabled,language}=await native.agentVoiceStatus(selected);
    if(turn!==voiceSettingEpoch||selected!==characterIdFor(currentCharacter()))return;
    voiceAvailable=available; voiceEnabled=enabled; voiceLanguage=language||'follow';
    syncVoiceButton();syncLanguageForm();
  }
  async function saveVoiceLanguage(value) {
    if(voiceLanguageSaving||value===voiceLanguage)return;
    voiceLanguageSaving=true;
    $('#agent-voice-language').disabled=true;
    try {
      voiceLanguage=await native.agentVoiceSetLanguage(value);
      stopVoice();
      status(tr('配音语言已保存。'));
    } finally {
      voiceLanguageSaving=false;
      syncLanguageForm();
    }
  }
  const canSpeak = () => voiceAvailable && voiceEnabled && !panel.hidden && !document.hidden;
  const syncStopButton = () => { $('[data-agent-action="stop"]').hidden = !busy && !voicePlayback; };
  function stopVoice() {
    replyVoice.stop();
    voiceSubtitle=null;
    characterStage.render();
    voicePlayback = null;
    syncStopButton();
  }
  function prepareVoice() {
    if(canSpeak())void native.agentVoicePrepare(characterIdFor(currentCharacter()),voiceLanguage==='follow'?(cleanReplyLanguage(profileFor(chats,characterIdFor(currentCharacter()))?.replyLanguage)==='zh-CN'?'zh':cleanReplyLanguage(profileFor(chats,characterIdFor(currentCharacter()))?.replyLanguage)):voiceLanguage==='zh-CN'?'zh':voiceLanguage).catch(()=>{});
  }
  function speakReply(text, sources, preferred, prepared=false, paired, onSegment) {
    if(!canSpeak())return;
    syncVoiceButton();
    const fallback={ja:'回答を表示しました。',en:'The answer is on screen.'}[preferred]||'回复已显示。';
    const playback=replyVoice.speak(text,{sources,preferred,fallback,voiceLanguage,prepared,paired,
      onSegment:display=>{voiceSubtitle=display;characterStage.render();if($('#agent-status').textContent===tr('正在准备配音…'))status('');onSegment?.();}});
    voicePlayback=playback;
    syncStopButton();
    void playback.then(played=>{if(voicePlayback===playback){
      voicePlayback=null;syncStopButton();
      if(!played){voiceSubtitle=null;characterStage.render();}
    }});
    return playback;
  }
  let config = { baseUrl: 'https://api.openai.com/v1', model: '', protocol: 'chat', hasKey: false, canRememberKey: false, rememberKey: false };
  let browserKey = '', entries = [], busy = false, controller, requestId = '', generation = 0, initialized = false, returnFocus, contextIdentity = '';
  let chats=emptyAgentHistory(),historyReady=false,historyKey='',saveQueue=Promise.resolve(),libraryEpoch=0;
  let autoplay=false, autoTimer, autoRequest, autoLines=[], autoChoices, autoRecap='', autoChatId='', autoSeed=0;
  let autoBatchReady=false,languageSaving=false,corpusRequest=0,renderedLog=[];
  const serviceSettings=createAgentServiceSettings(panel,{getConfig:()=>config,getBrowserKey:()=>browserKey,native:desktop?native:null,isBusy:()=>busy});
  const sources = new Map();
  const activeChat = () => chats.conversations.find(chat=>chat.id===chats.activeId);
  const currentCharacter = () => activeChat()?.character||characterStage.card();
  const memoryContext = (character,question) => recallCharacterMemory({
    state:chats,character,activeId:chats.activeId,scopeIds:scopeIds(),question,
  });
  const characterStage=createCharacterStage({panel,getSetting:options.getSetting,setSetting:options.setSetting,
    getEntries:()=>entries,getCharacter:()=>activeChat()?.character,onChange:async()=>{await reset();await loadVoiceSetting();prepareVoice();},onChoice:submitChoice,
    onToggleAutoplay:toggleAutoplay,onPauseAutoplay:()=>pauseAutoplay(),onOpenRole:()=>showSettings('role'),getSpeech:()=>voiceSubtitle});
  const voiceButton=$('[data-character="voice"]');
  const settings=$('#agent-settings'),log=$('#agent-log'),logButton=$('[data-character=log]'),settingsButton=$('[data-character=settings]');
  logButton.setAttribute('aria-controls',log.id);
  logButton.setAttribute('aria-expanded','false');
  settingsButton.setAttribute('aria-controls',settings.id);
  settingsButton.setAttribute('aria-expanded','false');
  settings.addEventListener('toggle',()=>settingsButton.setAttribute('aria-expanded',String(settings.open)));
  const scopeIds = () => $('#agent-scope').value === 'selected' ? (activeChat()?.scopeIds || [...new Set(options.getSelectedIds())]) : null;
  const identity = () => JSON.stringify(scopeIds());
  const history = () => entries.filter(e => e.role !== 'error').map(entry => ({role:entry.role,content:entryText(entry)}));
  const notice = () => {
    let host = config.baseUrl; try { host = new URL(config.baseUrl).host; } catch {}
    $('#agent-data-notice').textContent = msg`发送后，问题及检索到的文献元数据、材料、笔记和性能参数将发送至 ${host}。不发送 PDF 文件，不修改文献库。`;
    if(config.connection==='antigravity')$('#agent-data-notice').textContent=tr('当前使用本地反重力客户端及其账号。问题、上下文及检索结果由客户端发送至模型服务；不发送 PDF 文件。');
    const ids = scopeIds(); $('#agent-range-label').textContent = msg`${ids ? ids.length : options.getPapers().length} 篇文献 · ${ids && activeChat()?tr('该对话范围'):tr('本地检索')}`;
  };
  function syncChat(){const chat=activeChat();if(chat){chat.entries=entries;chat.title=chatTitle(entries);chat.updatedAt=Date.now();}}
  function chatbar(){
    const chat=activeChat();$('#agent-chat-title').textContent=chat?.title||tr('新对话');$('#agent-chat-title').title=chat?.title||tr('新对话');
    $('[data-agent-history-label]').textContent=msg`历史记录${chats.conversations.length?` · ${chats.conversations.length}`:''}`;
    $('#agent-scope option[value="selected"]').textContent=chat?.scopeIds?msg`该对话文献（${chat.scopeIds.length} 篇）`:tr('当前选中文献');
  }
  function showHistory(value){
    if(value)pauseAutoplay();
    if(value){showLog(false);settings.open=false;}
    $('#agent-history').hidden=!value;$('#agent-question-form').hidden=value;
    $('[data-agent-action="history"]').setAttribute('aria-expanded',String(value));if(value){renderHistory();$('#agent-history-search').focus();}
  }
  function showLog(value){
    log.hidden=!value;
    logButton.setAttribute('aria-expanded',String(value));
    if(value){
      showHistory(false);
      settings.open=false;
      const messages=$('#agent-messages');messages.scrollTop=messages.scrollHeight;
    }
  }
  function selectSettingsPage(page){
    $('#agent-service-page').hidden=page!=='service';
    $('#agent-role-page').hidden=page!=='role';
    $('#agent-language-page').hidden=page!=='language';
    $('#agent-memory-page').hidden=page!=='memory';
    if(page==='memory'){renderMemory();void searchCorpus();}
    else corpusRequest++;
    for(const button of settings.querySelectorAll('[data-agent-settings-tab]'))button.setAttribute('aria-pressed',String(button.dataset.agentSettingsTab===page));
  }
  function showSettings(page){
    pauseAutoplay();
    showHistory(false);
    showLog(false);
    if(page)selectSettingsPage(page);
    settings.open=true;
  }
  function setDialogueHidden(hidden){
    panel.classList.toggle('agent-ui-hidden',hidden);
    const button=$('[data-character=hide]');
    button.setAttribute('aria-pressed',String(hidden));
    if(hidden){showLog(false);showHistory(false);settings.open=false;panel.tabIndex=-1;panel.focus();}
    else button.focus();
  }
  const memoryLibrary=createMemoryLibrary({host:$('#agent-memory-page'),native,
    getState:()=>chats,getCharacter:currentCharacter,saveHistory:()=>persistHistory({sync:false}),isBusy:()=>busy||!historyReady});
  function renderMemory(){syncLanguageForm();if(!$('#agent-memory-page').hidden)void memoryLibrary.refresh();}
  function syncLanguageForm(){
    const canSetReply=hasCharacterMemory(currentCharacter());
    const languageTab=$('[data-agent-settings-tab="language"]');
    languageTab.hidden=!canSetReply&&!voiceAvailable;
    if(languageTab.hidden&&!$('#agent-language-page').hidden)selectSettingsPage('role');
    $('#agent-reply-language-setting').hidden=!canSetReply;
    $('#agent-reply-language').value=cleanReplyLanguage(profileFor(chats,characterIdFor(currentCharacter()))?.replyLanguage);
    $('#agent-reply-language').disabled=busy||languageSaving||!historyReady;
    $('#agent-voice-language-setting').hidden=!voiceAvailable;
    $('#agent-voice-language-help').hidden=!voiceAvailable;
    const voiceSelect=$('#agent-voice-language');
    voiceSelect.value=voiceLanguage;
    voiceSelect.disabled=voiceLanguageSaving||!voiceAvailable;
  }
  async function saveReplyLanguage(value){
    if(!historyReady||!hasCharacterMemory(currentCharacter())||languageSaving||busy)return;
    const state=chats,previous=state.characterMemory;
    const profile=profileFor(state,characterIdFor(currentCharacter()));
    const replyLanguage=cleanReplyLanguage(value);
    if(replyLanguage===cleanReplyLanguage(profile?.replyLanguage))return;
    pauseAutoplay(true);
    languageSaving=true;
    state.characterMemory={version:1,roles:{...previous?.roles,[characterIdFor(currentCharacter())]:{...profile,replyLanguage}}};
    syncLanguageForm();
    try{
      await persistHistory({sync:false});
      if(chats===state){renderMemory();status(tr('回复语言已保存。'));}
    }catch(error){
      state.characterMemory=previous;
      if(chats===state)renderMemory();
      throw error;
    }finally{languageSaving=false;syncLanguageForm();}
  }
  async function searchCorpus(){return memoryLibrary.search();}
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
  function persistHistory({sync=true}={}){
    if(!historyReady)return Promise.reject(new Error(tr('聊天历史尚未读取，未覆盖原有记录。')));
    if(sync)syncChat();
    const snapshot=cleanAgentHistory(chats),key=historyKey,epoch=libraryEpoch;
    chats.characterMemory=snapshot.characterMemory;
    const operation=saveQueue.catch(()=>{}).then(()=>desktop?native.agentSaveHistory({libraryKey:key,state:snapshot}):options.setSetting('agentChatHistory',snapshot));
    saveQueue=operation.catch(()=>{});chatbar();
    return operation.catch(()=>{if(epoch===libraryEpoch)throw new Error(tr('聊天历史保存失败，请检查本地存储空间与权限；本次内容仍保留在窗口中。'));});
  }
  async function loadHistory(){
    const epoch=libraryEpoch;
    const result=desktop?await native.agentGetHistory():{libraryKey:'browser',state:(await options.getSetting('agentChatHistory'))||emptyAgentHistory()};
    if(epoch!==libraryEpoch)return;
    chats=cleanAgentHistory(result.state);historyKey=result.libraryKey;historyReady=true;renderMemory();
    if(!$('#agent-memory-page').hidden)void searchCorpus();
    const chat=activeChat();entries=chat?.entries||[];contextIdentity=chat?JSON.stringify(chat.scopeIds):'';
    if(chat)$('#agent-scope').value=chat.scopeIds===null?'all':'selected';render();notice();
  }
  function busyState(value) {
    busy = value;
    characterStage.busy(value);
    $('#agent-send').disabled = value; $('#agent-scope').disabled = value;
    $('[data-agent-action="history"]').disabled=value;
    syncStopButton();
    $('#agent-config-form').querySelectorAll('input,select,button').forEach(el => { el.disabled = value || (el.id === 'agent-remember' && !config.canRememberKey); });
    serviceSettings.sync();syncLanguageForm();
  }
  function render({refreshLog=false}={}) {
    characterStage.render();
    const nextVoiceId=characterIdFor(currentCharacter());
    if(voiceCharacterId!==nextVoiceId){
      voiceCharacterId=nextVoiceId;replyVoice.stop();voicePlayback=null;voiceSubtitle=null;voiceAvailable=false;
      if(initialized)void loadVoiceSetting().then(prepareVoice).catch(()=>{});
    }
    syncLanguageForm();
    const memoryTab=$('[data-agent-settings-tab="memory"]');
    memoryTab.hidden=!hasCharacterMemory(currentCharacter());
    if(memoryTab.hidden&&!$('#agent-memory-page').hidden)selectSettingsPage('role');
    chatbar();
    const target = $('#agent-messages');
    if (!entries.length) {
      renderedLog=[];sources.clear();
      target.innerHTML = html`<div class="agent-welcome">${icon('assistant')}<h3>从你的文献中寻找线索</h3><p>我能检索文献与材料、梳理笔记，并按材料保留单位和测试条件比较性能参数。</p><button type="button" data-agent-prompt="概览当前范围内的文献主题与已录入性能参数。">概览我的文献库</button><button type="button" data-agent-prompt="对比当前范围内各材料的性能参数，保留材料名称、单位、条件及来源。">比较性能参数</button><button type="button" data-agent-prompt="根据已有笔记梳理研究线索，区分证据与推断，并指出信息缺口。">从笔记梳理研究线索</button><small>可以日常聊天，也可以一起查阅文献与笔记。对话自动保存在本机，可从历史记录继续。</small></div>`;
      target.scrollTop=0; return;
    }
    const append=!refreshLog&&renderedLog.length>0&&renderedLog.every((entry,index)=>entry===entries[index]);
    const follow=target.scrollHeight-target.scrollTop-target.clientHeight<32;
    const scrollTop=target.scrollTop;
    if(!append){target.replaceChildren();sources.clear();}
    for (const entry of entries.slice(append?renderedLog.length:0)) {
      const article = document.createElement('article'); article.className = `agent-message agent-${entry.role}`;
      const heading = document.createElement('small'); heading.textContent = entry.role === 'user' ? tr('你') : entry.role === 'error' ? tr('请求未完成') : (activeChat()?.character||characterStage.card()).name;
      const content = document.createElement('div'); content.className = 'agent-message-body';
      if (entry.role === 'error') content.textContent=entry.content;
      else { content.classList.add('agent-markdown'); content.innerHTML=renderChatMarkdown(entry.content,entry.sources || []); }
      article.append(heading,content);
      if(entry.choices){
        const list=document.createElement('ul');list.className='agent-past-choices';
        for(const text of entry.choices){const item=document.createElement('li');item.textContent=text;list.append(item);}
        article.append(list);
      }
      if (entry.sources?.length) {
        const list = document.createElement('details'); list.className='agent-sources';
        const summary = document.createElement('summary'); summary.textContent=msg`本次检索来源 · ${entry.sources.length} 篇`; list.append(summary);
        for (const ref of entry.sources) { sources.set(ref.id,ref); const button=document.createElement('button'); button.type='button'; button.dataset.agentSource=ref.id; button.textContent=[ref.title,ref.year].filter(Boolean).join(' · '); list.append(button); }
        article.append(list);
      }
      target.append(article);
    }
    renderedLog=entries.slice();
    target.scrollTop=follow||(!append&&!refreshLog)?target.scrollHeight:scrollTop;
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
  const modelField=()=>$('#agent-connection').value==='antigravity'?$('#agent-client-path'):$('#agent-model-manual').checked?$('#agent-model'):$('#agent-model-select');
  async function open() {
    returnFocus=document.activeElement; panel.hidden=false;
    document.querySelectorAll('[data-action="ai-agent"]').forEach(b => {b.setAttribute('aria-expanded','true');b.classList.add('active');});
    if (!initialized) {
      try {
        config=desktop?await native.agentGetConfig():{...config,...(await options.getSetting('agentPreferences') || {})};
        await characterStage.load();await loadHistory();await loadVoiceSetting().catch(()=>{});prepareVoice();initialized=true;fillConfig();const issue=agentCredentialIssue(config);if(issue){showSettings('service');status(issue);}
      } catch {status(tr('AI 设置或聊天历史无法读取，原记录已保留。请检查文献库或重新打开助手。'));}
    }
    notice(); (agentCredentialIssue(config)?(config.model?$('#agent-key'):modelField()):$('#agent-question')).focus();
  }
  function close() {
    panel.classList.remove('agent-ui-hidden');
    pauseAutoplay();
    stopVoice();
    panel.hidden=true; document.querySelectorAll('[data-action="ai-agent"]').forEach(b=>{b.setAttribute('aria-expanded','false');b.classList.remove('active');}); returnFocus?.focus();
  }
  function stop() { pauseAutoplay(); stopVoice(); controller?.abort(); if (desktop && requestId) native.agentCancel(requestId).catch(()=>{}); if(busy) status(tr('正在停止…')); }
  function reset() {
    pauseAutoplay(true);
    characterStage.cancelActions();
    if(busy)entries.push({role:'error',content:tr('本次回答已停止。')});syncChat();generation++;stop();entries=[];chats.activeId='';sources.clear();contextIdentity='';showHistory(false);render();status('');busyState(false);notice();
    return historyReady?persistHistory():Promise.resolve();
  }
  async function changeLibrary(){
    pauseAutoplay(true);
    characterStage.cancelActions();
    generation++;libraryEpoch++;corpusRequest++;stop();entries=[];chats=emptyAgentHistory();historyReady=false;historyKey='';sources.clear();contextIdentity='';showHistory(false);renderMemory();busyState(false);render();status('');
    await saveQueue.catch(()=>{});if(initialized){try{await characterStage.load();await loadHistory();}catch{initialized=false;status(tr('此文献库的聊天历史无法读取，原文件已保留。文献仍可正常使用。'));}}notice();
  }
  async function resumeChat(id){
    characterStage.cancelActions();
    if(busy)return;const chat=chats.conversations.find(item=>item.id===id);if(!chat)return;
    pauseAutoplay(true);
    stopVoice();
    chats.activeId=id;entries=chat.entries;contextIdentity=JSON.stringify(chat.scopeIds);$('#agent-scope').value=chat.scopeIds===null?'all':'selected';showHistory(false);render();notice();await persistHistory();status(tr('已恢复历史聊天，可以继续提问。'));$('#agent-question').focus();
  }
  async function saveConfig(clearKey=false) {
    const value={...serviceSettings.draft(),clearKey};
    if(value.connection!=='antigravity'){
      if (!value.model) throw new Error(tr('请选择模型，或勾选“手动填写模型 ID”。'));
      value.baseUrl=canonicalAgentUrl(value.baseUrl);
    }else if(!desktop)throw Error(tr('本地反重力接入请使用 Materia 桌面版。'));
    if (desktop) config=await native.agentSaveConfig(value);
    else {
      const nextKey=clearKey?'':(value.apiKey || (config.baseUrl===value.baseUrl?browserKey:''));
      const prefs={provider:value.provider,baseUrl:value.baseUrl,model:value.model,protocol:value.protocol};
      await options.setSetting('agentPreferences',prefs); browserKey=nextKey;
      config={...prefs,hasKey:Boolean(browserKey),canRememberKey:false,rememberKey:false};
    }
    await reset(); fillConfig();const issue=agentCredentialIssue(config);settings.open=Boolean(issue);status(clearKey?tr('密钥已清除。'):issue||tr('设置已保存，可以开始提问。'));
  }
  async function testConnection(){return serviceSettings.refresh();}
  async function completeInPreview({messages,signal},companion=false){
    const provider={provider:config.provider,baseUrl:config.baseUrl,model:config.model,protocol:config.protocol,apiKey:browserKey};
    const response=await fetch('/api/ai-agent/complete',{method:'POST',headers:{'Content-Type':'application/json','X-Materia-Agent':'1'},body:JSON.stringify({config:provider,messages,companion}),signal});
    let data;try{data=await response.json();}catch{throw new Error(tr('预览服务不支持 AI 请求，请使用 npm run preview 启动本项目。'));}
    if(!response.ok)throw new Error(data.error||tr('AI 服务请求失败，请重试。'));
    return data;
  }
  function interruptAutoplay(clear=false){
    clearTimeout(autoTimer);
    if(autoRequest&&!autoRequest.controller.signal.aborted){
      autoRequest.controller.abort();
      if(desktop)native.agentCancel(autoRequest.id).catch(()=>{});
    }
    if(clear){autoLines=[];autoChoices=undefined;autoRecap='';autoChatId='';autoSeed=0;autoBatchReady=false;}
    return autoRequest?.done;
  }
  function pauseAutoplay(clear=false){
    if(autoplay){if(!busy)status('');stopVoice();}
    autoplay=false;
    interruptAutoplay(clear);
    characterStage.autoplay(false);
  }
  function toggleAutoplay(){
    if(autoplay){pauseAutoplay();status(tr('自动对话已暂停。'));return;}
    if(busy||!historyReady||characterStage.isSwitching())return;
    const issue=agentCredentialIssue(config);
    if(issue){showSettings('service');status(issue);return;}
    if(scopeIds()?.length===0){status(tr('请先在文献列表勾选文献，或打开一篇文献，再使用当前选中范围。'));return;}
    showHistory(false);
    settings.open=false;
    autoplay=true;
    stopVoice();
    prepareVoice();
    if(!autoLines.length)autoBatchReady=false;
    characterStage.autoplay(true);
    scheduleAutoplay();
  }
  function scheduleAutoplay(delay=0){
    clearTimeout(autoTimer);
    if(!autoplay||busy||panel.hidden||document.hidden)return;
    const latest=entries.at(-1);
    if(latest?.automatic&&latest.choices){status(tr('任选一句，或直接输入。'));return;}
    autoTimer=setTimeout(playAutomaticLine,delay);
  }
  async function playAutomaticLine(){
    if(!autoplay||busy||panel.hidden||document.hidden)return;
    try{
      if(entries.length>=1000)throw Error('单个对话最多保存 1000 条消息，请另开新对话。');
      if(!activeChat()&&chats.conversations.length>=200)throw Error('聊天历史已满（最多 200 个对话），请先删除不需要的对话。');
      if(!autoLines.length){
        if(autoBatchReady){
          pauseAutoplay();
          status(tr('她停下来等你接话。'));
          return;
        }
        if(autoRequest)await autoRequest.done.catch(()=>{});
        if(!autoplay||busy||panel.hidden||document.hidden||autoRequest)return;
        const chat=activeChat(), character=chat?.character||characterStage.card();
        autoChatId=chat?.id||autoChatId||crypto.randomUUID();
        const recent=history().slice(-12);
        const topic=recent.findLast(entry=>entry.role==='user')?.content||'';
        const payload={id:crypto.randomUUID(),chatId:autoChatId,character,history:recent,
          voiceLanguage:canSpeak()&&voiceLanguage!=='follow'?voiceLanguage:undefined,
          kurisuContext:memoryContext(character,topic),
          companion:{locale:getLocale(),seed:autoSeed++,recap:chat?.companionRecap||'',offerChoice:Math.random()<0.05}};
        const current={id:payload.id,controller:new AbortController()};
        autoRequest=current;
        status(tr('正在准备下一句…'));
        const signal=current.controller.signal;
        const generated=desktop?native.agentRun(payload):runCompanionTurn({...payload,signal,findCanon:browsePreviewCorpus,complete:input=>completeInPreview(input,true)});
        current.done=generated.then(async result=>{
          const target=voiceLanguage;
          if(result.voice||result.error||signal.aborted||!canSpeak()||target==='follow'||target===cleanReplyLanguage(payload.kurisuContext?.replyLanguage))return result;
          try{return {...result,voice:{target,lines:await translateVoice(result.lines,target,signal)}};}
          catch(error){if(signal.aborted)throw error;return {...result,voice:{target}};}
        });
        try{
          const result=await current.done;
          if(signal.aborted||!autoplay||busy)return;
          if(result.error)throw Error(result.error);
          autoLines=result.lines.map((line,index)=>({line,
            spoken:result.voice?.segments?.[index]?.speech??result.voice?.lines?.[index],
            target:result.voice?.language??result.voice?.target}));
          autoChoices=result.choices;autoRecap=result.recap;autoBatchReady=true;
        }catch(error){if(signal.aborted)return;throw error;}
        finally{if(autoRequest===current)autoRequest=null;}
      }
      const {line,spoken,target}=autoLines.shift();
      const chat=activeChat()||createChat(autoChatId,scopeIds());
      chat.companionRecap=autoRecap;
      const entry={role:'assistant',content:line,automatic:true};
      if(!autoLines.length&&autoChoices)entry.choices=autoChoices;
      entries.push(entry);
      voiceSubtitle=canSpeak()?'':null;
      status(canSpeak()?tr('正在准备配音…'):'');render();
      const prepared=target===voiceLanguage;
      if(prepared&&!spoken&&canSpeak())showVoiceError();
      const prefetchNext=()=>{
        const next=autoLines[0];
        if(next?.target===voiceLanguage)replyVoice.prefetch(next.spoken,next.target);
      };
      const paired=prepared&&spoken?{language:target,segments:[{text:line,speech:spoken}]}:undefined;
      const voiced=prepared
        ? spoken&&speakReply(line,[],target,true,paired,prefetchNext)
        : speakReply(line,[],profileFor(chats,characterIdFor(currentCharacter()))?.replyLanguage);
      if(!voiced){voiceSubtitle=null;characterStage.render();}
      await persistHistory();
      const played=await voiced;
      if(entries.at(-1)===entry)scheduleAutoplay(played?100:Math.min(8000,Math.max(2400,line.length*85)));
    }catch(error){
      pauseAutoplay();
      status(msg`自动对话已暂停。${error.message}`);
    }
  }
  function createChat(id,ids){
    const now=Date.now(),chat={id,title:tr('新对话'),character:characterStage.card(),scopeIds:ids,createdAt:now,updatedAt:now,entries};
    chats.conversations.push(chat);chats.activeId=id;contextIdentity=JSON.stringify(ids);
    return chat;
  }
  async function submitChoice(text){
    if(busy||characterStage.isSwitching())return;
    const input=$('#agent-question'),draft=input.value;
    input.value=text;
    try{
      const pending=ask();
      if(draft&&input.value==='')input.value=draft;
      await pending;
    }finally{
      if(draft&&(input.value===''||input.value===text))input.value=draft;
    }
  }
  async function ask() {
    if(busy||languageSaving) return;
    if(characterStage.isSwitching()){status('正在切换角色，请稍候。');return;}
    if(!historyReady){status(tr('请先重新打开助手读取聊天历史，避免覆盖已有记录。'));return;}
    const question=$('#agent-question').value.trim(); if(!question) return;
    const credentialIssue=agentCredentialIssue(config);if(credentialIssue){showSettings('service');status(credentialIssue);(config.model?$('#agent-key'):modelField()).focus();return;}
    const ids=scopeIds(); if(ids && !ids.length){status(tr('请先在文献列表勾选文献，或打开一篇文献，再使用当前选中范围。'));return;}
    if (!options.isReady()) {status(tr('文献库尚未就绪，请稍后重试。'));return;}
    const interrupted=interruptAutoplay(true);
    stopVoice();
    prepareVoice();
    const currentIdentity=identity(); if(contextIdentity && contextIdentity!==currentIdentity) await reset();
    contextIdentity=currentIdentity; const prior=history();
    const chat=activeChat()||createChat(crypto.randomUUID(),ids);
    const character=chat.character||characterStage.card();
    const kurisuContext=memoryContext(character,question);
    const companionContext=autoplay||entries.slice(-12).some(entry=>entry.automatic);
    entries.push({role:'user',content:question}); render(); $('#agent-question').value=''; busyState(true);
    characterStage.trigger('message.send');
    const turn=++generation; requestId=crypto.randomUUID(); controller=new AbortController();
    status(tr('正在发送…'));
    const progress=p=>{if(turn===generation)status(p.stage==='tool'?(labels[p.name]||tr('正在检索…')):tr('正在整理回答…'));};
    let unsubscribe,voiced;
    try {
      await persistHistory();await interrupted?.catch(()=>{});if(turn!==generation)return;
      controller.signal.throwIfAborted();
      let result;
      if(desktop){unsubscribe=native.onAgentProgress(p=>{if(p.id===requestId)progress(p);});result=await native.agentRun({id:requestId,chatId:chat.id,question,history:prior,scopeIds:ids,character,companionContext,kurisuContext,voiceLanguage:canSpeak()&&voiceLanguage!=='follow'?voiceLanguage:undefined});if(result.error)throw new Error(result.error);}
      else {
        result=await runResearchAgent({question,character,kurisuContext,findCanon:browsePreviewCorpus,history:prior,context:{papers:structuredClone(options.getPapers()),notes:structuredClone(options.getNotes()),scopeIds:ids},signal:controller.signal,companionContext,onProgress:progress,complete:completeInPreview});
      }
      if(turn!==generation)return;
      controller.signal.throwIfAborted();
      voiceSubtitle=canSpeak()?'':null;
      entries.push({role:'assistant',content:result.answer,sources:result.sources,...(result.choices?{choices:result.choices}:{})});render();
      voiced=speakReply(result.answer,result.sources,kurisuContext?.replyLanguage,false,result.voice);
      await persistHistory();if(turn!==generation)return;status(voiced&&voiceSubtitle===''?tr('正在准备配音…'):tr('回答完成。可点击引用查看文献。'));
    } catch(error) {
      if(turn!==generation)return;
      pauseAutoplay();
      const stopped=controller.signal.aborted;
      entries.push({role:'error',content:stopped?tr('已停止生成。'):(error.message||tr('请求失败，请重试。'))});render();status(stopped?tr('已停止。'):tr('可修改设置或问题后重试。'));
      if(!stopped&&/HTTP 401\b/.test(error.message||'')){showSettings('service');status(tr('API 认证失败，请在服务设置中重新填写当前服务的有效密钥。'));$('#agent-key').focus();}
      if(!$('#agent-question').value.trim())$('#agent-question').value=question;
      await persistHistory().catch(error=>status(error.message));
    } finally {
      unsubscribe?.();
      if(turn===generation){
        busyState(false);requestId='';controller=null;notice();
        if(voiced)void voiced.then(()=>{if(turn===generation)scheduleAutoplay(8000);});
        else scheduleAutoplay(8000);
      }
    }
  }
  $('#agent-config-form').addEventListener('submit',event=>{event.preventDefault();saveConfig().catch(e=>status(e.message));});
  $('#agent-reply-language').addEventListener('change',event=>saveReplyLanguage(event.target.value).catch(error=>status(error.message)));
  $('#agent-voice-language').addEventListener('change',event=>saveVoiceLanguage(event.target.value).catch(error=>status(error.message)));

  const questionForm=$('#agent-question-form');
  const questionInput=$('#agent-question');
  const sendButton=$('#agent-send');
  questionForm.addEventListener('submit',event=>{event.preventDefault();ask().catch(e=>{busyState(false);status(e.message);});});
  questionInput.addEventListener('keydown',event=>{
    // Chromium can report the IME confirmation key as Enter with keyCode 229.
    if(event.defaultPrevented||event.key!=='Enter'||event.shiftKey||event.isComposing||event.keyCode===229)return;
    event.preventDefault();
    if(!event.repeat&&!sendButton.disabled&&questionInput.value.trim())questionForm.requestSubmit(sendButton);
  });
  $('#agent-scope').addEventListener('change',()=>reset().catch(error=>status(error.message)));
  $('#agent-history-search').addEventListener('input',renderHistory);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){pauseAutoplay();stopVoice();}});
  panel.addEventListener('keydown',event=>{
    event.stopPropagation();
    if(event.key==='Escape'&&!event.isComposing&&event.keyCode!==229){
      event.preventDefault();
      if(panel.classList.contains('agent-ui-hidden'))setDialogueHidden(false);
      else if(!log.hidden){showLog(false);logButton.focus();}
      else close();
    }
  });
  panel.addEventListener('click',event=>{
    if(panel.classList.contains('agent-ui-hidden')){event.preventDefault();setDialogueHidden(false);return;}
    const link=event.target.closest('.agent-markdown a[href]');
    if(link && desktop){event.preventDefault();native.agentOpenLink(link.href).catch(()=>status(tr('链接未能打开，请稍后重试。')));return;}
    const button=event.target.closest('button');if(!button)return;
    const action=button.dataset.agentAction;
    if(button.dataset.character==='hide'){setDialogueHidden(true);return;}
    if(button.dataset.character==='memory'){showSettings('memory');return;}
    if(button===logButton)showLog(log.hidden);
    if(action==='close-log'){showLog(false);logButton.focus();}
    if(button.dataset.agentSettingsTab)selectSettingsPage(button.dataset.agentSettingsTab);
    if(action==='close')close(); if(action==='stop')stop(); if(action==='new')reset().catch(e=>status(e.message));
    if(button===voiceButton){
      const next=!voiceEnabled;
      if(!next){voiceEnabled=false;stopVoice();}
      voiceButton.disabled=true;
      native.agentVoiceSetEnabled(next).then(value=>{voiceEnabled=value;syncVoiceButton();prepareVoice();})
        .catch(()=>{voiceEnabled=!next;syncVoiceButton();status(tr('配音设置未能保存。'));})
        .finally(()=>{voiceButton.disabled=false;});
    }
    if(action==='history'&&!busy)showHistory($('#agent-history').hidden);
    if(action==='memory-history'&&!busy)showHistory(true);
    if(action==='back')showHistory(false);
    if(button.dataset.historyOpen)resumeChat(button.dataset.historyOpen).catch(e=>status(e.message));
    if(button.dataset.historyDelete&&!busy){
      if(!button.dataset.confirmed){button.dataset.confirmed='true';button.textContent=tr('确认删除');return;}
      const id=button.dataset.historyDelete;chats.conversations=chats.conversations.filter(chat=>chat.id!==id);
      if(chats.activeId===id){pauseAutoplay(true);stopVoice();chats.activeId='';entries=[];contextIdentity='';sources.clear();render();notice();}
      renderHistory();persistHistory().then(()=>status(tr('已删除这条历史聊天。'))).catch(e=>status(e.message));
    }
    if(action==='settings'||button===settingsButton){if(settings.open)settings.open=false;else showSettings(action==='settings'?'service':undefined);}
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
  async function translateInDesktop(payload,signal){
    if(!native.translateText)throw new Error(tr('请重新启动新版 Materia，以启用翻译。'));
    signal?.throwIfAborted();
    const id=crypto.randomUUID(),cancel=()=>{native.translationCancel(id).catch(()=>{});};
    signal?.addEventListener('abort',cancel,{once:true});
    try{const result=await native.translateText({id,...payload});signal?.throwIfAborted();if(result.error)throw new Error(result.error);return result;}
    finally{signal?.removeEventListener('abort',cancel);}
  }
  async function translateVoice(lines,targetLanguage,signal){
    return (await translateInDesktop({voice:{lines,targetLanguage}},signal)).lines;
  }
  async function translate(request,{signal}={}){
    signal?.throwIfAborted();const service=await serviceStatus();signal?.throwIfAborted();
    if(!service.ready)throw new Error(service.message);
    if(desktop)return translateInDesktop({request},signal);
    const response=await fetch('/api/translation',{method:'POST',headers:{'Content-Type':'application/json','X-Materia-Agent':'1'},body:JSON.stringify({config:{provider:config.provider,baseUrl:config.baseUrl,model:config.model,protocol:config.protocol,apiKey:browserKey},request}),signal});
    let result;try{result=await response.json();}catch{throw new Error(tr('翻译服务不可用，请使用新版 Materia 或本项目的预览服务。'));}
    if(!response.ok)throw new Error(result.error||tr('翻译失败，请重试。'));return result;
  }
  async function openSettings(){await open();showSettings('service');(config.model&&!config.hasKey?$('#agent-key'):modelField()).focus();}
  function refreshLanguage(){render({refreshLog:true});notice();chatbar();serviceSettings.sync();panel.setAttribute('aria-label',tr('AI 研究助手'));}
  return {open,close,reset,changeLibrary,serviceStatus,translate,openSettings,refreshLanguage,isBusy:()=>busy};
}
