import {t as tr,html,msg,bindStaticDOM} from './i18n.js';
import {readStudy,updateStudy} from './study-client.js';
import {icon} from './icons.js';
import {TRANSLATION_LANGUAGES,vocabularyMarkdown,vocabularyIsDue,vocabularyToday} from './study-model.js';
import {createOfflineDictionaryView,offlineDictionaryShell} from './offline-dictionary-ui.js';

const statuses={get new(){return tr('未学习');},get learning(){return tr('学习中');},get mastered(){return tr('已掌握');}};
const types={get word(){return tr('单词');},get phrase(){return tr('短语与句块');}};
const SPEECH_LANGS={en:'en-US',ja:'ja-JP',de:'de-DE','zh-CN':'zh-CN',ko:'ko-KR',fr:'fr-FR',es:'es-ES'};
const labels=values=>Object.entries(values).map(([key,label])=>'<option value="'+key+'">'+label+'</option>').join('');
const languageOptions=(includeEmpty=true)=>`${includeEmpty?html`<option value="">全部语言</option><option value="?">未标注</option>`:''}
  ${Object.entries(TRANSLATION_LANGUAGES).map(([key,label])=>`<option value="${key}">${tr(label)}</option>`).join('')}`;

export function vocabularyStats(rows,day=vocabularyToday()){
  const byLanguage={};
  let due=0,newCount=0,learning=0,mastered=0;
  for(const word of rows||[]){
    if(vocabularyIsDue(word,day))due+=1;
    if(word.status==='mastered')mastered+=1;
    else if(word.status==='learning')learning+=1;
    else newCount+=1;
    const lang=word.termLanguage||'?';
    byLanguage[lang]=(byLanguage[lang]||0)+1;
  }
  const total=(rows||[]).length;
  const masteryPct=total?Math.round((mastered/total)*100):0;
  return{total,due,newCount,learning,mastered,masteryPct,byLanguage};
}

export function sortVocabularyRows(rows,sortBy='updated'){
  const list=[...(rows||[])];
  if(sortBy==='alpha'){
    return list.sort((a,b)=>(a.term||'').localeCompare(b.term||'','en',{sensitivity:'base'})||(b.updatedAt-a.updatedAt));
  }
  if(sortBy==='due'){
    return list.sort((a,b)=>{
      const da=a.review?.due||'0000-00-00',db=b.review?.due||'0000-00-00';
      return da.localeCompare(db)||(a.review?.stage||0)-(b.review?.stage||0)||(b.updatedAt-a.updatedAt);
    });
  }
  if(sortBy==='stage'){
    return list.sort((a,b)=>(a.review?.stage||0)-(b.review?.stage||0)||(b.updatedAt-a.updatedAt));
  }
  return list.sort((a,b)=>b.updatedAt-a.updatedAt);
}

