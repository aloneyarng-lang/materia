import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setTagVocabulary,tagFacet,loadTagVocabulary} from '../dist/tag-facets.js';
import {researchGraph} from '../dist/research-graph.js';
import {parseMetadata,planBatch} from '../dist/import-plan.js';
import {paperTagsMarkdown} from '../dist/markdown.js';
import {cleanGraphSettings} from '../dist/graph-settings.js';
import {associationMatches} from '../dist/associations.js';
import {sharedTagLinks} from '../dist/shared-tag-links.js';
const vocab=JSON.parse(await readFile(new URL('../dist/tag-vocab.json',import.meta.url),'utf8'));
const pair=(a,b,options={})=>researchGraph([{id:'a',tags:a},{id:'b',tags:b}],{similarityThreshold:0,...options}).layoutEdges[0]?.similarity||0;

test('facets use relative weights, ignore missing facets, and preserve full-label identity',()=>{
  setTagVocabulary(vocab);
  assert.ok(Math.abs(pair(['方向:A','体系:X'],['方向:A','体系:Y'])-.35/.6)<1e-12);
  assert.equal(pair(['方向:A'],['方向:A','体系:X']),1);
  assert.equal(pair(['方向:A'],['体系:A']),0);
  assert.equal(pair(['方向:A','体系:X'],['方向:B','体系:X'],{clusterBasis:'方向'}),0);
  assert.equal(pair(['方向:A','体系:X'],['方向:B','体系:X'],{clusterBasis:'体系'}),1);
  assert.equal(pair(['旧标签'],['旧标签'],{clusterBasis:'方向'}),0);
  assert.equal(cleanGraphSettings({clusterBasis:'体系'}).clusterBasis,'体系');
  assert.equal(cleanGraphSettings({clusterBasis:'invalid'}).clusterBasis,'combined');
});

test('IDF is calculated within each facet and vocabulary changes invalidate cached scores',()=>{
  setTagVocabulary(vocab);
  const papers=[{id:'a',tags:['方向:A','体系:X','体系:Y']},{id:'b',tags:['方向:A','体系:X']},{id:'c',tags:['体系:X']}];
  const result=researchGraph(papers,{similarityThreshold:0}).layoutEdges[0].similarity;
  const j=Math.log(2)/(Math.log(2)+Math.log(4));
  assert.ok(Math.abs(result-(.35+.25*j)/.6)<1e-12);
  const tagsA=['方向:A','体系:X'],tagsB=['方向:A','体系:Y'];
  const before=pair(tagsA,tagsB);
  setTagVocabulary({facets:{方向:{weight:.1},体系:{weight:.9}}});
  assert.ok(Math.abs(pair(tagsA,tagsB)-.1)<1e-12);assert.notEqual(before,.1);
});

test('zero-weight tags remain usable for association and shared-tag modes',()=>{
  setTagVocabulary(vocab);
  const tags=['表征:XRD','类型:综述'];
  assert.equal(pair(tags,tags),0);
  assert.equal(pair(['方向:A',...tags],['方向:A']),1);
  assert.equal(associationMatches({tags},{kind:'tag',value:'表征:XRD'}),true);
  assert.equal(associationMatches({tags},{kind:'tag',value:'XRD'}),false);
  assert.equal(sharedTagLinks([{tags},{tags}],1)[0].sharedTags,2);
});

test('unknown prefixes and missing vocabulary degrade without errors',async()=>{
  setTagVocabulary(vocab);
  assert.deepEqual(tagFacet('未知:值'),{facet:'',weight:.05});
  assert.deepEqual(tagFacet('方向X'),{facet:'',weight:.05});
  assert.equal(pair(['旧标签','未知:值'],['旧标签','未知:值']),1);
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async()=>{throw new Error('unavailable');};
    await loadTagVocabulary();
    assert.deepEqual(tagFacet('方向:A'),{facet:'',weight:.05});
    assert.equal(pair(['方向:A'],['方向:A']),1);
    assert.equal(pair(['类型:综述'],['类型:综述']),0);
  } finally {globalThis.fetch=original;setTagVocabulary(vocab);}
});

test('partial MD retagging replaces only the twelve listed papers without mutating the library',async()=>{
  const existing=Array.from({length:20},(_,i)=>({id:`p${i}`,filename:`${i}.pdf`,title:`Paper ${i}`,year:'',authors:'Original author formatting',authorDetails:[{name:'Author'}],tags:['旧标签'],notes:'keep',materials:[]}));
  const before=structuredClone(existing);
  const incoming=existing.slice(0,12).map(p=>({...p,tags:['方向:磁粉芯与软磁复合材料','体系:Finemet类','类型:实验研究']}));
  const records=parseMetadata(paperTagsMarkdown(incoming));
  assert.deepEqual(records[0].tags,incoming[0].tags);
  const plan=await planBatch([],records,existing,{tagMode:'replace'});
  assert.equal(plan.updated,12);assert.equal(plan.added,0);
  assert.deepEqual(plan.updates.map(p=>p.id),incoming.map(p=>p.id));
  for(const p of plan.updates){assert.deepEqual(p.tags,incoming[0].tags);assert.equal(p.notes,'keep');assert.equal(p.authors,'Original author formatting');}
  assert.deepEqual(existing,before);
  const appended=await planBatch([],records.slice(0,1),existing);
  assert.deepEqual(appended.updates[0].tags,['旧标签',...incoming[0].tags]);
  const blank=parseMetadata('# Materia\n格式版本: 2\n## 文献 1\n- 文献ID: p0\n- 标签: ');
  assert.deepEqual((await planBatch([],blank,existing,{tagMode:'replace'})).updates[0].tags,['旧标签']);
});

test('replacement mode also works when a duplicate PDF accompanies Markdown',async()=>{
  const file=Object.assign(new Blob(['%PDF-1.4']),{name:'a.pdf'});
  const existing=[{id:'a',filename:'a.pdf',title:'A',year:'',tags:['旧标签'],fingerprint:'same'}];
  const plan=await planBatch([file],[{id:'a',tags:['方向:A']}],existing,{tagMode:'replace',fingerprint:async()=> 'same'});
  assert.deepEqual(plan.updates[0].tags,['方向:A']);assert.equal(plan.updated,1);assert.equal(plan.added,0);
});
