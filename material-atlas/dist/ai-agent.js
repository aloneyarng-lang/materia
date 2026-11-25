import {createFlowAchievements,reportAchievement} from './flow-achievements.js';
import {t as tr,html,msg} from './i18n.js';
import {bindStaticDOM,getLocale} from './i18n.js';
import {icon} from './icons.js';
import {actionMenu} from './action-menus.js';
import {answerLocalCatalog,runResearchAgent} from './ai-agent-core.js';
import {agentCredentialIssue} from './agent-auth.js';
import {createAgentServiceSettings} from './agent-service-settings.js';
import {agentServiceForm} from './agent-service-form.js';
import {canonicalAgentUrl} from './agent-providers.js';
import {createCharacterStage} from './agent-character.js';
import {dialogueChoices,dialogueHistory,rollDialogueChoices} from './agent-choices.js';
import {hasCharacterMemory,supportsAutomaticDialogue} from './agent-persona.js';
import {characterIdFor,cleanReplyLanguage,profileFor,recallCharacterMemory} from './agent-character-memory.js';
import {browsePreviewCorpus} from './agent-character-corpus.js';
import {createMemoryLibrary} from './agent-memory-library.js';
import {createAgentNoteEditor} from './agent-note.js';
import {createAgentReader} from './agent-reader.js';
import {createAgentVoiceController} from './agent-voice-controller.js';
import {createAgentAutoplayController} from './agent-autoplay-controller.js';
import {createAgentHistoryView} from './agent-history-view.js';
import {noteCatalogData,wantsNoteCatalog} from './note-edit.js';

const labels = {
  get draft_note(){return tr('正在整理笔记…');},
  get library_overview(){return tr('正在查看文献目录…');},
  get search_library(){return tr('正在检索相关文献…');},
  get read_papers(){return tr('正在阅读笔记与参数…');},
  get compare_parameters(){return tr('正在整理性能观测…');},
};