const csvCell=val=>{
  const s=String(val??'').replace(/\r?\n/g,'\n');
  return /[",\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s;
};

export function vocabularyCSV(rows){
  const header=['语言','表达','词义','读音','例句','状态','掌握阶段','下次复习','备注'].join(',');
  const lines=(rows||[]).map(w=>[
    TRANSLATION_LANGUAGES[w.termLanguage]||w.termLanguage||'',
    w.term||'',
    w.translation||'',
    w.reading||'',
    w.example||'',
    w.status||'new',
    w.review?.stage??0,
    w.review?.due||'',
    w.note||'',
  ].map(csvCell).join(','));
  return '\uFEFF'+[header,...lines].join('\r\n');
}

export function checkSpellingAttempt(attempt,expected){
  const clean=value=>String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase().replace(/[.!?。！？;；,:：]+$/g,'');
  const normalizedAttempt=clean(attempt);
  const normalizedExpected=clean(expected);
  return{
    exact:Boolean(normalizedAttempt&&normalizedAttempt===normalizedExpected),
    normalizedAttempt,
    normalizedExpected,
  };
}

export function speakTerm(term,langCode){
  const synth=globalThis.speechSynthesis;
  const Ctor=globalThis.SpeechSynthesisUtterance;
  if(!synth||!Ctor||!term)return false;
  try{
    synth.cancel();
    const u=new Ctor(String(term).trim());
    u.lang=SPEECH_LANGS[langCode]||'en-US';
    u.rate=0.95;
    synth.speak(u);
    return true;
  }catch{return false;}
}

export function vocabularyShell({allowImport=false,fullPage=false}={}){
  return html`
    ${fullPage?html`
      <section class="vocab-stats" data-vocab-stats aria-label="生词统计概览"></section>
    `:''}
    <div class="vocab-tools vocab-modes">
      <button type="button" data-vocab-mode="list" aria-pressed="true">词卡库</button>
      <button type="button" data-vocab-mode="review" aria-pressed="false">练习</button>
      ${fullPage?html`<button type="button" data-vocab-add-toggle aria-expanded="false">+ 新增词条</button>`:''}
      ${fullPage?html`<button type="button" data-vocab-batch-toggle aria-pressed="false">批量整理</button>`:''}
      ${allowImport?html`<button type="button" data-vocab-import aria-expanded="false">导入词表</button>`:''}
    </div>
    ${fullPage?html`
      <form class="vocab-add-panel" data-vocab-add-panel hidden>
        <div class="vocab-add-grid">
          <label>表达 *<input type="text" data-vocab-new="term" maxlength="160" required placeholder="如：coercivity / 焼鈍"></label>
          <label>表达语言<select data-vocab-new="termLanguage">${languageOptions(false)}</select></label>
          <label>词条类型<select data-vocab-new="entryType">${labels(types)}</select></label>
          <label class="is-wide">中文 / 释义 *<textarea data-vocab-new="translation" maxlength="16000" rows="2" required placeholder="输入释义或学科术语解释…"></textarea></label>
          <label>读音 / 音标<input type="text" data-vocab-new="reading" maxlength="1000" placeholder="如 /kəʊˈɜːsɪvɪti/ 或 しょうどん"></label>
          <label>笔记备注<input type="text" data-vocab-new="note" maxlength="4000" placeholder="可选记忆线索或构词备注"></label>
          <label class="is-wide">语境例句<textarea data-vocab-new="example" maxlength="4000" rows="2" placeholder="可选原句或例句…"></textarea></label>
        </div>
        <div class="vocab-tools">
          <button type="submit" class="primary" data-vocab-add-submit>添加到生词本</button>
          <button type="button" data-vocab-add-cancel>取消</button>
        </div>
      </form>
    `:''}
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
      <div class="vocab-tools vocab-filter-bar">
        <input type="search" data-vocab-search aria-label="搜索生词" placeholder="搜索表达、释义、例句或文献…">
        <select data-vocab-filter aria-label="学习状态">
          <option value="">全部状态</option>
          ${fullPage?html`<option value="due">今日到期</option>`:''}
          ${labels(statuses)}
        </select>
        <select data-vocab-type aria-label="词条类型"><option value="">全部类型</option>${labels(types)}</select>
        <select data-vocab-language aria-label="表达语言">${languageOptions()}</select>
        ${fullPage?html`
          <select data-vocab-sort aria-label="排序方式">
            <option value="updated">最近更新</option>
            <option value="due">最早到期</option>
            <option value="stage">掌握度升序</option>
            <option value="alpha">字母 A–Z</option>
          </select>
          <div class="vocab-layout-switch" role="group" aria-label="视图布局">
            <button type="button" data-vocab-layout="grid" aria-pressed="true">卡片</button>
            <button type="button" data-vocab-layout="table" aria-pressed="false">词表</button>
          </div>
          <button type="button" data-vocab-export-csv>导出 CSV</button>
        `:''}
        <button type="button" data-vocab-export>导出 MD</button>
      </div>
      ${fullPage?html`<div class="vocab-lang-chips" data-vocab-lang-chips></div>`:''}
      ${fullPage?html`
        <div class="vocab-batch-bar" data-vocab-batch-bar hidden>
          <span data-vocab-batch-count>已选 0 条</span>
          <button type="button" data-vocab-batch-all>全选当前</button>
          <button type="button" data-vocab-batch-clear>取消全选</button>
          <button type="button" data-vocab-batch-status="mastered">设为已掌握</button>
          <button type="button" data-vocab-batch-status="learning">设为学习中</button>
          <button type="button" data-vocab-batch-export>导出所选 MD</button>
          <button type="button" class="is-danger" data-vocab-batch-delete>批量删除</button>
        </div>
      `:''}
      <p data-vocab-status role="status"></p>
      <div class="vocab-list" data-layout="grid"></div>
    </section>
    <section data-vocab-review hidden>
      <div class="vocab-tools vocab-review-settings">
        ${fullPage?html`
          <label>练习模式<select data-vocab-practice-mode>
            <option value="flashcard">3D 翻卡回忆</option>
            <option value="spelling">拼写听写测验</option>
          </select></label>
        `:''}
        <label>表达语言<select data-vocab-review-language>${languageOptions()}</select></label>
        <label>词条类型<select data-vocab-review-type><option value="">全部类型</option>${labels(types)}</select></label>
        <label>复习范围<select data-vocab-scope><option value="due">到期词卡</option><option value="all">全部词卡</option></select></label>
        <label>出题方向<select data-vocab-direction><option value="meaning">先看释义</option><option value="term">先看表达</option></select></label>
        <button type="button" class="primary" data-vocab-start>开始练习</button>
      </div>
      <div class="vocab-review-meta">
        <p data-vocab-review-count role="status"></p>
        ${fullPage?html`<div class="vocab-progress-track" data-vocab-progress-track hidden><i data-vocab-progress-fill></i></div>`:''}
      </div>
      <div data-vocab-practice></div>
    </section>`;
}

function stagePips(stage=0){
  const n=Math.max(0,Math.min(5,Number(stage)||0));
  return `<span class="vocab-stage-pips" title="${msg`掌握阶段 ${n} / 5`}" aria-label="${msg`掌握阶段 ${n} / 5`}">${Array.from({length:5},(_,i)=>`<i class="${i<n?'is-filled':''}"></i>`).join('')}</span>`;
}

function cardHTML(word,esc,{fullPage=false,batchMode=false,selectedIds=null}={}){
  const language=word.termLanguage?tr(TRANSLATION_LANGUAGES[word.termLanguage]):
    msg`译成 ${tr(TRANSLATION_LANGUAGES[word.targetLanguage])}`;
  const tag=[language,types[word.entryType]].filter(Boolean).join(' · ');
  const sources=word.sources.map((source,index)=>html`<button type="button" data-vocab-source="${index}" title="${esc(source.quote||tr('查看原文'))}">${esc(source.title||tr('原文献'))} · 第 ${source.page} 页</button>`).join('');
  const facts=[
    word.addedOn&&(word.addedSource==='estimated'?msg`录入 ${word.addedOn}（估算）`:msg`录入 ${word.addedOn}`),
    word.review.last&&msg`最近练习 ${word.review.last}`,
    word.review.due&&msg`下次复习 ${word.review.due}`
  ].filter(Boolean).join(' · ');
  const checked=selectedIds?.has(word.id);
  const due=vocabularyIsDue(word);
  return html`<article class="vocab-card ${checked?'is-selected':''}" data-vocab-id="${esc(word.id)}" data-status="${esc(word.status||'new')}" data-due="${due}">
    <header>
      <div class="vocab-card-title-wrap">
        ${batchMode?`<input type="checkbox" class="vocab-batch-check" data-vocab-check ${checked?'checked':''} aria-label="${esc(word.term)}">`:''}
        <strong>${esc(word.term)}</strong>
        ${fullPage?`<button type="button" class="vocab-speak-btn" data-vocab-speak="${esc(word.id)}" title="朗读发音" aria-label="朗读发音">🔊</button>`:''}
      </div>
      <div class="vocab-card-badges">
        ${fullPage?stagePips(word.review?.stage):''}
        <small>${tag}</small>
      </div>
    </header>
    ${word.reading?html`<p class="vocab-reading">${esc(word.reading)}</p>`:''}
    <p class="vocab-meaning">${esc(word.translation)}</p>
    ${word.example?html`<p class="vocab-example">${esc(word.example)}</p>`:''}
    ${word.note?html`<p class="vocab-note">${esc(word.note)}</p>`:''}
    ${facts?html`<p class="vocab-dates">${facts}${due&&fullPage?' · <b class="vocab-due-dot">待复习</b>':''}</p>`:''}
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

function tableHTML(list,esc,{batchMode=false,selectedIds=null}={}){
  return `<div class="vocab-table-wrap"><table class="vocab-table"><thead><tr>
    ${batchMode?'<th>选</th>':''}
    <th>表达</th><th>词义</th><th>读音</th><th>语言</th><th>阶段</th><th>下次复习</th><th>状态</th><th>操作</th>
  </tr></thead><tbody>${list.map(word=>{
    const lang=TRANSLATION_LANGUAGES[word.termLanguage]||'-';
    const checked=selectedIds?.has(word.id);
    return `<tr data-vocab-id="${esc(word.id)}">
      ${batchMode?`<td><input type="checkbox" data-vocab-check ${checked?'checked':''} aria-label="${esc(word.term)}"></td>`:''}
      <td><strong>${esc(word.term)}</strong> <button type="button" class="vocab-speak-btn" data-vocab-speak="${esc(word.id)}" aria-label="朗读">🔊</button></td>
      <td class="vocab-table-meaning">${esc(word.translation)}</td>
      <td class="vocab-table-muted">${esc(word.reading||'—')}</td>
      <td>${esc(tr(lang))}</td>
      <td>${stagePips(word.review?.stage)}</td>
      <td class="vocab-table-muted">${esc(word.review?.due||'今日')}</td>
      <td><select data-vocab-status-select aria-label="学习状态">${Object.entries(statuses).map(([v,l])=>`<option value="${v}" ${word.status===v?'selected':''}>${l}</option>`).join('')}</select></td>
      <td><button type="button" data-vocab-delete>删除</button></td>
    </tr>`;
  }).join('')}</tbody></table></div>`;
}

export function createVocabularyView(root,options){
  const esc=options.escape,$=selector=>root.querySelector(selector);
  const fullPage=Boolean(options.fullPage);
  const events=new AbortController(),listen=(type,fn)=>root.addEventListener(type,fn,{signal:events.signal});
  let rows=[],libraryKey='',epoch=0,busy=false,mode='list',layout='grid',batchMode=false;
  let pendingImport=null,round=null,revealed=false,spellingResult=null,importTicket=0;
  const selectedIds=new Set();
  const showFeedback=(text='',error=false)=>{
    const notice=$('[data-vocab-feedback]');
    if(!notice)return;
    notice.textContent=text;notice.hidden=!text;notice.classList.toggle('is-error',error);
  };
  const report=error=>showFeedback(tr(error.message,false),true);
  const inScope=word=>!options.paperId||word.sources.some(source=>source.paperId===options.paperId);
  const languageFilter=()=>mode==='review'?$('[data-vocab-review-language]')?.value||'':$('[data-vocab-language]')?.value||'';
  const typeFilter=()=>mode==='review'?$('[data-vocab-review-type]')?.value||'':$('[data-vocab-type]')?.value||'';
  function scopeRows(){
    const language=languageFilter(),type=typeFilter();
    return rows.filter(word=>inScope(word)&&(!language||language===(word.termLanguage||'?'))&&(!type||type===word.entryType));
  }
  function filtered(){
    const query=$('[data-vocab-search]').value.trim().toLowerCase(),status=$('[data-vocab-filter]').value;
    const sortBy=$('[data-vocab-sort]')?.value||'updated';
    const matching=scopeRows().filter(word=>{
      if(status==='due'&&!vocabularyIsDue(word))return false;
      else if(status&&status!=='due'&&word.status!==status)return false;
      return [word.term,word.translation,word.reading,word.example,word.note,...word.sources.map(source=>source.title)].join(' ').toLowerCase().includes(query);
    });
    return sortVocabularyRows(matching,sortBy);
  }
  const practiceRows=()=>scopeRows().filter(word=>$('[data-vocab-scope]').value==='all'||vocabularyIsDue(word));

  function renderStats(){
    const scoped=rows.filter(inScope);
    const stats=vocabularyStats(scoped);
    options.onStats?.(stats);
    const statsHost=$('[data-vocab-stats]');
    if(statsHost){
      statsHost.innerHTML=html`
        <div class="vocab-kpi"><span>TOTAL LEXICON</span><strong>${stats.total}</strong><small>词条总量</small></div>
        <div class="vocab-kpi is-due"><span>DUE TODAY</span><strong>${stats.due}</strong><small>今日待复习</small></div>
        <div class="vocab-kpi is-learning"><span>LEARNING</span><strong>${stats.learning}</strong><small>巩固中</small></div>
        <div class="vocab-kpi is-mastered">
          <span>MASTERY</span>
          <strong>${stats.mastered}<small> (${stats.masteryPct}%)</small></strong>
          <div class="vocab-mastery-bar"><i style="width:${stats.masteryPct}%"></i></div>
        </div>
      `;
    }
    const chipsHost=$('[data-vocab-lang-chips]');
    if(chipsHost){
      const activeLang=$('[data-vocab-language]')?.value||'';
      const chips=[['','全部',stats.total],...Object.entries(stats.byLanguage).map(([code,count])=>[code,TRANSLATION_LANGUAGES[code]?tr(TRANSLATION_LANGUAGES[code]):tr('未标注'),count])];
      chipsHost.innerHTML=chips.map(([code,label,count])=>`<button type="button" data-vocab-lang-chip="${esc(code)}" aria-pressed="${activeLang===code}">${esc(label)} <span>${count}</span></button>`).join('');
    }
  }

  function syncBatchBar(){
    const bar=$('[data-vocab-batch-bar]');
    if(!bar)return;
    bar.hidden=!batchMode;
    $('[data-vocab-batch-toggle]')?.setAttribute('aria-pressed',String(batchMode));
    const countEl=$('[data-vocab-batch-count]');
    if(countEl)countEl.textContent=msg`已选 ${selectedIds.size} 条`;
    for(const btn of bar.querySelectorAll('[data-vocab-batch-status],[data-vocab-batch-export],[data-vocab-batch-delete]')){
      btn.disabled=selectedIds.size===0;
    }
  }

  function renderList(){
    renderStats();
    const validIds=new Set(rows.map(w=>w.id));
    for(const id of [...selectedIds])if(!validIds.has(id))selectedIds.delete(id);
    syncBatchBar();
    const list=filtered();
    $('[data-vocab-status]').textContent=msg`${list.length} 个词条`+(list.length>100?tr(' · 先显示 100 条，请搜索缩小范围'):'');
    const host=$('.vocab-list');
    host.dataset.layout=fullPage?layout:'grid';
    const visible=list.slice(0,100);
    if(!visible.length){
      host.innerHTML=html`<p class="study-empty">暂无符合条件的生词。</p>`;
      return;
    }
    host.innerHTML=fullPage&&layout==='table'
      ?tableHTML(visible,esc,{batchMode,selectedIds})
      :visible.map(word=>cardHTML(word,esc,{fullPage,batchMode,selectedIds})).join('');
  }

  function renderReview(focus=false){
    renderStats();
    while(round?.queue.length&&!rows.some(word=>word.id===round.queue[0]))round.queue.shift();
    const word=round&&rows.find(word=>word.id===round.queue[0]);
    const candidates=practiceRows(),practice=$('[data-vocab-practice]');
    $('[data-vocab-start]').disabled=!libraryKey||!candidates.length;
    $('[data-vocab-start]').textContent=round?tr('重新开始'):tr('开始练习');
    const done=round?round.reviewed:0,total=round?(round.reviewed+round.queue.length):candidates.length;
    const pct=round&&total?Math.round((done/total)*100):0;
    $('[data-vocab-review-count]').textContent=round
      ?(word?msg`本轮进度 ${done}/${total} · 剩余 ${round.queue.length} 张`:msg`已完成本轮 ${done} 张`)
      :msg`可练习 ${candidates.length} 张词卡`;
    const track=$('[data-vocab-progress-track]');
    if(track){
      track.hidden=!round;
      const fill=$('[data-vocab-progress-fill]');
      if(fill)fill.style.width=`${pct}%`;
    }
    if(!word){
      if(round){
        const acc=round.reviewed?Math.round((round.goodCount/round.reviewed)*100):0;
        practice.innerHTML=fullPage?html`<article class="vocab-review-summary" tabindex="-1">
          <span class="vocab-summary-badge">SESSION COMPLETE</span>
          <h3>本轮练习完成</h3>
          <p>累计作答 <strong>${round.reviewed}</strong> 次 · 首次记住 <strong>${round.goodCount}</strong> 词 · 掌握率 <strong>${acc}%</strong></p>
          <button type="button" class="primary" data-vocab-restart>再来一轮</button>
        </article>`:html`<p class="vocab-review-empty" tabindex="-1">本轮练习完成。</p>`;
      }else{
        practice.innerHTML=html`<p class="study-empty">${candidates.length?tr('先回想，再翻卡对照并评分；在全页模式还可切换拼写测验。'):tr('当前范围内没有可练习的词卡。')}</p>`;
      }
      if(focus)practice.querySelector('[tabindex]')?.focus();
      return;
    }
    const pMode=round.practiceMode||'flashcard';
    const meaningFirst=pMode==='spelling'||round.direction==='meaning';
    const prompt=meaningFirst?word.translation:word.term;
    const answer=meaningFirst?word.term:word.translation;
    const language=word.termLanguage?tr(TRANSLATION_LANGUAGES[word.termLanguage]):'';
    const meta=[language,types[word.entryType]].filter(Boolean).join(' · ');

    if(pMode==='spelling'){
      practice.innerHTML=html`<article class="vocab-review-card is-spelling">
        <div class="vocab-review-card-top">
          <small>${meta} · 拼写测验</small>
          ${fullPage?`<button type="button" class="vocab-speak-btn" data-vocab-speak="${esc(word.id)}" title="听发音提示">🔊 听发音</button>`:''}
        </div>
        <h3 data-vocab-prompt tabindex="-1">${esc(prompt)}</h3>
        ${!revealed?html`
          <form class="vocab-spelling-form" data-vocab-spelling-form>
            <input type="text" data-vocab-spelling-input placeholder="输入对应的外文表达，按 Enter 核对…" autocomplete="off" spellcheck="false">
            <button type="submit" class="primary" data-vocab-spelling-check>核对拼写</button>
            <button type="button" data-vocab-reveal>直接看答案</button>
          </form>
        `:html`
          <div class="vocab-answer">
            ${spellingResult?`<p class="vocab-spelling-verdict ${spellingResult.exact?'is-exact':'is-diff'}">
              ${spellingResult.exact?'✓ 拼写完全正确！':msg`已输入：${spellingResult.normalizedAttempt||'（空）'} · 正确拼写如下：`}
            </p>`:''}
            <p data-vocab-answer tabindex="-1">${esc(word.term)}</p>
            ${word.reading?html`<p class="vocab-reading">${esc(word.reading)}</p>`:''}
            ${word.example?html`<p class="vocab-example">${esc(word.example)}</p>`:''}
            <div class="vocab-tools">
              <button type="button" data-vocab-rate="again">再练一次 <kbd>1</kbd></button>
              <button type="button" data-vocab-rate="hard">有点难 <kbd>2</kbd></button>
              <button type="button" class="primary" data-vocab-rate="good">记住了 <kbd>3</kbd></button>
            </div>
          </div>
        `}
      </article>`;
      if(focus)practice.querySelector(revealed?'[data-vocab-answer]':'[data-vocab-spelling-input]')?.focus();
      return;
    }

    practice.innerHTML=html`<article class="vocab-review-card vocab-flip-card ${revealed?'is-flipped':''}">
      <div class="vocab-review-card-top">
        <small>${meta}</small>
        <div class="vocab-review-card-right">
          ${fullPage?stagePips(word.review?.stage):''}
          ${fullPage&&(revealed||!meaningFirst)?`<button type="button" class="vocab-speak-btn" data-vocab-speak="${esc(word.id)}" aria-label="朗读发音">🔊</button>`:''}
        </div>
      </div>
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
  function resetRound(){round=null;revealed=false;spellingResult=null;}
  function closeImport(){
    if(!$('[data-vocab-import-panel]'))return;
    importTicket++;pendingImport=null;
    $('[data-vocab-import-panel]').hidden=true;$('[data-vocab-import]').setAttribute('aria-expanded','false');
    $('[data-vocab-preview]').replaceChildren();$('[data-vocab-import-confirm]').hidden=true;
    showFeedback();
  }
  function closeAdd(){
    const panel=$('[data-vocab-add-panel]');
    if(!panel)return;
    panel.hidden=true;
    $('[data-vocab-add-toggle]')?.setAttribute('aria-expanded','false');
  }
  function switchMode(next){
    mode=next;
    if(next==='review'){closeImport();closeAdd();}
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
        resetRound();closeImport();closeAdd();selectedIds.clear();showFeedback();
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
  async function runBatch(ids,makeOp,successMsg){
    if(!libraryKey||!ids.length)return;
    ++epoch;busy=true;root.setAttribute('aria-busy','true');showFeedback();
    const controls=[...root.querySelectorAll('input,textarea,select,button:not(:disabled)')].filter(element=>!element.disabled);
    controls.forEach(element=>element.disabled=true);
    try{
      for(const id of ids){
        rows=await updateStudy(libraryKey,{kind:'vocabulary',operation:makeOp(id)});
        if(events.signal.aborted)return;
      }
      selectedIds.clear();
      renderList();
      if(successMsg)showFeedback(successMsg);
    }catch(error){report(error);}
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
      const previewEl=$('[data-vocab-preview]');
      previewEl.innerHTML=html`<p><strong>${esc(file.name)}</strong></p>
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
    $('[data-vocab-import]')?.focus();
  }
  function startRound(){
    const candidates=practiceRows();
    if(!candidates.length)return;
    candidates.sort((a,b)=>a.review.due.localeCompare(b.review.due)||a.review.last.localeCompare(b.review.last));
    round={
      direction:$('[data-vocab-direction]').value,
      practiceMode:$('[data-vocab-practice-mode]')?.value||'flashcard',
      queue:candidates.map(word=>word.id),
      reviewed:0,
      goodCount:0,
    };
    revealed=false;spellingResult=null;showFeedback();renderReview(true);
  }
  function reveal(result=null){
    if(!round?.queue.length||revealed)return;
    spellingResult=result;
    revealed=true;renderReview(true);
  }
  async function rate(rating){
    if(!revealed||!round?.queue.length)return;
    if(!await save({type:'review',id:round.queue[0],rating}))return;
    round.reviewed+=1;
    if(rating==='good')round.goodCount+=1;
    const id=round.queue.shift();
    if(rating==='again')round.queue.push(id);
    revealed=false;spellingResult=null;renderReview(true);
  }
  listen('input',event=>{if(!busy&&event.target.matches('[data-vocab-search]'))renderList();});
  listen('submit',async event=>{
    if(event.target.matches('[data-vocab-spelling-form]')){
      event.preventDefault();
      const word=round&&rows.find(w=>w.id===round.queue[0]);
      const input=$('[data-vocab-spelling-input]');
      if(word&&input)reveal(checkSpellingAttempt(input.value,word.term));
      return;
    }
    if(event.target.matches('[data-vocab-add-panel]')&&!busy){
      event.preventDefault();
      const getVal=f=>$('[data-vocab-new="'+f+'"]')?.value.trim()||'';
      const term=getVal('term'),translation=getVal('translation');
      if(!term||!translation){showFeedback('请填写表达与释义。',true);return;}
      const word={
        id:'word-'+crypto.randomUUID(),
        term,
        translation,
        targetLanguage:'zh-CN',
        termLanguage:getVal('termLanguage')||'en',
        entryType:getVal('entryType')||'word',
        reading:getVal('reading'),
        example:getVal('example'),
        note:getVal('note'),
        addedOn:vocabularyToday(),
        addedSource:'source',
        sources:[],
      };
      try{
        if(await save({type:'add',word})){
          event.target.reset();
          closeAdd();
          renderList();
          showFeedback(msg`已加入新词条「${term}」`);
        }
      }catch(error){report(error);}
    }
  });
  listen('change',async event=>{
    if(busy)return;
    const target=event.target;
    if(target.matches('[data-vocab-file]')){
      const [file]=target.files;target.value='';
      if(file)await preview(file);
    }
    if(target.matches('[data-vocab-filter],[data-vocab-language],[data-vocab-type],[data-vocab-sort]'))renderList();
    if(target.matches('[data-vocab-scope],[data-vocab-direction],[data-vocab-review-language],[data-vocab-review-type],[data-vocab-practice-mode]')){resetRound();renderReview();}
    if(target.matches('[data-vocab-check]')){
      const id=target.closest('[data-vocab-id]')?.dataset.vocabId;
      if(id){if(target.checked)selectedIds.add(id);else selectedIds.delete(id);renderList();}
    }
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
      if(button.hasAttribute('data-vocab-add-toggle')){
        const panel=$('[data-vocab-add-panel]');
        const opening=panel.hidden;
        switchMode('list');closeImport();
        panel.hidden=!opening;
        button.setAttribute('aria-expanded',String(opening));
        if(opening)$('[data-vocab-new="term"]')?.focus();
        return;
      }
      if(button.hasAttribute('data-vocab-add-cancel')){closeAdd();$('[data-vocab-add-toggle]')?.focus();return;}
      if(button.hasAttribute('data-vocab-batch-toggle')){
        batchMode=!batchMode;
        if(!batchMode)selectedIds.clear();
        renderList();
        return;
      }
      if(button.dataset.vocabLayout){
        layout=button.dataset.vocabLayout;
        root.querySelectorAll('[data-vocab-layout]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.vocabLayout===layout)));
        renderList();
        return;
      }
      if(button.dataset.vocabLangChip!==undefined){
        const select=$('[data-vocab-language]');
        if(select){select.value=button.dataset.vocabLangChip;renderList();}
        return;
      }
      if(button.hasAttribute('data-vocab-batch-all')){
        for(const word of filtered().slice(0,100))selectedIds.add(word.id);
        renderList();return;
      }
      if(button.hasAttribute('data-vocab-batch-clear')){selectedIds.clear();renderList();return;}
      if(button.dataset.vocabBatchStatus){
        await runBatch([...selectedIds],id=>({type:'update',id,patch:{status:button.dataset.vocabBatchStatus}}),msg`已批量更新 ${selectedIds.size} 条状态`);
        return;
      }
      if(button.hasAttribute('data-vocab-batch-export')){
        const picked=rows.filter(w=>selectedIds.has(w.id));
        await options.saveText(vocabularyMarkdown(picked),'Materia-精选生词本.md','md');
        return;
      }
      if(button.hasAttribute('data-vocab-batch-delete')){
        if(!button.dataset.confirmed){button.dataset.confirmed='true';button.textContent=tr('再点确认删除');return;}
        button.textContent=tr('批量删除');delete button.dataset.confirmed;
        await runBatch([...selectedIds],id=>({type:'delete',id}),'已批量删除所选词条');
        return;
      }
      if(button.dataset.vocabSpeak){
        const word=rows.find(w=>w.id===button.dataset.vocabSpeak);
        if(word&&!speakTerm(word.term,word.termLanguage||'en'))showFeedback('当前环境不支持语音朗读，可核对读音标。');
        return;
      }
      if(button.hasAttribute('data-vocab-start')||button.hasAttribute('data-vocab-restart')){startRound();return;}
      if(button.hasAttribute('data-vocab-reveal')){reveal();return;}
      if(button.dataset.vocabRate){await rate(button.dataset.vocabRate);return;}
      if(button.hasAttribute('data-vocab-import')){
        const opening=$('[data-vocab-import-panel]').hidden;
        switchMode('list');closeAdd();showFeedback();
        if(opening){$('[data-vocab-import-panel]').hidden=false;button.setAttribute('aria-expanded','true');$('[data-vocab-pick]').focus();}
        else closeImport();
        return;
      }
      if(button.hasAttribute('data-vocab-pick')){$('[data-vocab-file]').click();return;}
      if(button.hasAttribute('data-vocab-import-cancel')){closeImport();showFeedback();$('[data-vocab-import]')?.focus();return;}
      if(button.hasAttribute('data-vocab-import-confirm')){await importPending();return;}
      if(button.hasAttribute('data-vocab-export')){await options.saveText(vocabularyMarkdown(filtered()),'Materia-生词本.md','md');return;}
      if(button.hasAttribute('data-vocab-export-csv')){await options.saveText(vocabularyCSV(filtered()),'Materia-生词本.csv','csv');return;}
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
  return {
    refresh,
    switchMode,
    getStats:()=>vocabularyStats(rows.filter(inScope)),
    getTermsSet:()=>new Set(rows.filter(inScope).map(w=>`${w.targetLanguage}|${String(w.term||'').trim().toLowerCase()}`)),
    dispose(){events.abort();epoch++;},
  };
}

export function createVocabularyController(options){
  if(typeof options.openPage==='function'){
    return{async open(){await options.openPage();}};
  }
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
