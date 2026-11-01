import test from 'node:test';
import assert from 'node:assert/strict';
import {lookupOfflineDictionary,searchOfflineDictionary,offlineDictionarySize} from '../dist/offline-dictionary.js';

test('offline dictionary resolves exact terms, phrases and English inflections without network state',()=>{
  assert.equal(lookupOfflineDictionary('alloy','zh-CN').translation,'合金');
  assert.equal(lookupOfflineDictionary('tensile strength','de').translation,'Zugfestigkeit');
  assert.equal(lookupOfflineDictionary('alloys','ja').translation,'合金');
  assert.equal(lookupOfflineDictionary('  grain–boundary  ','zh-CN').translation,'晶界');
  assert.ok(offlineDictionarySize()>=80);
});
test('offline dictionary supports reverse Chinese, Japanese and German lookup',()=>{
  assert.equal(lookupOfflineDictionary('晶界','en').translation,'grain boundary');
  assert.equal(lookupOfflineDictionary('焼結','zh-CN').translation,'烧结');
  assert.equal(lookupOfflineDictionary('Korrosion','ja').translation,'腐食');
});
test('offline dictionary fails closed for unsupported languages and bounds search results',()=>{
  assert.equal(lookupOfflineDictionary('alloy','fr').unsupported,true);
  assert.deepEqual(searchOfflineDictionary('not-in-dictionary','zh-CN'),[]);
  const rows=searchOfflineDictionary('','zh-CN',7);assert.equal(rows.length,7);assert.ok(rows.every(row=>row.translation&&row.term));
});