export function createAgentController(options) {
  const native = globalThis.materiaDesktop;
  const desktop = Boolean(native?.agentRun);
  const ribbonButton = document.createElement('button');
  ribbonButton.type = 'button'; ribbonButton.className = 'ribbon-button'; ribbonButton.dataset.action = 'ai-agent';
  ribbonButton.title = tr('AI 研究助手'); ribbonButton.setAttribute('aria-label', tr('AI 研究助手'));
  ribbonButton.setAttribute('aria-controls', 'ai-agent-panel'); ribbonButton.setAttribute('aria-expanded', 'false');
  ribbonButton.innerHTML = icon('assistant');
  document.querySelector('.workspace-ribbon [data-action="research-canvas"]')?.after(ribbonButton);
  bindStaticDOM(ribbonButton, { translated: true });

  const panel = document.createElement('aside');
  panel.id = 'ai-agent-panel'; panel.className = 'agent-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', tr('AI 研究助手'));
  panel.innerHTML = html`<header class="agent-header"><div><small>MATERIA AGENT</small><h2>${icon('assistant')}Amadeus · AI 助手</h2></div><button type="button" class="icon-button" data-agent-action="close" aria-label="关闭 AI 研究助手" title="关闭 AI 研究助手">${icon('close')}</button></header>
    <div class="agent-toolbar"><label>文献范围<select id="agent-scope"><option value="all">整个文献库</option><option value="selected">当前选中文献</option></select></label>${actionMenu('agent-conversation-menu',tr('对话操作'),html`<button type="button" data-agent-action="new">${icon('plus')}新对话</button>`+'<button type="button" data-agent-action="history" aria-expanded="false" aria-controls="agent-history">'+icon('clock')+tr('<span data-agent-history-label>历史记录</span></button><button type="button" data-agent-action="settings">',false)+icon('settings')+tr('服务设置</button>',false),{iconOnly:true,className:'icon-button'})}</div>
    <div class="agent-chatbar"><span id="agent-chat-title">新对话</span></div>
    <details id="agent-settings" class="agent-settings"><summary class="agent-settings-heading">${icon('settings')}<span>设置</span>${icon('close')}</summary>
    <div class="agent-settings-inner">
    <div class="agent-settings-tabs" role="group" aria-label="伴侣设置"><button type="button" data-agent-settings-tab="service" aria-pressed="true" aria-controls="agent-service-page">${icon('network')} AI 服务</button><button type="button" data-agent-settings-tab="role" aria-pressed="false" aria-controls="agent-role-page">${icon('assistant')} 角色卡</button><button type="button" data-agent-settings-tab="language" aria-pressed="false" aria-controls="agent-language-page">${icon('speaker')} 语言</button><button type="button" data-agent-settings-tab="memory" aria-pressed="false" aria-controls="agent-memory-page">${icon('notes')} 记忆库</button><button type="button" data-agent-settings-tab="flow" aria-pressed="false" aria-controls="agent-flow-page">${icon('orbit')} 心流</button></div>
    <section id="agent-service-page">${agentServiceForm()}<p id="agent-data-notice" class="agent-data-notice"></p></section>
    <section id="agent-role-page" class="agent-character-editor" hidden></section>
    <section id="agent-language-page" class="agent-memory-page" hidden>
      <label id="agent-reply-language-setting">回复语言<select id="agent-reply-language"><option value="zh-CN">简体中文</option><option value="en">English</option><option value="ja">日本語</option></select></label>
      <label id="agent-voice-language-setting" hidden>配音语言<select id="agent-voice-language"><option value="follow">跟随回复</option><option value="zh-CN">简体中文</option><option value="en">English</option><option value="ja">日本語</option></select></label>
      <div id="agent-voice-playback" class="agent-voice-playback" hidden>
        <div><label for="agent-voice-rate">日语语速</label><output for="agent-voice-rate" aria-hidden="true"></output><input id="agent-voice-rate" type="range" min="60" max="120" step="1" value="90"></div>
        <div><label for="agent-voice-volume">配音音量</label><output for="agent-voice-volume" aria-hidden="true"></output><input id="agent-voice-volume" type="range" min="0" max="100" step="1" value="100"></div>
      </div>
      <div id="agent-auto-playback" class="agent-voice-playback" hidden>
        <div><label for="agent-auto-gap">台词间隔</label><output for="agent-auto-gap" aria-hidden="true"></output><input id="agent-auto-gap" type="range" min="0" max="10" step="0.5" value="1"></div>
        <p class="agent-help">自动播放时，上一句播放完后等待的时间。</p>
      </div>
      <p id="agent-voice-language-help" class="agent-help" hidden>当前 AI 服务同时生成回复和朗读稿。台词随语音显示，完整回复保存在记录中。</p>
    </section>
    <section id="agent-memory-page" class="agent-memory-page" hidden></section>
    <section id="agent-flow-page" hidden><button type="button" class="outline-button" data-character="flow">${icon('orbit')} 国际象棋</button> <button type="button" class="outline-button" data-character="flow-go">${icon('orbit')} 和红莉栖下围棋</button> <button type="button" class="outline-button" data-character="flow-achievements">${icon('orbit')} 科研成就</button></section>
    </div></details>
    <div id="agent-tools-menu" class="ui-action-popover" popover="auto" role="menu" aria-label="工具"><button type="button" data-agent-action="note">${icon('notes')} AI 笔记</button><button type="button" data-agent-action="reader">${icon('speaker')} 朗读器</button></div>
    <section id="agent-history" class="agent-history" aria-label="历史聊天记录" hidden><div class="agent-history-heading"><strong>历史聊天记录</strong><button type="button" class="text-button" data-agent-action="back">返回对话</button></div><input id="agent-history-search" type="search" placeholder="搜索标题或聊天内容" aria-label="搜索聊天历史"><div id="agent-history-list" class="agent-history-list"></div></section>
    <section id="agent-log" class="agent-log" aria-label="记录" hidden><header class="agent-log-heading"><strong>${icon('notes')} 对话记录</strong><button type="button" class="icon-button" data-agent-action="close-log" title="关闭记录" aria-label="关闭记录">${icon('close')}</button></header><div id="agent-messages" class="agent-messages" role="log" aria-label="对话记录" aria-live="polite" tabindex="0"></div></section>
    <div id="agent-status" class="agent-status" role="status"></div>
    <form id="agent-question-form" class="agent-composer"><label class="sr-only" for="agent-question">向研究助手提问</label><textarea id="agent-question" maxlength="8000" rows="3" placeholder="和 Amadeus 聊聊，或一起讨论文献与研究…" required></textarea><div><small id="agent-range-label"></small><button type="button" class="outline-button" data-agent-action="stop" hidden>停止</button><button class="primary" id="agent-send" type="submit">发送</button></div></form>`;
  document.body.append(panel);
  bindStaticDOM(panel, { translated: true });
  const $ = selector => panel.querySelector(selector);

  $('.agent-config-actions').insertAdjacentHTML('afterbegin', tr('<button type="button" class="outline-button" data-agent-action="test-connection">刷新模型</button>'));
  const connectionStatus = document.createElement('p');
  connectionStatus.id = 'agent-connection-status'; connectionStatus.className = 'agent-help'; connectionStatus.setAttribute('role', 'status');
  $('.agent-config-actions').before(connectionStatus);

  let pendingQuestions = [], statusText = '';
  const status = (message = statusText) => {
    statusText = message;
    $('#agent-status').textContent = [message, pendingQuestions.length ? tr('消息已排队，台词播完后发送。') : ''].filter(Boolean).join(' ');
  };

  let config = { baseUrl: 'https://api.openai.com/v1', model: '', protocol: 'chat', hasKey: false, canRememberKey: false, rememberKey: false };
  let browserKey = '', busy = false, controller, requestId = '', generation = 0, initialized = false, returnFocus;
  let libraryEpoch = 0, languageSaving = false, corpusRequest = 0;

  let voiceCtrl, historyView, autoplayCtrl, characterStage, flowGo;
  const noteEditor = createAgentNoteEditor(panel, status);
  const serviceSettings = createAgentServiceSettings(panel, { getConfig: () => config, getBrowserKey: () => browserKey, native: desktop ? native : null, isBusy: () => busy });

  const syncStopButton = () => { $('[data-agent-action="stop"]').hidden = !busy && !voiceCtrl?.isPlaying(); };
  const scopeIds = () => $('#agent-scope').value === 'selected' ? (historyView.activeChat()?.scopeIds || [...new Set(options.getSelectedIds())]) : null;
  const identity = () => JSON.stringify(scopeIds());
  const currentCharacter = () => historyView.currentCharacter();
  const memoryContext = (character, question) => recallCharacterMemory({
    state: historyView.getChats(), character, activeId: historyView.getChats().activeId, scopeIds: scopeIds(), question,
  });

  historyView = createAgentHistoryView({
    panel, native, desktop, options,
    characterStage: { card: () => characterStage.card() },
    voiceCtrl: { addReplay: (article, entry) => voiceCtrl.addReplay(article, entry) },
    getLibraryEpoch: () => libraryEpoch,
  });

  voiceCtrl = createAgentVoiceController({
    panel, native,
    status,
    statusTextRef: () => statusText,
    currentCharacter,
    getChats: () => historyView.getChats(),
    getHistoryKey: () => historyView.getHistoryKey(),
    isHistoryReady: () => historyView.isHistoryReady(),
    getLibraryEpoch: () => libraryEpoch,
    persistHistory: opts => historyView.persistHistory(opts),
    syncLanguageForm: () => syncLanguageForm(),
    renderStage: () => characterStage.render(),
    isBusy: () => busy,
    onPauseAutoplay: () => autoplayCtrl.pause(),
    drainQuestions: () => drainQuestions(),
    translateVoice,
    serviceStatus,
    syncStopButton,
  });

  characterStage = createCharacterStage({
    panel, getSetting: options.getSetting, setSetting: options.setSetting,
    getEntries: () => historyView.getEntries(),
    getCharacter: () => historyView.activeChat()?.character,
    onChange: async () => { await reset(); await voiceCtrl.loadVoiceSetting(); voiceCtrl.prepareVoice(); },
    onChoice: text => ask(false, text),
    onPauseAutoplay: () => autoplayCtrl.pause(),
    onOpenRole: () => showSettings('role'),
    getSpeech: () => voiceCtrl.getSubtitle(),
  });
  const voiceButton = $('[data-character="voice"]');

  const reader = createAgentReader(panel, {
    desktop,
    read: (...args) => voiceCtrl.readTextAloud(...args),
    replay: clip => voiceCtrl.replayVoiceClip(clip),
    stop: () => voiceCtrl.stopVoice(),
    getLibraryKey: () => historyView.getHistoryKey(),
  });

  const flowAchievements = createFlowAchievements(panel, {
    getActiveRole: () => characterIdFor(currentCharacter()),
    onCompanionSpeak: ({ line }) => {
      if (!busy && !voiceCtrl.isPlaying()) voiceCtrl.speakReply(line, [], 'zh-CN');
    },
  });

  const settings = $('#agent-settings'), log = $('#agent-log'), logButton = $('[data-character=log]'), settingsButton = $('[data-character=settings]');
  logButton.setAttribute('aria-controls', log.id); logButton.setAttribute('aria-expanded', 'false');
  settingsButton.setAttribute('aria-controls', settings.id); settingsButton.setAttribute('aria-expanded', 'false');
  settings.addEventListener('toggle', () => settingsButton.setAttribute('aria-expanded', String(settings.open)));

  const history = () => dialogueHistory(historyView.getEntries());

  autoplayCtrl = createAgentAutoplayController({
    panel, native, desktop, status,
    getConfig: () => config,
    showSettings,
    agentCredentialIssue,
    isBusy: () => busy,
    isHistoryReady: () => historyView.isHistoryReady(),
    characterStage,
    getChats: () => historyView.getChats(),
    getEntries: () => historyView.getEntries(),
    activeChat: () => historyView.activeChat(),
    createChat: (id, ids) => historyView.createChat(id, ids),
    scopeIds,
    history,
    currentCharacter,
    memoryContext,
    showHistory,
    settings,
    persistHistory: opts => historyView.persistHistory(opts),
    render: opts => render(opts),
    voiceCtrl,
    translateVoice,
    completeInPreview,
    drainQuestions,
    hasPendingQuestions: () => pendingQuestions.length > 0,
  });

  function restoreQuestions(questions = pendingQuestions.splice(0)) {
    if (!questions.length) return;
    const input = $('#agent-question');
    input.value = [...questions.map(item => item.text), input.value].filter(Boolean).join('\n\n');
    status();
  }

  function drainQuestions() {
    if (!pendingQuestions.length || busy || languageSaving || characterStage.isSwitching() || autoplayCtrl.waitingForSpeech() || panel.hidden || document.hidden) return false;
    if (pendingQuestions[0].scope !== identity()) { restoreQuestions(); return false; }
    const item = pendingQuestions.shift();
    status();
    void ask(false, item.text, true).then(accepted => {
      if (accepted === false) restoreQuestions([item, ...pendingQuestions.splice(0)]);
    }).catch(error => { restoreQuestions([item, ...pendingQuestions.splice(0)]); status(error.message); });
    return true;
  }

  const notice = () => {
    let host = config.baseUrl; try { host = new URL(config.baseUrl).host; } catch {}
    $('#agent-data-notice').textContent = msg`发送后，问题及检索到的文献元数据、材料、笔记和性能参数将发送至 ${host}。不发送 PDF 文件，不修改文献库。`;
    if (config.connection === 'local-gemini') $('#agent-data-notice').textContent = tr('问题和选中的上下文会发送至 Gemini 桌面客户端。');
    if (config.connection === 'antigravity') $('#agent-data-notice').textContent = tr('当前使用本地反重力客户端及其账号。问题、上下文及检索结果由客户端发送至模型服务；不发送 PDF 文件。');
    const ids = scopeIds();
    $('#agent-range-label').textContent = msg`${ids ? ids.length : options.getPapers().length} 篇文献 · ${ids && historyView.activeChat() ? tr('该对话范围') : tr('本地检索')}`;
  };

  function showHistory(value) {
    if (value) { showLog(false); settings.open = false; }
    $('#agent-history').hidden = !value; $('#agent-question-form').hidden = value;
    $('[data-agent-action="history"]').setAttribute('aria-expanded', String(value));
    if (value) { historyView.renderHistory(); $('#agent-history-search').focus(); }
  }

  function showLog(value) {
    log.hidden = !value;
    logButton.setAttribute('aria-expanded', String(value));
    if (value) {
      showHistory(false);
      settings.open = false;
      const messages = $('#agent-messages');
      messages.scrollTop = messages.scrollHeight;
    }
  }

  function selectSettingsPage(page) {
    $('#agent-service-page').hidden = page !== 'service';
    $('#agent-role-page').hidden = page !== 'role';
    $('#agent-language-page').hidden = page !== 'language';
    $('#agent-memory-page').hidden = page !== 'memory';
    $('#agent-flow-page').hidden = page !== 'flow';
    if (page === 'memory') { renderMemory(); void memoryLibrary.search(); }
    else corpusRequest++;
    for (const button of settings.querySelectorAll('[data-agent-settings-tab]')) {
      button.setAttribute('aria-pressed', String(button.dataset.agentSettingsTab === page));
    }
  }

  function showSettings(page) {
    showHistory(false);
    showLog(false);
    if (page) selectSettingsPage(page);
    settings.open = true;
  }

  function setDialogueHidden(hidden) {
    panel.classList.toggle('agent-ui-hidden', hidden);
    const button = $('[data-character=hide]');
    button.setAttribute('aria-pressed', String(hidden));
    if (hidden) { showLog(false); showHistory(false); settings.open = false; panel.tabIndex = -1; panel.focus(); }
    else button.focus();
  }

  const memoryLibrary = createMemoryLibrary({
    host: $('#agent-memory-page'), native,
    getState: () => historyView.getChats(), getCharacter: currentCharacter,
    saveHistory: () => historyView.persistHistory({ sync: false }), isBusy: () => busy || !historyView.isHistoryReady(),
  });

  function renderMemory() { syncLanguageForm(); if (!$('#agent-memory-page').hidden) void memoryLibrary.refresh(); }

  function syncLanguageForm() {
    const canSetReply = hasCharacterMemory(currentCharacter());
    const languageTab = $('[data-agent-settings-tab="language"]');
    const canAutoPlay = supportsAutomaticDialogue(currentCharacter());
    const voiceAvail = voiceCtrl.isVoiceAvailable();
    languageTab.hidden = !canSetReply && !voiceAvail && !canAutoPlay;
    $('#agent-auto-playback').hidden = !canAutoPlay;
    if (languageTab.hidden && !$('#agent-language-page').hidden) selectSettingsPage('role');
    $('#agent-reply-language-setting').hidden = !canSetReply;
    $('#agent-reply-language').value = cleanReplyLanguage(profileFor(historyView.getChats(), characterIdFor(currentCharacter()))?.replyLanguage);
    $('#agent-reply-language').disabled = busy || languageSaving || !historyView.isHistoryReady();
    $('#agent-voice-language-setting').hidden = !voiceAvail;
    $('#agent-voice-language-help').hidden = !voiceAvail;
    $('#agent-voice-playback').hidden = !voiceAvail;
    const voiceSelect = $('#agent-voice-language');
    voiceSelect.value = voiceCtrl.getVoiceLanguage();
    voiceSelect.disabled = voiceCtrl.isVoiceLanguageSaving() || !voiceAvail;
  }

  async function saveReplyLanguage(value) {
    if (!historyView.isHistoryReady() || !hasCharacterMemory(currentCharacter()) || languageSaving || busy) return;
    const state = historyView.getChats(), previous = state.characterMemory;
    const profile = profileFor(state, characterIdFor(currentCharacter()));
    const replyLanguage = cleanReplyLanguage(value);
    if (replyLanguage === cleanReplyLanguage(profile?.replyLanguage)) return;
    autoplayCtrl.pause(true);
    languageSaving = true;
    state.characterMemory = { version: 1, roles: { ...previous?.roles, [characterIdFor(currentCharacter())]: { ...profile, replyLanguage } } };
    syncLanguageForm();
    try {
      await historyView.persistHistory({ sync: false });
      if (historyView.getChats() === state) { renderMemory(); status(tr('回复语言已保存。')); }
    } catch (error) {
      state.characterMemory = previous;
      if (historyView.getChats() === state) renderMemory();
      throw error;
    } finally { languageSaving = false; syncLanguageForm(); drainQuestions(); }
  }

  function busyState(value) {
    busy = value;
    characterStage.busy(value);
    $('#agent-send').disabled = value; $('#agent-scope').disabled = value;
    $('[data-agent-action="history"]').disabled = value;
    syncStopButton();
    $('#agent-config-form').querySelectorAll('input,select,button').forEach(el => {
      el.disabled = value || (el.id === 'agent-remember' && !config.canRememberKey);
    });
    serviceSettings.sync(); syncLanguageForm();
  }

  function render({ refreshLog = false } = {}) {
    const entries = historyView.getEntries();
    const role = characterIdFor(currentCharacter());
    if (role && entries.some(entry => entry.role === 'assistant')) {
      flowAchievements.recordRole(role);
      reportAchievement('maxCompanionTurns', entries.filter(entry => entry.role === 'assistant').length);
    }
    characterStage.render();
    if (voiceCtrl.syncCharacterVoice() && initialized) {
      void voiceCtrl.loadVoiceSetting().then(() => voiceCtrl.prepareVoice()).catch(() => {});
    }
    syncLanguageForm();
    const memoryTab = $('[data-agent-settings-tab="memory"]');
    memoryTab.hidden = !hasCharacterMemory(currentCharacter());
    if (memoryTab.hidden && !$('#agent-memory-page').hidden) selectSettingsPage('role');
    historyView.chatbar();
    historyView.renderLogMessages({ refreshLog });
  }

  function fillConfig() {
    if (config.appVersion) $('.agent-header small').textContent = 'MATERIA AGENT · v' + config.appVersion;
    $('#agent-base-url').value = config.baseUrl; $('#agent-model').value = config.model; $('#agent-protocol').value = config.protocol;
    $('#agent-key').value = ''; $('#agent-key').placeholder = config.hasKey ? tr('已有密钥，留空保留；输入新密钥替换') : tr('可留空用于无需密钥的本机服务');
    $('#agent-remember').checked = config.rememberKey; $('#agent-remember').disabled = !config.canRememberKey;
    let keyStatus = $('#agent-key-status');
    if (!keyStatus) {
      keyStatus = document.createElement('p'); keyStatus.id = 'agent-key-status'; keyStatus.className = 'agent-help'; keyStatus.setAttribute('role', 'status');
      $('#agent-key').closest('label').after(keyStatus);
    }
    keyStatus.textContent = config.hasKey
      ? (config.rememberKey ? tr('密钥已载入，使用系统加密保存。') : tr('密钥仅在本次运行有效，重启后需重新填写。'))
      : tr('当前未载入密钥；已有的地址和模型设置不会代替密钥。');
    serviceSettings.fill(); notice();
  }

  const modelField = () => $('#agent-connection').value === 'antigravity' ? $('#agent-client-path') : $('#agent-model-manual').checked ? $('#agent-model') : $('#agent-model-select');

  async function open() {
    if (ribbonButton.hidden) return;
    returnFocus = document.activeElement; panel.hidden = false;
    document.querySelectorAll('[data-action="ai-agent"]').forEach(b => { b.setAttribute('aria-expanded', 'true'); b.classList.add('active'); });
    if (!initialized) {
      try {
        config = desktop ? await native.agentGetConfig() : { ...config, ...(await options.getSetting('agentPreferences') || {}) };
        await characterStage.load();
        if (await historyView.loadHistory()) {
          renderMemory();
          if (!$('#agent-memory-page').hidden) void memoryLibrary.search();
          render(); notice();
        }
        await voiceCtrl.loadVoiceSetting().catch(() => {});
        voiceCtrl.prepareVoice();
        initialized = true; fillConfig();
        const issue = agentCredentialIssue(config);
        if (issue) { showSettings('service'); status(issue); }
      } catch {
        status(tr('AI 设置或聊天历史无法读取，原记录已保留。请检查文献库或重新打开助手。'));
      }
    }
    if (panel.hidden) return;
    drainQuestions(); notice();
    (agentCredentialIssue(config) ? (config.model ? $('#agent-key') : modelField()) : $('#agent-question')).focus();
  }

  function close() {
    flowGo?.hide();
    voiceCtrl.stopGoCommentary();
    if (flowAchievements.dialog.open) flowAchievements.dialog.close();
    noteEditor.hide(); reader.hide();
    panel.classList.remove('agent-ui-hidden');
    autoplayCtrl.pause(); voiceCtrl.stopVoice();
    panel.hidden = true;
    document.querySelectorAll('[data-action="ai-agent"]').forEach(b => { b.setAttribute('aria-expanded', 'false'); b.classList.remove('active'); });
    returnFocus?.focus();
  }

  function stop() {
    autoplayCtrl.pause(); voiceCtrl.stopVoice(); controller?.abort();
    if (desktop && requestId) native.agentCancel(requestId).catch(() => {});
    if (busy) status(tr('正在停止…'));
    queueMicrotask(drainQuestions);
  }

  function setMinimalMode(enabled) {
    ribbonButton.hidden = enabled;
    if (!enabled) return;
    if (busy) stop();
    if (!panel.hidden) close();
  }

  function reset() {
    restoreQuestions();
    autoplayCtrl.pause(true);
    characterStage.cancelActions();
    if (busy) historyView.getEntries().push({ role: 'error', content: tr('本次回答已停止。') });
    historyView.chatbar(); generation++; stop();
    historyView.clearActiveState(); showHistory(false); render(); status(''); busyState(false); notice();
    return historyView.isHistoryReady() ? historyView.persistHistory() : Promise.resolve();
  }

  async function changeLibrary() {
    reader.hide(); restoreQuestions(); autoplayCtrl.pause(true); characterStage.cancelActions();
    generation++; libraryEpoch++; corpusRequest++; stop();
    voiceCtrl.onLibraryChanged();
    await historyView.resetLibraryState();
    showHistory(false); renderMemory(); busyState(false); render(); status('');
    if (initialized) {
      try {
        await characterStage.load();
        if (await historyView.loadHistory()) { renderMemory(); render(); }
      } catch {
        initialized = false;
        status(tr('此文献库的聊天历史无法读取，原文件已保留。文献仍可正常使用。'));
      }
    }
    notice();
  }

  async function resumeChat(id) {
    characterStage.cancelActions();
    if (busy) return;
    const chat = historyView.getChats().conversations.find(item => item.id === id);
    if (!chat) return;
    restoreQuestions(); autoplayCtrl.pause(true); voiceCtrl.stopVoice();
    historyView.getChats().activeId = id;
    historyView.setEntries(chat.entries);
    historyView.setContextIdentity(JSON.stringify(chat.scopeIds));
    $('#agent-scope').value = chat.scopeIds === null ? 'all' : 'selected';
    showHistory(false); render(); notice();
    await historyView.persistHistory();
    status(tr('已恢复历史聊天，可以继续提问。'));
    $('#agent-question').focus();
  }

  async function persistServiceConfig(value) {
    if (!['antigravity', 'local-gemini'].includes(value.connection)) {
      if (!value.model) throw new Error(tr('请选择模型，或勾选“手动填写模型 ID”。'));
      value.baseUrl = canonicalAgentUrl(value.baseUrl);
    } else if (!desktop) throw Error(tr('本地反重力接入请使用 Materia 桌面版。'));
    if (desktop) config = await native.agentSaveConfig(value);
    else {
      const nextKey = value.clearKey ? '' : (value.apiKey || (config.baseUrl === value.baseUrl ? browserKey : ''));
      const prefs = { provider: value.provider, baseUrl: value.baseUrl, model: value.model, protocol: value.protocol };
      await options.setSetting('agentPreferences', prefs); browserKey = nextKey;
      config = { ...prefs, hasKey: Boolean(browserKey), canRememberKey: false, rememberKey: false };
    }
    window.dispatchEvent(new Event('materia-ai-service-changed'));
    return config;
  }

  async function saveConfig(clearKey = false) {
    await persistServiceConfig({ ...serviceSettings.draft(), clearKey });
    await reset(); fillConfig();
    const issue = agentCredentialIssue(config);
    settings.open = Boolean(issue);
    status(clearKey ? tr('密钥已清除。') : issue || tr('设置已保存，可以开始提问。'));
  }

  async function completeInPreview({ messages, signal, noteEdit, noteCatalog }, companion = false) {
    const provider = { provider: config.provider, baseUrl: config.baseUrl, model: config.model, protocol: config.protocol, apiKey: browserKey };
    const response = await fetch('/api/ai-agent/complete', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Materia-Agent': '1' },
      body: JSON.stringify({ config: provider, messages, companion, noteEdit, noteCatalog }), signal,
    });
    let data; try { data = await response.json(); } catch { throw new Error(tr('预览服务不支持 AI 请求，请使用 npm run preview 启动本项目。')); }
    if (!response.ok) throw new Error(data.error || tr('AI 服务请求失败，请重试。'));
    return data;
  }

  async function ask(draftNote = false, submittedText, fromQueue = false) {
    if (busy || languageSaving) return false;
    if (characterStage.isSwitching()) { status('正在切换角色，请稍候。'); return false; }
    if (!historyView.isHistoryReady()) { status(tr('请先重新打开助手读取聊天历史，避免覆盖已有记录。')); return false; }
    const input = $('#agent-question');
    const question = (submittedText ?? input.value).trim() || (draftNote && history().length ? tr('把当前对话整理成一篇笔记。') : '');
    if (!question) { if (draftNote) { status(tr('先输入想记录的内容，再选择 AI 笔记。')); input.focus(); } return false; }
    if (question.length > 8000) { status(tr('请输入问题，最多 8000 字。')); return false; }
    if (!options.isReady()) { status(tr('文献库尚未就绪，请稍后重试。')); return false; }
    const ids = scopeIds();
    const catalog = draftNote ? null : answerLocalCatalog(question, { papers: options.getPapers(), scopeIds: ids });
    const credentialIssue = catalog ? '' : agentCredentialIssue(config);
    if (credentialIssue) { showSettings('service'); status(credentialIssue); (config.model ? $('#agent-key') : modelField()).focus(); return false; }
    if (!catalog && !draftNote && ids && !ids.length) { status(tr('请先在文献列表勾选文献，或打开一篇文献，再使用当前选中范围。')); return false; }
    if (!draftNote && !fromQueue && (pendingQuestions.length || autoplayCtrl.waitingForSpeech())) {
      if (pendingQuestions.length >= 8) { status(tr('待发送消息已满，请等前面的消息发送。')); return false; }
      pendingQuestions.push({ text: question, scope: identity() });
      if (submittedText === undefined) input.value = '';
      status(); drainQuestions(); return true;
    }
    if (draftNote || catalog) autoplayCtrl.pause(true);
    const interrupted = autoplayCtrl.interrupt(true);
    voiceCtrl.stopVoice();
    if (!catalog) voiceCtrl.prepareVoice();
    const currentIdentity = identity();
    if (historyView.getContextIdentity() && historyView.getContextIdentity() !== currentIdentity) await reset();
    historyView.setContextIdentity(currentIdentity);
    const prior = history();
    const chat = historyView.activeChat() || historyView.createChat(crypto.randomUUID(), ids);
    const character = chat.character || characterStage.card();
    const kurisuContext = memoryContext(character, question);
    const entries = historyView.getEntries();
    const companionContext = autoplayCtrl.isActive() || entries.slice(-12).some(entry => entry.automatic);
    const offerChoice = !draftNote && rollDialogueChoices();
    entries.push({ role: 'user', content: question }); render();
    if (submittedText === undefined) input.value = '';
    busyState(true); characterStage.trigger('message.send');
    const turn = ++generation; requestId = crypto.randomUUID(); controller = new AbortController();
    status(catalog ? tr('正在查看文献目录…') : tr('正在发送…'));
    const progress = p => { if (turn === generation) status(p.stage === 'answer' ? p.text : p.stage === 'tool' ? (labels[p.name] || tr('正在检索…')) : tr('正在整理回答…')); };
    let unsubscribe, voiced;
    try {
      await historyView.persistHistory(); await interrupted?.catch(() => {}); if (turn !== generation) return;
      controller.signal.throwIfAborted();
      let result;
      if (catalog) result = offerChoice ? { ...catalog, choices: dialogueChoices(undefined, getLocale()) } : catalog;
      else if (desktop) {
        unsubscribe = native.onAgentProgress(p => { if (p.id === requestId) progress(p); });
        result = await native.agentRun({
          id: requestId, chatId: chat.id, question, history: prior, scopeIds: ids, character, companionContext, kurisuContext, draftNote, offerChoice,
          voiceLanguage: voiceCtrl.canSpeak() && voiceCtrl.getVoiceLanguage() !== 'follow' ? voiceCtrl.getVoiceLanguage() : undefined,
        });
        if (result.error) throw new Error(result.error);
      } else {
        result = await runResearchAgent({
          question, character, kurisuContext, findCanon: browsePreviewCorpus, history: prior,
          context: { papers: structuredClone(options.getPapers()), notes: structuredClone(options.getNotes()), scopeIds: ids },
          signal: controller.signal, companionContext, draftNote, offerChoice, onProgress: progress, complete: completeInPreview,
        });
      }
      if (turn !== generation) return;
      controller.signal.throwIfAborted();
      voiceCtrl.setSubtitle(!catalog && !result.noteDraft && voiceCtrl.canSpeak() ? '' : null);
      const answer = result.noteDraft && noteEditor.hasDraft()
        ? tr('已有未保存的 AI 笔记。请先保存或放弃该草稿。')
        : result.noteDraft ? tr(result.answer) : result.answer;
      const entry = { role: 'assistant', content: answer, sources: result.sources, ...(result.choices ? { choices: result.choices } : {}) };
      entries.push(entry); render();
      if (!catalog && typeof answer === 'string' && answer.trim()) reportAchievement('companionReplies', 1, 'add');
      if (result.noteDraft) {
        autoplayCtrl.pause();
        if (!noteEditor.hasDraft()) noteEditor.setDraft(result.noteDraft);
        if (!panel.hidden) noteEditor.show();
        status(answer); await historyView.persistHistory(); return;
      }
      if (!catalog) voiced = voiceCtrl.speakReply(result.answer, result.sources, kurisuContext?.replyLanguage, false, result.voice, undefined, entry);
      await historyView.persistHistory(); if (turn !== generation) return;
      status(catalog ? tr('已读取本地文献目录。') : voiced && voiceCtrl.getSubtitle() === '' ? tr('正在准备配音…') : tr('回答完成。可点击引用查看文献。'));
    } catch (error) {
      if (turn !== generation) return;
      autoplayCtrl.pause();
      const stopped = controller.signal.aborted;
      entries.push({ role: 'error', content: stopped ? tr('已停止生成。') : (error.message || tr('请求失败，请重试。')) });
      render(); status(stopped ? tr('已停止。') : tr('可修改设置或问题后重试。'));
      if (!stopped && /HTTP 401\b/.test(error.message || '')) {
        showSettings('service');
        status(tr('API 认证失败，请在服务设置中重新填写当前服务的有效密钥。'));
        $('#agent-key').focus();
      }
      if (fromQueue) restoreQuestions([{ text: question }, ...pendingQuestions.splice(0)]);
      else if (!input.value.trim()) input.value = question;
      await historyView.persistHistory().catch(err => status(err.message));
    } finally {
      unsubscribe?.();
      if (turn === generation) {
        busyState(false); requestId = ''; controller = null; notice();
        const next = () => { if (turn === generation && !drainQuestions()) autoplayCtrl.schedule(8000); };
        if (voiced) void voiced.then(next);
        else next();
      }
    }
  }

  $('#agent-config-form').addEventListener('submit', event => { event.preventDefault(); saveConfig().catch(e => status(e.message)); });
  $('#agent-reply-language').addEventListener('change', event => saveReplyLanguage(event.target.value).catch(e => status(e.message)));

  const questionForm = $('#agent-question-form'), questionInput = $('#agent-question'), sendButton = $('#agent-send');
  questionForm.addEventListener('submit', event => { event.preventDefault(); ask().catch(e => { busyState(false); status(e.message); }); });
  questionInput.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    if (!event.repeat && !sendButton.disabled && questionInput.value.trim()) questionForm.requestSubmit(sendButton);
  });
  $('#agent-scope').addEventListener('change', () => reset().catch(e => status(e.message)));
  document.addEventListener('visibilitychange', () => { if (document.hidden) { autoplayCtrl.pause(); voiceCtrl.stopVoice(); } else drainQuestions(); });

  panel.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.target.closest('#agent-note-editor,#agent-reader')) return;
    if (event.key === 'Escape' && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      if (panel.classList.contains('agent-ui-hidden')) setDialogueHidden(false);
      else if (!log.hidden) { showLog(false); logButton.focus(); }
      else close();
    }
  });

  panel.addEventListener('click', event => {
    if (panel.classList.contains('agent-ui-hidden')) { event.preventDefault(); setDialogueHidden(false); return; }
    const link = event.target.closest('.agent-markdown a[href]');
    if (link && desktop) { event.preventDefault(); native.agentOpenLink(link.href).catch(() => status(tr('链接未能打开，请稍后重试。'))); return; }
    const button = event.target.closest('button'); if (!button) return;
    const action = button.dataset.agentAction;
    if (button.dataset.character === 'flow-achievements') { flowAchievements.show(); return; }
    if (button.dataset.character === 'flow-go') {
      button.disabled = true;
      import('./flow-go.js').then(({ createFlowGo }) => {
        if (panel.hidden) return;
        flowGo ??= createFlowGo(panel, voiceCtrl.getGoVoiceBridge());
        autoplayCtrl.pause();
        voiceCtrl.stopVoice();
        voiceCtrl.getGoVoiceBridge().prepare();
        flowGo.show();
      }).catch(() => status(tr('围棋暂时无法打开。'))).finally(() => { button.disabled = false; });
      return;
    }
    if (button.dataset.character === 'autoplay') { autoplayCtrl.toggleMode(); return; }
    if (action === 'note') {
      if (noteEditor.hasDraft()) noteEditor.show();
      else ask(true).catch(e => { busyState(false); status(e.message); });
      return;
    }
    if (action === 'reader') { $('#agent-tools-menu').hidePopover(); reader.show(); return; }
    if (button.dataset.character === 'hide') { setDialogueHidden(true); return; }
    if (button.dataset.character === 'memory') { showSettings('memory'); return; }
    if (button === logButton) showLog(log.hidden);
    if (action === 'close-log') { showLog(false); logButton.focus(); }
    if (button.dataset.agentSettingsTab) selectSettingsPage(button.dataset.agentSettingsTab);
    if (action === 'close') close();
    if (action === 'stop') stop();
    if (action === 'new') reset().catch(e => status(e.message));
    if (button === voiceButton) voiceCtrl.toggleVoice();
    if (action === 'history' && !busy) showHistory($('#agent-history').hidden);
    if (action === 'memory-history' && !busy) showHistory(true);
    if (action === 'back') showHistory(false);
    if (button.dataset.historyOpen) resumeChat(button.dataset.historyOpen).catch(e => status(e.message));
    if (button.dataset.historyDelete && !busy) {
      if (!button.dataset.confirmed) { button.dataset.confirmed = 'true'; button.textContent = tr('确认删除'); return; }
      const id = button.dataset.historyDelete, chats = historyView.getChats();
      chats.conversations = chats.conversations.filter(chat => chat.id !== id);
      if (chats.activeId === id) {
        restoreQuestions(); autoplayCtrl.pause(true); voiceCtrl.stopVoice();
        historyView.clearActiveState(); render(); notice();
      }
      historyView.renderHistory();
      historyView.persistHistory().then(() => status(tr('已删除这条历史聊天。'))).catch(e => status(e.message));
    }
    if (action === 'settings' || button === settingsButton) { if (settings.open) settings.open = false; else showSettings(action === 'settings' ? 'service' : undefined); }
    if (action === 'test-connection') serviceSettings.refresh();
    if (action === 'forget') saveConfig(true).catch(e => status(e.message));
    if (button.dataset.agentPrompt) { $('#agent-question').value = button.dataset.agentPrompt; $('#agent-question').focus(); }
    if (button.dataset.agentSource && historyView.getSources().has(button.dataset.agentSource)) { close(); options.openPaper(button.dataset.agentSource); }
  });

  render(); notice();

  async function serviceStatus() {
    if (desktop) config = await native.agentGetConfig();
    else if (!config.model) {
      const saved = await options.getSetting('agentPreferences');
      if (saved) config = { ...config, baseUrl: saved.baseUrl, model: saved.model, protocol: saved.protocol || 'chat' };
    }
    if (!desktop) config.hasKey = Boolean(browserKey);
    const message = agentCredentialIssue(config);
    return { ready: !message, model: config.model || '', message };
  }

  async function translateInDesktop(payload, signal) {
    if (!native.translateText) throw new Error(tr('请重新启动新版 Materia，以启用翻译。'));
    signal?.throwIfAborted();
    const id = crypto.randomUUID(), cancel = () => { native.translationCancel(id).catch(() => {}); };
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      const result = await native.translateText({ id, ...payload });
      signal?.throwIfAborted();
      if (result.error) throw new Error(result.error);
      return result;
    } finally { signal?.removeEventListener('abort', cancel); }
  }

  async function translateVoice(lines, targetLanguage, signal) {
    return (await translateInDesktop({ voice: { lines, targetLanguage } }, signal)).lines;
  }

  async function translate(request, { signal } = {}) {
    signal?.throwIfAborted(); const service = await serviceStatus(); signal?.throwIfAborted();
    if (!service.ready) throw new Error(service.message);
    if (desktop) return translateInDesktop({ request }, signal);
    const response = await fetch('/api/translation', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Materia-Agent': '1' },
      body: JSON.stringify({ config: { provider: config.provider, baseUrl: config.baseUrl, model: config.model, protocol: config.protocol, apiKey: browserKey }, request }), signal,
    });
    let result; try { result = await response.json(); } catch { throw new Error(tr('翻译服务不可用，请使用新版 Materia 或本项目的预览服务。')); }
    if (!response.ok) throw new Error(result.error || tr('翻译失败，请重试。'));
    return result;
  }

  async function editNote(noteEdit, { signal } = {}) {
    signal?.throwIfAborted();
    const service = await serviceStatus(); signal?.throwIfAborted();
    if (!service.ready) throw Error(service.message);
    if (!desktop) {
      const noteCatalog = wantsNoteCatalog(noteEdit.instruction) ? noteCatalogData(options.getPapers()) : undefined;
      return (await completeInPreview({ noteEdit, noteCatalog, signal })).body;
    }
    const id = crypto.randomUUID(), cancel = () => { native.agentCancel(id).catch(() => {}); };
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      const result = await native.agentRun({ id, noteEdit });
      signal?.throwIfAborted();
      if (result.error) throw Error(result.error);
      return result.body;
    } finally { signal?.removeEventListener('abort', cancel); }
  }

  async function openSettings() {
    await open();
    if (panel.hidden) return;
    showSettings('service');
    (config.model && !config.hasKey ? $('#agent-key') : modelField()).focus();
  }

  function refreshLanguage() {
    autoplayCtrl.syncGapSlider();
    render({ refreshLog: true }); notice(); historyView.chatbar(); serviceSettings.sync();
    panel.setAttribute('aria-label', tr('AI 研究助手'));
  }

  return {
    open, close,
    async getSharedServiceConfig() { await serviceStatus(); return config; },
    getBrowserKey: () => browserKey,
    async saveSharedServiceConfig(value) { await persistServiceConfig(value); fillConfig(); return config; },
    setMinimalMode, reset, changeLibrary, serviceStatus, translate, editNote, openSettings, refreshLanguage,
    isBusy: () => busy,
  };
}
