import test from 'node:test';
import assert from 'node:assert/strict';
import {researchGraph,researchLocalPapers,louvain} from '../dist/research-graph.js';
import {createNetwork,stepNetwork} from '../dist/force-layout.js';
import {cleanGraphSettings} from '../dist/graph-settings.js';
import {solveNaturalLayout,cleanLayoutInput} from '../dist/natural-layout.js';

const fixture=()=>Array.from({length:36},(_,i)=>({id:'p'+String(i).padStart(2,'0'),title:'Paper '+i,tags:['Materials','Analysis','Field '+Math.floor(i/12),'Method '+Math.floor(i/12),'Specific '+i%3]}));
test('community names prioritize common distinctive tags and preserve original spelling',()=>{
  const papers=fixture(),graph=researchGraph(papers,{similarityThreshold:.5});
  for(const label of graph.labels.values()){assert.match(label,/Field/);assert.match(label,/Method/);assert.ok(!label.includes('Materials'));}
  papers[0].tags=papers[0].tags.map(t=>t==='Field 0'?'FIELD 0':t);
  assert.match(researchGraph(papers,{similarityThreshold:.5}).labels.get(0),/FIELD 0/);
  assert.equal(cleanGraphSettings({}).showCommunityLabels,true);
  assert.equal(cleanGraphSettings({showCommunityLabels:false}).showCommunityLabels,false);
});
test('IDF tag similarity downweights ubiquitous tags, normalizes and deduplicates',()=>{
  const papers=[{id:'a',tags:['Common','Rare']},{id:'b',tags:[' common ','COMMON']},{id:'c',tags:['rare']},...Array.from({length:10},(_,i)=>({id:'f'+i,tags:['Common']}))];
  const graph=researchGraph(papers,{similarityThreshold:.01});
  const score=j=>graph.layoutEdges.find(e=>e.source===0&&e.target===j).similarity;
  assert.ok(score(2)>score(1));assert.ok(graph.layoutEdges.every(e=>e.similarity>0&&e.similarity<=1));
  assert.equal(researchGraph([{id:'x',tags:[' Ａ ','a']},{id:'y',tags:['a']}]).edges[0].similarity,1);
  assert.equal(researchGraph([{id:'x',title:'same'},{id:'y',title:'same'}]).layoutEdges.length,0);
});
test('display density and mutual selection do not change layout graph or communities',()=>{
  const papers=fixture(),a=researchGraph(papers,{neighbors:1}),b=researchGraph(papers,{neighbors:8}),c=researchGraph(papers,{neighbors:8,mutualKnn:true});
  assert.deepEqual(a.layoutEdges,b.layoutEdges);assert.deepEqual(a.communities,b.communities);assert.deepEqual(b.layoutEdges,c.layoutEdges);assert.ok(a.edges.length<b.edges.length);assert.ok(c.edges.length<=b.edges.length);
  const selected=Array.from({length:papers.length},()=>[]);b.layoutEdges.forEach((e,i)=>{selected[e.source].push(i);selected[e.target].push(i);});
  assert.ok(c.edges.every(e=>b.edges.some(x=>x.source===e.source&&x.target===e.target)));
  const opts={similarityThreshold:.5};assert.deepEqual(researchLocalPapers(papers,'p00',1,opts).map(p=>p.id),papers.slice(0,12).map(p=>p.id));
});
test('Louvain separates dense domains joined by a weak bridge and retains isolated nodes',()=>{
  const edges=[];for(let base of [0,6])for(let i=base;i<base+6;i++)for(let j=i+1;j<base+6;j++)edges.push({source:i,target:j,similarity:1});
  edges.push({source:5,target:6,similarity:.02});
  const c=louvain(13,edges);assert.equal(new Set(c.slice(0,6)).size,1);assert.equal(new Set(c.slice(6,12)).size,1);assert.notEqual(c[0],c[6]);assert.notEqual(c[12],c[0]);assert.deepEqual(louvain(13,edges),c);
});
test('live layout forms separated domains, preserves pins, and display count cannot move coordinates',()=>{
  const papers=fixture(),prefs=cleanGraphSettings({similarityThreshold:.5}),a=createNetwork(papers,[],{},[],'similarity',1,3,prefs),b=createNetwork(papers,[],{},[],'similarity',8,3,prefs);
  const pin=a.nodes[0];pin.pinned=true;const saved={x:pin.x,y:pin.y};
  for(let i=0;i<220;i++){stepNetwork(a,.7*Math.pow(.98,i),prefs);stepNetwork(b,.7*Math.pow(.98,i),prefs);}
  assert.equal(pin.x,saved.x);assert.equal(pin.y,saved.y);
  assert.ok(a.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));
  const centers=[0,1,2].map(c=>{const nodes=b.nodes.filter(n=>n.community===c);return{x:nodes.reduce((s,n)=>s+n.x,0)/nodes.length,y:nodes.reduce((s,n)=>s+n.y,0)/nodes.length,nodes};});
  const spread=centers.reduce((s,c)=>s+c.nodes.reduce((t,n)=>t+Math.hypot(n.x-c.x,n.y-c.y),0)/c.nodes.length,0)/3;
  const separation=Math.min(...centers.flatMap((a,i)=>centers.slice(i+1).map(b=>Math.hypot(a.x-b.x,a.y-b.y))));
  assert.ok(separation>spread*2,`separation ${separation}, spread ${spread}`);
  const x=createNetwork(papers,[],{},[],'similarity',1,3,prefs),y=createNetwork(papers,[],{},[],'similarity',8,3,prefs);
  for(let i=0;i<100;i++){stepNetwork(x,.4,prefs);stepNetwork(y,.4,prefs);}assert.deepEqual(x.nodes.map(n=>[n.x,n.y]),y.nodes.map(n=>[n.x,n.y]));
});
test('natural arrangement preserves community information and fixed coordinates',async()=>{
  const graph=createNetwork(fixture(),[],{},[],'similarity',3,3,{similarityThreshold:.5});
  const nodes=graph.nodes.map(n=>({...n,title:n.paper.title,group:'community:'+n.community}));nodes[0].pinned=true;
  const input={nodes,edges:graph.layoutEdges};assert.equal(cleanLayoutInput(input).nodes[0].community,0);
  const result=await solveNaturalLayout(input,{}, {yieldTask:()=>Promise.resolve()});
  const pinned=result.points.find(n=>n.id===nodes[0].id);assert.equal(pinned.x,nodes[0].x);assert.equal(pinned.y,nodes[0].y);assert.equal(result.points.length,36);
});
