import {cleanReplyLanguage,characterIdFor,profileFor} from './agent-character-memory.js';
import {browsePreviewCorpus} from './agent-character-corpus.js';
import {rollDialogueChoices} from './agent-choices.js';
import {runCompanionTurn} from './agent-companion.js';
import {getLocale,msg,t as tr} from './i18n.js';

const GAP_KEY = 'materia.auto-line-gap';

export function createAgentAutoplayController({
  panel,
  native,
  desktop,
  status,
  getConfig,
  showSettings,
  agentCredentialIssue,
  isBusy,
  isHistoryReady,
  characterStage,
  getChats,
  getEntries,
  activeChat,
  createChat,
  scopeIds,
  history,
  currentCharacter,
  memoryContext,
  showHistory,
  settings,
  persistHistory,
  render,
  voiceCtrl,
  translateVoice,
  completeInPreview,
  drainQuestions,
  hasPendingQuestions,
}) {
  let autoMode = 'paused', autoLinePlaying = false, autoTimer, autoRequest;
  let autoLines = [], autoChoices, autoRecap = '', autoChatId = '', autoSeed = 0, autoBatchReady = false;

  const isActive = () => autoMode !== 'paused';
  const gapSlider = panel.querySelector('#agent-auto-gap');

  try {
    const savedGap = localStorage.getItem(GAP_KEY);
    if (savedGap !== null && Number.isFinite(Number(savedGap))) gapSlider.value = savedGap;
  } catch {}

  function syncGapSlider() {
    const label = msg`${gapSlider.valueAsNumber} 秒`;
    panel.querySelector('output[for="agent-auto-gap"]').value = label;
    gapSlider.setAttribute('aria-valuetext', label);
  }
  syncGapSlider();
  gapSlider.addEventListener('input', syncGapSlider);
  gapSlider.addEventListener('change', () => {
    try { localStorage.setItem(GAP_KEY, gapSlider.value); }
    catch { status(tr('台词间隔未能保存。')); }
  });

  function interrupt(clear = false) {
    clearTimeout(autoTimer);
    if (autoRequest && !autoRequest.controller.signal.aborted) {
      autoRequest.controller.abort();
      if (desktop) native.agentCancel(autoRequest.id).catch(() => {});
    }
    if (clear) { autoLines = []; autoChoices = undefined; autoRecap = ''; autoChatId = ''; autoSeed = 0; autoBatchReady = false; }
    return autoRequest?.done;
  }

  function pause(clear = false) {
    if (isActive()) { if (!isBusy()) status(''); voiceCtrl.stopVoice(); }
    autoMode = 'paused';
    interrupt(clear);
    characterStage.autoplay(autoMode);
  }

  function schedule(delay = 0) {
    clearTimeout(autoTimer);
    if (!isActive() || isBusy() || panel.hidden || document.hidden || autoLinePlaying) return;
    const latest = getEntries().at(-1);
    if (latest?.automatic && latest.choices && !hasPendingQuestions()) { status(tr('任选一句，或直接输入。')); return; }
    if (autoMode === 'step' && autoLines.length) { status(tr('按空格播放下一句。')); return; }
    autoTimer = setTimeout(playLine, autoMode === 'step' ? 0 : delay);
  }

  async function playLine(advance = false) {
    if (!isActive() || isBusy() || panel.hidden || document.hidden || autoLinePlaying) return;
    const entries = getEntries(), chats = getChats();
    try {
      if (entries.length >= 1000) throw Error('单个对话最多保存 1000 条消息，请另开新对话。');
      if (!activeChat() && chats.conversations.length >= 200) throw Error('聊天历史已满（最多 200 个对话），请先删除不需要的对话。');
      if (!autoLines.length) {
        if (autoBatchReady) {
          pause();
          status(tr('她停下来等你接话。'));
          drainQuestions();
          return;
        }
        if (autoRequest) await autoRequest.done.catch(() => {});
        if (!isActive() || isBusy() || panel.hidden || document.hidden || autoRequest) return;
        const chat = activeChat(), character = chat?.character || characterStage.card();
        autoChatId = chat?.id || autoChatId || crypto.randomUUID();
        const recent = history().slice(-12);
        const topic = recent.findLast(entry => entry.role === 'user')?.content || '';
        const voiceLang = voiceCtrl.getVoiceLanguage();
        const payload = {
          id: crypto.randomUUID(), chatId: autoChatId, character, history: recent,
          voiceLanguage: voiceCtrl.canSpeak() && voiceLang !== 'follow' ? voiceLang : undefined,
          kurisuContext: memoryContext(character, topic),
          companion: { locale: getLocale(), seed: autoSeed++, recap: chat?.companionRecap || '', offerChoice: rollDialogueChoices() },
        };
        const current = { id: payload.id, controller: new AbortController() };
        autoRequest = current;
        status(tr('正在准备下一句…'));
        const signal = current.controller.signal;
        const generated = desktop
          ? native.agentRun(payload)
          : runCompanionTurn({ ...payload, signal, findCanon: browsePreviewCorpus, complete: input => completeInPreview(input, true) });
        current.done = generated.then(async result => {
          const target = voiceCtrl.getVoiceLanguage();
          if (result.voice || result.error || signal.aborted || !voiceCtrl.canSpeak() || target === 'follow' || target === cleanReplyLanguage(payload.kurisuContext?.replyLanguage)) return result;
          try { return { ...result, voice: { target, lines: await translateVoice(result.lines, target, signal) } }; }
          catch (error) { if (signal.aborted) throw error; return { ...result, voice: { target } }; }
        });
        try {
          const result = await current.done;
          if (signal.aborted || !isActive() || isBusy()) return;
          if (result.error) throw Error(result.error);
          autoLines = result.lines.map((line, index) => ({
            line,
            spoken: result.voice?.segments?.[index]?.speech ?? result.voice?.lines?.[index],
            target: result.voice?.language ?? result.voice?.target,
          }));
          autoChoices = result.choices; autoRecap = result.recap; autoBatchReady = true;
        } catch (error) {
          if (signal.aborted) return;
          throw error;
        } finally {
          if (autoRequest === current) autoRequest = null;
        }
      }
      if (autoMode === 'step' && !advance) { status(tr('按空格播放下一句。')); return; }
      const { line, spoken, target } = autoLines.shift();
      autoLinePlaying = true;
      const chat = activeChat() || createChat(autoChatId, scopeIds());
      chat.companionRecap = autoRecap;
      const entry = { role: 'assistant', content: line, automatic: true };
      if (!autoLines.length && autoChoices) entry.choices = autoChoices;
      entries.push(entry);
      voiceCtrl.setSubtitle(voiceCtrl.canSpeak() ? '' : null);
      status(voiceCtrl.canSpeak() ? tr('正在准备配音…') : ''); render();
      const voiceLang = voiceCtrl.getVoiceLanguage();
      const prepared = target === voiceLang;
      if (prepared && !spoken && voiceCtrl.canSpeak()) {
        panel.querySelector('[data-character="voice"] small').textContent = 'ERROR';
      }
      const prefetchNext = () => {
        const next = autoLines[0];
        if (next?.target === voiceLang) voiceCtrl.prefetch(next.spoken, next.target);
      };
      const paired = prepared && spoken ? { language: target, segments: [{ text: line, speech: spoken }] } : undefined;
      const voiced = prepared
        ? spoken && voiceCtrl.speakReply(line, [], target, true, paired, prefetchNext, entry)
        : voiceCtrl.speakReply(line, [], profileFor(chats, characterIdFor(currentCharacter()))?.replyLanguage, false, undefined, undefined, entry);
      if (!voiced) { voiceCtrl.setSubtitle(null); characterStage.render(); }
      await persistHistory();
      const played = await voiced;
      autoLinePlaying = false;
      const readingTime = played ? 0 : Math.min(8000, Math.max(2400, line.length * 85));
      if (entries.at(-1) === entry) schedule(played && !autoLines.length && hasPendingQuestions() ? 0 : readingTime + gapSlider.valueAsNumber * 1000);
    } catch (error) {
      autoLinePlaying = false;
      pause();
      status(msg`自动对话已暂停。${error.message}`);
      drainQuestions();
    }
  }

  function setMode(mode) {
    if (mode === autoMode) return;
    if (mode === 'paused') { pause(); status(tr('自动对话已暂停。')); drainQuestions(); return; }
    if (isActive()) {
      autoMode = mode;
      characterStage.autoplay(autoMode);
      clearTimeout(autoTimer);
      if (!autoRequest && !autoLinePlaying) schedule();
      return;
    }
    if (isBusy() || !isHistoryReady() || characterStage.isSwitching()) return;
    const issue = agentCredentialIssue(getConfig());
    if (issue) { showSettings('service'); status(issue); return; }
    if (scopeIds()?.length === 0) { status(tr('请先在文献列表勾选文献，或打开一篇文献，再使用当前选中范围。')); return; }
    showHistory(false);
    settings.open = false;
    autoMode = mode;
    voiceCtrl.stopVoice();
    voiceCtrl.prepareVoice();
    if (!autoLines.length) autoBatchReady = false;
    characterStage.autoplay(autoMode);
    schedule();
  }

  document.addEventListener('keydown', event => {
    if (autoMode !== 'step' || panel.hidden || document.hidden || event.key !== ' ' || event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || document.querySelector('dialog[open]')) return;
    if (event.target.closest?.('input,textarea,select,[contenteditable],button:not([data-character=autoplay]),a,summary')) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat && autoLines.length && !autoLinePlaying) void playLine(true);
  }, true);

  return {
    isActive,
    waitingForSpeech: () => Boolean(voiceCtrl.isPlaying() || (isActive() && (autoRequest || autoLinePlaying || autoLines.length))),
    interrupt,
    pause,
    setMode,
    toggleMode: () => setMode(autoMode === 'paused' ? 'auto' : autoMode === 'auto' ? 'step' : 'paused'),
    schedule,
    syncGapSlider,
  };
}
