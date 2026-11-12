import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedTagLinks,sharedTagLocalPapers} from '../dist/shared-tag-links.js';
import {createNetwork,stepNetwork} from '../dist/force-layout.js';
import {GRAPH_DEFAULTS,cleanGraphSettings} from '../dist/graph-settings.js';
import {cleanLayoutInput} from '../dist/natural-layout.js';

const papers=[
  {id:'a',tags:[' A ','a','Ｂ','C']},
  {id:'b',tags:['a','b']},
  {id:'c',tags:['A','b','C']},
  {id:'d',tags:['c']},
  {id:'empty',tags:[]},
];

test('threshold is exclusive, normalized tags count once, all qualifying pairs connect',()=>{
  assert.deepEqual(sharedTagLinks(papers,1),[
    {source:0,target:1,sharedTags:2},
    {source:0,target:2,sharedTags:3},
    {source:1,target:2,sharedTags:2},
  ]);
  assert.equal(sharedTagLinks(papers,2).length,1);
  assert.equal(sharedTagLinks(papers,0).length,5);
  assert.deepEqual(sharedTagLocalPapers(papers,'a',1,2).map(p=>p.id),['a','c']);
  const all=Array.from({length:80},(_,i)=>({id:String(i),tags:['a','b']}));
  assert.equal(sharedTagLinks(all,1).length,80*79/2);
});

test('weights affect attraction and survive natural layout, pins and saved settings',()=>{
  assert.equal(cleanGraphSettings({}).sharedTagThreshold,6);
  for(const value of [0,1,2,3,4,5,'5',null])assert.equal(cleanGraphSettings({mode:'shared-tags',sharedTagThreshold:value}).sharedTagThreshold,6);
  assert.equal(cleanGraphSettings({sharedTagThreshold:7}).sharedTagThreshold,7);
  const network=createNetwork(papers,[],{},[{kind:'tag',value:'a'}],'shared-tags',1,1);
  assert.equal(network.nodes.length,papers.length);
  assert.equal(network.edges.length,3);
  assert.ok(network.nodes.every(n=>n.type==='paper'));
  assert.deepEqual(cleanLayoutInput(network).edges.map(e=>e.sharedTags),[2,3,2]);
  const distances=[];
  for(const count of [2,6]){
    const fixture=[{id:'x',tags:Array.from({length:count},(_,i)=>String(i))},{id:'y',tags:Array.from({length:count},(_,i)=>String(i))}];
    const graph=createNetwork(fixture,[],{},[],'shared-tags',3,1);
    Object.assign(graph.nodes[0],{x:100,y:300,pinned:true});
    Object.assign(graph.nodes[1],{x:600,y:300});
    for(let i=0;i<400;i++)stepNetwork(graph,.4,{...GRAPH_DEFAULTS,center:0,repulsion:0});
    assert.equal(graph.nodes[0].x,100);
    assert.ok(graph.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));
    distances.push(Math.abs(graph.nodes[1].x-100));
  }
  assert.ok(distances[1]<distances[0]);
});
