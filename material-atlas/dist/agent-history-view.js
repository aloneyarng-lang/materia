import {cleanAgentHistory,emptyAgentHistory,chatTitle} from './agent-history.js';
import {renderChatMarkdown} from './agent-markdown.js';
import {icon} from './icons.js';
import {getLocale,html,msg,t as tr} from './i18n.js';

export function createAgentHistoryView({
  panel,
  native,
  desktop,
  options,
  characterStage,
  voiceCtrl,
  getLibraryEpoch,
}) {
  let chats = emptyAgentHistory(), entries = [], historyReady = false, historyKey = '';
  let saveQueue = Promise.resolve(), renderedLog = [], contextIdentity = '';
  const sources = new Map();

  const activeChat = () => chats.conversations.find(chat => chat.id === chats.activeId);
  const currentCharacter = () => activeChat()?.character || characterStage.card();

  function syncChat() {
    const chat = activeChat();
    if (chat) {
      chat.entries = entries;
      chat.title = chatTitle(entries);
      chat.updatedAt = Date.now();
    }
  }

  function chatbar() {
    const chat = activeChat();
    panel.querySelector('#agent-chat-title').textContent = chat?.title || tr('新对话');
    panel.querySelector('#agent-chat-title').title = chat?.title || tr('新对话');
    panel.querySelector('[data-agent-history-label]').textContent = msg`历史记录${chats.conversations.length ? ` · ${chats.conversations.length}` : ''}`;
    panel.querySelector('#agent-scope option[value="selected"]').textContent = chat?.scopeIds
      ? msg`该对话文献（${chat.scopeIds.length} 篇）`
      : tr('当前选中文献');
  }

  function persistHistory({ sync = true } = {}) {
    if (!historyReady) return Promise.reject(new Error(tr('聊天历史尚未读取，未覆盖原有记录。')));
    if (sync) syncChat();
    const snapshot = cleanAgentHistory(chats), key = historyKey, epoch = getLibraryEpoch();
    chats.characterMemory = snapshot.characterMemory;
    const operation = saveQueue.catch(() => {}).then(() =>
      desktop ? native.agentSaveHistory({ libraryKey: key, state: snapshot }) : options.setSetting('agentChatHistory', snapshot));
    saveQueue = operation.catch(() => {});
    chatbar();
    return operation.catch(() => {
      if (epoch === getLibraryEpoch()) throw new Error(tr('聊天历史保存失败，请检查本地存储空间与权限；本次内容仍保留在窗口中。'));
    });
  }

  async function loadHistory() {
    const epoch = getLibraryEpoch();
    const result = desktop
      ? await native.agentGetHistory()
      : { libraryKey: 'browser', state: (await options.getSetting('agentChatHistory')) || emptyAgentHistory() };
    if (epoch !== getLibraryEpoch()) return false;
    chats = cleanAgentHistory(result.state);
    historyKey = result.libraryKey;
    historyReady = true;
    const chat = activeChat();
    entries = chat?.entries || [];
    contextIdentity = chat ? JSON.stringify(chat.scopeIds) : '';
    if (chat) panel.querySelector('#agent-scope').value = chat.scopeIds === null ? 'all' : 'selected';
    return true;
  }

  function renderHistory() {
    const list = panel.querySelector('#agent-history-list');
    const query = panel.querySelector('#agent-history-search').value.trim().toLocaleLowerCase();
    list.replaceChildren();
    const matching = [...chats.conversations].sort((a, b) => b.updatedAt - a.updatedAt)
      .filter(chat => !query || chat.title.toLocaleLowerCase().includes(query) || chat.entries.some(e => e.content.toLocaleLowerCase().includes(query)));
    if (!matching.length) {
      const empty = document.createElement('p');
      empty.className = 'agent-history-empty';
      empty.textContent = chats.conversations.length ? tr('没有匹配的历史聊天。') : tr('还没有历史聊天。发送问题后会自动保存在本机。');
      list.append(empty);
      return;
    }
    for (const chat of matching) {
      const row = document.createElement('article');
      row.className = 'agent-history-row';
      row.classList.toggle('is-current', chat.id === chats.activeId);
      const open = document.createElement('button'); open.type = 'button'; open.dataset.historyOpen = chat.id;
      const title = document.createElement('strong'); title.textContent = chat.title;
      const meta = document.createElement('small');
      meta.textContent = msg`${new Date(chat.updatedAt).toLocaleString(getLocale(), { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${chat.entries.length} 条消息 · ${chat.scopeIds === null ? tr('全库') : msg`${chat.scopeIds.length} 篇文献`}`;
      open.append(title, meta);
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'text-button'; remove.dataset.historyDelete = chat.id;
      remove.textContent = tr('删除'); remove.setAttribute('aria-label', msg`删除聊天：${chat.title}`);
      row.append(open, remove);
      list.append(row);
    }
  }

  function renderLogMessages({ refreshLog = false } = {}) {
    const target = panel.querySelector('#agent-messages');
    if (!entries.length) {
      renderedLog = []; sources.clear();
      target.innerHTML = html`<div class="agent-welcome">${icon('assistant')}<h3>从你的文献中寻找线索</h3><button type="button" data-agent-prompt="概览当前范围内的文献主题与已录入性能参数。">概览我的文献库</button><button type="button" data-agent-prompt="对比当前范围内各材料的性能参数，保留材料名称、单位、条件及来源。">比较性能参数</button><button type="button" data-agent-prompt="根据已有笔记梳理研究线索，区分证据与推断，并指出信息缺口。">从笔记梳理研究线索</button></div>`;
      target.scrollTop = 0;
      return;
    }
    const append = !refreshLog && renderedLog.length > 0 && renderedLog.every((entry, index) => entry === entries[index]);
    const follow = target.scrollHeight - target.scrollTop - target.clientHeight < 32;
    const scrollTop = target.scrollTop;
    if (!append) { target.replaceChildren(); sources.clear(); }
    for (const entry of entries.slice(append ? renderedLog.length : 0)) {
      const article = document.createElement('article');
      article.className = `agent-message agent-${entry.role}`;
      const heading = document.createElement('small');
      heading.textContent = entry.role === 'user' ? tr('你') : entry.role === 'error' ? tr('请求未完成') : (activeChat()?.character || characterStage.card()).name;
      const content = document.createElement('div');
      content.className = 'agent-message-body';
      if (entry.role === 'error') content.textContent = entry.content;
      else { content.classList.add('agent-markdown'); content.innerHTML = renderChatMarkdown(entry.content, entry.sources || []); }
      article.append(heading, content);
      voiceCtrl.addReplay(article, entry);
      if (entry.choices) {
        const list = document.createElement('ul'); list.className = 'agent-past-choices';
        for (const text of entry.choices) { const item = document.createElement('li'); item.textContent = text; list.append(item); }
        article.append(list);
      }
      if (entry.sources?.length) {
        const list = document.createElement('details'); list.className = 'agent-sources';
        const summary = document.createElement('summary'); summary.textContent = msg`本次检索来源 · ${entry.sources.length} 篇`;
        list.append(summary);
        for (const ref of entry.sources) {
          sources.set(ref.id, ref);
          const button = document.createElement('button');
          button.type = 'button'; button.dataset.agentSource = ref.id;
          button.textContent = [ref.title, ref.year].filter(Boolean).join(' · ');
          list.append(button);
        }
        article.append(list);
      }
      target.append(article);
    }
    renderedLog = entries.slice();
    target.scrollTop = follow || (!append && !refreshLog) ? target.scrollHeight : scrollTop;
  }

  function createChat(id, ids) {
    const now = Date.now();
    const chat = { id, title: tr('新对话'), character: characterStage.card(), scopeIds: ids, createdAt: now, updatedAt: now, entries };
    chats.conversations.push(chat);
    chats.activeId = id;
    contextIdentity = JSON.stringify(ids);
    return chat;
  }

  function clearActiveState() {
    entries = [];
    chats.activeId = '';
    sources.clear();
    contextIdentity = '';
  }

  async function resetLibraryState() {
    entries = [];
    chats = emptyAgentHistory();
    historyReady = false;
    historyKey = '';
    sources.clear();
    contextIdentity = '';
    await saveQueue.catch(() => {});
  }

  panel.querySelector('#agent-history-search').addEventListener('input', renderHistory);

  return {
    getChats: () => chats,
    getEntries: () => entries,
    setEntries: next => { entries = next; },
    isHistoryReady: () => historyReady,
    getHistoryKey: () => historyKey,
    getContextIdentity: () => contextIdentity,
    setContextIdentity: value => { contextIdentity = value; },
    getSources: () => sources,
    activeChat,
    currentCharacter,
    createChat,
    clearActiveState,
    resetLibraryState,
    persistHistory,
    loadHistory,
    chatbar,
    renderHistory,
    renderLogMessages,
  };
}
