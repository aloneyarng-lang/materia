import {t as tr,html,msg} from './i18n.js';
import {READING_STATUSES,readingStatusOf} from './reading-status.js';
// A menu captures its targets when opened; later selection changes cannot retarget it.
export function paperActionTargets(papers, selection, clickedId) {
  const existing=new Set(papers.map(p=>p.id));
  if(!existing.has(clickedId))return [];
  const selected=[...selection].filter(id=>existing.has(id));
  return selected.length>1&&selected.includes(clickedId)?selected:[clickedId];
}

export function createPaperActions(config) {
  const esc=config.escape,$=selector=>document.querySelector(selector);
  const menu=document.createElement('div');menu.id='paper-context-menu';menu.className='paper-context-menu';menu.hidden=true;
  document.body.append(menu);
  let targets=[],origin=null,busy=false,sub='',modalIds=[];
  const records=ids=>config.getPapers().filter(p=>ids.includes(p.id));
  const item=(command,label,{disabled=false,extra='',danger=false}={})=>`<button role="menuitem" tabindex="-1" data-paper-command="${command}" ${disabled?'disabled':''} ${extra} class="${danger?'danger':''}"><span>${label}</span></button>`;
  const menus=()=>menu.querySelectorAll('[role=menu]');
  function close(restore=false){menu.hidden=true;menu.replaceChildren();sub='';if(restore&&origin?.isConnected)origin.focus({preventScroll:true});}
  function focusFirst(root){root?.querySelector('button:not(:disabled)')?.focus({preventScroll:true});}
  function clampPanel(panel,x,y){panel.style.left=Math.max(8,Math.min(innerWidth-panel.offsetWidth-8,Number.isFinite(x)?x:8))+'px';panel.style.top=Math.max(8,Math.min(innerHeight-panel.offsetHeight-8,Number.isFinite(y)?y:8))+'px';}
  function open(id,x,y,row){
    if(busy||!config.canEdit())return;
    targets=paperActionTargets(config.getPapers(),config.getSelection(),id);if(!targets.length)return;
    close();origin=row;config.selectPaper(id);
    const rows=records(targets),multi=rows.length>1,allStar=rows.every(p=>p.favorite),allPlot=targets.every(id=>config.getSelection().has(id));
    const hidden=rows.filter(p=>!config.getVisible().some(v=>v.id===p.id)).length;
    menu.innerHTML=html`<div class="paper-context-panel" role="menu" aria-label="文献快捷操作"><header><strong>${multi?msg`当前选中 ${rows.length} 篇文献`:esc(rows[0].title)}</strong><small>${multi?`${hidden?msg`含 ${hidden} 篇不在当前筛选结果中`:''}`:''}</small></header>${!multi?item('read',tr('阅读 PDF 与批注'),{disabled:!config.hasPDF(rows[0]),extra:!config.hasPDF(rows[0])?tr('title="尚未附上 PDF 文件"'):''}):''}${item('collections',tr('分组 <i>›</i>'),{extra:'aria-haspopup="menu" aria-expanded="false"'})}${item('reading',tr('阅读状态 <i>›</i>'),{extra:'aria-haspopup="menu" aria-expanded="false"'})}${item('star',allStar?tr('取消星标'):tr('加星标'))}${item('edit',multi?tr('批量修改标签…'):tr('编辑信息…'))}${item('plot',allPlot?tr('从作图选择中移除'):tr('加入作图选择'))}<hr>${item('more',tr('更多 <i>›</i>'),{extra:'aria-haspopup="menu" aria-expanded="false"'})}<hr>${item('remove',msg`移除${multi?msg` ${rows.length} 篇`:''}文献…`,{danger:true})}</div><div class="paper-context-submenu paper-context-panel" role="menu" hidden></div>`;
    menu.hidden=false;clampPanel(menus()[0],x,y);focusFirst(menus()[0]);
  }
  function openSub(kind){
    const [main,panel]=menus();sub=kind;
    main.querySelectorAll('[aria-expanded]').forEach(b=>b.setAttribute('aria-expanded',String(b.dataset.paperCommand===kind)));
    const rows=records(targets);
    if(kind==='collections'){
      panel.setAttribute('aria-label',tr('选择分组'));
      panel.innerHTML=html`<header><strong>归入分组 · ${rows.length} 篇</strong><small></small></header><div class="paper-folder-menu-list">${config.getCollections().map(c=>item('folder',`${rows.every(p=>p.collection===c.id)?'✓ ':''}${esc(c.name)}`,{extra:`data-folder-id="${esc(c.id)}"`})).join('')||tr('<p class="paper-menu-empty">还没有分组</p>')}</div><hr>${item('new-folder',tr('＋ 新建分组并加入…'))}${item('detach-folder',tr('移出分组'),{disabled:rows.every(p=>!p.collection)})}`;
    }else if(kind==='reading'){
      panel.setAttribute('aria-label',tr('设置阅读状态'));panel.innerHTML=html`<header><strong>阅读状态${rows.length>1?' · '+rows.length+tr(' 篇',false):''}</strong></header>${READING_STATUSES.map(s=>item('status',`<span class="reading-status-menu-label"><i class="reading-status-dot" aria-hidden="true"></i>${tr(s.name)}</span>${rows.every(p=>readingStatusOf(p)===s.id)?'✓':''}`,{extra:`data-reading-value="${s.id}" data-reading-status="${s.id}"`})).join('')}`;
    }else{
      panel.setAttribute('aria-label',tr('更多文献操作'));panel.innerHTML=`${rows.length===1?item('notes',tr('文献笔记…'))+item('parameters',tr('材料与参数…')):''}${item('copy-title',rows.length>1?tr('复制所选标题'):tr('复制标题'))}${rows.length===1?item('copy-doi',tr('复制 DOI'),{disabled:!rows[0].doi}):''}${rows.length===1&&config.locate?'<hr>'+item('locate',tr('在文件夹中显示')):''}${rows.length===1&&origin?.matches('.paper-node')?'<hr>'+item('hide',tr('从当前星图隐藏')):''}`;
    }
    panel.hidden=false;const r=main.getBoundingClientRect(),button=main.querySelector(`[data-paper-command="${kind}"]`).getBoundingClientRect();
    clampPanel(panel,r.right+panel.offsetWidth+12<innerWidth?r.right+5:r.left-panel.offsetWidth-5,button.top);focusFirst(panel);
  }
  function hideSub(){const panel=menus()[1];if(!panel)return;panel.hidden=true;const button=menus()[0].querySelector(`[data-paper-command="${sub}"]`);button?.setAttribute('aria-expanded','false');button?.focus();sub='';}
  async function run(task,lock=true){
    if(busy)return;if(lock)busy=true;
    try{await task();}catch(error){config.toast(msg`操作未完成：${error.message}`,true);}finally{if(lock)busy=false;}
  }
  async function assign(ids,options){
    await run(async()=>{
      const result=await config.assign(ids,options);await config.reload();
      // Clear busy before the app closes the modal, so the normal save guard allows it.
      busy=false;config.closeModal();
      const name=options.groupMode==='new'?String(options.groupName).trim():config.getCollections().find(c=>c.id===options.collection)?.name;
      config.toast(!result.count?tr('这些文献已经在该分组中。'):name?msg`已将 ${result.count} 篇文献归入「${name}」。`:msg`已将 ${result.count} 篇文献移出分组，文献仍保留在全部文献中。`);
    });
  }
  function summary(ids){const rows=records(ids);return `<div class="collection-targets">${rows.slice(0,3).map(p=>`<p>${esc(p.title)}</p>`).join('')}${rows.length>3?html`<small>以及另外 ${rows.length-3} 篇</small>`:''}</div>`;}
  function picker(ids){
    if(!config.canEdit())return;close();modalIds=[...ids];const rows=records(ids);if(!rows.length)return;
    config.showModal(rows.length>1?msg`归入分组 · ${rows.length} 篇`:tr('加入 / 更改分组'),'',html`${summary(ids)}<input id="collection-picker-search" class="collection-picker-search" type="search" aria-label="搜索分组" placeholder="搜索分组…"><div id="collection-picker-list" class="collection-picker-list">${config.getCollections().map(c=>`<button data-collection-command="choose" data-folder-id="${esc(c.id)}"><span>${esc(c.name)}</span><small>${rows.every(p=>p.collection===c.id)?tr('✓ 当前分组'):msg`${config.getPapers().filter(p=>p.collection===c.id).length} 篇`}</small></button>`).join('')||tr('<p class="help-inline">还没有分组，先创建一个研究主题。</p>')}</div><p id="collection-picker-empty" class="help-inline" hidden>没有匹配的分组，可新建并加入。</p><div class="collection-picker-footer"><button class="outline-button" data-collection-command="create">＋ 新建分组并加入</button><button class="text-button" data-collection-command="detach" ${rows.every(p=>!p.collection)?'disabled':''}>移出分组</button></div><p class="help-inline"></p>`,'collection-picker');
  }
  function create(ids){
    if(!config.canEdit())return;close();modalIds=[...ids];
    config.showModal(ids.length?tr('新建分组并加入文献'):tr('新建分组'),ids.length?msg`创建后归入当前选中的 ${ids.length} 篇文献。`:tr('用研究主题整理文献。'),html`<form id="quick-collection-form">${ids.length?summary(ids):''}<label class="form-field">分组名称<input name="name" required maxlength="80" placeholder="例如：高熵合金 · 强化机制" autofocus></label>${ids.length?html`<label class="collection-assign-choice"><input name="assign" type="checkbox" checked>创建并加入这 ${ids.length} 篇文献</label>`:''}<div class="modal-footer"><button type="button" class="text-button" data-action="close-modal">取消</button><button type="submit" class="primary">${ids.length?tr('创建并加入'):tr('创建分组')}</button></div></form>`,'collection-create');
  }
  menu.addEventListener('click',async event=>{
    event.stopPropagation();const button=event.target.closest('[data-paper-command]');if(!button||button.disabled)return;
    const command=button.dataset.paperCommand,ids=[...targets],rows=records(ids);
    if(['collections','reading','more'].includes(command)){openSub(command);return;}
    close();
    if(command==='folder')return assign(ids,{groupMode:'set',collection:button.dataset.folderId});
    if(command==='new-folder')return create(ids);
    if(command==='detach-folder')return assign(ids,{groupMode:'set',collection:''});
    if(command==='read')return run(()=>config.read(ids[0]),false);
    if(command==='edit')return config.edit(ids);
    if(command==='notes')return config.notes(ids[0]);
    if(command==='parameters')return config.parameters?.(ids[0]);
    if(command==='locate')return run(()=>config.locate(ids[0]));
    if(command==='hide')return config.hide?.(ids[0]);
    if(command==='status')return run(()=>config.setReadingStatus(ids,button.dataset.readingValue));
    if(command==='remove')return config.remove(ids);
    if(command==='star')return run(async()=>{await config.star(ids,!rows.every(p=>p.favorite));await config.reload();config.toast(msg`${ids.length} 篇文献${rows.every(p=>p.favorite)?tr('已取消星标'):tr('已加入星标「我的收藏」')}。`);});
    if(command==='plot')return run(async()=>{const next=new Set(config.getSelection()),remove=ids.every(id=>next.has(id));ids.forEach(id=>remove?next.delete(id):next.add(id));await config.selectComparison([...next]);config.toast(msg`${ids.length} 篇文献${remove?tr('已移出'):tr('已加入')}作图选择。`);});
    if(command==='copy-title'||command==='copy-doi')return run(async()=>{await navigator.clipboard.writeText(command==='copy-doi'?rows[0].doi:rows.map(p=>p.title).join('\n'));config.toast(tr('已复制。'));});
  });
  document.addEventListener('contextmenu',event=>{
    if(event.target.closest('input,textarea,select,[contenteditable=true]')||config.isReaderOpen()||$('#modal')?.open||$('#advanced-filter-dialog')?.open)return;
    const row=event.target.closest('#paper-list .paper-row[data-select]');if(!row)return;
    event.preventDefault();open(row.dataset.select,event.clientX,event.clientY,row);
  });
  document.addEventListener('pointerdown',event=>{if(!menu.hidden&&!menu.contains(event.target))close();},true);
  document.addEventListener('keydown',event=>{
    if(menu.hidden){
      if((event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')&&!event.target.closest('input,textarea,select,[contenteditable=true]')){
        const row=event.target.closest('#paper-list .paper-row[data-select],.paper-node[data-paper-id]');if(row){event.preventDefault();event.stopImmediatePropagation();const r=row.getBoundingClientRect();open(row.dataset.select||row.dataset.paperId,r.left+40,r.top+25,row);}
      }
      return;
    }
    event.stopImmediatePropagation();
    const panel=event.target.closest('[role=menu]')||menus()[0],buttons=[...panel.querySelectorAll('button:not(:disabled)')];
    if(['Escape','Tab','ArrowDown','ArrowUp','Home','End','ArrowRight','ArrowLeft','Enter',' '].includes(event.key)){event.stopImmediatePropagation();
      if(event.key==='Tab'){close();return;}event.preventDefault();
      if(event.key==='Escape'){close(true);return;}
      if(event.key==='ArrowLeft'){hideSub();return;}
      if(event.key==='ArrowRight'){const kind=document.activeElement?.dataset.paperCommand;if(['collections','reading','more'].includes(kind))openSub(kind);return;}
      if(event.key==='Enter'||event.key===' '){document.activeElement?.click();return;}
      let i=buttons.indexOf(document.activeElement);i=event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length;buttons[i]?.focus();
    }
  },true);
  window.addEventListener('resize',()=>close());window.addEventListener('blur',()=>close());
  document.addEventListener('scroll',event=>{if(!menu.hidden&&!menu.contains(event.target))close();},true);
  document.addEventListener('input',event=>{if(event.target.id!=='collection-picker-search')return;const q=event.target.value.trim().toLocaleLowerCase();let count=0;$('#collection-picker-list').querySelectorAll('button').forEach(button=>{button.hidden=!button.textContent.toLocaleLowerCase().includes(q);if(!button.hidden)count++;});$('#collection-picker-empty').hidden=Boolean(count)||!config.getCollections().length;});
  document.addEventListener('click',event=>{
    const menuButton=event.target.closest('[data-paper-menu]');
    if(menuButton){const row=menuButton.closest('.paper-row'),r=menuButton.getBoundingClientRect();open(row.dataset.select,r.right,r.bottom,row);return;}
    const button=event.target.closest('[data-collection-command]');if(!button||button.disabled||busy)return;
    const ids=[...modalIds],command=button.dataset.collectionCommand;
    if(command==='create')create(ids);
    if(command==='choose'||command==='detach')assign(ids,{groupMode:'set',collection:command==='detach'?'':button.dataset.folderId});
  });
  document.addEventListener('submit',event=>{
    if(event.target.id!=='quick-collection-form')return;event.preventDefault();if(busy)return;
    const form=event.target,fields=new FormData(form),name=String(fields.get('name')||'').trim();if(!name)return;
    const ids=fields.has('assign')?[...modalIds]:[];
    if(ids.length)assign(ids,{groupMode:'new',groupName:name});
    else run(async()=>{await config.createEmpty(name);await config.reload();busy=false;config.closeModal();config.toast(msg`已创建分组「${name}」。`);});
  });
  return {open,picker,create,close,detach:ids=>assign(ids,{groupMode:'set',collection:''}),isBusy:()=>busy};
}
