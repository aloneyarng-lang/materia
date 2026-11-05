import {normalizeAuthors} from './catalog.js';

const key=value=>String(value||'').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g,' ');
const names=values=>new Set(values.map(key).filter(Boolean));
const stop=new Set('a an the of in on for to and or with by from at as is are using study studies effect effects via based'.split(' '));
function terms(paper){
  const text=key([paper.title,paper.abstract].filter(Boolean).join(' ')).slice(0,20000),result=new Map();
  for(const part of text.match(/[a-z\d][a-z\d-]+|[\p{Script=Han}]+/gu)||[]){
    const tokens=/\p{Script=Han}/u.test(part)?Array.from({length:Math.max(0,part.length-1)},(_,i)=>part.slice(i,i+2)):[part];
    for(const token of tokens)if(!stop.has(token))result.set(token,(result.get(token)||0)+1);
  }
  return result;
}
const jaccard=(a,b)=>{let shared=0;for(const v of a)if(b.has(v))shared++;return shared/(a.size+b.size-shared||1);};
const linkCache=new Map();
const hash=value=>{let n=2166136261;for(const c of String(value))n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};
export const similarityKey=papers=>JSON.stringify(papers.map(p=>[p.id,p.title,p.abstract,p.tags,p.authors,p.authorDetails]));

// Local, deterministic metadata similarity. Missing fields contribute zero.
// TF-IDF downweights vocabulary common throughout the current library.
export function similarityLinks(papers,{neighbors=3,threshold=.08,onStats=()=>{}}={}){
  neighbors=Math.max(1,Math.min(12,Math.round(Number(neighbors)||3)));
  const candidateLimit=Math.max(16,neighbors*8);
  const cacheKey=JSON.stringify([neighbors,threshold,similarityKey(papers)]);
  if(linkCache.has(cacheKey)){const cached=linkCache.get(cacheKey);onStats({...cached.stats,cached:true});return cached.links.map(e=>({...e,components:{...e.components}}));}
  const rows=papers.map(p=>{
    const authors=normalizeAuthors(p.authorDetails?.length?p.authorDetails:typeof p.authors==='string'?p.authors.split(/[,，;；\n]+/):p.authors);
    return {tags:names(p.tags||[]),authors:names(authors.map(a=>a.name)),institutions:names(authors.flatMap(a=>a.affiliations)),terms:terms(p)};
  });
  const frequencies=new Map();for(const row of rows)for(const term of row.terms.keys())frequencies.set(term,(frequencies.get(term)||0)+1);
  for(const row of rows){let norm=0;for(const [term,count] of row.terms){const weight=(1+Math.log(count))*(1+Math.log((papers.length+1)/(frequencies.get(term)+1)));row.terms.set(term,weight);norm+=weight*weight;}row.norm=Math.sqrt(norm);}
  const candidates=rows.map(()=>[]);
  const compare=(a,b)=>b.similarity-a.similarity||String(papers[a.source].id).localeCompare(String(papers[b.source].id))||String(papers[a.target].id).localeCompare(String(papers[b.target].id));
  const retain=(list,edge)=>{if(list.length>=neighbors&&compare(edge,list[list.length-1])>=0)return;let at=list.length;while(at>0&&compare(edge,list[at-1])<0)at--;list.splice(at,0,edge);if(list.length>neighbors)list.pop();};
  // Approximate nearest neighbours: recall a bounded feature-based shortlist,
  // then score it. Never enumerate every document pair.
  const inverted=new Map();
  rows.forEach((row,i)=>{for(const field of ['tags','authors','institutions','terms'])for(const token of row[field].keys()){const id=field+':'+token;if(!inverted.has(id))inverted.set(id,[]);inverted.get(id).push(i);}});
  for(const list of inverted.values())list.sort((a,b)=>String(papers[a].id).localeCompare(String(papers[b].id)));
  const checked=new Set();let scoredPairs=0;
  for(let i=0;i<rows.length;i++){
   const features=[];
   for(const [field,weight] of [['tags',.5],['terms',.3],['authors',.15],['institutions',.05]])for(const token of rows[i][field].keys()){
     const id=field+':'+token,list=inverted.get(id);if(list.length<2)continue;
     const value=field==='terms'?(rows[i].terms.get(token)/(rows[i].norm||1))**2:1/(rows[i][field].size||1);
     features.push({id,list,weight:weight*value*(1+Math.log((papers.length+1)/(list.length+1)))});
   }
   features.sort((a,b)=>b.weight-a.weight||a.id.localeCompare(b.id));
   const recalled=new Map();
   for(const feature of features.slice(0,32)){
     const {list,weight}=feature,visits=Math.min(list.length,candidateLimit+1),start=hash(papers[i].id+'|'+feature.id)%list.length;
     for(let k=0;k<visits;k++){const j=list[(start+Math.floor(k*list.length/visits))%list.length];if(j!==i)recalled.set(j,(recalled.get(j)||0)+weight);}
   }
   const shortlist=[...recalled].sort((a,b)=>b[1]-a[1]||String(papers[a[0]].id).localeCompare(String(papers[b[0]].id))).slice(0,candidateLimit);
   for(const [j] of shortlist){
    const source=Math.min(i,j),target=Math.max(i,j),pair=source+':'+target;if(checked.has(pair))continue;checked.add(pair);scoredPairs++;
    const a=rows[i],b=rows[j];let dot=0;for(const [term,weight] of a.terms)dot+=weight*(b.terms.get(term)||0);
    const components={tags:jaccard(a.tags,b.tags),text:a.norm&&b.norm?dot/a.norm/b.norm:0,authors:jaccard(a.authors,b.authors),institutions:jaccard(a.institutions,b.institutions)};
    const similarity=Math.min(1,.5*components.tags+.3*components.text+.15*components.authors+.05*components.institutions);
    if(similarity<threshold)continue;
    const edge={source,target,similarity,components};retain(candidates[i],edge);retain(candidates[j],edge);
   }
  }
  const selected=new Map();
  for(const list of candidates)for(const edge of list)selected.set(`${edge.source}:${edge.target}`,edge);
  const result=[...selected.values()].sort((a,b)=>a.source-b.source||a.target-b.target);
  const stats={papers:papers.length,neighbors,candidateLimit,scoredPairs,cached:false};onStats(stats);
  if(linkCache.size>=3)linkCache.delete(linkCache.keys().next().value);linkCache.set(cacheKey,{links:result,stats});
  return result.map(e=>({...e,components:{...e.components}}));
}

export function similarityLocalPapers(papers,id,depth=1,options={}){
  if(!papers.some(p=>p.id===id))return papers;
  const included=new Set([papers.findIndex(p=>p.id===id)]),edges=similarityLinks(papers,options);
  for(let layer=0;layer<depth;layer++){const before=new Set(included);for(const e of edges){if(before.has(e.source))included.add(e.target);if(before.has(e.target))included.add(e.source);}}
  return papers.filter((_,i)=>included.has(i));
}
