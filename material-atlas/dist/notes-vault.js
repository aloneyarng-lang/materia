import {html,msg,t} from './i18n.js';
import {icon} from './icons.js';
import {actionMenu} from './action-menus.js';
import {getSetting,setSetting} from './storage.js';
import {NOTE_LIMIT,notePath,noteName,noteBody} from './notes-vault-model.js';
import {createNoteEditDialog} from './note-edit-dialog.js';
import {renderNoteMarkdown,noteReferences,resolveNoteLink} from './notes-markdown.js';

const native=globalThis.materiaDesktop;
const browserKey='independentMarkdownNotes';
const compare=(a,b)=>b.updatedAt-a.updatedAt||a.id.localeCompare(b.id);

async function readIndex(){
  if(native)return native.notesVaultList();
  return {notes:await getSetting(browserKey)||[],skipped:0};
}
export async function saveNote(payload){
  if(native)return native.notesVaultSave(payload);
  const {revision}=payload,id=notePath(payload.id),body=noteBody(payload.body);
  const {notes}=await readIndex(),old=notes.find(note=>note.id.toLowerCase()===id.toLowerCase());
  if(revision===null&&old)throw Error(t('已有同名笔记，请换一个名称。'));
  if(revision!==null&&old?.revision!==revision)throw Error(t('笔记已在外部修改或移除。请先导出当前草稿，再重新载入文件。'));
  const saved={id,body,revision:crypto.randomUUID(),updatedAt:Date.now()};
  await setSetting(browserKey,[...notes.filter(note=>note!==old),saved]);
  return saved;
}

const tool=(action,label,glyph)=>html`<button type="button" class="icon-button" data-vault-action="${action}" aria-label="${t(label)}" title="${t(label)}">${icon(glyph)}</button>`;

