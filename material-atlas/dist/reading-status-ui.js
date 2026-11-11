import {t as tr,html,msg,getLocale} from './i18n.js';
import {READING_STATUSES,readingStatusInfo,readingStatusOf,readingStatusCounts} from './reading-status.js';

export function readingStatusBadge(paper,escape){
  const status=readingStatusInfo(paper);
  return html`<button type="button" class="reading-status-chip" data-reading-paper="${escape(paper.id)}" data-reading-status="${status.id}" aria-haspopup="menu" aria-expanded="false" aria-label="阅读状态：${tr(status.name)}，${escape(paper.title)}" title="更改阅读状态"><i class="reading-status-dot" aria-hidden="true"></i><span>${tr(status.name)}</span><small aria-hidden="true">⌄</small></button>`;
}
export function readingStatusHeading(paper,count){const status=readingStatusInfo(paper);return html`<div class="paper-status-heading" data-reading-status="${status.id}" role="heading" aria-level="3"><i class="reading-status-dot" aria-hidden="true"></i><strong>${tr(status.name)}</strong><small>${count} 篇</small></div>`;}
export function createReadingStatusController(config){
  const esc=config.escape,menu=document.createElement('div');menu.className='paper-context-panel reading-status-menu';menu.id='reading-status-menu';menu.setAttribute('popover','auto');menu.setAttribute('role','menu');menu.setAttribute('aria-label',tr('设置阅读状态'));document.body.append(menu);
  let targets=[],origin=null,busy=false;
  const open=()=>menu.matches(':popover-open');
  function close(restore=false){if(open())menu.hidePopover();origin?.setAttribute('aria-expanded','false');if(restore){const fallback=document.querySelector('#reading-status-filter');(origin?.isConnected?origin:fallback)?.focus({preventScroll:true});}}
  function render(){
    close();const host=document.querySelector('#reading-status-filter');if(!host)return;host.hidden=!config.isVisible();
    const batch=document.querySelector('#selection-reading-actions');
    if(batch&&batch.dataset.locale!==getLocale()){
      batch.dataset.locale=getLocale();
      batch.innerHTML=html`<p class="ui-menu-caption">阅读状态</p>${READING_STATUSES.map(s=>html`<button type="button" data-reading-batch="${s.id}" data-reading-status="${s.id}" role="menuitemradio" aria-checked="false"><i class="reading-status-dot" aria-hidden="true"></i>${tr(s.name)}</button>`).join('')}`;
    }
    const papers=config.getScopePapers(),counts=readingStatusCounts(papers),selected=config.getFilter();
    host.replaceChildren(new Option(msg`阅读状态 · 全部 ${papers.length}`,''),...READING_STATUSES.map(s=>new Option(`${tr(s.name)} ${counts[s.id]}`,s.id)));host.value=selected;
  }
  function show(ids,button){
    if(busy||!config.canEdit())return;
    const existing=new Set(config.getPapers().map(p=>p.id));targets=[...new Set(ids)].filter(id=>existing.has(id));if(!targets.length){config.toast(tr('请先选择文献。'));return;}
    origin=button;const rows=config.getPapers().filter(p=>targets.includes(p.id)),current=rows.every(p=>readingStatusOf(p)===readingStatusOf(rows[0]))?readingStatusOf(rows[0]):'';
    menu.innerHTML=html`<header><strong>阅读状态${targets.length>1?' · '+targets.length+tr(' 篇',false):''}</strong></header>${READING_STATUSES.map(s=>`<button type="button" role="menuitemradio" tabindex="-1" data-reading-set="${s.id}" data-reading-status="${s.id}" aria-checked="${current===s.id}"><span><span class="reading-status-menu-label"><i class="reading-status-dot" aria-hidden="true"></i>${tr(s.name)}</span><span aria-hidden="true">${current===s.id?'✓':''}</span></span></button>`).join('')}`;
    menu.showPopover();const box=button.getBoundingClientRect(),left=Math.max(8,Math.min(innerWidth-menu.offsetWidth-8,box.left)),top=box.bottom+menu.offsetHeight+8<innerHeight?box.bottom+6:Math.max(8,box.top-menu.offsetHeight-6);
    menu.style.left=left+'px';menu.style.top=top+'px';button.setAttribute('aria-expanded','true');(menu.querySelector('[aria-checked=true]')||menu.querySelector('button'))?.focus({preventScroll:true});
  }
  async function set(ids,status){
    if(busy)throw Error(tr('正在保存阅读状态，请稍候。'));if(!config.canEdit())return;
    const captured=[...ids];busy=true;menu.setAttribute('aria-busy','true');menu.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{const result=await config.persist(captured,status);await config.reload();const feedback=document.querySelector('#reading-status-feedback');if(feedback)feedback.textContent=msg`${captured.length} 篇文献已设为${READING_STATUSES.find(s=>s.id===status)?.name?tr(READING_STATUSES.find(s=>s.id===status).name):status}`;return result;}
    finally{busy=false;menu.setAttribute('aria-busy','false');menu.querySelectorAll('button').forEach(b=>b.disabled=false);}
  }
  document.querySelector('#selection-organize-menu')?.addEventListener('beforetoggle',event=>{
    if(event.newState!=='open')return;
    const ids=config.getSelection(),rows=config.getPapers().filter(paper=>ids.has(paper.id));
    for(const button of event.target.querySelectorAll('[data-reading-batch]')){
      const active=rows.length>0&&rows.every(paper=>readingStatusOf(paper)===button.dataset.readingBatch);
      button.setAttribute('aria-checked',String(active));
    }
  });
  document.addEventListener('change',event=>{if(event.target.id==='reading-status-filter')config.setFilter(event.target.value);});
  document.addEventListener('click',event=>{
    const filter=event.target.closest('[data-reading-filter]');if(filter){config.setFilter(filter.dataset.readingFilter);return;}
    const batch=event.target.closest('[data-reading-batch]');
    if(batch){const ids=[...config.getSelection()];if(ids.length)void set(ids,batch.dataset.readingBatch).catch(error=>config.toast(error.message,true));return;}
    const button=event.target.closest('[data-reading-paper]');if(button)show([button.dataset.readingPaper],button);
  });
  menu.addEventListener('click',async event=>{event.stopPropagation();const button=event.target.closest('[data-reading-set]');if(!button||button.disabled||busy)return;const ids=[...targets];try{await set(ids,button.dataset.readingSet);close(true);}catch(error){config.toast(error.message,true);}});
  document.addEventListener('keydown',event=>{
    if(!open())return;event.stopPropagation();const buttons=[...menu.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);
    if(event.key==='Escape'){event.preventDefault();close(true);return;}if(event.key==='Tab'){close();return;}
    let next;if(event.key==='ArrowDown')next=buttons[(index+1)%buttons.length];if(event.key==='ArrowUp')next=buttons[(index-1+buttons.length)%buttons.length];if(event.key==='Home')next=buttons[0];if(event.key==='End')next=buttons.at(-1);if(next){event.preventDefault();next.focus();}
  },true);
  menu.addEventListener('toggle',event=>{if(event.newState==='closed')origin?.setAttribute('aria-expanded','false');});
  addEventListener('resize',()=>close());document.addEventListener('scroll',event=>{if(!menu.contains(event.target))close();},true);
  return {render,set,close,isBusy:()=>busy};
}
