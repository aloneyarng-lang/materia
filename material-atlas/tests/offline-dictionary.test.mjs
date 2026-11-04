import test from 'node:test';
import assert from 'node:assert/strict';
import {lookupOfflineDictionary as lookup,searchOfflineDictionary as search,offlineDictionarySize} from '../dist/offline-dictionary.js';
import {readFile} from 'node:fs/promises';
import manifest from '../dist/dictionaries/manifest.js';
import languageManifest from '../dist/language-dictionaries/manifest.js';

test('full bundled dictionaries work with remote networking disabled',async()=>{
  const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('Network forbidden');};
  try {
    for(const word of ['apple','serendipity','photosynthesis','thermodynamics','computer']){
      const zh=await lookup(word,'zh-CN');assert.equal(zh.found,true,word);assert.ok(/[\u3400-\u9fff]/u.test(zh.translation));assert.ok(zh.sources[0].includes('ECDICT'));
      const en=await lookup(word,'en');assert.equal(en.found,true,word);assert.ok(en.sources[0].includes('WordNet'));
    }
    assert.ok(offlineDictionarySize()>750000);
    assert.match((await lookup('alloys','ja')).translation,/合金/);
    assert.equal((await lookup('晶界','en')).translation,'grain boundary');
    assert.equal((await lookup('alloy','fr')).unsupported,true);
    assert.equal((await lookup('zzzxunknownword','zh-CN')).found,false);
    const rows=await search('apple','zh-CN',7);assert.ok(rows.length<=7);assert.equal(rows[0].term,'apple');
    assert.deepEqual(await search('','zh-CN'),[]);
  }finally{globalThis.fetch=original;}
});
test('Japanese and German dictionaries resolve both directions offline, including kana and umlauts',async()=>{
  const fetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('External networking forbidden');};
  try{
    for(const word of ['猫','ねこ','食べる','図書館']){
      const row=await lookup(word,'en');assert.equal(row.found,true,word);assert.equal(row.sourceLanguage,'ja');assert.ok(row.sources.some(s=>s.includes('JMdict')));
    }
    assert.match((await lookup('cat','ja')).translation,/猫/);
    assert.match((await lookup('apple','ja')).translation,/りんご/);
    for(const [word,expected] of [['Haus',/house/],['Wasser',/water/],['Bücher',/books/],['Straße',/street|road/]]){
      const row=await lookup(word,'en');assert.equal(row.found,true,word);assert.match(row.translation,expected);assert.ok(row.sources.some(s=>s.includes('Ding')));
    }
    assert.match((await lookup('water','de')).translation,/Wasser/);
    for(const word of ['猫','Haus']){const row=await lookup(word,'zh-CN');assert.equal(row.indirect,true);assert.match(row.translation,/经英语转译/);}
    assert.match((await lookup('Haus','zh-CN')).translation,/房|家|住宅/);
    const rows=await search('図書','en',5);assert.ok(rows.length>0&&rows.length<=5);assert.ok(rows.every(r=>r.sources.some(s=>s.includes('JMdict'))));
    assert.ok(languageManifest.counts.jmdictEntries>200000);assert.ok(languageManifest.counts.dingEntries>200000);
  }finally{globalThis.fetch=fetch;}
});
test('Japanese and German source archives, licenses and all lookup shards ship together',async()=>{
  for(const key of languageManifest.shards)assert.ok((await readFile(new URL('../dist/language-dictionaries/'+key+'.js',import.meta.url))).length>15);
  for(const name of ['JMdict_e.gz','de-en.txt.gz','JMDICT-LICENSE.html','JMDICT-DOCUMENTATION.html','CC-BY-SA-4.0.txt','DING-COPYING.txt','DING-README.txt'])assert.ok((await readFile(new URL('../dist/language-dictionaries/'+name,import.meta.url))).length>100);
});
test('every dictionary shard and both redistribution licenses are bundled',async()=>{
  for(const key of manifest.shards)assert.ok((await readFile(new URL('../dist/dictionaries/'+key+'.js',import.meta.url))).length>15);
  for(const name of ['WORDNET','ECDICT'])assert.ok((await readFile(new URL('../dist/dictionaries/'+name+'-LICENSE.txt',import.meta.url),'utf8')).includes('Permission'));
});
