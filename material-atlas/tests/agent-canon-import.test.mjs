import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createDesktopCorpus} from '../desktop/agent-character-corpus.mjs';
import {REZE_ID,GANYU_ID} from '../dist/agent-character-memory.js';

const load=async id=>JSON.parse(await readFile(new URL(`../dist/assets/characters/${id}/corpus.json`,import.meta.url),'utf8'));

test('imported source dialogue is trilingual, speaker-scoped, and separate from authored examples',async()=>{
  for(const [id,speaker,min] of [[REZE_ID,'Reze',23],[GANYU_ID,'Ganyu',400]]){
    const corpus=await load(id),original=corpus.records.filter(r=>r.kind==='dialogue');
    assert.ok(original.length>=min);
    assert.ok(corpus.records.some(r=>r.kind==='authored_style_example'));
    for(const row of original){
      assert.match(row.source.url,/^https:\/\//);
      assert.ok(row.lines.every(line=>line.speaker.includes(speaker)));
      assert.ok(row.lines.every(line=>['zh-CN','en','ja'].every(l=>line.texts[l]?.trim())));
      if(id===REZE_ID){
        assert.equal(row.source.primaryVerified,false);
        assert.equal(row.lines[0].sourceText,row.lines[0].texts.ja);
        assert.deepEqual(row.lines[0].translatedLanguages,['zh-CN','en']);
      }else{
        assert.equal(row.source.alignment,'exact_ingame_filename_without_language');
        assert.ok(row.source.gamePath.includes('ganyu'));
        for(const locale of ['zh-CN','en','ja'])assert.ok(row.source.assets[locale].key);
      }
    }
  }
});

test('actual Reze manga quotes are retrieved in Chinese, English, and Japanese with honest translation labels',async()=>{
  const find=createDesktopCorpus();
  for(const [query,locale,id,label] of [
    ['咖啡','zh-CN','reze-manga-cafe-first','adapted'],
    ['田舎のネズミ','ja','reze-manga-quote-02','source'],
    ['never been to school','en','reze-manga-quote-07','adapted'],
  ]){
    const result=await find({characterId:REZE_ID,query,locale});
    const match=result.matches.find(r=>r.id===id);
    assert.ok(match,`${query}: ${result.matches.map(r=>r.id)}`);
    assert.equal(match.translation,label);
    assert.equal(match.primaryVerified,false);
    assert.ok(match.lines.every(l=>l.speaker.includes('Reze')));
  }
});

test('Ganyu game localization is retrieved as original game text and never as machine translation',async()=>{
  const find=createDesktopCorpus();
  for(const [query,locale] of [['草地','zh-CN'],['heartbeat','en'],['鼓動','ja']]){
    const result=await find({characterId:GANYU_ID,query,locale});
    assert.ok(result.count>=405);
    const match=result.matches.find(r=>r.gamePath?.includes('explore_idle_02'));
    assert.ok(match,`${query}: ${result.matches.map(r=>r.gamePath||r.id)}`);
    assert.equal(match.method,'game_text_metadata');
    assert.equal(match.translation,locale==='zh-CN'?'source':'official');
    assert.ok(match.lines.every(l=>l.speaker.includes('Ganyu')));
  }
  const result=await find({characterId:REZE_ID,query:'heartbeat',locale:'en',browse:true});
  assert.ok(result.matches.every(r=>r.variant==='reze'));
});

test('the secondary Reze chapter conflict remains explicit instead of inventing a precise location',async()=>{
  const corpus=await load(REZE_ID);
  const quote=corpus.records.find(r=>r.id==='reze-manga-quote-02');
  assert.equal(quote.source.chapter,null);
  assert.deepEqual(quote.source.chapterCandidates,[41,42]);
  assert.ok(quote.source.locationNote.includes('disagree'));
});
