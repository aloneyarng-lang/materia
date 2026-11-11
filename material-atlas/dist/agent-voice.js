import {renderChatMarkdown} from './agent-markdown.js';

const sentences = new Intl.Segmenter(undefined, {granularity: 'sentence'});
const limit = 180;

export function replySpeechSegments(text, sources, fallback) {
  const template = document.createElement('template');
  template.innerHTML = renderChatMarkdown(text, sources);
  template.content.querySelectorAll('pre, .agent-citation').forEach(node => node.remove());
  template.content.querySelectorAll('br, th, td').forEach(node => node.after(' '));
  const segments = splitSpeech(template.content.textContent);
  return segments.length ? segments : fallback?[fallback]:[];
}

export function splitSpeech(text) {
  return text.split(/\n+/).flatMap(line => [...sentences.segment(line)].flatMap(({segment}) => {
    const characters = [...segment.trim()];
    const chunks = [];
    while (characters.length > limit) {
      const pause = characters.slice(0, limit).findLastIndex(char => /[\s，,；;、]/u.test(char));
      chunks.push(characters.splice(0, pause >= limit / 2 ? pause + 1 : limit).join('').trim());
    }
    return [...chunks, characters.join('')];
  })).filter(segment => /[\p{L}\p{N}]/u.test(segment));
}

function speechLanguage(text, preferred) {
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return 'ja';
  if (/\p{Script=Han}/u.test(text)) return preferred === 'ja' ? 'ja' : 'zh';
  if (/\p{Script=Hangul}/u.test(text)) return 'auto';
  return 'en';
}

async function* speechRequests(segments, {preferred, voiceLanguage, prepared}, translate, signal) {
  if (voiceLanguage === 'follow') {
    for (const text of segments) yield {text, language: speechLanguage(text, preferred), display:text};
    return;
  }
  const language = voiceLanguage === 'zh-CN' ? 'zh' : voiceLanguage;
  if (prepared) {
    for (const text of segments) yield {text, language, display:text};
    return;
  }
  for (let start = 0; start < segments.length;) {
    const batch = segments.slice(start, start + (start === 0 ? 1 : 8));
    start += batch.length;
    const rows = batch.map(text => ({text, needsTranslation: speechLanguage(text, preferred) !== language}));
    const originals = rows.filter(row => row.needsTranslation).map(row => row.text);
    const translated = originals.length ? (await translate(originals, voiceLanguage, signal)).values() : null;
    for (const row of rows) {
      const parts = row.needsTranslation ? splitSpeech(translated.next().value) : [row.text];
      if (!parts.length) throw Error('配音译文没有可朗读文字。');
      for (const text of parts) yield {text, language, display:row.text};
    }
  }
}

async function play(wav, signal, onPlaying, configureAudio) {
  const data = Uint8Array.fromBase64(wav);
  const url = URL.createObjectURL(new Blob([data], {type: 'audio/wav'}));
  const audio = new Audio(url);
  configureAudio(audio);
  let cancel;
  try {
    await new Promise((resolve, reject) => {
      cancel = resolve;
      audio.addEventListener('playing', () => {if(!signal.aborted)onPlaying?.();}, {once:true});
      audio.addEventListener('ended', resolve, {once: true});
      audio.addEventListener('error', () => reject(Error('配音播放失败。')), {once: true});
      signal.addEventListener('abort', resolve, {once: true});
      audio.play().catch(reject);
    });
  } finally {
    signal.removeEventListener('abort', cancel);
    audio.pause();
    URL.revokeObjectURL(url);
  }
}

export function createReplyVoice({synthesize, translate, onError, getCharacterId}) {
  let active, currentAudio, synthesisQueue = Promise.resolve();
  let playback={japaneseRate:90,volume:100};
  const percent=(value,fallback,min,max)=>Number.isFinite(value)?Math.round(Math.min(max,Math.max(min,value))):fallback;
  function applyPlayback(){
    if(!currentAudio)return;
    const {audio,language}=currentAudio;
    audio.playbackRate=language==='ja'?playback.japaneseRate/100:1;
    audio.preservesPitch=true;
    audio.volume=playback.volume/100;
  }
  function setPlayback(value){
    playback={japaneseRate:percent(value?.japaneseRate,90,60,120),volume:percent(value?.volume,100,0,100)};
    applyPlayback();
    return {...playback};
  }
  const prefetched=new Map();
  const cacheKey=request=>JSON.stringify(request);
  function enqueue(request) {
    const pending=synthesisQueue.then(()=>synthesize(request));
    synthesisQueue=pending.catch(()=>{});
    return pending;
  }
  function prefetch(text,language) {
    const code=language==='zh-CN'?'zh':language;
    if(!['zh','en','ja'].includes(code)||typeof text!=='string'||!text.trim()||[...text].length>180)return;
    const characterId=getCharacterId?.();
    const request={text,language:code,...(characterId?{characterId}:{})},key=cacheKey(request);
    if(prefetched.has(key))return;
    prefetched.clear();
    prefetched.set(key,enqueue(request).then(wav=>({wav}),error=>({error})));
  }

  function stop() {
    active?.abort();
    active = null;
    prefetched.clear();
  }

  async function speak(text, {sources, preferred, fallback, voiceLanguage, prepared, paired, onSegment, onClip, manual=false}) {
    active?.abort();
    const characterId=getCharacterId?.();
    const turn = new AbortController();
    const {signal} = turn;
    active = turn;
    try {
      const segments = replySpeechSegments(text, sources, fallback);
      const matched=paired?.language===voiceLanguage&&Array.isArray(paired.segments)&&paired.segments.length;
      const code=voiceLanguage==='zh-CN'?'zh':voiceLanguage;
      const clips = matched ? paired.segments.map(row=>({text:row.speech,language:code,display:row.text})).values()
        : speechRequests(segments, {preferred,voiceLanguage,prepared}, translate, signal);
      const request = async () => {
        try {
          const {value,done} = await clips.next();
          if (done || signal.aborted) return {};
          const {display,...fields}=value,input={...fields,...(characterId?{characterId}:{}),...(manual?{manual:true}:{})},key=cacheKey(input);
          const cached=prefetched.get(key);
          prefetched.delete(key);
          const response=cached ? await cached : {wav:await enqueue(input)};
          if(response.wav)onClip?.({wav:response.wav,language:input.language,text:display??text});
          return {...response,language:input.language,display:display??text};
        } catch (error) { return {error}; }
      };
      let pending = request(), played = false;
      while (!signal.aborted) {
        const {wav, error, language, display} = await pending;
        if (signal.aborted) return false;
        if (error) throw error;
        if (!wav) break;
        pending = request();
        try{
          await play(wav,signal,()=>onSegment?.(display),audio=>{currentAudio={audio,language,turn};applyPlayback();});
        }finally{
          if(currentAudio?.turn===turn)currentAudio=null;
        }
        played = true;
      }
      return played && !signal.aborted;
    } catch {
      if (!signal.aborted) onError();
      turn.abort();
      return false;
    } finally {
      if (active === turn) active = null;
    }
  }

  async function replay({language},load){
    stop();
    const turn=new AbortController(),{signal}=turn;
    active=turn;
    try{
      const wav=await load();
      if(signal.aborted)return false;
      await play(wav,signal,undefined,audio=>{currentAudio={audio,language,turn};applyPlayback();});
      return !signal.aborted;
    }catch(error){
      if(!signal.aborted)throw error;
      return false;
    }finally{
      if(currentAudio?.turn===turn)currentAudio=null;
      if(active===turn)active=null;
    }
  }

  return {speak, stop, prefetch, setPlayback, replay};
}
