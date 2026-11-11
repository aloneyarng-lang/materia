import {t as tr,html,msg} from './i18n.js';
import {getLocale} from './i18n.js';
import {noteImagesHTML,openNoteImage} from './note-media.js';
import { wikiLinks, resolveLink, backlinks } from './note-links.js';
import { tagCounts, MIN_TAG_PAPERS } from './tags.js';
import {icon} from './icons.js';

export function createNotesController(config) {
  const { escape: esc, showModal, toast } = config;
  let owner, editing = '', libraryScope=[];
  let notesTab='vault', vault, vaultLoading;
  const keyOf = entity => `${entity.type}:${entity.id}`;
  const titleOf = entity => entity.type === 'tag' ? `# ${entity.id}` : config.getPapers().find(p => p.id === entity.id)?.title || tr('文献');
  const notesFor = entity => config.getNotes()[keyOf(entity)] || [];
  const time = value => new Date(value).toLocaleString(getLocale(), { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  function renderText(body) {
    let output = '', cursor = 0;
    for (const link of wikiLinks(body)) {
      output += esc(body.slice(cursor, link.index));
      const resolved = resolveLink(link, config.getPapers());
      output += resolved?.id ? `<button class="wiki-link" data-link-${resolved.type}="${esc(resolved.id)}">${esc(link.value)}</button>` : html`<span class="wiki-unresolved" title="尚未找到同名文献">${esc(link.raw)}</span>`;
      cursor = link.index + link.raw.length;
    }
    return output + esc(body.slice(cursor));
  }
  function preview(type, id) {
    const list = notesFor({ type, id });
    return list.slice(-2).map(n => `<div class="note-preview">${n.anchor?.label?`<strong class="reader-note-caption">${esc(n.anchor.label)}</strong>`:''}<p>${renderText(n.body.slice(0, 300))}</p>${n.anchor?html`<button class="note-anchor-link" data-note-location="${esc(n.id)}" data-note-paper="${esc(id)}">第 ${n.anchor.page} 页 · 定位标记 ↗</button>`:''}${n.attachments?.length?html`<small>📎 ${n.attachments.length} 张图片</small>`:''}<small>${time(n.updatedAt)}</small></div>`).join('');
  }
  function open(type, id, editId = '') {
    owner = { type, id }; editing = editId;
    const own = config.canEdit(), papers = config.getPapers(), list = notesFor(owner);
    const references = backlinks(config.getNotes(), type, id, papers);
    const linked = type === 'tag' ? papers.filter(p => p.tags.includes(id)) : [];
    const edited = list.find(n => n.id === editing);
    showModal(type === 'tag' ? esc(titleOf(owner)) : tr('文献笔记'), type === 'tag' ? msg`${linked.length} 篇关联文献 · 标签也有自己的思考空间` : esc(titleOf(owner)), html`${type === 'tag' ? html`<div class="tag-dialog-toolbar"><button class="outline-button" data-note-action="graph-tag" ${linked.length < MIN_TAG_PAPERS ? tr('disabled title="在整个文献库中关联至少 3 篇文献后生效"') : ''}>${linked.length < MIN_TAG_PAPERS ? tr('至少关联 3 篇后显示在星图') : tr('在星图中查看')}</button><span>${list.length} 条笔记</span></div><div class="linked-titles">${linked.map(p => `<button data-link-paper="${esc(p.id)}"><span>↗</span>${esc(p.title)}<small>${esc(p.year)}</small></button>`).join('') || tr('<p class="help-inline">还没有文献使用这个标签。</p>')}</div>` : html`<button class="outline-button" data-note-location="" data-note-paper="${esc(id)}">PDF 阅读与图文笔记 ↗</button><div class="note-owner-tags">${(papers.find(p => p.id === id)?.tags || []).map(tag => `<button class="tag" data-link-tag="${esc(tag)}">${esc(tag)}</button>`).join('')}</div>`}${own ? html`<div class="note-composer"><label for="note-body">${editing ? tr('修改这条笔记') : tr('添加一条新笔记')}</label><textarea id="note-body" maxlength="40000" placeholder="记录想法… 可用 [[文献标题]] 或 [[#标签]] 建立双向链接。">${esc(edited?.body || '')}</textarea><div><small>支持 [[标题]] 和 [[#标签]]，被引用处会显示反向链接。</small>${editing ? tr('<button class="text-button" data-note-action="cancel-edit">取消编辑</button>') : ''}<button class="primary" data-note-action="save">${editing ? tr('保存修改') : tr('添加笔记')}</button></div></div>` : tr('<div class="info-box">当前文献库不可编辑，请检查存储权限。</div>')}<div class="notes-section-heading"><span>全部笔记</span><small>${list.length} 条</small></div><div class="notes-stack">${[...list].sort((a, b) => b.createdAt - a.createdAt).map(n => `<article class="note-card"><div class="note-card-meta"><time>${time(n.updatedAt)}</time>${own ? html`<button class="text-button" data-note-edit="${esc(n.id)}">编辑</button><button class="text-button" data-note-delete="${esc(n.id)}">删除</button>` : ''}</div>${n.anchor&&type==='paper'?html`<button class="note-anchor-link" data-note-location="${esc(n.id)}" data-note-paper="${esc(id)}">第 ${n.anchor.page} 页 · 在阅读器中定位 ↗</button>`:''}${n.anchor?.label?`<strong class="reader-note-caption">${esc(n.anchor.label)}</strong>`:''}<div class="note-body">${renderText(n.body)}</div>${noteImagesHTML(n.attachments||[],esc)}</article>`).join('') || tr('<div class="notes-empty">留下一条思考，让下一次阅读有迹可循。</div>')}</div>${references.length ? html`<div class="notes-section-heading"><span>反向链接</span><small>${references.length} 条笔记引用了这里</small></div><div class="backlink-list">${references.map(item => { const colon = item.source.indexOf(':'); const entity = { type: item.source.slice(0, colon), id: item.source.slice(colon + 1) }; return `<button data-note-owner-type="${esc(entity.type)}" data-note-owner-id="${esc(entity.id)}"><strong>↖ ${esc(titleOf(entity))}</strong><span>${esc(item.note.body.slice(0, 100))}</span></button>`; }).join('')}</div>` : ''}`, 'notes');
  }
  function renderLibrary(host,scope,{query='',sort='newest'}={}) {
    libraryScope=scope;
    if(!host.querySelector('[data-notes-pane]')){
      host.innerHTML=html`<div class="notes-view-bar" role="group" aria-label="笔记来源">
        <button type="button" data-notes-tab="vault">${icon('notebook')}<span>独立笔记</span></button>
        <button type="button" data-notes-tab="papers">${icon('files')}<span>文献笔记</span></button>
      </div>
      <div data-notes-pane="vault"></div>
      <div data-notes-pane="papers" hidden></div>`;
    }
    for(const button of host.querySelectorAll('[data-notes-tab]'))button.setAttribute('aria-pressed',String(button.dataset.notesTab===notesTab));
    const personal=host.querySelector('[data-notes-pane="vault"]'),papersPane=host.querySelector('[data-notes-pane="papers"]');
    personal.hidden=notesTab!=='vault';
    papersPane.hidden=notesTab!=='papers';
    if(notesTab==='vault'){
      vaultLoading??=import('./notes-vault.js').then(({createNotesVault})=>{
        vault=createNotesVault(personal,{saveText:config.saveText,editNote:config.editNote,escape:esc,toast});
        return vault.show();
      }).catch(error=>{personal.textContent=error.message;vaultLoading=null;});
      return null;
    }
    const ids=new Set(scope.map(p=>p.id)),tags=new Set(scope.flatMap(p=>p.tags||[]));
    const q=query.trim().toLocaleLowerCase();
    const rows=[];
    for(const [key,list] of Object.entries(config.getNotes())){
      const split=key.indexOf(':'),type=key.slice(0,split),id=key.slice(split+1);
      if(type==='paper'?!ids.has(id):type!=='tag'||!tags.has(id))continue;
      const title=titleOf({type,id});
      for(const note of list)if(!q||[note.body,note.anchor?.label,title].join(' ').toLocaleLowerCase().includes(q))rows.push({type,id,title,note});
    }
    rows.sort((a,b)=>sort==='title'?a.title.localeCompare(b.title):Number(b.note.updatedAt||b.note.createdAt||0)-Number(a.note.updatedAt||a.note.createdAt||0));
    papersPane.innerHTML=html`
      <div class="notes-library-toolbar">
        <p>${icon('notebook')}<span>笔记</span><small>${msg`${rows.length} 条`}</small></p>
        <div class="notes-library-actions">
          <button type="button" class="icon-button" data-action="tag-index" title="标签与笔记" aria-label="标签与笔记">${icon('tag')}</button>
          <button type="button" class="icon-button" data-note-start title="添加笔记" aria-label="添加笔记" ${!scope.length||!config.canEdit()?'disabled':''}>${icon('plus')}</button>
        </div>
      </div>
      <div class="notes-library-grid">${rows.map(renderLibraryNote).join('')||html`<div class="notes-empty">${icon('notebook')}<p>当前范围还没有笔记。点击 ＋ 添加笔记，或调整筛选条件。</p></div>`}</div>`;
    return rows.length;
  }
  function renderLibraryNote({type,id,title,note}){
    const actionLabel=config.canEdit()?tr('编辑笔记'):tr('查看笔记');
    const linkLabel=note.anchor?msg`定位原文第 ${note.anchor.page} 页`:tr('打开原文');
    return html`<article class="note-card">
      <header class="note-row-heading">
        <span class="note-row-type" title="${type==='tag'?tr('标签笔记'):tr('文献笔记')}">${icon(type==='tag'?'tag':'files')}</span>
        <div class="note-row-identity">
          <h3><button type="button" data-note-owner-type="${type}" data-note-owner-id="${esc(id)}" data-note-open-id="${esc(note.id)}" title="${esc(actionLabel)}">${esc(title)}</button></h3>
          <time>${time(note.updatedAt||note.createdAt)}</time>
        </div>
        ${type==='paper'?html`<button type="button" class="icon-button" data-note-location="${esc(note.id)}" data-note-paper="${esc(id)}" title="${esc(linkLabel)}" aria-label="${esc(linkLabel)}">${icon(note.anchor?'external':'files')}</button>`:''}
      </header>
      ${note.anchor?.label?`<strong class="reader-note-caption">${esc(note.anchor.label)}</strong>`:''}
      <div class="note-body">${renderText(String(note.body||''))}</div>
      ${noteImagesHTML(note.attachments||[],esc)}
    </article>`;
  }
  function chooseNotePaper(){
    if(!config.canEdit()||!libraryScope.length)return;
    if(libraryScope.length===1){open('paper',libraryScope[0].id);return;}
    showModal(tr('添加笔记'),'',html`
      <div class="notes-owner-picker">
        <label for="notes-library-owner">选择文献</label>
        <select id="notes-library-owner">${libraryScope.map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('')}</select>
        <button type="button" class="icon-button" data-note-create title="继续" aria-label="继续">${icon('arrow')}</button>
      </div>`,'notes-owner');
  }
  function index(query = '') {
    const tags = [...tagCounts(config.getPapers())].filter(([tag, count]) => count >= MIN_TAG_PAPERS && tag.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return tags.map(([tag, count]) => html`<button class="tag-directory-card" data-link-tag="${esc(tag)}"><span># ${esc(tag)}</span><small>${count} 篇文献 · ${notesFor({ type: 'tag', id: tag }).length} 条笔记</small></button>`).join('') || tr('<p class="notes-empty">暂无匹配标签。标签在整个文献库中关联至少 3 篇文献后，会自动出现在这里。</p>');
  }
  function openIndex() { showModal(tr('标签与笔记'), tr('仅显示在整个文献库中关联至少 3 篇文献的标签。'), html`<div class="tag-directory-search"><input id="tag-directory-query" placeholder="搜索标签…" aria-label="搜索标签"></div><div class="tag-directory" id="tag-directory">${index()}</div>`, 'tag-index'); }

  document.addEventListener('input', event => { if (event.target.id === 'tag-directory-query') document.querySelector('#tag-directory').innerHTML = index(event.target.value); });
  document.addEventListener('click', async event => {
    const image=event.target.closest('[data-reader-image]');if(image){event.preventDefault();const item=Object.values(config.getNotes()).flat().flatMap(n=>n.attachments||[]).find(n=>n.id===image.dataset.readerImage);if(item)openNoteImage(item);return;}
    const button = event.target.closest('button'); if (!button) return;
    try {
      if(button.hasAttribute('data-note-location')){await config.openReader(button.dataset.notePaper,button.dataset.noteLocation);return;}
      if (button.dataset.linkTag) { open('tag', button.dataset.linkTag); return; }
      if (button.dataset.linkPaper) { config.jumpPaper(button.dataset.linkPaper); return; }
      if(button.dataset.notesTab){
        await vault?.flush();
        notesTab=button.dataset.notesTab;config.onTabChange();return;
      }
      if(button.hasAttribute('data-note-start')){chooseNotePaper();return;}
      if(button.hasAttribute('data-note-create')){const id=document.querySelector('#notes-library-owner')?.value;if(id)open('paper',id);return;}
      if (button.dataset.noteOwnerType) { open(button.dataset.noteOwnerType, button.dataset.noteOwnerId,button.dataset.noteOpenId||''); return; }
      if (button.dataset.noteEdit) { open(owner.type, owner.id, button.dataset.noteEdit); document.querySelector('#note-body')?.focus(); return; }
      if (button.dataset.noteDelete) {
        button.textContent = button.dataset.confirmed ? tr('删除') : tr('再点一次删除');
        if (!button.dataset.confirmed) { button.dataset.confirmed = 'true'; return; }
        const next = { ...config.getNotes(), [keyOf(owner)]: notesFor(owner).filter(n => n.id !== button.dataset.noteDelete) };
        await config.persist(next); open(owner.type, owner.id); return;
      }
      if (button.dataset.noteAction === 'graph-tag') { config.graphTag(owner.id); return; }
      if (button.dataset.noteAction === 'cancel-edit') { open(owner.type, owner.id); return; }
      if (button.dataset.noteAction === 'save') {
        const body = document.querySelector('#note-body').value.trim(); if (!body && !notesFor(owner).some(n=>n.id===editing&&(n.anchor||n.attachments?.length))) { toast(tr('先写一点内容，再保存笔记。'), true); return; }
        button.disabled = true;
        const list = [...notesFor(owner)], now = Date.now();
        const existing = list.findIndex(n => n.id === editing);
        if (existing >= 0) list[existing] = { ...list[existing], body, updatedAt: now };
        else list.push({ id: `note-${crypto.randomUUID()}`, body, createdAt: now, updatedAt: now });
        await config.persist({ ...config.getNotes(), [keyOf(owner)]: list });
        open(owner.type, owner.id); toast(tr('笔记已保存。'));
      }
    } catch (error) { button.disabled = false; toast(msg`笔记未保存：${error.message}`, true); }
  });
  return { open, openIndex, renderLibrary, preview, count: (type, id) => notesFor({ type, id }).length, renderText,
    independent:()=>notesTab==='vault',syncVault:()=>vault?.syncExternal(),flush:()=>vault?.flush() };
}
