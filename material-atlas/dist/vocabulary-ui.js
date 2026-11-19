import {t as tr,html,msg,bindStaticDOM} from './i18n.js';
import {readStudy,updateStudy} from './study-client.js';
import {icon} from './icons.js';
import {TRANSLATION_LANGUAGES,vocabularyMarkdown,vocabularyIsDue} from './study-model.js';
import {createOfflineDictionaryView,offlineDictionaryShell} from './offline-dictionary-ui.js';

const statuses={get new(){return tr('未学习');},get learning(){return tr('学习中');},get mastered(){return tr('已掌握');}};
const types={get word(){return tr('单词');},get phrase(){return tr('短语与句块');}};
const labels=values=>Object.entries(values).map(([key,label])=>'<option value="'+key+'">'+label+'</option>').join('');
const languageOptions=()=>html`<option value="">全部语言</option><option value="?">未标注</option>
  ${Object.entries(TRANSLATION_LANGUAGES).map(([key,label])=>`<option value="${key}">${tr(label)}</option>`).join('')}`;

export function vocabularyShell({allowImport=false}={}){
  return html`
    <div class="vocab-tools vocab-modes">
      <button type="button" data-vocab-mode="list" aria-pressed="true">词卡库</button>
      <button type="button" data-vocab-mode="review" aria-pressed="false">练习</button>
      ${allowImport?html`<button type="button" data-vocab-import aria-expanded="false">导入词表</button>`:''}
    </div>
    ${allowImport?html`<section class="vocab-import" data-vocab-import-panel hidden>
      <p>支持「三语词卡」的 Markdown、CSV 和旧版 JSON。词表需包含语言、表达和中文提示。</p>
      <div class="vocab-tools">
        <button type="button" data-vocab-pick>选择文件</button>
        <input type="file" data-vocab-file accept=".md,.markdown,.csv,.json" hidden>
        <button type="button" data-vocab-import-confirm hidden>确认导入</button>
        <button type="button" data-vocab-import-cancel>取消</button>
      </div>
      <div data-vocab-preview></div>
    </section>`:''}
    <p class="vocab-feedback" data-vocab-feedback role="status" hidden></p>
    <section data-vocab-library>
      <div class="vocab-tools">
        <input type="search" data-vocab-search aria-label="搜索生词" placeholder="搜索表达、释义、例句或文献…">
        <select data-vocab-filter aria-label="学习状态"><option value="">全部状态</option>${labels(statuses)}</select>
        <select data-vocab-type aria-label="词条类型"><option value="">全部类型</option>${labels(types)}</select>
        <select data-vocab-language aria-label="表达语言">${languageOptions()}</select>
        <button type="button" data-vocab-export>导出 MD</button>
      </div>
      <p data-vocab-status role="status"></p>
      <div class="vocab-list"></div>
    </section>
    <section data-vocab-review hidden>
      <div class="vocab-tools vocab-review-settings">
        <label>表达语言<select data-vocab-review-language>${languageOptions()}</select></label>
        <label>词条类型<select data-vocab-review-type><option value="">全部类型</option>${labels(types)}</select></label>
        <label>复习范围<select data-vocab-scope><option value="due">到期词卡</option><option value="all">全部词卡</option></select></label>
        <label>出题方向<select data-vocab-direction><option value="meaning">先看释义</option><option value="term">先看表达</option></select></label>
        <button type="button" class="primary" data-vocab-start>开始练习</button>
      </div>
      <p data-vocab-review-count role="status"></p>
      <div data-vocab-practice></div>
    </section>`;
}

