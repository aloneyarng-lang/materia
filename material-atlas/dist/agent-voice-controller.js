import {createReplyVoice,replySpeechSegments,splitSpeech} from './agent-voice.js';
import {characterIdFor,voiceIdFor,cleanReplyLanguage,profileFor,KURISU_ID} from './agent-character-memory.js';
import {reportAchievement} from './flow-achievements.js';
import {t as tr} from './i18n.js';

const PLAYBACK_KEY = 'materia.voice-playback';
const GO_VOICE_CACHE_KEY = 'materia.flow.go.voiceCache.v1';
const GO_CACHE_MAX_RAM = 48;
const GO_CACHE_MAX_DISK = 96;

export function createAgentVoiceController({
  panel,
  native,
  voiceButton,
  status,
  statusTextRef,
  currentCharacter,
  getChats,
  getHistoryKey,
  isHistoryReady,
  getLibraryEpoch,
  persistHistory,
  syncLanguageForm,
  renderStage,
  isBusy,
  onPauseAutoplay,
  drainQuestions,
  translateVoice,
  serviceStatus,
  syncStopButton,
  syncLanguageUi,
}) {
  let voiceAvailable = false, voiceEnabled = false, voicePlayback = null, voiceSubtitle = null;
  let voiceLanguage = 'follow', voiceLanguageSaving = false, voiceSettingEpoch = 0, voiceCharacterId;
  let goPlayback = null, goVoiceMeta = null;
  const clipQueues = new WeakMap();
  const goWavCache = new Map();
  const getVoiceButton = () => voiceButton || panel.querySelector('[data-character="voice"]');

  function showVoiceError() {
    const btn = getVoiceButton();
    if (!btn) return;
    btn.querySelector('small').textContent = 'ERROR';
    btn.title = tr('配音暂不可用，文字回复仍可阅读。');
  }

  const replyVoice = createReplyVoice({
    synthesize: request => native.agentVoiceSynthesize(request),
    getCharacterId: () => voiceIdFor(currentCharacter()),
    translate: translateVoice,
    onError: showVoiceError,
  });

  let savedPlayback;
  try { savedPlayback = JSON.parse(localStorage.getItem(PLAYBACK_KEY)); } catch {}
  let voicePlaybackSettings = replyVoice.setPlayback(savedPlayback);
  const playbackSliders = { 'agent-voice-rate': 'japaneseRate', 'agent-voice-volume': 'volume' };

  function syncPlaybackSliders() {
    for (const [id, key] of Object.entries(playbackSliders)) {
      const value = voicePlaybackSettings[key], slider = panel.querySelector('#' + id);
      slider.value = value;
      slider.setAttribute('aria-valuetext', value + '%');
      panel.querySelector(`output[for="${id}"]`).value = value + '%';
    }
  }
  for (const [id, key] of Object.entries(playbackSliders)) {
    const slider = panel.querySelector('#' + id);
    slider.addEventListener('input', () => {
      voicePlaybackSettings = replyVoice.setPlayback({ ...voicePlaybackSettings, [key]: slider.valueAsNumber });
      syncPlaybackSliders();
    });
    slider.addEventListener('change', () => {
      try { localStorage.setItem(PLAYBACK_KEY, JSON.stringify(voicePlaybackSettings)); }
      catch { status(tr('配音设置未能保存。')); }
    });
  }
  syncPlaybackSliders();

  function syncVoiceButton() {
    const btn = getVoiceButton();
    if (!btn) return;
    btn.hidden = false;
    btn.disabled = !voiceAvailable;
    btn.querySelector('small').textContent = voiceEnabled ? 'ON' : 'OFF';
    btn.title = tr(!voiceAvailable ? '当前角色配音暂不可用' : voiceEnabled ? '配音已开' : '配音已关');
    btn.setAttribute('aria-pressed', String(voiceEnabled));
  }

  async function loadVoiceSetting() {
    if (!native?.agentVoiceStatus) return;
    const selected = voiceIdFor(currentCharacter());
    const turn = ++voiceSettingEpoch;
    const { available, enabled, language } = await native.agentVoiceStatus(selected);
    if (selected === KURISU_ID) goVoiceMeta = { available, enabled, language: language || 'follow' };
    if (turn !== voiceSettingEpoch || selected !== voiceIdFor(currentCharacter())) return;
    voiceAvailable = available; voiceEnabled = enabled; voiceLanguage = language || 'follow';
    syncVoiceButton(); syncLanguageForm();
  }

  async function ensureGoVoiceMeta() {
    if (goVoiceMeta) return goVoiceMeta;
    if (!native?.agentVoiceStatus) {
      goVoiceMeta = { available: false, enabled: false, language: 'follow' };
      return goVoiceMeta;
    }
    try {
      const res = await native.agentVoiceStatus(KURISU_ID);
      goVoiceMeta = { available: Boolean(res?.available), enabled: res?.enabled !== false, language: res?.language || 'follow' };
    } catch {
      goVoiceMeta = { available: false, enabled: false, language: 'follow' };
    }
    return goVoiceMeta;
  }

  async function saveVoiceLanguage(value) {
    if (voiceLanguageSaving || value === voiceLanguage) return;
    voiceLanguageSaving = true;
    panel.querySelector('#agent-voice-language').disabled = true;
    try {
      voiceLanguage = await native.agentVoiceSetLanguage(value);
      if (goVoiceMeta) goVoiceMeta.language = voiceLanguage;
      stopVoice();
      status(tr('配音语言已保存。'));
    } finally {
      voiceLanguageSaving = false;
      syncLanguageForm();
      drainQuestions();
    }
  }

  const canSpeak = () => voiceAvailable && voiceEnabled && !panel.hidden && !document.hidden;

  function stopVoice() {
    replyVoice.stop();
    voiceSubtitle = null;
    renderStage();
    voicePlayback = null;
    goPlayback = null;
    syncStopButton();
  }

  function stopGoCommentary() {
    if (!goPlayback) return;
    replyVoice.stop();
    goPlayback = null;
  }

  function prepareVoice() {
    if (!canSpeak()) return;
    const character = currentCharacter();
    const language = voiceLanguage === 'follow'
      ? cleanReplyLanguage(profileFor(getChats(), characterIdFor(character))?.replyLanguage)
      : voiceLanguage;
    void native.agentVoicePrepare(voiceIdFor(character), language === 'zh-CN' ? 'zh' : language).catch(() => {});
  }

  async function saveVoiceClip({ wav, language, text }, key) {
    const id = await native.agentVoiceSave({ libraryKey: key, wav });
    return { id, language, text: text.slice(0, 1200) };
  }

  function archiveForEntry(entry) {
    if (!entry || !isHistoryReady() || !native?.agentVoiceSave) return undefined;
    const key = getHistoryKey(), epoch = getLibraryEpoch();
    return clip => {
      const pending = (clipQueues.get(entry) || Promise.resolve()).then(async () => {
        const saved = await saveVoiceClip(clip, key);
        if (epoch !== getLibraryEpoch() || !getChats().conversations.some(chat => chat.entries.includes(entry))) return;
        const records = entry.voiceClips ??= [];
        if (records.length >= 512 || records.some(row => row.id === saved.id && row.text === saved.text)) return;
        records.push(saved);
        await persistHistory({ sync: false });
      }).catch(() => { if (epoch === getLibraryEpoch()) status(tr('语音记录保存失败，当前对话仍可阅读。')); });
      clipQueues.set(entry, pending);
    };
  }

  function speakReply(text, sources, preferred, prepared = false, paired, onSegment, entry) {
    if (!canSpeak()) return;
    syncVoiceButton();
    const fallback = { ja: '回答を表示しました。', en: 'The answer is on screen.' }[preferred] || '回复已显示。';
    let reportedVoice = false;
    const playback = replyVoice.speak(text, {
      sources, preferred, fallback, voiceLanguage, prepared, paired, onClip: archiveForEntry(entry),
      onSegment: display => {
        if (!reportedVoice) { reportedVoice = true; reportAchievement('voicePlayCount', 1, 'add'); }
        voiceSubtitle = display; renderStage();
        if (statusTextRef() === tr('正在准备配音…')) status('');
        onSegment?.();
      },
    });
    voicePlayback = playback;
    syncStopButton();
    void playback.then(played => {
      if (voicePlayback === playback) {
        voicePlayback = null; syncStopButton();
        if (!played) { voiceSubtitle = null; renderStage(); }
      }
    });
    return playback;
  }

  async function replayVoiceClip(clip) {
    if (isBusy()) throw Error(tr('请等当前回答完成后再重读。'));
    onPauseAutoplay();
    stopVoice();
    const playback = replyVoice.replay(clip, () => native.agentVoiceRead({ libraryKey: clip.libraryKey ?? getHistoryKey(), id: clip.id }));
    voicePlayback = playback; syncStopButton();
    try { return await playback; }
    finally { if (voicePlayback === playback) { voicePlayback = null; syncStopButton(); drainQuestions(); } }
  }

  async function generateReplay(entry, text) {
    if (isBusy()) throw Error(tr('请等当前回答完成后再重读。'));
    const actor = voiceIdFor(currentCharacter());
    if (!actor || !(await native.agentVoiceStatus(actor)).available) throw Error(tr('当前角色配音暂不可用。'));
    onPauseAutoplay();
    stopVoice();
    const preferred = profileFor(getChats(), characterIdFor(currentCharacter()))?.replyLanguage;
    const playback = replyVoice.speak(text, { preferred, voiceLanguage, manual: true, onClip: archiveForEntry(entry) });
    voicePlayback = playback; syncStopButton();
    try {
      if (!await playback) throw Error(tr('朗读未完成。'));
      await clipQueues.get(entry);
    } finally {
      if (voicePlayback === playback) { voicePlayback = null; syncStopButton(); drainQuestions(); }
    }
  }

  function addReplay(article, entry) {
    if (!native?.agentVoiceRead || entry.role !== 'assistant' || !entry.content.trim()) return;
    const content = article.querySelector('.agent-message-body');
    const selector = 'p,li,td,th,h1,h2,h3,h4,h5,h6';
    const blocks = [...content.querySelectorAll(selector)].filter(block => !block.closest('pre'));
    const sentences = new Intl.Segmenter(undefined, { granularity: 'sentence' });
    for (const block of blocks) {
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
        acceptNode: node => node.parentElement.closest('button,pre') || node.parentElement.closest(selector) !== block
          ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
      });
      const nodes = []; let node, text = '';
      while ((node = walker.nextNode())) { nodes.push({ node, start: text.length }); text += node.textContent; }
      for (const part of [...sentences.segment(text)].reverse()) {
        const sentence = part.segment.trim();
        if (!/[\p{L}\p{N}]/u.test(sentence)) continue;
        const end = part.index + part.segment.trimEnd().length;
        const last = nodes.findLast(row => row.start < end);
        if (!last) continue;
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'agent-replay-button'; button.textContent = '▶';
        button.title = tr('重读'); button.setAttribute('aria-label', tr('重读') + ' ' + sentence);
        button.addEventListener('click', async () => {
          button.disabled = true;
          try {
            const clips = replySpeechSegments(sentence, entry.sources).map(partText =>
              entry.voiceClips?.findLast(row => replySpeechSegments(row.text, entry.sources).join(' ').trim() === partText));
            if (clips.length && clips.every(Boolean)) {
              for (const clip of clips) if (!await replayVoiceClip(clip)) break;
            } else await generateReplay(entry, sentence);
          } catch (error) { status(error.message); }
          finally { button.disabled = false; }
        });
        const range = document.createRange();
        range.setStart(last.node, end - last.start); range.collapse(true); range.insertNode(button);
      }
    }
  }

  async function readTextAloud(text, language, { signal, onTranslation, onClip }) {
    if (isBusy()) throw Error(tr('请等当前回答完成后再朗读。'));
    const key = getHistoryKey(), epoch = getLibraryEpoch(), actor = voiceIdFor(currentCharacter());
    if (!isHistoryReady()) throw Error(tr('聊天历史尚未读取。'));
    if (!actor || !(await native.agentVoiceStatus(actor)).available) throw Error(tr('当前角色配音暂不可用。'));
    onPauseAutoplay(); stopVoice();
    const service = await serviceStatus();
    if (!service.ready) throw Error(service.message);
    const source = splitSpeech(text), translated = [];
    if (!source.length) throw Error(tr('没有可朗读的文字。'));
    for (let i = 0; i < source.length; i += 12) translated.push(...await translateVoice(source.slice(i, i + 12), language, signal));
    signal.throwIfAborted();
    if (epoch !== getLibraryEpoch() || actor !== voiceIdFor(currentCharacter())) throw Error(tr('角色或文献库已切换，请重新朗读。'));
    onTranslation(translated.join('\n'));
    onPauseAutoplay(); stopVoice();
    const segments = translated.flatMap(line => splitSpeech(line).map(part => ({ text: part, speech: part })));
    const writes = [];
    const playback = replyVoice.speak('', {
      voiceLanguage: language, paired: { language, segments }, manual: true,
      onClip: clip => writes.push(saveVoiceClip(clip, key).then(saved => onClip({ ...saved, libraryKey: key }), error => error)),
    });
    voicePlayback = playback; syncStopButton();
    try {
      const played = await playback, results = await Promise.all(writes);
      signal.throwIfAborted();
      if (results.some(result => result instanceof Error)) throw Error(tr('朗读完成，但有语音未能保存。'));
      if (!played) throw Error(tr('朗读未完成。'));
    } finally {
      if (voicePlayback === playback) { voicePlayback = null; syncStopButton(); drainQuestions(); }
    }
  }

  function syncCharacterVoice() {
    const nextVoiceId = voiceIdFor(currentCharacter());
    if (voiceCharacterId === nextVoiceId) return false;
    voiceCharacterId = nextVoiceId;
    replyVoice.stop();
    voicePlayback = null;
    goPlayback = null;
    voiceSubtitle = null;
    voiceAvailable = false;
    return true;
  }

  function toggleVoice() {
    const btn = getVoiceButton();
    const next = !voiceEnabled;
    if (!next) { voiceEnabled = false; stopVoice(); }
    if (btn) btn.disabled = true;
    native.agentVoiceSetEnabled(next).then(value => {
      voiceEnabled = value;
      if (goVoiceMeta) goVoiceMeta.enabled = value;
      syncVoiceButton();
      prepareVoice();
    }).catch(() => {
      voiceEnabled = !next;
      syncVoiceButton();
      status(tr('配音设置未能保存。'));
    }).finally(() => { if (btn) btn.disabled = false; });
  }

  function readGoDiskIndex() {
    try {
      const parsed = JSON.parse(localStorage.getItem(GO_VOICE_CACHE_KEY));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
  }

  function writeGoDiskIndex(key, entry) {
    try {
      const current = readGoDiskIndex();
      delete current[key];
      current[key] = entry;
      const entries = Object.entries(current);
      if (entries.length > GO_CACHE_MAX_DISK) {
        const trimmed = Object.fromEntries(entries.slice(-GO_CACHE_MAX_DISK));
        localStorage.setItem(GO_VOICE_CACHE_KEY, JSON.stringify(trimmed));
      } else {
        localStorage.setItem(GO_VOICE_CACHE_KEY, JSON.stringify(current));
      }
    } catch {}
  }

  function setGoRamCache(key, wav) {
    goWavCache.delete(key);
    goWavCache.set(key, wav);
    if (goWavCache.size > GO_CACHE_MAX_RAM) {
      goWavCache.delete(goWavCache.keys().next().value);
    }
  }

  async function speakGoCommentary({ id, speech, language = 'zh', manual = false } = {}) {
    if (panel.hidden || document.hidden || !native?.agentVoiceSynthesize || !speech) return false;
    const meta = await ensureGoVoiceMeta();
    if (!manual && (!meta.available || !meta.enabled)) return false;
    const lang = language === 'zh-CN' ? 'zh' : language;
    const cacheKey = `${KURISU_ID}|${lang}|${id}`;
    const libraryKey = getHistoryKey();
    const loadWav = async () => {
      if (goWavCache.has(cacheKey)) {
        const hit = goWavCache.get(cacheKey);
        setGoRamCache(cacheKey, hit);
        return hit;
      }
      const disk = readGoDiskIndex()[cacheKey];
      if (disk && disk.libraryKey === libraryKey && disk.id && native.agentVoiceRead) {
        try {
          const wav = await native.agentVoiceRead({ libraryKey: disk.libraryKey, id: disk.id });
          if (typeof wav === 'string' && wav.startsWith('UklGR')) {
            setGoRamCache(cacheKey, wav);
            return wav;
          }
        } catch {}
      }
      const wav = await native.agentVoiceSynthesize({ text: speech, language: lang, characterId: KURISU_ID, manual });
      if (typeof wav === 'string' && wav.startsWith('UklGR')) {
        setGoRamCache(cacheKey, wav);
        if (libraryKey && native.agentVoiceSave) {
          void native.agentVoiceSave({ libraryKey, wav }).then(clipId => {
            if (clipId) writeGoDiskIndex(cacheKey, { libraryKey, id: clipId, language: lang });
          }).catch(() => {});
        }
      }
      return wav;
    };
    const playback = replyVoice.replay({ language: lang }, loadWav);
    goPlayback = playback;
    try {
      const ok = await playback;
      if (ok) reportAchievement('voicePlayCount', 1, 'add');
      return ok;
    } catch {
      return false;
    } finally {
      if (goPlayback === playback) goPlayback = null;
    }
  }

  function getGoVoiceBridge() {
    return {
      speakCommentary: speakGoCommentary,
      stopCommentary: stopGoCommentary,
      getVoiceState: () => ({
        available: Boolean(goVoiceMeta?.available),
        enabled: goVoiceMeta?.enabled !== false,
        language: voiceLanguage,
      }),
      prepare: () => {
        void ensureGoVoiceMeta().then(meta => {
          if (!meta.available || !meta.enabled || !native?.agentVoicePrepare) return;
          const lang = voiceLanguage === 'follow' ? 'zh' : voiceLanguage === 'zh-CN' ? 'zh' : voiceLanguage;
          void native.agentVoicePrepare(KURISU_ID, lang).catch(() => {});
        });
      },
    };
  }

  panel.querySelector('#agent-voice-language').addEventListener('change', event => {
    saveVoiceLanguage(event.target.value).catch(error => status(error.message));
  });

  return {
    speakReply,
    prefetch: (...args) => replyVoice.prefetch(...args),
    stopVoice,
    stopGoCommentary,
    prepareVoice,
    loadVoiceSetting,
    saveVoiceLanguage,
    syncVoiceButton,
    syncCharacterVoice,
    toggleVoice,
    addReplay,
    readTextAloud,
    canSpeak,
    isPlaying: () => Boolean(voicePlayback),
    getSubtitle: () => voiceSubtitle,
    setSubtitle: value => { voiceSubtitle = value; },
    getVoiceLanguage: () => voiceLanguage,
    isVoiceAvailable: () => voiceAvailable,
    isVoiceLanguageSaving: () => voiceLanguageSaving,
    onLibraryChanged: () => { goVoiceMeta = null; goWavCache.clear(); voiceCharacterId = undefined; },
    onShow: () => { if (syncLanguageUi) syncLanguageUi(); },
    getGoVoiceBridge,
  };
}
