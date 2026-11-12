import {t as tr,html,msg} from './i18n.js';
import { normalizeAuthors } from './catalog.js';

const nameKey=value=>value.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase();
function names(values,key=nameKey){
  const result=new Map();
  for(const value of values){if(typeof value!=='string'||!value.trim())continue;const normalized=key(value);if(!result.has(normalized))result.set(normalized,value.trim());}
  return result;
}
function identities(paper){
  let authors=normalizeAuthors(paper.authorDetails);
  if(!authors.length){
    const raw=paper.authors;
    // Older display-only author lists use commas/semicolons; structured records win.
    authors=normalizeAuthors(typeof raw==='string'&&!raw.includes('|')?raw.split(/[,，;；\n]+/):raw);
  }
  return {authors:names(authors.map(author=>author.name)),institutions:names(authors.flatMap(author=>author.affiliations))};
}
const shared=(left,right)=>[...left].filter(([key])=>right.has(key)).map(([,label])=>label);
const tagNames=paper=>names(paper.tags||[],value=>value.trim());
const added=paper=>Number.isFinite(Number(paper.addedAt))?Number(paper.addedAt):0;
const tieBreak=(a,b)=>added(b.paper)-added(a.paper)||String(a.paper.title||'').localeCompare(String(b.paper.title||''))||String(a.paper.id).localeCompare(String(b.paper.id));

export function relatedPaperGroups(papers,current){
  const people=[],tags=[];if(!current)return {people,tags};
  const own=identities(current),ownTags=tagNames(current);
  for(const paper of papers){
    if(paper.id===current.id)continue;
    const other=identities(paper),authors=shared(own.authors,other.authors),institutions=shared(own.institutions,other.institutions),overlap=shared(ownTags,tagNames(paper));
    if(authors.length||institutions.length)people.push({paper,authors,institutions});
    if(overlap.length)tags.push({paper,tags:overlap});
  }
  people.sort((a,b)=>b.authors.length-a.authors.length||b.institutions.length-a.institutions.length||tieBreak(a,b));
  tags.sort((a,b)=>b.tags.length-a.tags.length||tieBreak(a,b));
  return {people,tags};
}

export function relatedPaperSections(groups,esc){
  const section=(key,title,items,empty)=>{
    const row=item=>{
      const reasons=key==='tags'?[msg`重合 ${item.tags.length} 个 Tag`,item.tags.join(' · ')]:[
        item.authors.length?msg`共同作者：${item.authors.join('、')}`:'',
        item.institutions.length?msg`共同机构：${item.institutions.join('、')}`:'',
      ].filter(Boolean);
      return `<button type="button" class="related-paper" data-related="${esc(item.paper.id)}"><i class="related-dot" aria-hidden="true"></i><span><strong>${esc(item.paper.title)}</strong>${reasons.map(reason=>`<small>${esc(reason)}</small>`).join('')}</span></button>`;
    };
    return html`<section class="related-group" data-related-group="${key}" aria-label="${title}"><div class="related-header"><h3>${title}</h3><small>${items.length} 篇</small></div>${key==='tags'&&items.length?tr(''):''}<div class="related-list">${items.slice(0,3).map(row).join('')||`<p class="help-inline">${empty}</p>`}${items.length>3?html`<details class="related-more"><summary>展开其余 ${items.length-3} 篇</summary>${items.slice(3).map(row).join('')}</details>`:''}</div></section>`;
  };
  return section('people',tr('作者 / 机构关联'),groups.people,tr('尚未找到共同作者或机构，可补充作者与机构信息。'))+section('tags',tr('Tag 关联'),groups.tags,tr('尚未找到共享 Tag 的文献。'));
}
