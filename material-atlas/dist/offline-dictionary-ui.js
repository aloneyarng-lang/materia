import {t as tr,html,msg} from './i18n.js';
import {readStudy,updateStudy} from './study-client.js';
import {OFFLINE_DICTIONARY_LANGUAGES,searchOfflineDictionary} from './offline-dictionary.js';
import {speakTerm} from './vocabulary-ui.js';

const RECENT_KEY='materia.offline-dict.recent.v1';

function loadRecent(){
  try{
    const parsed=JSON.parse(globalThis.localStorage?.getItem(RECENT_KEY)||'[]');
    return Array.isArray(parsed)?parsed.filter(x=>typeof x==='string'&&x.trim()).slice(0,10):[];
  }catch{return[];}
}

function saveRecent(list){
  try{globalThis.localStorage?.setItem(RECENT_KEY,JSON.stringify(list.slice(0,10)));}catch{}
}

export function offlineDictionaryShell({fullPage=false}={}){
  return html`
    <div class="offline-dictionary-tools ${fullPage?'is-hero-search':''}">
      <input type="search" data-offline-query aria-label="本地词典查词" placeholder="输入英文、日文、德文或中文术语，如 grain boundary / alloy / 焼鈍…">
      <select data-offline-target aria-label="离线翻译目标语言">${Object.entries(OFFLINE_DICTIONARY_LANGUAGES).map(([id,label])=>`<option value="${id}">${tr(label)}</option>`).join('')}</select>
    </div>
    ${fullPage?html`
      <div class="offline-dict-meta-row">
        <div class="offline-lang-pills" data-offline-lang-pills>
          ${Object.entries(OFFLINE_DICTIONARY_LANGUAGES).map(([id,label])=>`<button type="button" data-offline-lang-pill="${id}" aria-pressed="${id==='zh-CN'}">${tr(label)}</button>`).join('')}
        </div>
        <div class="offline-recent-chips" data-offline-recent></div>
      </div>
    `:''}
    <p data-offline-status role="status"></p>
    <div class="offline-dictionary-results"></div>
  `;
}

export function createOfflineDictionaryView(root,{escape:esc,onVocabularyChanged,fullPage=false,getVocabularyTerms=null}={}){
  const $=selector=>root.querySelector(selector);
  const events=new AbortController(),listen=(type,fn)=>root.addEventListener(type,fn,{signal:events.signal});
  let rows=[],libraryKey='',targetLanguage='zh-CN',query='',busy=false,active=true,recent=loadRecent();
  const message=text=>{const el=$('[data-offline-status]');if(el)el.textContent=text;};
  let renderVersion=0;

  function renderRecent(){
    const host=$('[data-offline-recent]');
    if(!host)return;
    host.innerHTML=recent.length
      ?`<span class="offline-recent-label">最近查词</span>${recent.map(term=>`<button type="button" data-offline-history="${esc(term)}">${esc(term)}</button>`).join('')}`
      :'';
  }

  function syncLangPills(){
    root.querySelectorAll('[data-offline-lang-pill]').forEach(btn=>{
      btn.setAttribute('aria-pressed',String(btn.dataset.offlineLangPill===targetLanguage));
    });
  }

  async function render(){
    const version=++renderVersion;rows=[];$('.offline-dictionary-results').replaceChildren();message(tr('正在读取本地词典…'));
    syncLangPills();renderRecent();
    let results;try{results=await searchOfflineDictionary(query,targetLanguage,fullPage?72:60);}catch(error){if(active&&version===renderVersion)message('词典文件读取失败：'+error.message);return;}
    if(!active||version!==renderVersion)return;rows=results;
    if(query.trim().length>=2&&results.length){
      recent=[query.trim(),...recent.filter(item=>item.toLowerCase()!==query.trim().toLowerCase())].slice(0,10);
      saveRecent(recent);renderRecent();
    }
    const existing=getVocabularyTerms?.();
    message(query?msg`${rows.length} 个本地匹配 · 未使用网络`:tr('已内置 75 万+ 英汉、WordNet、JMdict、Ding 离线词库 · 输入文字开始极速查词'));
    $('.offline-dictionary-results').innerHTML=rows.map((row,index)=>{
      const saved=existing?.has(`${row.targetLanguage}|${String(row.term||'').trim().toLowerCase()}`);
      return html`<article class="offline-dictionary-card">
        <header>
          <div class="offline-card-title">
            <strong>${esc(row.term)}</strong>
            ${fullPage?`<button type="button" class="vocab-speak-btn" data-offline-speak="${index}" title="朗读发音" aria-label="朗读发音">🔊</button>`:''}
          </div>
          <small>${tr(OFFLINE_DICTIONARY_LANGUAGES[row.targetLanguage])}</small>
        </header>
        ${row.phonetic?`<small class="offline-phonetic">${esc(row.phonetic)}</small>`:''}
        <p style="white-space:pre-line">${esc(row.translation)}</p>
        <footer>
          <span>${esc(row.sources.join(' · '))}</span>
          <button type="button" data-offline-save="${index}" ${saved?'disabled':''}>${saved?tr('✓ 已在生词本'):tr('加入生词本')}</button>
        </footer>
      </article>`;
    }).join('')||(query?tr('<p class="study-empty">本地词典暂无此词条或目标语言释义。</p>'):'');
  }

  async function initialize(){
    const data=await readStudy();if(!active)return;libraryKey=data.libraryKey;targetLanguage=Object.hasOwn(OFFLINE_DICTIONARY_LANGUAGES,data.preferences.targetLanguage)?data.preferences.targetLanguage:'zh-CN';
    const sel=$('[data-offline-target]');if(sel)sel.value=targetLanguage;
    render();
  }

  listen('input',event=>{if(event.target.matches('[data-offline-query]')){query=event.target.value;render();}});
  listen('change',event=>{if(event.target.matches('[data-offline-target]')){targetLanguage=event.target.value;render();}});
  listen('click',async event=>{
    const langBtn=event.target.closest('[data-offline-lang-pill]');
    if(langBtn){
      targetLanguage=langBtn.dataset.offlineLangPill;
      const sel=$('[data-offline-target]');if(sel)sel.value=targetLanguage;
      render();return;
    }
    const histBtn=event.target.closest('[data-offline-history]');
    if(histBtn){
      query=histBtn.dataset.offlineHistory;
      const q=$('[data-offline-query]');if(q){q.value=query;q.focus();}
      render();return;
    }
    const speakBtn=event.target.closest('[data-offline-speak]');
    if(speakBtn){
      const row=rows[Number(speakBtn.dataset.offlineSpeak)];
      if(row)speakTerm(row.term,row.sourceLanguage||'en');
      return;
    }
    const button=event.target.closest('[data-offline-save]');if(!button||busy)return;const row=rows[Number(button.dataset.offlineSave)];if(!row)return;
    busy=true;button.disabled=true;
    try{await updateStudy(libraryKey,{kind:'vocabulary',operation:{type:'add',word:{id:'word-'+crypto.randomUUID(),term:row.term,translation:row.translation,reading:row.phonetic||'',targetLanguage:row.targetLanguage,termLanguage:row.sourceLanguage&&row.sourceLanguage!==row.targetLanguage?row.sourceLanguage:'',sources:[]}}});button.textContent=tr('✓ 已在生词本');await onVocabularyChanged?.();}
    catch(error){message(error.message);button.disabled=false;}
    finally{busy=false;}
  });
  return{initialize,refresh:render,focus(){root.querySelector('[data-offline-query]')?.focus();},dispose(){active=false;events.abort();}};
}
