import {t as tr,html,msg} from './i18n.js';
import {readStudy,updateStudy} from './study-client.js';
import {OFFLINE_DICTIONARY_LANGUAGES,searchOfflineDictionary,offlineDictionarySize} from './offline-dictionary.js';

export function offlineDictionaryShell(){
  return html`<div class="offline-dictionary-tools"><input type="search" data-offline-query aria-label="本地词典查词" placeholder="输入英文、日文或德文单词…"><select data-offline-target aria-label="离线翻译目标语言">${Object.entries(OFFLINE_DICTIONARY_LANGUAGES).map(([id,label])=>`<option value="${id}">${tr(label)}</option>`).join('')}</select></div><p class="study-notice">已内置 ECDICT 英汉词典、Princeton WordNet 英语释义、EDRDG JMdict 日英词典与 Ding 德英词典。支持日英、德英双向离线查词，日语可按汉字或假名查询。日文、德文译成中文时会明确标注经英语转译；词库随程序安装，无需联网或 API Key。</p><p data-offline-status role="status"></p><div class="offline-dictionary-results"></div>`;
}
export function createOfflineDictionaryView(root,{escape:esc,onVocabularyChanged}={}){
  const $=selector=>root.querySelector(selector);let rows=[],libraryKey='',targetLanguage='zh-CN',query='',busy=false,active=true;
  const message=text=>{$('[data-offline-status]').textContent=text;};
  let renderVersion=0;
  async function render(){
    const version=++renderVersion;rows=[];$('.offline-dictionary-results').replaceChildren();message(tr('正在读取本地词典…'));
    let results;try{results=await searchOfflineDictionary(query,targetLanguage,60);}catch(error){if(active&&version===renderVersion)message('词典文件读取失败：'+error.message);return;}
    if(!active||version!==renderVersion)return;rows=results;
    message(query?msg`${rows.length} 个本地匹配 · 未使用网络`:tr('已内置英汉、英语、日英、德英词库 · 输入文字开始离线查词'));
    $('.offline-dictionary-results').innerHTML=rows.map((row,index)=>html`<article class="offline-dictionary-card"><header><strong>${esc(row.term)}</strong><small>${tr(OFFLINE_DICTIONARY_LANGUAGES[row.targetLanguage])}</small></header><small>${esc(row.phonetic||'')}</small><p style="white-space:pre-line">${esc(row.translation)}</p><footer><span>${esc(row.sources.join(' · '))}</span><button type="button" data-offline-save="${index}">加入生词本</button></footer></article>`).join('')||(query?tr('<p class="study-empty">本地词典暂无此词条或目标语言释义。</p>'):'');
  }
  async function initialize(){
    const data=await readStudy();if(!active)return;libraryKey=data.libraryKey;targetLanguage=Object.hasOwn(OFFLINE_DICTIONARY_LANGUAGES,data.preferences.targetLanguage)?data.preferences.targetLanguage:'zh-CN';$('[data-offline-target]').value=targetLanguage;render();
  }
  root.addEventListener('input',event=>{if(event.target.matches('[data-offline-query]')){query=event.target.value;render();}});
  root.addEventListener('change',event=>{if(event.target.matches('[data-offline-target]')){targetLanguage=event.target.value;render();}});
  root.addEventListener('click',async event=>{
    const button=event.target.closest('[data-offline-save]');if(!button||busy)return;const row=rows[Number(button.dataset.offlineSave)];if(!row)return;
    busy=true;button.disabled=true;
    try{await updateStudy(libraryKey,{kind:'vocabulary',operation:{type:'add',word:{id:'word-'+crypto.randomUUID(),term:row.term,translation:row.translation,targetLanguage:row.targetLanguage,sources:[]}}});button.textContent=tr('已加入生词本');await onVocabularyChanged?.();}
    catch(error){message(error.message);button.disabled=false;}
    finally{busy=false;}
  });
  return{initialize,focus(){root.querySelector('[data-offline-query]')?.focus();},dispose(){active=false;}};
}

