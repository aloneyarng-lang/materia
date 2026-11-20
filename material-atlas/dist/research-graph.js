import {tagFacet} from './tag-facets.js';
// Weighted tag space, independent layout/display graphs, and multilevel Louvain.
const normalize = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
let cache;

export function louvain(count, edges, resolution = 1) {
  let members = Array.from({length:count}, (_,i)=>[i]);
  let links = edges.map(e=>({source:e.source,target:e.target,weight:e.similarity}));
  for(let level=0;level<12;level++) {
    const n=members.length,adj=Array.from({length:n},()=>new Map()),degree=Array(n).fill(0);
    for(const {source:a,target:b,weight:w} of links){
      adj[a].set(b,(adj[a].get(b)||0)+w);adj[b].set(a,(adj[b].get(a)||0)+w);degree[a]+=w;degree[b]+=w;
    }
    const total=degree.reduce((a,b)=>a+b,0);if(!total)break;
    const community=Array.from({length:n},(_,i)=>i),mass=degree.slice();
    for(let pass=0;pass<40;pass++){
      let moved=false;
      for(let i=0;i<n;i++){
        const old=community[i],weights=new Map();
        for(const [j,w] of adj[i])if(i!==j)weights.set(community[j],(weights.get(community[j])||0)+w);
        mass[old]-=degree[i];
        const gain=c=>(weights.get(c)||0)-resolution*degree[i]*mass[c]/total;
        let best=old,bestGain=gain(old);
        for(const c of [...weights.keys()].sort((a,b)=>a-b)){const g=gain(c);if(g>bestGain+1e-10){best=c;bestGain=g;}}
        community[i]=best;mass[best]+=degree[i];if(best!==old)moved=true;
      }
      if(!moved)break;
    }
    const ids=[...new Set(community)].sort((a,b)=>a-b),remap=new Map(ids.map((id,i)=>[id,i]));
    if(ids.length===n)break;
    const next=ids.map(()=>[]);members.forEach((row,i)=>next[remap.get(community[i])].push(...row));
    const aggregate=new Map();
    for(const edge of links){let a=remap.get(community[edge.source]),b=remap.get(community[edge.target]);if(a>b)[a,b]=[b,a];const key=a+':'+b;const e=aggregate.get(key)||{source:a,target:b,weight:0};e.weight+=edge.weight;aggregate.set(key,e);}
    members=next;links=[...aggregate.values()];
  }
  const result=Array(count);members.sort((a,b)=>Math.min(...a)-Math.min(...b)).forEach((row,c)=>row.forEach(i=>result[i]=c));return result;
}

function researchTags(papers, clusterBasis) {
  const facets=new Map();
  const rows=papers.map(p=>[...new Set((p.tags||[]).map(normalize).filter(Boolean))].sort().filter(tag=>{
    const info=tagFacet(tag);facets.set(tag,info);
    return info.weight>0&&(clusterBasis==='combined'||info.facet===clusterBasis);
  }));
  return {rows, facets};
}

function indexResearchTags(rows, facets) {
  const index = new Map();
  rows.forEach((tags, i) => {
    for (const tag of tags) {
      if (!index.has(tag)) index.set(tag, []);
      index.get(tag).push(i);
    }
  });
  const weights = new Map([...index].map(([tag, papers]) => [tag, Math.log(1 + rows.length / papers.length)]));
  const sums = rows.map(tags => {
    const result = new Map();
    for (const tag of tags) {
      const facet = facets.get(tag).facet;
      result.set(facet, (result.get(facet) || 0) + weights.get(tag));
    }
    return result;
  });
  const facetWeights = new Map([...facets.values()].map(info => [info.facet, info.weight]));
  return {index, weights, sums, facets, facetWeights};
}

function matchingResearchPapers(tags, source, {index, weights, sums, facets, facetWeights}, threshold, firstTarget = 0) {
  const overlap = new Map();
  for (const tag of tags) {
    const facet = facets.get(tag).facet;
    for (const target of index.get(tag)) {
      if (target < firstTarget || target === source) continue;
      if (!overlap.has(target)) overlap.set(target, new Map());
      const common = overlap.get(target);
      common.set(facet, (common.get(facet) || 0) + weights.get(tag));
    }
  }
  const matches = [];
  for (const [target, common] of overlap) {
    let score = 0, total = 0;
    for (const [facet, sum] of sums[source]) {
      if (!sums[target].has(facet)) continue;
      const weight = facetWeights.get(facet), shared = common.get(facet) || 0;
      total += weight;
      score += weight * (shared / (sum + sums[target].get(facet) - shared || 1));
    }
    const similarity = total ? Math.min(1, Math.max(0, score / total)) : 0;
    if (similarity > 0 && similarity >= threshold) matches.push({source, target, similarity});
  }
  return matches;
}

