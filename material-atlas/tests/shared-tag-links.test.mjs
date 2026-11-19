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

test('retired shared-tag mode migrates to similarity and cannot create the dense threshold graph',()=>{
  assert.equal(cleanGraphSettings({mode:'shared-tags'}).mode,'similarity');
  const legacy=createNetwork(papers,[],{},[],'shared-tags',3,1);
  const current=createNetwork(papers,[],{},[],'similarity',3,1);
  assert.equal(legacy.mode,'similarity');
  assert.deepEqual(legacy.edges.map(e=>[e.source.id,e.target.id,e.similarity]),current.edges.map(e=>[e.source.id,e.target.id,e.similarity]));
  assert.ok(legacy.edges.every(e=>e.sharedTags===undefined));
});
