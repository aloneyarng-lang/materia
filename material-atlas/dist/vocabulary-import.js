import MarkdownIt from './vendor/markdown-it.mjs';
import {parseDelimited} from './prediction-import.js';
import {cleanVocabulary,termKey,TRANSLATION_LANGUAGES,vocabularyDate} from './study-model.js';

export const VOCABULARY_IMPORT_LIMIT=4*1024*1024;
const markdown=new MarkdownIt();
const languages={
  'zh-CN':['简体中文','中文','chinese','zh'],en:['英语','英文','english'],
  ja:['日语','日文','日本語','japanese'],de:['德语','德文','deutsch','german'],
  ko:['韩语','韩国语','한국어','korean'],fr:['法语','français','french'],
  es:['西班牙语','español','spanish']
};
const columns={
  lang:['语言','表达语言','language','lang'],
  term:['词或句块','词汇与句块','词语','单词','词汇','短语','句块','表达','词条','原文','term','phrase'],
  meaning:['中文提示','中文释义','中文','释义','词义','含义','翻译','meaning','translation'],
  reading:['假名','读音','罗马音','发音','reading'],example:['练习例句','例句','example'],
  status:['状态','掌握情况','status'],last:['最近练习','最近复习','last'],due:['下次复习','下次复习日期','复习日期','due'],
  added:['录入日期','首次录入','收录日期','添加日期','added'],addedSource:['日期来源','addedsource'],
  type:['类型','词条类型','type'],note:['备注','note']
};
const cellText=value=>String(value??'').replace(/<br\s*\/?>/gi,'\n')
  .replace(/\*\*([^*]+)\*\*|`([^`]+)`/g,(_,bold,code)=>bold??code).trim();
function expressionLanguage(value){
  const name=value.normalize('NFKC').toLowerCase();
  return Object.keys(TRANSLATION_LANGUAGES).find(key=>[key.toLowerCase(),...languages[key]].some(alias=>
    name===alias||name.startsWith(alias+' ')||name.startsWith(alias+'（')||name.startsWith(alias+'(')))||'';
}
function tableRecords(headers,rows,lang=''){
  const keys=headers.map(value=>cellText(value).toLowerCase());
  const positions=Object.fromEntries(Object.entries(columns).map(([field,aliases])=>[field,keys.findIndex(key=>aliases.includes(key))]));
  if(positions.term<0||positions.meaning<0||(!lang&&positions.lang<0))return [];
  return rows.map(row=>{
    const record=Object.fromEntries(Object.entries(positions).map(([field,index])=>[field,cellText(row.cells[index])]));
    const type=record.type||(['单词','词汇'].includes(keys[positions.term])?'word':'');
    return {...record,type,lang:record.lang?expressionLanguage(record.lang):lang,line:row.line};
  });
}
function markdownRecords(text){
  const records=[],sections=[];
  let table,row;
  const tokens=markdown.parse(text,{});
  for(const [index,token] of tokens.entries()){
    if(token.type==='heading_open'&&token.level===0){
      const level=Number(token.tag[1]);
      while(sections.length&&sections.at(-1).level>=level)sections.pop();
      sections.push({level,lang:expressionLanguage(cellText(tokens[index+1]?.content))||sections.at(-1)?.lang||''});
    }
    if(token.type==='table_open'&&token.level===0)table={rows:[],header:[]};
    if(!table)continue;
    if(token.type==='tr_open')row={cells:[],line:(token.map?.[0]??0)+1};
    if(row&&token.type==='inline')row.cells.push(token.content);
    if(token.type==='tr_close'){
      if(!table.header.length)table.header=row.cells;
      else table.rows.push(row);
      row=null;
    }
    if(token.type==='table_close'){
      const entries=tableRecords(table.header,table.rows,sections.at(-1)?.lang);
      if(records.length+entries.length>5000)throw new Error('每次可导入 1 至 5000 个词条。');
      records.push(...entries);
      table=null;
    }
  }
  return records;
}
function csvRecords(text){
  const [header,...rows]=parseDelimited(text);
  return header?tableRecords(header,rows.map((cells,index)=>({cells,line:index+2}))):[];
}
function legacyRecords(text){
  const data=JSON.parse(text);
  if(data?.format!=='trilingual-flashcards-v1'||!Array.isArray(data.cards))throw new Error('请选择由三语词卡导出的旧版备份。');
  const cards=[...data.cards],ids=new Set(cards.map(card=>card?.id));
  const scores=data.scores??{};
  for(const [id,score] of Object.entries(scores)){
    if(ids.has(id)||!vocabularyDate(score?.last)||!vocabularyDate(score?.due))continue;
    // The built-in legacy deck exported only its scores. Its keys contain the original prompts.
    try{
      const parts=JSON.parse(id);
      if(Array.isArray(parts)&&parts.length===3&&parts.every(part=>typeof part==='string')){
        const [lang,term,meaning]=parts;
        if(expressionLanguage(lang))cards.push({id,lang,term,meaning});
      }
    }catch{}
  }
  return cards.map((card,index)=>{
    if(!card||typeof card!=='object')return {line:index+1};
    const score=typeof card.id==='string'&&Object.hasOwn(scores,card.id)?scores[card.id]:null;
    const rating={'再练一次':'again','有点难':'hard','记住了':'good'}[score?.label];
    const review=vocabularyDate(score?.last)&&vocabularyDate(score?.due)?{last:score.last,due:score.due,stage:score.stage,rating}:null;
    return {...card,lang:expressionLanguage(cellText(card.lang)),review,line:index+1};
  });
}
function toWord(record){
  const [term,...inlineReading]=cellText(record.term).split(/\r?\n/);
  const translation=cellText(record.meaning),termLanguage=record.lang;
  if(!term.trim()||!translation||!termLanguage)return null;
  const addedOn=vocabularyDate(record.added),dateSource=cellText(record.addedSource);
  const status=cellText(record.status);
  return {
    id:'word-'+crypto.randomUUID(),term:term.trim(),translation,termLanguage,targetLanguage:'zh-CN',
    entryType:/^(词语|词汇|单词|word)$/i.test(cellText(record.type))?'word':'phrase',
    reading:cellText(record.reading)||inlineReading.join('\n').trim(),example:cellText(record.example),note:cellText(record.note),
    addedOn,addedSource:!addedOn?'':/估算|estimated|practice|migration/i.test(dateSource)?'estimated':/导入|^import$/i.test(dateSource)?'import':'source',
    status:record.review?.stage>=3||/^(mastered|已掌握)/i.test(status)?'mastered':
      record.review||/^(learning|学习中|提示后用出|独立用出)/i.test(status)?'learning':'new',
    review:record.review??{last:record.last,due:record.due}
  };
}
export function parseVocabularyImport(text,filename){
  if(new TextEncoder().encode(text).length>VOCABULARY_IMPORT_LIMIT)throw new Error('词表文件不能超过 4 MB。');
  text=text.replace(/^\uFEFF/,'');
  const records=/\.(md|markdown)$/i.test(filename)?markdownRecords(text):
    /\.csv$/i.test(filename)?csvRecords(text):/\.json$/i.test(filename)?legacyRecords(text):null;
  if(!records)throw new Error('请选择 Markdown、CSV 或三语词卡旧版 JSON。');
  if(records.length>5000)throw new Error('每次可导入 1 至 5000 个词条。');
  const words=new Map(),skipped=[];
  let duplicates=0;
  for(const record of records){
    const word=toWord(record);
    if(!word||word.term.length>160||word.translation.length>16000||word.reading.length>1000||word.example.length>4000||word.note.length>4000){
      skipped.push(record.line);
      continue;
    }
    const key=JSON.stringify([termKey(word.term,word.termLanguage),termKey(word.translation,'zh-CN')]);
    if(words.has(key))duplicates++;
    else words.set(key,word);
  }
  if(!words.size)throw new Error('没有可导入的词条。请检查语言及「词或句块」「中文提示」两列。');
  return {words:cleanVocabulary([...words.values()]),skipped,duplicates};
}