export function researchNeighbors(papers, id, {clusterBasis = 'combined', similarityThreshold = .2, limit} = {}) {
  const source = papers.findIndex(paper => paper.id === id);
  if (source < 0) return [];
  const {rows, facets} = researchTags(papers, clusterBasis);
  const matches = matchingResearchPapers(rows[source], source, indexResearchTags(rows, facets), similarityThreshold);
  return matches
    .sort((a, b) => b.similarity - a.similarity || String(papers[a.target].id).localeCompare(String(papers[b.target].id)))
    .slice(0, limit)
    .map(({target}) => papers[target]);
}

export function researchGraph(papers,{neighbors=3,similarityThreshold=.2,mutualKnn=false,resolution=1,clusterBasis='combined'}={}){
  const {rows, facets} = researchTags(papers, clusterBasis);
  const key=JSON.stringify([papers.map((p,i)=>[p.id,rows[i],p.tags]),similarityThreshold,resolution,clusterBasis,[...facets]]);
  if(cache?.key!==key){
    const tagIndex = indexResearchTags(rows, facets);
    const {weights} = tagIndex;
    const layoutEdges=[];
    rows.forEach((tags,source)=>{
      for (const match of matchingResearchPapers(tags, source, tagIndex, similarityThreshold, source + 1)) {
        layoutEdges.push(match);
      }
    });
    layoutEdges.sort((a,b)=>a.source-b.source||a.target-b.target);
    const communities=louvain(papers.length,layoutEdges,resolution);
    const clusters=new Map();communities.forEach((c,i)=>{if(!clusters.has(c))clusters.set(c,[]);clusters.get(c).push(i);});
    const spellings=new Map();for(const paper of papers)for(const raw of paper.tags||[]){const tag=normalize(raw);if(tag&&!spellings.has(tag))spellings.set(tag,String(raw).normalize('NFKC').trim().replace(/\s+/g,' '));}
    const labels=new Map([...clusters].map(([c,indices])=>{
      const counts=new Map();for(const i of indices)for(const t of rows[i])counts.set(t,(counts.get(t)||0)+1);
      const ranked=[...counts].sort((a,b)=>Number(b[1]===indices.length)-Number(a[1]===indices.length)||b[1]*weights.get(b[0])-a[1]*weights.get(a[0])||a[0].localeCompare(b[0]));
      const shared=ranked.filter(([,count])=>count>=Math.max(2,Math.ceil(indices.length*.6)));
      return [c,(shared.length?shared:ranked).slice(0,2).map(([t])=>spellings.get(t)||t).join(' · ')||'未分类'];
    }));
    cache={key,layoutEdges,communities,labels};
  }
  const lists=rows.map(()=>[]);cache.layoutEdges.forEach((e,i)=>{lists[e.source].push(i);lists[e.target].push(i);});
  const chosen=lists.map((list,i)=>new Set(list.sort((a,b)=>cache.layoutEdges[b].similarity-cache.layoutEdges[a].similarity||String(papers[cache.layoutEdges[a].source===i?cache.layoutEdges[a].target:cache.layoutEdges[a].source].id).localeCompare(String(papers[cache.layoutEdges[b].source===i?cache.layoutEdges[b].target:cache.layoutEdges[b].source].id))).slice(0,neighbors)));
  const edges=cache.layoutEdges.filter((e,i)=>mutualKnn?chosen[e.source].has(i)&&chosen[e.target].has(i):chosen[e.source].has(i)||chosen[e.target].has(i));
  return {layoutEdges:cache.layoutEdges.map(e=>({...e})),edges:edges.map(e=>({...e})),communities:cache.communities.slice(),labels:new Map(cache.labels)};
}

export function researchLocalPapers(papers,id,depth=1,options={}){
  const start=papers.findIndex(p=>p.id===id);if(start<0)return papers;
  const included=new Set([start]),{layoutEdges}=researchGraph(papers,options);
  for(let k=0;k<depth;k++){const before=new Set(included);for(const e of layoutEdges){if(before.has(e.source))included.add(e.target);if(before.has(e.target))included.add(e.source);}}
  return papers.filter((_,i)=>included.has(i));
}