function cardHTML(word,esc){
  const language=word.termLanguage?tr(TRANSLATION_LANGUAGES[word.termLanguage]):
    msg`译成 ${tr(TRANSLATION_LANGUAGES[word.targetLanguage])}`;
  const tag=[language,types[word.entryType]].filter(Boolean).join(' · ');
  const sources=word.sources.map((source,index)=>html`<button type="button" data-vocab-source="${index}" title="${esc(source.quote||tr('查看原文'))}">${esc(source.title||tr('原文献'))} · 第 ${source.page} 页</button>`).join('');
  const facts=[
    word.addedOn&&(word.addedSource==='estimated'?msg`录入 ${word.addedOn}（估算）`:msg`录入 ${word.addedOn}`),
    word.review.last&&msg`最近练习 ${word.review.last}`,
    word.review.due&&msg`下次复习 ${word.review.due}`
  ].filter(Boolean).join(' · ');
  return html`<article class="vocab-card" data-vocab-id="${esc(word.id)}">
    <header><strong>${esc(word.term)}</strong><small>${tag}</small></header>
    ${word.reading?html`<p class="vocab-reading">${esc(word.reading)}</p>`:''}
    <p class="vocab-meaning">${esc(word.translation)}</p>
    ${word.example?html`<p class="vocab-example">${esc(word.example)}</p>`:''}
    ${facts?html`<p class="vocab-dates">${facts}</p>`:''}
    ${sources?html`<div class="vocab-sources">${sources}</div>`:''}
    <details><summary>编辑词条</summary>
      <label>词条类型<select data-vocab-edit="entryType">${Object.entries(types).map(([value,label])=>`<option value="${value}" ${word.entryType===value?'selected':''}>${label}</option>`).join('')}</select></label>
      <label>词义<textarea data-vocab-edit="translation" data-vocab-meaning maxlength="16000">${esc(word.translation)}</textarea></label>
      <label>读音<textarea data-vocab-edit="reading" maxlength="1000">${esc(word.reading)}</textarea></label>
      <label>例句<textarea data-vocab-edit="example" maxlength="4000">${esc(word.example)}</textarea></label>
      <label>备注<textarea data-vocab-edit="note" data-vocab-note maxlength="4000">${esc(word.note)}</textarea></label>
      <button type="button" data-vocab-save>保存修改</button>
    </details>
    <footer>
      <select data-vocab-status-select aria-label="学习状态">${Object.entries(statuses).map(([value,label])=>`<option value="${value}" ${word.status===value?'selected':''}>${label}</option>`).join('')}</select>
      <button type="button" data-vocab-delete>删除</button>
    </footer>
  </article>`;
}