export function createNotesVault(host,{saveText,editNote,escape,toast}){
  host.innerHTML=html`
    <section class="vault-workspace" aria-label="独立笔记工作区">
      <aside class="vault-library">
        <div class="vault-library-head">
          <strong>笔记库</strong>
          ${tool('create','新建独立笔记','plus')}
          ${actionMenu('vault-library-actions',t('笔记库操作'),html`
            <button type="button" data-vault-action="import">${icon('upload')}导入 Markdown</button>
            <button type="button" data-vault-action="folder" ${native?'':'hidden'}>${icon('folder')}打开笔记库文件夹</button>
            <button type="button" data-vault-action="refresh">${icon('refresh')}刷新笔记库</button>
          `,{iconOnly:true,className:'icon-button'})}
        </div>
        <label class="vault-search">${icon('search')}<input type="search" data-vault="search" aria-label="搜索独立笔记" placeholder="搜索标题或正文"></label>
        <div class="vault-file-list" data-vault="list" aria-label="笔记文件"></div>
      </aside>
      <div class="vault-main">
        <div class="vault-empty" data-vault="empty">${icon('notebook')}<strong>写下第一篇笔记</strong><p>点击 ＋ 新建，或从菜单导入 Markdown 文件。</p></div>
        <section class="vault-document" data-vault="document" hidden>
          <div class="vault-document-bar">
            <div class="vault-title"><strong data-vault="title"></strong><small data-vault="path"></small></div>
            <div class="vault-mode" role="group" aria-label="编辑与阅读">
              ${tool('edit','编辑源码','edit')}
              ${tool('split','分栏预览','panel-right')}
              ${tool('read','阅读预览','eye')}
            </div>
            <button type="button" class="outline-button vault-ai-button" data-vault-action="ai-edit" ${editNote?'':'hidden'}>${icon('assistant')} AI 编辑</button>
            <button type="button" class="outline-button vault-ai-button" data-vault-action="wide" aria-pressed="false">${icon('expand')} <span data-vault="enter-fullscreen">全屏编辑</span><span data-vault="exit-fullscreen" hidden>退出全屏</span></button>
            <button type="button" class="outline-button vault-ai-button" data-vault-action="details" aria-pressed="false">${icon('list')} 大纲</button>
            ${tool('export','导出 Markdown','download')}
          </div>
          <div class="vault-content" data-vault="content" data-mode="split">
            <textarea data-vault="editor" aria-label="Markdown 源码" placeholder="支持 Markdown、[[双向链接]] 和 $$ LaTeX 公式" spellcheck="false" maxlength="${NOTE_LIMIT}"></textarea>
            <article class="vault-preview" data-vault="preview" aria-label="Markdown 预览" tabindex="0"></article>
            <aside class="vault-details" data-vault="details" hidden>
              <strong>大纲</strong><nav data-vault="outline" aria-label="大纲"></nav>
              <strong>反向链接</strong><div data-vault="backlinks"></div>
            </aside>
          </div>
        </section>
        <p class="vault-status" data-vault="status" role="status"></p>
      </div>
    </section>
    <dialog class="vault-fullscreen" aria-label="全屏笔记编辑"></dialog>
    <input type="file" data-vault="files" accept=".md,text/markdown" multiple hidden>
    <dialog class="modal vault-new-dialog" data-vault="new-dialog" aria-label="新建独立笔记">
      <form data-vault="new-form">
        <header><h2>新建独立笔记</h2>${tool('close-new','关闭弹窗','close')}</header>
        <label>笔记名称<input data-vault="new-name" placeholder="例如：研究/实验记录" maxlength="236" required autocomplete="off"></label>
        <p class="vault-status is-error" data-vault="new-error" role="alert"></p>
        <button type="submit" class="primary">创建</button>
      </form>
    </dialog>`;

  const get=key=>host.querySelector(`[data-vault="${key}"]`);
  const editor=get('editor'),list=get('list'),preview=get('preview'),dialog=get('new-dialog');
  const workspace=host.querySelector('.vault-workspace'),fullscreen=host.querySelector('.vault-fullscreen');
  const records=new Map(),referenceCache=new Map();
  let images={urls:new Map(),size:0};
  let active=null,ready=false,loading,busy=false,timer,previewTimer,queue=Promise.resolve(),outline=[];
  let mode='split',syncingExternal=false,externalSyncPending=false;
  const aiEditor=editNote&&createNoteEditDialog(host,editNote,applyAIEdit);

  function toggleFullscreen(){
    const opening=!fullscreen.open;
    const button=host.querySelector('[data-vault-action="wide"]');
    workspace.classList.toggle('vault-wide',opening);
    button.setAttribute('aria-pressed',String(opening));
    get('enter-fullscreen').hidden=opening;
    get('exit-fullscreen').hidden=!opening;
    if(opening){
      fullscreen.append(workspace);
      fullscreen.showModal();
      if(mode==='read')setMode('split');
      editor.focus();
    }else{
      host.prepend(workspace);
      fullscreen.close();
      button.focus();
    }
  }
  fullscreen.addEventListener('cancel',event=>{event.preventDefault();toggleFullscreen();});

  function status(message,error=false){
    get('status').textContent=message;
    get('status').classList.toggle('is-error',error);
  }
  function renderList(){
    const query=get('search').value.trim().normalize('NFC').toLocaleLowerCase();
    const notes=[...records.values()].filter(note=>!query||(note.id+'\n'+note.body).toLocaleLowerCase().includes(query)).sort(compare);
    list.innerHTML=notes.map(note=>`<button type="button" class="vault-file" data-vault-note="${escape(note.id)}" aria-pressed="${note.id===active?.id}" title="${escape(note.id)}">
      ${icon('files')}<span><strong>${escape(noteName(note.id))}</strong>${note.id.includes('/')?`<small>${escape(note.id.split('/').slice(0,-1).join('/'))}</small>`:''}</span>
    </button>`).join('')||html`<p class="vault-empty-list">${t(query?'没有匹配的笔记。':'暂无独立笔记。')}</p>`;
  }
  function renderDetails(){
    if(get('details').hidden||!active)return;
    const notes=[...records.values()];
    get('outline').innerHTML=outline.map(item=>`<button type="button" data-vault-heading="${item.id}" data-heading-level="${item.depth}" style="--note-indent:${item.depth-1}"><small>H${item.depth}</small><span>${escape(item.label)}</span></button>`).join('')||html`<p>暂无标题</p>`;
    get('backlinks').innerHTML=notes.filter(note=>{
      if(note.id===active.id)return false;
      if(!referenceCache.has(note.id))referenceCache.set(note.id,noteReferences(note.body));
      return referenceCache.get(note.id).some(link=>resolveNoteLink(link.target,note.id,notes,link.wiki)?.id===active.id);
    }).sort(compare).map(note=>`<button type="button" data-vault-note="${escape(note.id)}" title="${escape(note.id)}">${icon('files')}${escape(noteName(note.id))}</button>`).join('')||html`<p>暂无反向链接</p>`;
  }
  function renderPreview(){
    clearTimeout(previewTimer);
    const rendered=renderNoteMarkdown(editor.value);
    preview.innerHTML=rendered.markup;
    outline=rendered.outline;
    if(active&&native?.notesVaultImage){
      const note=active.id,cache=images;
      for(const image of [...preview.querySelectorAll('img[data-note-image]')].slice(0,20)){
        let reference;
        try{reference=decodeURIComponent(image.dataset.noteImage);}catch{continue;}
        if(!cache.urls.has(reference)&&cache.urls.size<20){
          cache.urls.set(reference,native.notesVaultImage({note,reference}).then(result=>{
            if(!result||images!==cache||cache.size+result.bytes.byteLength>24*1024*1024)return '';
            cache.size+=result.bytes.byteLength;
            return URL.createObjectURL(new Blob([result.bytes],{type:result.type}));
          }).catch(()=>''));
        }
        cache.urls.get(reference)?.then(url=>{if(url&&image.isConnected)image.src=url;});
      }
    }
    renderDetails();
  }
  function setMode(next){
    mode=next;
    get('content').dataset.mode=next;
    for(const key of ['edit','split','read'])host.querySelector(`[data-vault-action="${key}"]`).setAttribute('aria-pressed',String(next===key));
    if(next!=='edit'||!get('details').hidden)renderPreview();
  }
  function select(note){
    clearTimeout(timer);
    for(const pending of images.urls.values())pending.then(url=>{if(url)URL.revokeObjectURL(url);});
    images={urls:new Map(),size:0};
    active=note||null;
    get('document').hidden=!active;
    get('empty').hidden=Boolean(active);
    editor.value=note?.body||'';
    editor.scrollTop=0;
    preview.scrollTop=0;
    get('title').textContent=note?noteName(note.id):'';
    get('path').textContent=note?.id||'';
    status('');
    renderList();
    setMode(mode);
  }
  async function refresh({preserveEditor=false}={}){
    const result=await readIndex(),previous=active;
    if(preserveEditor&&busy){externalSyncPending=true;return;}
    if(preserveEditor&&host.querySelector('dialog[open]:not(.vault-fullscreen)'))return;
    records.clear();
    referenceCache.clear();
    for(const note of result.notes)records.set(note.id,note);
    ready=true;
    const latest=previous&&records.get(previous.id);
    const hasDraft=previous&&editor.value!==previous.body.replace(/\r\n?/g,'\n');
    if(preserveEditor&&previous&&(hasDraft||latest?.revision===previous.revision)){
      if(!hasDraft)active=latest;
      renderList();renderDetails();
    }else select(latest||[...records.values()].sort(compare)[0]);
    if(result.skipped)status(msg`${result.skipped} 篇笔记因路径、编码或大小限制未载入。`,true);
  }
  function show(){
    if(ready)return Promise.resolve();
    loading??=refresh().catch(error=>status(error.message,true)).finally(()=>{loading=null;});
    return loading;
  }
  async function commit(body){
    const id=active.id;
    status(t('正在保存…'));
    const saved=await saveNote({id,body,revision:active.revision});
    records.set(id,saved);
    referenceCache.delete(id);
    active=saved;
    status(t('已保存'));
    renderList();
  }
  async function applyAIEdit(snapshot,replacement){
    await flush();
    if(active?.id!==snapshot.id||editor.value!==snapshot.body)throw Error(t('笔记内容已变化，请重新生成修改建议。'));
    const next=noteBody(snapshot.body.slice(0,snapshot.start)+replacement+snapshot.body.slice(snapshot.end));
    if(next!==editor.value)await commit(next);
    editor.value=next;
    if(mode==='read')setMode('split');
    else renderPreview();
    editor.setSelectionRange(snapshot.start,snapshot.start+replacement.length);
  }
  function flush(){
    clearTimeout(timer);
    const operation=queue.then(async()=>{
      if(!active||editor.value===active.body)return;
      await commit(editor.value);
    });
    queue=operation.catch(()=>{});
    return operation;
  }
  async function run(work){
    if(busy)return;
    busy=true;editor.readOnly=true;
    try{await show();if(ready)await work();}
    catch(error){status(error.message,true);if(!ready)toast(error.message,true);}
    finally{
      busy=false;editor.readOnly=false;
      finishExternalSync();
    }
  }
  function finishExternalSync(){
    if(externalSyncPending&&!busy&&!syncingExternal){externalSyncPending=false;syncExternal();}
  }
  function syncExternal(){
    if(!native||!ready||!host.getClientRects().length||host.querySelector('dialog[open]:not(.vault-fullscreen)'))return;
    if(busy||syncingExternal){externalSyncPending=true;return;}
    syncingExternal=true;
    const operation=queue.then(()=>refresh({preserveEditor:true}));
    queue=operation.catch(error=>status(error.message,true));
    void queue.finally(()=>{syncingExternal=false;finishExternalSync();});
  }
  if(native)window.addEventListener('focus',syncExternal);
  function createDialog(suggestion=''){
    get('new-name').value=suggestion;
    get('new-error').textContent='';
    if(!dialog.open)dialog.showModal();
    get('new-name').focus();
  }
  function scrollHeading(id){
    if(mode==='edit')setMode('split');
    preview.querySelector('#'+CSS.escape(id))?.scrollIntoView({block:'start'});
  }
  const actions={
    create:async()=>{await flush();createDialog();},
    'close-new':()=>dialog.close(),
    import:()=>get('files').click(),
    folder:()=>native?.notesVaultFolder(),
    refresh:async()=>{
      try{await flush();}
      catch(error){
        if(!confirm(t('当前草稿未能保存。确认放弃草稿并重新载入笔记库？')))throw error;
      }
      await refresh();
    },
    export:()=>active&&saveText(editor.value,active.id.split('/').at(-1),'md'),
    'ai-edit':()=>{
      if(!active||!aiEditor)return;
      const body=editor.value, selected=mode!=='read'&&editor.selectionStart<editor.selectionEnd;
      const start=selected?editor.selectionStart:0,end=selected?editor.selectionEnd:body.length;
      aiEditor.open({id:active.id,body,start,end,selected});
    },
    wide:toggleFullscreen,
    edit:()=>setMode('edit'),
    split:()=>setMode('split'),
    read:()=>setMode('read'),
    details:()=>{
      const details=get('details');
      details.hidden=!details.hidden;
      host.querySelector('[data-vault-action="details"]').setAttribute('aria-pressed',String(!details.hidden));
      if(!details.hidden)renderPreview();
    },
  };
  host.addEventListener('click',event=>{
    const target=event.target.closest('button,a');if(!target)return;
    const action=target.dataset.vaultAction;
    if(Object.hasOwn(actions,action)){
      if(action==='import'||action==='close-new')actions[action]();
      else void run(actions[action]);
      return;
    }
    if(target.dataset.vaultNote){
      void run(async()=>{await flush();select(records.get(target.dataset.vaultNote));});
    }
    if(target.dataset.vaultHeading)scrollHeading(target.dataset.vaultHeading);
    if(target.hasAttribute('data-note-link')&&active){
      event.preventDefault();
      const link=resolveNoteLink(target.dataset.noteLink,active.id,[...records.values()],target.hasAttribute('data-note-wiki'));
      void run(async()=>{
        await flush();
        if(!link){
          if(target.hasAttribute('data-note-wiki'))createDialog(target.dataset.noteLink.split('#')[0]);
          else status(t('找不到链接的笔记。'),true);
          return;
        }
        if(link.id!==active.id)select(records.get(link.id));
        if(link.heading){
          const wanted=link.heading.toLocaleLowerCase().replace(/-/g,' ');
          const heading=outline.find(item=>item.label.toLocaleLowerCase()===wanted);
          if(heading)scrollHeading(heading.id);
        }
      });
    }else if(target.matches('a[href]')&&native&&preview.contains(target)){
      event.preventDefault();native.agentOpenLink(target.href).catch(error=>status(error.message,true));
    }
  });
  get('new-form').addEventListener('submit',event=>{
    event.preventDefault();
    if(busy)return;
    void run(async()=>{
      try{
        await flush();
        const id=notePath(get('new-name').value),saved=await saveNote({id,body:'',revision:null});
        records.set(id,saved);dialog.close();get('search').value='';select(saved);
        if(mode==='read')setMode('split');
        editor.focus();
      }catch(error){get('new-error').textContent=error.message;}
    });
  });
  get('files').addEventListener('change',event=>{
    const files=[...event.target.files];event.target.value='';
    if(!files.length)return;
    void run(async()=>{
      await flush();
      let saved,added=0;
      const errors=[];
      for(const file of files){
        try{
          if(file.size>NOTE_LIMIT||!/\.md$/i.test(file.name))throw Error(t('笔记须为 UTF-8 Markdown，每篇最多 512 KB。'));
          const body=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await file.arrayBuffer());
          saved=await saveNote({id:notePath(file.name),body,revision:null});
          records.set(saved.id,saved);added++;
        }catch(error){errors.push(file.name+' · '+error.message);}
      }
      if(saved)select(saved);
      status(msg`已导入 ${added} 篇笔记`+(errors.length?' · '+errors[0]:''),Boolean(errors.length));
    });
  });
  document.addEventListener('notes-vault:created',event=>{
    if(!ready)return;
    const note=event.detail;
    records.set(note.id,note);
    if(active){renderList();renderDetails();}
    else select(note);
  });
  get('search').addEventListener('input',renderList);
  editor.addEventListener('input',()=>{
    clearTimeout(timer);clearTimeout(previewTimer);
    status(t('待保存'));
    timer=setTimeout(()=>flush().catch(error=>status(error.message,true)),420);
    if(mode!=='edit'||!get('details').hidden)previewTimer=setTimeout(renderPreview,140);
  });
  host.addEventListener('keydown',event=>{
    if(event.target.closest('.vault-ai-dialog')||!(event.ctrlKey||event.metaKey)||event.isComposing)return;
    const key=event.key.toLowerCase();
    if(!['s','e','n'].includes(key))return;
    event.preventDefault();event.stopPropagation();
    if(key==='s')flush().catch(error=>status(error.message,true));
    if(key==='e'&&active)setMode(mode==='read'?'edit':'read');
    if(key==='n')void run(actions.create);
  });
  return {show,flush,syncExternal};
}
