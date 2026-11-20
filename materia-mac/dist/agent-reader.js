import {html,t} from './i18n.js';
import {splitSpeech} from './agent-voice.js';

export function createAgentReader(panel,{read,replay,stop,desktop,getLibraryKey}){
  const dialog=document.createElement('dialog');
  dialog.id='agent-reader';
  dialog.setAttribute('aria-labelledby','agent-reader-title');
  dialog.innerHTML=html`<form>
    <header class="agent-reader-heading">
      <div><h2 id="agent-reader-title">朗读器</h2></div>
      <button type="button" data-reader-close aria-label="关闭朗读器" title="关闭">×</button>
    </header>
    <div class="agent-reader-toolbar">
      <label>朗读语言<select name="language"><option value="zh-CN">简体中文</option><option value="ja">日本語</option><option value="en">English</option></select></label>
      <span class="agent-reader-count">0 / 2400</span>
    </div>
    <div class="agent-reader-main">
      <section class="agent-reader-source">
        <label for="agent-reader-input">原文</label>
        <textarea id="agent-reader-input" name="text" maxlength="2400" placeholder="写下或粘贴想朗读的内容…" required></textarea>
      </section>
      <section class="agent-reader-output" aria-labelledby="agent-reader-output-label">
        <h3 id="agent-reader-output-label">译文</h3>
        <div class="agent-reader-empty">译文会显示在这里<span>生成后，点句尾 ▶ 可以再次播放</span></div>
        <div class="agent-reader-translation" hidden></div>
      </section>
    </div>
    <details class="agent-reader-recent" hidden>
      <summary>最近朗读 <span></span></summary>
      <div class="agent-reader-clips"></div>
    </details>
    <footer class="agent-reader-footer">
      <p class="agent-reader-status" role="status">准备就绪</p>
      <div><button type="button" data-reader-stop hidden>停止</button><button type="submit" class="primary">翻译并朗读</button></div>
    </footer>
  </form>`;
  panel.append(dialog);
  const form=dialog.querySelector('form');
  const text=form.elements.namedItem('text'),language=form.elements.namedItem('language');
  const feedback=dialog.querySelector('.agent-reader-status');
  const translation=dialog.querySelector('.agent-reader-translation'),clips=dialog.querySelector('.agent-reader-clips');
  const empty=dialog.querySelector('.agent-reader-empty'),recent=dialog.querySelector('.agent-reader-recent');
  const count=dialog.querySelector('.agent-reader-count'),outputRows=new Map();
  const start=form.querySelector('[type=submit]'),stopButton=form.querySelector('[data-reader-stop]');
  let task;
  const historyKey='materia.reader-history';
  let saved=[];
  try{
    const value=JSON.parse(localStorage.getItem(historyKey));
    if(Array.isArray(value))saved=value.filter(clip=>clip&&typeof clip.text==='string'&&
      typeof clip.libraryKey==='string'&&/^[a-f0-9]{64}$/.test(clip.id)&&
      ['zh','ja','en','auto'].includes(clip.language)).slice(-100);
  }catch{}
  function cancel(){if(task){task.abort();stop();}}
  function hide(){cancel();if(dialog.open)dialog.close();}
  function show(){
    clips.replaceChildren();
    for(const clip of saved.toReversed())if(clip.libraryKey===getLibraryKey())addClip(clip);
    updateRecent();
    if(!dialog.open)dialog.showModal();
  }
  function updateRecent(){
    recent.hidden=!clips.children.length;
    recent.querySelector('summary span').textContent=String(clips.children.length);
  }
  function syncControls(){
    count.textContent=text.value.length+' / 2400';
    start.disabled=!desktop||Boolean(task)||!text.value.trim();
    stopButton.hidden=!task;
    language.disabled=Boolean(task);
    text.readOnly=Boolean(task);
    dialog.classList.toggle('is-running',Boolean(task));
  }
  async function run(operation,message){
    if(task)return;
    const current=new AbortController(),{signal}=current;
    task=current;
    syncControls();
    feedback.textContent=t(message);
    try{
      await operation(signal);
      if(!signal.aborted)feedback.textContent=t('朗读完成。');
    }catch(error){
      if(!signal.aborted)feedback.textContent=t(error.message);
    }finally{
      if(signal.aborted)feedback.textContent=t('已停止。');
      task=undefined;
      if(translation.hidden)empty.firstChild.textContent=t('译文会显示在这里');
      syncControls();
    }
  }
  function replayButton(clip){
    const button=document.createElement('button');
    button.type='button';
    button.className='agent-replay-button';
    button.textContent='▶';button.title=t('重读');button.setAttribute('aria-label',t('重读')+' '+clip.text);
    button.addEventListener('click',()=>void run(()=>replay(clip),'正在朗读…'));
    return button;
  }
  function addClip(clip,signal){
    if(signal?.aborted||!clip)return;
    const row=document.createElement('div');
    row.className='agent-reader-clip';row.append(document.createTextNode(clip.text),replayButton(clip));
    clips.append(row);
  }
  function showTranslation(value){
    outputRows.clear();
    translation.replaceChildren();
    for(const line of splitSpeech(value)){
      const row=document.createElement('p');
      row.textContent=line;
      translation.append(row);
      const rows=outputRows.get(line)||[];
      rows.push(row);outputRows.set(line,rows);
    }
    translation.hidden=false;empty.hidden=true;
    feedback.textContent=t('正在朗读…');
  }
  form.addEventListener('submit',event=>{
    event.preventDefault();
    if(!desktop||task||!text.value.trim())return;
    translation.hidden=true;
    empty.hidden=false;
    empty.firstChild.textContent=t('正在翻译…');
    outputRows.clear();
    clips.replaceChildren();
    recent.open=false;updateRecent();
    void run(signal=>read(text.value.trim(),language.value,{signal,
      onTranslation:showTranslation,
      onClip:clip=>{
        if(!saved.some(row=>row.id===clip.id&&row.libraryKey===clip.libraryKey)){
          saved.push(clip);saved=saved.slice(-100);
          try{localStorage.setItem(historyKey,JSON.stringify(saved));}catch{}
        }
        addClip(clip,signal);
        updateRecent();
        if(!signal.aborted){
          for(const row of outputRows.get(clip.text)||[]){
            if(row.querySelector('button'))continue;
            row.append(replayButton(clip));
          }
        }
      },
    }),'正在翻译…');
  });
  stopButton.addEventListener('click',cancel);
  form.querySelector('[data-reader-close]').addEventListener('click',hide);
  dialog.addEventListener('close',cancel);
  text.addEventListener('input',syncControls);
  if(!desktop)feedback.textContent=t('朗读器需要 Materia 桌面版。');
  syncControls();
  return {show,hide};
}
