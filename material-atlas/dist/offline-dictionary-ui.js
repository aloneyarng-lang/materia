import {t as tr,html,msg} from './i18n.js';
import {readStudy,updateStudy} from './study-client.js';
import {OFFLINE_DICTIONARY_LANGUAGES,searchOfflineDictionary,offlineDictionarySize} from './offline-dictionary.js';

export function offlineDictionaryShell(){
  return html`<div class="offline-dictionary-tools"><input type="search" data-offline-query aria-label="本地词典查词" placeholder="输入英文、中文、日文或德文术语…"><select data-offline-target aria-label="离线翻译目标语言">${Object.entries(OFFLINE_DICTIONARY_LANGUAGES).map(([id,label])=>`<option value="${id}">${tr(label)}</option>`).join('')}</select></div><p class="study-notice">内置学术与材料术语词典，查询全程离线，不会发送文字或使用 API Key。长句和未收录词条仍可使用 AI 翻译。</p><p data-offline-status role="status"></p><div class="offline-dictionary-results"></div>`;
}
export function createOfflineDictionaryView(root,{escape:esc,onVocabularyChanged}={}){
  const $=selector=>root.querySelector(selector);let rows=[],libraryKey='',targetLanguage='zh-CN',query='',busy=false,active=true;
  const message=text=>{$('[data-offline-status]').textContent=text;};
  function render(){
    rows=searchOfflineDictionary(query,targetLanguage,query?60:24);
    message(query?msg`${rows.length} 个本地匹配 · 未使用网络`:msg`内置 ${offlineDictionarySize()} 个术语 · 输入文字开始离线查词`);
    $('.offline-dictionary-results').innerHTML=rows.map((row,index)=>html`<article class="offline-dictionary-card"><header><strong>${esc(row.term)}</strong><small>${tr(OFFLINE_DICTIONARY_LANGUAGES[row.targetLanguage])}</small></header><p>${esc(row.translation)}</p><footer><span>${esc(row.terms.en[0])}</span><button type="button" data-offline-save="${index}">加入生词本</button></footer></article>`).join('')||tr('<p class="study-empty">本地词典暂无此词条。可缩短关键词，或在 PDF 中使用 AI 翻译。</p>');
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
