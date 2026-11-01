import {t as tr,html,msg} from './i18n.js';
import {bindStaticDOM} from './i18n.js';
import {readStudy,updateStudy} from './study-client.js';
import {icon} from './icons.js';
import {TRANSLATION_LANGUAGES,vocabularyMarkdown} from './study-model.js';
const statuses={get new(){return tr('未学习');},get learning(){return tr('学习中');},get mastered(){return tr('已掌握');}};
export function vocabularyShell(){return html`<div class="vocab-tools"><input type="search" data-vocab-search aria-label="搜索生词" placeholder="搜索词语、词义或文献…"><select data-vocab-filter aria-label="学习状态"><option value="">全部状态</option>${Object.entries(statuses).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select><button type="button" data-vocab-export>导出 MD</button></div><p data-vocab-status role="status"></p><div class="vocab-list"></div>`;}
export function createVocabularyView(root,options){
  const esc=options.escape;let rows=[],libraryKey='',query='',filter='',epoch=0,active=true,busy=false;
  const $=selector=>root.querySelector(selector),message=text=>{$('[data-vocab-status]').textContent=text;};
  const filtered=()=>rows.filter(word=>(!options.paperId||word.sources.some(s=>s.paperId===options.paperId))&&(!filter||word.status===filter)&&[word.term,word.translation,word.note,...word.sources.map(s=>s.title)].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a,b)=>b.updatedAt-a.updatedAt);
  function render(){
    const list=filtered();message(msg`${list.length} 个词条${list.length>100?tr(' · 先显示 100 条，请搜索缩小范围'):''}`);
    $('.vocab-list').innerHTML=list.slice(0,100).map(word=>html`<article class="vocab-card" data-vocab-id="${esc(word.id)}"><header><strong>${esc(word.term)}</strong><small>${tr(TRANSLATION_LANGUAGES[word.targetLanguage])}</small></header><p class="vocab-meaning">${esc(word.translation)}</p><div class="vocab-sources">${word.sources.map((source,index)=>html`<button type="button" data-vocab-source="${index}" title="${esc(source.quote||tr('查看原文'))}">${esc(source.title||tr('原文献'))} · 第 ${source.page} 页</button>`).join('')}</div><details><summary>编辑词义与备注</summary><label>词义<textarea data-vocab-meaning maxlength="16000">${esc(word.translation)}</textarea></label><label>备注<textarea data-vocab-note maxlength="4000">${esc(word.note)}</textarea></label><button type="button" data-vocab-save>保存修改</button></details><footer><select data-vocab-status-select aria-label="${esc(word.term)}的学习状态">${Object.entries(statuses).map(([key,label])=>`<option value="${key}" ${word.status===key?'selected':''}>${label}</option>`).join('')}</select><button type="button" data-vocab-delete>删除</button></footer></article>`).join('')||tr('<p class="study-empty">暂无符合条件的生词。在 PDF 中选中文字，翻译后即可加入生词本。</p>');
  }
  async function refresh(){const ticket=++epoch;try{const data=await readStudy();if(!active||ticket!==epoch)return;rows=data.vocabulary;libraryKey=data.libraryKey;render();}catch(error){if(active)message(error.message);}}
  async function save(operation){if(busy)return;busy=true;root.setAttribute('aria-busy','true');root.querySelectorAll('input,textarea,select,button').forEach(element=>element.disabled=true);try{rows=await updateStudy(libraryKey,{kind:'vocabulary',operation});if(active)render();}finally{busy=false;root.removeAttribute('aria-busy');root.querySelectorAll('input,textarea,select,button').forEach(element=>element.disabled=false);}}
  root.addEventListener('input',event=>{if(event.target.matches('[data-vocab-search]')){query=event.target.value;render();}});
  root.addEventListener('change',event=>{
    if(event.target.matches('[data-vocab-filter]')){filter=event.target.value;render();}
    if(event.target.matches('[data-vocab-status-select]'))save({type:'update',id:event.target.closest('[data-vocab-id]').dataset.vocabId,patch:{status:event.target.value}}).catch(error=>message(error.message));
  });
  root.addEventListener('click',async event=>{try{
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-vocab-export')){await options.saveText(vocabularyMarkdown(filtered()),'Materia-生词本.md','md');return;}
    const card=button.closest('[data-vocab-id]'),word=card&&rows.find(row=>row.id===card.dataset.vocabId);if(!word)return;
    if(button.hasAttribute('data-vocab-source'))await options.openSource(word.sources[Number(button.dataset.vocabSource)]);
    if(button.hasAttribute('data-vocab-save'))await save({type:'update',id:word.id,patch:{translation:card.querySelector('[data-vocab-meaning]').value,note:card.querySelector('[data-vocab-note]').value}});
    if(button.hasAttribute('data-vocab-delete')){if(!button.dataset.confirmed){button.dataset.confirmed='true';button.textContent=tr('再点删除');return;}await save({type:'delete',id:word.id});}
  }catch(error){message(error.message);}});
  return{refresh,dispose(){active=false;epoch++;}};
}
export function createVocabularyController(options){
  const dialog=document.createElement('dialog');dialog.className='vocabulary-dialog';dialog.id='vocabulary-dialog';dialog.setAttribute('aria-label',tr('生词本'));
  dialog.innerHTML=tr('<header><h2>生词本</h2><button type="button" data-vocab-close aria-label="关闭生词本">×</button></header><div class="vocabulary-content">',false)+vocabularyShell()+'</div>';
  bindStaticDOM(dialog,{translated:true});document.body.append(dialog);
  dialog.addEventListener('keydown',event=>event.stopPropagation());
  const view=createVocabularyView(dialog.querySelector('.vocabulary-content'),{...options,openSource:async source=>{dialog.close();await options.openSource(source);}});
  dialog.querySelector('[data-vocab-close]').onclick=()=>dialog.close();
  const button=document.createElement('button');button.className='ribbon-button';button.title=tr('生词本');button.setAttribute('aria-label',tr('生词本'));button.innerHTML=icon('dictionary');button.dataset.action='vocabulary';document.querySelector('.workspace-ribbon')?.insertBefore(button,document.querySelector('.ribbon-spacer'));
  bindStaticDOM(button,{translated:true});
  return{async open(){await view.refresh();if(!dialog.open)dialog.showModal();dialog.querySelector('input').focus();}};
}
