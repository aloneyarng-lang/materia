import test from 'node:test';
import assert from 'node:assert/strict';
import {similarityLinks,similarityLocalPapers} from '../dist/paper-similarity.js';
import {createNetwork,stepNetwork} from '../dist/force-layout.js';
import {GRAPH_DEFAULTS,cleanGraphSettings} from '../dist/graph-settings.js';
import {cleanLayoutInput} from '../dist/natural-layout.js';

const papers=[{id:'a',title:'Magnetic alloy',tags:['Magnetic','Alloy']},{id:'b',title:'Magnetic alloy',tags:['Magnetic','Alloy']},{id:'c',title:'Polymer',tags:['Alloy','Polymer']},{id:'d',title:'Biology',tags:[]}];
test('similarity ranks overlapping research above partial overlap and leaves unrelated papers isolated',()=>{
  const links=similarityLinks(papers),strong=links.find(e=>e.source===0&&e.target===1),weak=links.find(e=>e.source===0&&e.target===2);
  assert.ok(strong.similarity>weak.similarity);assert.ok(links.every(e=>e.source!==3&&e.target!==3));
  assert.deepEqual(similarityLinks([{id:'1'},{id:'2'}]),[]);
  assert.ok(similarityLinks([{id:'1',title:'高熵合金强化机制'},{id:'2',title:'高熵合金强化研究'}]).length);
});
test('default preferences choose paper mode; tags remain opt-in and independent of automatic links',()=>{
  assert.equal(cleanGraphSettings({}).mode,'similarity');assert.equal(cleanGraphSettings({mode:'invalid'}).mode,'similarity');
  const rules=[{kind:'tag',value:'Alloy'}],auto=createNetwork(papers,[],{},rules,'similarity'),tags=createNetwork(papers.filter(p=>p.tags.includes('Alloy')),[],{},rules,'tags');
  assert.ok(auto.nodes.every(n=>n.type==='paper'));assert.equal(auto.nodes.length,4);assert.ok(auto.edges.length);
  assert.equal(tags.nodes.filter(n=>n.type==='relation').length,1);assert.equal(tags.edges.length,3);assert.ok(tags.edges.every(e=>e.target.type==='relation'));
  assert.deepEqual(similarityLocalPapers(papers,'a',1).map(p=>p.id),['a','b','c']);
});
test('stronger links settle closer and their weights survive natural arrangement input',()=>{
  const distances=[];
  for(const similarity of [.2,.9]){
    const graph=createNetwork(papers.slice(0,2),[],{},[],'similarity');graph.edges[0].similarity=similarity;
    Object.assign(graph.nodes[0],{x:100,y:300,pinned:true});Object.assign(graph.nodes[1],{x:600,y:300});
    for(let i=0;i<400;i++)stepNetwork(graph,.4,{...GRAPH_DEFAULTS,center:0,repulsion:0,clusterStrength:0});
    distances.push(graph.nodes[1].x-graph.nodes[0].x);
    assert.equal(cleanLayoutInput(graph).edges[0].similarity,similarity);
  }
  assert.ok(distances[1]<distances[0]*.65);
});
test('dense libraries retain bounded sparse links with normalized, symmetric scores',()=>{
  const fixture=Array.from({length:80},(_,i)=>({id:String(i),tags:['Shared'],title:'Shared materials'})),links=similarityLinks(fixture);
  assert.ok(links.length<=80*6);assert.equal(new Set(links.map(e=>`${e.source}:${e.target}`)).size,links.length);
  assert.ok(links.every(e=>e.similarity>=0&&e.similarity<=1));
  const score=similarityLinks(papers.slice(0,2))[0].similarity;
  assert.equal(similarityLinks(papers.slice(0,2).reverse())[0].similarity,score);
});

test('near-neighbour count bounds scoring work and reduces links without dropping papers',()=>{
  const fixture=Array.from({length:600},(_,i)=>({id:'bounded-'+i,title:'Materials group '+i%30,tags:['Shared','Group '+i%30]}));
  let low,high;const a=similarityLinks(fixture,{neighbors:1,onStats:s=>low=s}),b=similarityLinks(fixture,{neighbors:6,onStats:s=>high=s});
  assert.ok(low.scoredPairs<=fixture.length*16);assert.ok(high.scoredPairs<=fixture.length*48);
  assert.ok(low.scoredPairs<fixture.length*(fixture.length-1)/20,'must avoid all-pairs scoring');
  assert.ok(a.length<b.length);assert.ok(a.length<=fixture.length);assert.ok(b.length<=fixture.length*6);
  const graph=createNetwork(fixture,[],{},[],'similarity',1);assert.equal(graph.nodes.length,600);assert.equal(graph.edges.length,a.length);
  assert.equal(cleanGraphSettings({}).neighbors,3);assert.equal(cleanGraphSettings({neighbors:1}).neighbors,1);assert.equal(cleanGraphSettings({neighbors:100}).neighbors,12);
});

test('cached neighbours remain independent of layout mutations and metadata edits invalidate the cache',()=>{
  const fixture=[{id:'cache-a',tags:['Unique']},{id:'cache-b',tags:['Unique']}];
  const first=similarityLinks(fixture,{neighbors:1});first[0].similarity=0;first[0].components.tags=0;
  let stats;const again=similarityLinks(fixture,{neighbors:1,onStats:s=>stats=s});assert.equal(stats.cached,true);assert.equal(again[0].similarity,.5);assert.equal(again[0].components.tags,1);
  fixture[1].tags=['Different'];assert.deepEqual(similarityLinks(fixture,{neighbors:1}),[]);
});
