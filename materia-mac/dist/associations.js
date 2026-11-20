import {t as tr,html,msg} from './i18n.js';
import { normalizeAuthors } from './catalog.js';
export const ASSOCIATION_KINDS={get tag(){return tr('标签');},get year(){return tr('发表年份');},get institution(){return tr('作者机构');},get author(){return tr('作者');}};
export const associationValueKey=value=>String(value||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase();
export const associationId=(kind,value)=>`relation:${kind}:${associationValueKey(value)}`;
export function associationMatches(paper,rule){
  const key=associationValueKey(rule.value);
  if(rule.kind==='tag')return(paper.tags||[]).some(tag=>associationValueKey(tag)===key);
  if(rule.kind==='year')return String(paper.year||'')===String(rule.value);
  const authors=normalizeAuthors(paper.authorDetails||[]);
  if(rule.kind==='author')return authors.some(author=>associationValueKey(author.name)===key);
  if(rule.kind==='institution')return authors.some(author=>author.affiliations.some(institution=>associationValueKey(institution)===key));
  return false;
}
export function cleanAssociations(value=[]){
  if(!Array.isArray(value))return[];
  const result=new Map();
  for(const row of value.slice(0,100)){
    if(!row||!ASSOCIATION_KINDS[row.kind]||typeof row.value!=='string')continue;
    const text=row.value.trim().replace(/\s+/g,' ').slice(0,1000);if(!text||row.kind==='year'&&!/^\d{4}$/.test(text))continue;
    const id=associationId(row.kind,text);result.set(id,{id,kind:row.kind,value:text,label:text});
  }
  return[...result.values()];
}
export function associationInventory(papers,kind){
  const rows=new Map();
  for(const paper of papers){
    const authors=normalizeAuthors(paper.authorDetails||[]);
    const values=kind==='tag'?paper.tags||[]:kind==='year'?[paper.year].filter(Boolean):kind==='author'?authors.map(author=>author.name):kind==='institution'?authors.flatMap(author=>author.affiliations):[];
    for(const text of new Set(values.map(value=>String(value||'').trim()).filter(Boolean))){
      const id=associationId(kind,text);if(!rows.has(id))rows.set(id,{id,kind,value:text,label:text,paperIds:new Set()});rows.get(id).paperIds.add(paper.id);
    }
  }
  return[...rows.values()].map(({paperIds,...row})=>({...row,count:paperIds.size})).sort((a,b)=>kind==='year'?Number(b.value)-Number(a.value):b.count-a.count||a.label.localeCompare(b.label));
}
export function associationLocalPapers(papers,rules,id,depth=1){
  if(!id||!papers.some(paper=>paper.id===id))return papers;
  const included=new Set([id]);
  for(let layer=0;layer<depth;layer++){
    const links=rules.filter(rule=>papers.some(paper=>included.has(paper.id)&&associationMatches(paper,rule)));
    for(const paper of papers)if(links.some(rule=>associationMatches(paper,rule)))included.add(paper.id);
  }
  return papers.filter(paper=>included.has(paper.id));
}
export function createAssociationController(config){
  const esc=config.escape;let kind='tag',query='';
  const directory=()=>{
    const active=new Set(config.getRules().map(rule=>rule.id));
    return associationInventory(config.getPapers(),kind).filter(row=>associationValueKey(row.label).includes(associationValueKey(query))).map(row=>html`<button class="association-choice ${active.has(row.id)?'already-added':''}" data-add-association="${esc(row.id)}" ${active.has(row.id)?'disabled':''}><span>${esc(row.label)}</span><small>${row.count} 篇${active.has(row.id)?tr(' · 已添加'):' · ＋'}</small></button>`).join('')||tr('<div class="notes-empty">没有匹配的真实元数据。可切换类型或搜索词；作者与机构以已录入的结构化信息为准。</div>');
  };
  function open(){
    const rules=config.getRules();
    config.showModal(tr('添加关联节点'),tr('选择多个标签后，画布展示这些标签及匹配任一标签的文献；也可按年份、作者或机构探索。'),html`<div class="association-kind-tabs">${Object.entries(ASSOCIATION_KINDS).map(([key,label])=>`<button data-association-kind="${key}" class="${kind===key?'active':''}">${label}</button>`).join('')}</div><input class="parameter-search" id="association-query" value="${esc(query)}" placeholder="搜索 ${ASSOCIATION_KINDS[kind]}…" aria-label="搜索关联节点"><div id="association-directory" class="association-directory">${directory()}</div><details class="association-active" ${rules.length?'open':''}><summary>已加入 ${rules.length} 个关联节点</summary><div>${rules.map(rule=>html`<button data-remove-association="${esc(rule.id)}" title="仅移除此可视化节点，不修改文献数据">${ASSOCIATION_KINDS[rule.kind]} · ${esc(rule.label)} <span>×</span></button>`).join('')||tr('<small>还没有选择标签，请从上方加入要探索的标签。</small>')}</div></details><div class="modal-footer"><button class="text-button" data-association-clear ${rules.length?'':'disabled'}>清空全部关联节点</button><button class="primary" data-action="close-modal">完成</button></div>`,'associations');
  }
  function inspect(id){
    const rule=config.getRules().find(rule=>rule.id===id);if(!rule)return;
    const all=config.getPapers().filter(paper=>associationMatches(paper,rule)),visible=config.getVisible().filter(paper=>associationMatches(paper,rule));
    config.showModal(`${ASSOCIATION_KINDS[rule.kind]} · ${esc(rule.label)}`,msg`全库 ${all.length} 篇匹配 · 当前筛选中 ${visible.length} 篇`, html`<div class="linked-titles">${visible.map(paper=>`<button data-link-paper="${esc(paper.id)}"><span>↗</span>${esc(paper.title)}<small>${esc(paper.year)}</small></button>`).join('')||tr('<p class="help-inline">当前筛选没有匹配文献。节点仍保留，可调整筛选或移除此节点。</p>')}</div><div class="modal-footer"><button class="text-button" data-remove-association="${esc(id)}">移除这个关联节点</button><button class="primary" data-action="close-modal">完成</button></div>`,'associations');
  }
  async function remove(id){await config.save(config.getRules().filter(rule=>rule.id!==id));config.changed();}
  document.addEventListener('input',event=>{if(event.target.id==='association-query'){query=event.target.value;document.querySelector('#association-directory').innerHTML=directory();}});
  document.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button)return;
    try{
      if(button.dataset.associationKind){kind=button.dataset.associationKind;query='';open();}
      if(button.dataset.addAssociation){const row=associationInventory(config.getPapers(),kind).find(row=>row.id===button.dataset.addAssociation);if(!row)return;const current=config.getRules();if(current.some(rule=>rule.id===row.id))return;if(current.length>=100)throw new Error(tr('当前最多同时保留 100 个关联节点，请先移除一些。'));await config.save(cleanAssociations([...current,row]));config.changed();open();}
      if(button.dataset.removeAssociation){await remove(button.dataset.removeAssociation);open();}
      if(button.hasAttribute('data-association-clear')){await config.save([]);config.changed();open();}
    }catch(error){config.toast(error.message,true);}
  });
  return{open,inspect,remove};
}
