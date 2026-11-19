import assert from 'node:assert/strict';
import test from 'node:test';
import {bibliography,citationLinks,citationLocalPapers} from '../dist/citation-graph.js';
import {cleanGraphSettings} from '../dist/graph-settings.js';
import {createNetwork} from '../dist/force-layout.js';

const papers = [
  {id:'source',title:'Source paper',doi:'10.1111/source',tags:['shared']},
  {id:'target',title:'Microstructure evolution in soft magnetic alloys',doi:'https://doi.org/10.1111/ALLOY',tags:[]},
  {id:'other',title:'Phase separation in amorphous magnetic composites',tags:['shared']},
  {id:'duplicate-a',title:'Duplicate',doi:'10.1111/ambiguous',tags:[]},
  {id:'duplicate-b',title:'Another duplicate',doi:'10.1111/ambiguous',tags:[]},
];
test('only bibliography evidence creates directed links, with a page and matching method',()=>{
  const input=bibliography([
    'Phase separation in amorphous magnetic composites\nhttps://doi.org/10.1111/ALLOY',
    '5. References\n[1] Microstructure evolution in soft\nmagnetic alloys.\n[2] https://doi.org/10.1111/ambiguous',
    '[3] doi:10.1111/alloy.\n[4] doi: 10.1111/source\nSupporting information\nPhase separation in amorphous magnetic composites',
    'Phase separation in amorphous magnetic composites'
  ]);
  assert.deepEqual(citationLinks(papers,new Map([['source',input]])),[{source:'source',target:'target',method:'doi',page:3}]);
  assert.deepEqual(citationLinks(papers,new Map([['source',bibliography(['参考文献\nPhase separation in amorphous magnetic composites'])]])),[
    {source:'source',target:'other',method:'title',page:1}
  ]);
});

test('citation network respects filtering and explores both directions without adding tag matches',()=>{
  const citations=[{source:'source',target:'target',page:2,method:'doi'},{source:'target',target:'other',page:1,method:'title'}];
  assert.equal(cleanGraphSettings({mode:'citations'}).mode,'citations');
  const network=createNetwork(papers.slice(0,2),[],{},[],'citations',3,6,{citations});
  assert.deepEqual(network.edges.map(e=>[e.source.paper.id,e.target.paper.id]),[['source','target']]);
  assert.deepEqual(citationLocalPapers(papers,citations,'other',2).map(p=>p.id),['source','target','other']);
  assert.deepEqual(citationLocalPapers(papers.filter(p=>p.id!=='target'),citations,'source',2).map(p=>p.id),['source']);
});