export function createVocabularyView(root,options){
  const esc=options.escape,$=selector=>root.querySelector(selector);
  const events=new AbortController(),listen=(type,fn)=>root.addEventListener(type,fn,{signal:events.signal});
  let rows=[],libraryKey='',epoch=0,busy=false,mode='list',pendingImport=null,round=null,revealed=false,importTicket=0;
  const showFeedback=(text='',error=false)=>{
    const notice=$('[data-vocab-feedback]');
    notice.textContent=text;notice.hidden=!text;notice.classList.toggle('is-error',error);
  };
  const report=error=>showFeedback(tr(error.message,false),true);
  const inScope=word=>!options.paperId||word.sources.some(source=>source.paperId===options.paperId);
  const languageFilter=()=>mode==='review'?$('[data-vocab-review-language]').value:$('[data-vocab-language]').value;
  const typeFilter=()=>mode==='review'?$('[data-vocab-review-type]').value:$('[data-vocab-type]').value;
  function scopeRows(){
    const language=languageFilter(),type=typeFilter();
    return rows.filter(word=>inScope(word)&&(!language||language===(word.termLanguage||'?'))&&(!type||type===word.entryType));
  }
  function filtered(){
    const query=$('[data-vocab-search]').value.trim().toLowerCase(),status=$('[data-vocab-filter]').value;
    return scopeRows().filter(word=>(!status||word.status===status)&&[
      word.term,word.translation,word.reading,word.example,word.note,...word.sources.map(source=>source.title)
    ].join(' ').toLowerCase().includes(query)).sort((a,b)=>b.updatedAt-a.updatedAt);
  }
  const practiceRows=()=>scopeRows().filter(word=>$('[data-vocab-scope]').value==='all'||vocabularyIsDue(word));
  function renderList(){
    const list=filtered();
    $('[data-vocab-status]').textContent=msg`${list.length} 个词条`+(list.length>100?tr(' · 先显示 100 条，请搜索缩小范围'):'');
    $('.vocab-list').innerHTML=list.slice(0,100).map(word=>cardHTML(word,esc)).join('')||html`<p class="study-empty">暂无符合条件的生词。</p>`;
  }
  function renderReview(focus=false){
    while(round?.queue.length&&!rows.some(word=>word.id===round.queue[0]))round.queue.shift();
    const word=round&&rows.find(word=>word.id===round.queue[0]);
    const candidates=practiceRows(),practice=$('[data-vocab-practice]');
    $('[data-vocab-start]').disabled=!libraryKey||!candidates.length;
    $('[data-vocab-start]').textContent=round?tr('重新开始'):tr('开始练习');
    $('[data-vocab-review-count]').textContent=round?
      msg`本轮剩余 ${round.queue.length} 张`:msg`可练习 ${candidates.length} 张词卡`;
    if(!word){
      practice.innerHTML=round?html`<p class="vocab-review-empty" tabindex="-1">本轮练习完成。</p>`:
        html`<p class="study-empty">${candidates.length?tr('先回想，再翻卡对照并评分。'):tr('当前范围内没有可练习的词卡。')}</p>`;
      if(focus)practice.querySelector('[tabindex]')?.focus();
      return;
    }
    const meaningFirst=round.direction==='meaning',prompt=meaningFirst?word.translation:word.term;
    const answer=meaningFirst?word.term:word.translation;
    const language=word.termLanguage?tr(TRANSLATION_LANGUAGES[word.termLanguage]):'';
    const meta=[language,types[word.entryType]].filter(Boolean).join(' · ');
    practice.innerHTML=html`<article class="vocab-review-card">
      <small>${meta}</small>
      <h3 data-vocab-prompt tabindex="-1">${esc(prompt)}</h3>
      ${revealed?html`<div class="vocab-answer">
        <p data-vocab-answer tabindex="-1">${esc(answer)}</p>
        ${word.reading?html`<p class="vocab-reading">${esc(word.reading)}</p>`:''}
        ${word.example?html`<p class="vocab-example">${esc(word.example)}</p>`:''}
        <div class="vocab-tools">
          <button type="button" data-vocab-rate="again">再练一次 <kbd>1</kbd></button>
          <button type="button" data-vocab-rate="hard">有点难 <kbd>2</kbd></button>
          <button type="button" class="primary" data-vocab-rate="good">记住了 <kbd>3</kbd></button>
        </div>
      </div>`:html`<button type="button" class="primary" data-vocab-reveal>显示答案 <kbd>Space</kbd></button>`}
    </article>`;
    if(focus)practice.querySelector(revealed?'[data-vocab-answer]':'[data-vocab-prompt]').focus();
  }
  function render(){if(mode==='list')renderList();else renderReview();}
  function resetRound(){round=null;revealed=false;}
  function closeImport(){
    importTicket++;pendingImport=null;
    $('[data-vocab-import-panel]').hidden=true;$('[data-vocab-import]').setAttribute('aria-expanded','false');
    $('[data-vocab-preview]').replaceChildren();$('[data-vocab-import-confirm]').hidden=true;
    showFeedback();
  }
  function switchMode(next){
    mode=next;
    if(next==='review'&&$('[data-vocab-import-panel]'))closeImport();
    $('[data-vocab-library]').hidden=next!=='list';$('[data-vocab-review]').hidden=next!=='review';
    root.querySelectorAll('[data-vocab-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.vocabMode===next)));
    render();
  }
  async function refresh(){
    if(busy||events.signal.aborted)return;
    const ticket=++epoch;
    try{
      const data=await readStudy();
      if(events.signal.aborted||ticket!==epoch)return;
      if(libraryKey&&data.libraryKey!==libraryKey){
        resetRound();if($('[data-vocab-import-panel]'))closeImport();showFeedback();
      }
      rows=data.vocabulary;libraryKey=data.libraryKey;render();
    }catch(error){if(ticket===epoch&&!events.signal.aborted)report(error);}
  }
  async function save(operation){
    if(!libraryKey)throw new Error('生词本尚未加载，请重新打开。');
    ++epoch;busy=true;root.setAttribute('aria-busy','true');showFeedback();
    const controls=[...root.querySelectorAll('input,textarea,select,button:not(:disabled)')].filter(element=>!element.disabled);
    controls.forEach(element=>element.disabled=true);
    try{rows=await updateStudy(libraryKey,{kind:'vocabulary',operation});return !events.signal.aborted;}
    finally{busy=false;root.removeAttribute('aria-busy');controls.forEach(element=>element.disabled=false);}
  }
  async function preview(file){
    const ticket=++importTicket;
    pendingImport=null;$('[data-vocab-preview]').replaceChildren();$('[data-vocab-import-confirm]').hidden=true;
    showFeedback(tr('正在读取词表…'));
    try{
      const {parseVocabularyImport,VOCABULARY_IMPORT_LIMIT}=await import('./vocabulary-import.js');
      if(file.size>VOCABULARY_IMPORT_LIMIT)throw new Error('词表文件不能超过 4 MB。');
      const result=parseVocabularyImport(await file.text(),file.name);
      if(ticket!==importTicket||events.signal.aborted)return;
      pendingImport=result;
      const preview=$('[data-vocab-preview]');
      preview.innerHTML=html`<p><strong>${esc(file.name)}</strong></p>
        <p>${msg`识别 ${result.words.length} 条 · 重复 ${result.duplicates} 条 · 跳过 ${result.skipped.length} 条`}</p>
        <ul>${result.words.slice(0,4).map(word=>`<li>${esc(word.term)} · ${esc(word.translation)}</li>`).join('')}</ul>
        ${result.skipped.length?html`<p>${msg`跳过的行：${result.skipped.slice(0,8).join(', ')}`}${result.skipped.length>8?'…':''}</p>`:''}`;
      $('[data-vocab-import-confirm]').hidden=false;showFeedback();
    }catch(error){if(ticket===importTicket&&!events.signal.aborted)report(error);}
  }
  async function importPending(){
    if(!pendingImport)return;
    const {words}=pendingImport,ids=new Set(words.map(word=>word.id));
    if(!await save({type:'import',words}))return;
    const added=rows.filter(word=>ids.has(word.id)).length;
    closeImport();switchMode('list');
    showFeedback(msg`导入完成 · 新增 ${added} 条 · 合并 ${words.length-added} 条`);
    $('[data-vocab-import]').focus();
  }
  function startRound(){
    const candidates=practiceRows();
    if(!candidates.length)return;
    candidates.sort((a,b)=>a.review.due.localeCompare(b.review.due)||a.review.last.localeCompare(b.review.last));
    round={direction:$('[data-vocab-direction]').value,queue:candidates.map(word=>word.id)};
    revealed=false;showFeedback();renderReview(true);
  }
  function reveal(){
    if(!round?.queue.length||revealed)return;
    revealed=true;renderReview(true);
  }
  async function rate(rating){
    if(!revealed||!round?.queue.length)return;
    if(!await save({type:'review',id:round.queue[0],rating}))return;
    const id=round.queue.shift();
    if(rating==='again')round.queue.push(id);
    revealed=false;renderReview(true);
  }
  listen('input',event=>{if(!busy&&event.target.matches('[data-vocab-search]'))renderList();});
  listen('change',async event=>{
    if(busy)return;
    const target=event.target;
    if(target.matches('[data-vocab-file]')){
      const [file]=target.files;target.value='';
      if(file)await preview(file);
    }
    if(target.matches('[data-vocab-filter],[data-vocab-language],[data-vocab-type]'))renderList();
    if(target.matches('[data-vocab-scope],[data-vocab-direction],[data-vocab-review-language],[data-vocab-review-type]')){resetRound();renderReview();}
    if(target.matches('[data-vocab-status-select]')){
      const id=target.closest('[data-vocab-id]').dataset.vocabId;
      try{if(await save({type:'update',id,patch:{status:target.value}}))renderList();}
      catch(error){target.value=rows.find(row=>row.id===id)?.status??'new';report(error);}
    }
  });
  listen('keydown',event=>{
    if(mode!=='review'||!event.target.closest('[data-vocab-review]'))return;
    if(event.repeat||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||busy||
      event.target.closest('input,select,textarea,[contenteditable]'))return;
    const rating={'1':'again','2':'hard','3':'good'}[event.key];
    if(revealed&&rating){event.preventDefault();event.stopPropagation();rate(rating).catch(report);}
    if(!revealed&&round?.queue.length&&event.code==='Space'&&!event.target.closest('button')){
      event.preventDefault();event.stopPropagation();reveal();
    }
  });
  listen('click',async event=>{
    const button=event.target.closest('button');if(!button||busy)return;
    try{
      if(button.dataset.vocabMode){switchMode(button.dataset.vocabMode);return;}
      if(button.hasAttribute('data-vocab-start')){startRound();return;}
      if(button.hasAttribute('data-vocab-reveal')){reveal();return;}
      if(button.dataset.vocabRate){await rate(button.dataset.vocabRate);return;}
      if(button.hasAttribute('data-vocab-import')){
        const opening=$('[data-vocab-import-panel]').hidden;
        switchMode('list');showFeedback();
        if(opening){$('[data-vocab-import-panel]').hidden=false;button.setAttribute('aria-expanded','true');$('[data-vocab-pick]').focus();}
        else closeImport();
        return;
      }
      if(button.hasAttribute('data-vocab-pick')){$('[data-vocab-file]').click();return;}
      if(button.hasAttribute('data-vocab-import-cancel')){closeImport();showFeedback();$('[data-vocab-import]').focus();return;}
      if(button.hasAttribute('data-vocab-import-confirm')){await importPending();return;}
      if(button.hasAttribute('data-vocab-export')){await options.saveText(vocabularyMarkdown(filtered()),'Materia-生词本.md','md');return;}
      const card=button.closest('[data-vocab-id]'),word=card&&rows.find(row=>row.id===card.dataset.vocabId);
      if(!word)return;
      if(button.hasAttribute('data-vocab-source'))await options.openSource(word.sources[Number(button.dataset.vocabSource)]);
      if(button.hasAttribute('data-vocab-save')){
        const patch=Object.fromEntries([...card.querySelectorAll('[data-vocab-edit]')].map(field=>[field.dataset.vocabEdit,field.value]));
        if(await save({type:'update',id:word.id,patch}))renderList();
      }
      if(button.hasAttribute('data-vocab-delete')){
        if(!button.dataset.confirmed){button.dataset.confirmed='true';button.textContent=tr('再点删除');return;}
        if(await save({type:'delete',id:word.id}))renderList();
      }
    }catch(error){report(error);}
  });
  return {refresh,dispose(){events.abort();epoch++;}};
}

export function createVocabularyController(options){
  const dialog=document.createElement('dialog');dialog.className='vocabulary-dialog';dialog.id='vocabulary-dialog';dialog.setAttribute('aria-label',tr('本地词典与生词本'));
  dialog.innerHTML=html`<header><h2>本地词典与生词本</h2><button type="button" data-vocab-close aria-label="关闭生词本">×</button></header><div class="dictionary-tabs" role="tablist"><button type="button" role="tab" aria-selected="true" data-dictionary-tab="offline">离线词典</button><button type="button" role="tab" aria-selected="false" data-dictionary-tab="vocabulary">生词本</button></div><section class="offline-dictionary-content">${offlineDictionaryShell()}</section><section class="vocabulary-content" hidden>${vocabularyShell({allowImport:true})}</section>`;
  bindStaticDOM(dialog,{translated:true});document.body.append(dialog);
  dialog.addEventListener('keydown',event=>event.stopPropagation());
  const view=createVocabularyView(dialog.querySelector('.vocabulary-content'),{...options,openSource:async source=>{dialog.close();await options.openSource(source);}});
  const offline=createOfflineDictionaryView(dialog.querySelector('.offline-dictionary-content'),{escape:options.escape,onVocabularyChanged:()=>view.refresh()});
  const showOffline=()=>!dialog.querySelector('.offline-dictionary-content').hidden;
  const focus=()=>showOffline()?offline.focus():dialog.querySelector('[data-vocab-mode][aria-pressed="true"]').focus();
  dialog.addEventListener('click',event=>{
    const tab=event.target.closest('[data-dictionary-tab]');if(!tab)return;
    const offlineTab=tab.dataset.dictionaryTab==='offline';
    dialog.querySelector('.offline-dictionary-content').hidden=!offlineTab;dialog.querySelector('.vocabulary-content').hidden=offlineTab;
    dialog.querySelectorAll('[data-dictionary-tab]').forEach(button=>button.setAttribute('aria-selected',String(button===tab)));
    if(offlineTab)offline.focus();else void view.refresh();
  });
  dialog.querySelector('[data-vocab-close]').onclick=()=>dialog.close();
  const button=document.createElement('button');button.className='ribbon-button';button.title=tr('本地词典与生词本');button.setAttribute('aria-label',tr('本地词典与生词本'));button.innerHTML=icon('dictionary');button.dataset.action='vocabulary';document.querySelector('.workspace-ribbon')?.insertBefore(button,document.querySelector('.ribbon-spacer'));
  bindStaticDOM(button,{translated:true});
  return{async open(){await Promise.all([view.refresh(),offline.initialize()]);if(!dialog.open)dialog.showModal();focus();}};
}
