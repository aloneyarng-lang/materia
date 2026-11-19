import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {parseVocabularyImport} from '../dist/vocabulary-import.js';
import {editVocabulary,mergeVocabulary,vocabularyIsDue} from '../dist/study-model.js';
import {LocalLibrary} from '../desktop/library.mjs';
import {createBackup,readBackup} from '../dist/storage.js';

const markdown=`# 词汇与句块

## 英语
| 词或句块 | 中文提示 | 练习例句 | 录入日期 |
| --- | --- | --- | --- |
| **It depends on …** | 这取决于…… | It depends on the weather. | 2026-11-09 |
| It depends on … | 另一种提示 | It depends on the time. | |
| It depends on … | 这取决于…… | | |
| | 缺少表达 | | |

~~~md
## 德语
| 表达 | 释义 |
| --- | --- |
| Nicht übernehmen | 示例 |
~~~

## 日语（口语）
| 词或句块 | 中文提示 | 练习例句 |
| --- | --- | --- |
| 予約する<br>よやくする | 预约 | 予約します。<br>明日です。 |
`;

test('Markdown imports senses, language sections and readings while reporting bad rows and ignoring fenced examples',()=>{
  const {words,duplicates,skipped}=parseVocabularyImport(markdown,'词汇与句块.md');
  assert.equal(duplicates,1);
  assert.deepEqual(skipped,[9]);
  assert.deepEqual(words.map(word=>[word.termLanguage,word.term,word.translation]),[
    ['en','It depends on …','这取决于……'],['en','It depends on …','另一种提示'],['ja','予約する','预约']
  ]);
  assert.equal(words[0].addedOn,'2026-11-09');
  assert.equal(words[2].reading,'よやくする');
  assert.equal(words[2].example,'予約します。\n明日です。');
});

test('CSV accepts the trilingual deck format and legacy JSON restores ratings',()=>{
  const csv='\uFEFF语言,词或句块,中文提示,读音,练习例句,录入日期,日期来源\r\n德语,der Termin,预约,,"Er sagte: ""Morgen"".\nIch komme.",2026-11-09,历史练习日期（估算）';
  const [card]=parseVocabularyImport(csv,'Flashcards.csv').words;
  assert.equal(card.example,'Er sagte: "Morgen".\nIch komme.');
  assert.equal(card.addedSource,'estimated');
  const json=JSON.stringify({format:'trilingual-flashcards-v1',cards:[{id:'legacy',lang:'ja',term:'予約する',meaning:'预约'}],
    scores:{legacy:{last:'2026-11-09',due:'2026-11-16',stage:2,label:'记住了'}}});
  const [restored]=parseVocabularyImport(json,'Flashcards-legacy.json').words;
  assert.deepEqual(restored.review,{last:'2026-11-09',due:'2026-11-16',stage:2,rating:'good',ratedAt:0});
  const builtInBackup=JSON.stringify({format:'trilingual-flashcards-v1',cards:[],
    scores:{[JSON.stringify(['ja','予約する','预约'])]:{...restored.review,label:'记住了'}}});
  assert.deepEqual(parseVocabularyImport(builtInBackup,'Flashcards-legacy.json').words[0].review,restored.review);
  assert.throws(()=>parseVocabularyImport('语言,表达,释义\n德语,der Termin,"预约','broken.csv'),/引号/);
});

test('repeat imports and backups preserve edited meanings, PDF links, and independent senses',()=>{
  const stamp=(day)=>new Date(2026,10,day,12).getTime();
  const original={id:'existing',term:'It depends on …',translation:'这取决于……',targetLanguage:'zh-CN',
    note:'笔记',sources:[{paperId:'paper',page:2}]};
  const operation=()=>({type:'import',words:parseVocabularyImport(markdown,'words.md').words});
  let rows=editVocabulary([original],operation(),stamp(19));
  assert.equal(rows.length,3);
  assert.equal(rows[0].id,'existing');
  assert.equal(rows[0].sources[0].page,2);
  rows=editVocabulary(rows,{type:'update',id:'existing',patch:{translation:'我改过的释义',entryType:'word'}},stamp(19)+1);
  rows=editVocabulary(rows,{type:'review',id:'existing',rating:'good'},stamp(19)+2);
  const imported=editVocabulary(rows,operation(),stamp(20));
  assert.deepEqual(imported,rows);
  assert.deepEqual(mergeVocabulary(rows,imported),rows);
  assert.equal(imported[0].review.due,'2026-11-22');
  assert.equal(imported[0].note,'笔记');
});

test('review uses calendar days, retains early due dates and survives reopening and full backup',async()=>{
  const folder=await mkdtemp(path.join(tmpdir(),'materia-vocabulary-'));
  try{
    const library=await new LocalLibrary(folder).init(),[word]=parseVocabularyImport(markdown,'words.md').words;
    await library.updateStudy({kind:'vocabulary',operation:{type:'import',words:[word]}});
    const op=rating=>({kind:'vocabulary',operation:{type:'review',id:word.id,rating}});
    await library.updateStudy(op('again'));
    await library.updateStudy(op('good'));
    const reopened=await new LocalLibrary(folder).init();
    const [saved]=reopened.getStudy().vocabulary;
    assert.equal(saved.review.stage,1);
    assert.equal(vocabularyIsDue(saved,saved.review.last),false);
    assert.equal(vocabularyIsDue(saved,saved.review.due),true);
    const early=editVocabulary([saved],op('good').operation,saved.review.ratedAt+1)[0];
    assert.equal(early.review.due,saved.review.due);
    const backup=readBackup(await createBackup([],[],{},[],reopened.getStudy()));
    assert.deepEqual(backup.study.vocabulary[0],saved);
  }finally{await rm(folder,{recursive:true,force:true});}
});
