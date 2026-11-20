export const TRANSLATION_LANGUAGES={'zh-CN':'简体中文',en:'英语',ja:'日语',de:'德语',ko:'韩语',fr:'法语',es:'西班牙语'};
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const string=(value,max,label)=>{if(typeof value!=='string'||value.length>max)throw new Error(`${label}格式不正确或过长。`);return value.trim();};
const id=value=>{if(typeof value!=='string'||!/^[a-z\d_-]{1,120}$/i.test(value))throw new Error('词条 ID 无效。');return value;};
const language=value=>{if(!own(TRANSLATION_LANGUAGES,value))throw new Error('不支持的翻译目标语言。');return value;};
const time=value=>Number.isFinite(value)&&value>=0?value:0;
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
const normalizeText=value=>value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
export const termKey=(term,targetLanguage)=>`${language(targetLanguage)}\n${normalizeText(term)}`;
export const REVIEW_INTERVALS=[3,7,14,30,60];
export const REVIEW_RATINGS=['again','hard','good'];
export function vocabularyDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return '';
  const date=new Date(value+'T00:00:00Z');
  return Number.isFinite(+date)&&date.toISOString().slice(0,10)===value?value:'';
}
export function vocabularyToday(date=new Date()){
  return [date.getFullYear(),date.getMonth()+1,date.getDate()].map((part,index)=>String(part).padStart(index?2:4,'0')).join('-');
}
const addDays=(day,days)=>new Date(Date.parse(day+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
function cleanReview(value={}){
  if(!object(value))throw new Error('复习记录无效。');
  return {last:vocabularyDate(value.last),due:vocabularyDate(value.due),
    stage:Number.isInteger(value.stage)&&value.stage>=0&&value.stage<=REVIEW_INTERVALS.length?value.stage:0,
    rating:REVIEW_RATINGS.includes(value.rating)?value.rating:'',ratedAt:time(value.ratedAt)};
}
export const vocabularyIsDue=(word,day=vocabularyToday())=>!word.review?.due||word.review.due<=day;
function rateWord(row,rating,now){
  if(!REVIEW_RATINGS.includes(rating))throw new Error('复习评分无效。');
  const day=vocabularyToday(new Date(now)),previous=row.review;
  let stage=rating==='again'?0:Math.max(0,previous.stage-1),due=addDays(day,1);
  if(rating==='good'){
    const scheduled=previous.due>day&&!(previous.last===day&&previous.rating==='again');
    stage=scheduled?previous.stage:Math.min(previous.stage+1,REVIEW_INTERVALS.length);
    due=scheduled?previous.due:addDays(day,REVIEW_INTERVALS[stage-1]);
  }
  row.review={last:day,due,stage,rating,ratedAt:now};
  row.status=stage>=3?'mastered':'learning';
  row.updatedAt=now;
}
export function cleanTranslationPreferences(value={}){return{targetLanguage:own(TRANSLATION_LANGUAGES,value?.targetLanguage)?value.targetLanguage:'zh-CN',instant:false};}
export function cleanTranslationRequest(value){
  if(!object(value)||!['selection','page'].includes(value.mode))throw new Error('翻译请求格式无效。');
  const text=string(value.text,value.mode==='selection'?4000:12000,'待翻译文字');if(!text)throw new Error('没有可翻译的文字。');
  return{mode:value.mode,text,targetLanguage:language(value.targetLanguage),context:string(value.context??'',1200,'上下文'),title:string(value.title??'',1000,'文献标题')};
}
export function pdfPageText(content){
  const lines=[];let line='';for(const item of content?.items||[]){if(typeof item.str!=='string')continue;line+=(line&&!/\s$/.test(line)&&item.str&&!/^\s/.test(item.str)?' ':'')+item.str;if(item.hasEOL){if(line.trim())lines.push(line.trim());line='';}}
  if(line.trim())lines.push(line.trim());return lines.join('\n');
}
export function translationChunks(text,max=6000){
  if(typeof text!=='string'||text.length>120000)throw new Error('当前页文字过长，请使用划词翻译。');
  const chunks=[];let remaining=text.trim();while(remaining){let end=Math.min(max,remaining.length);if(end<remaining.length){const boundary=Math.max(remaining.lastIndexOf('\n',end),remaining.lastIndexOf(' ',end));if(boundary>end/2)end=boundary;else if(/[\uD800-\uDBFF]/.test(remaining[end-1]))end--;}
    chunks.push(remaining.slice(0,end).trim());remaining=remaining.slice(end).trim();}return chunks;
}
function source(value){
  if(!object(value))throw new Error('词条出处无效。');const paperId=string(value.paperId??'',120,'文献 ID');if(paperId&&!/^[a-z\d_-]+$/i.test(paperId))throw new Error('出处文献 ID 无效。');
  if(!Number.isInteger(value.page)||value.page<1||value.page>100000)throw new Error('出处页码无效。');
  return{paperId,title:string(value.title??'',1000,'出处标题'),page:value.page,fingerprint:string(value.fingerprint??'',128,'PDF 标识'),quote:string(value.quote??'',1200,'原句')};
}
const sourceKey=row=>JSON.stringify([row.paperId,row.page,row.fingerprint,row.quote]);
function sources(rows=[]){if(!Array.isArray(rows)||rows.length>30)throw new Error('每个词条最多保存 30 处出处。');return [...new Map(rows.map(value=>{const row=source(value);return[sourceKey(row),row];})).values()];}
function cleanWord(value){
  if(!object(value))throw new Error('生词条目无效。');const term=string(value.term,160,'词语'),translation=string(value.translation,16000,'词义');if(!term||!translation)throw new Error('词语和词义不能为空。');
  const status=value.status??'new';if(!['new','learning','mastered'].includes(status))throw new Error('词汇学习状态无效。');
  const termLanguage=value.termLanguage?language(value.termLanguage):'';
  const entryType=value.entryType??'word';
  if(!['word','phrase'].includes(entryType))throw new Error('词条类型无效。');
  const addedOn=vocabularyDate(value.addedOn);
  return{id:id(value.id),term,translation,targetLanguage:language(value.targetLanguage),termLanguage,entryType,
    importMeaning:string(value.importMeaning??'',16000,'原词表释义'),
    reading:string(value.reading??'',1000,'读音'),example:string(value.example??'',4000,'例句'),
    note:string(value.note??'',4000,'词汇备注'),status,sources:sources(value.sources),
    addedOn,addedSource:addedOn&&['source','estimated','import'].includes(value.addedSource)?value.addedSource:'',
    review:cleanReview(value.review),createdAt:time(value.createdAt),updatedAt:time(value.updatedAt)};
}
const baseKey=row=>termKey(row.term,row.targetLanguage);
const senseKey=row=>JSON.stringify([baseKey(row),row.termLanguage,normalizeText(row.importMeaning||row.translation)]);
const vocabularyKey=row=>row.termLanguage?senseKey(row):baseKey(row);
const joinedSources=(a,b)=>[...new Map([...a,...b].map(row=>[sourceKey(row),row])).values()].slice(-30);
const reviewIsNewer=(candidate,previous)=>candidate.ratedAt!==previous.ratedAt?candidate.ratedAt>previous.ratedAt:
  candidate.last!==previous.last?candidate.last>previous.last:candidate.due>previous.due;
function addedDate(old,incoming){
  if(!old.addedOn||old.addedSource!=='source'&&incoming.addedSource==='source'&&
    (old.addedSource==='estimated'||incoming.addedOn<old.addedOn)){
    return {addedOn:incoming.addedOn,addedSource:incoming.addedSource};
  }
  return {addedOn:old.addedOn,addedSource:old.addedSource};
}
export function cleanVocabulary(value=[]){
  if(!Array.isArray(value)||value.length>5000)throw new Error('生词本最多保存 5000 个词条。');const ids=new Set(),keys=new Set();const rows=value.map(value=>{const row=cleanWord(value),key=vocabularyKey(row);if(ids.has(row.id)||keys.has(key))throw new Error('生词本中有重复词条或 ID。');ids.add(row.id);keys.add(key);return row;});if(bytes(rows)>12*1024*1024)throw new Error('生词本超过 12 MB，请先导出整理。');return rows;
}
export function mergeVocabulary(current,incoming){
  const rows=cleanVocabulary(current);
  for(const entry of cleanVocabulary(incoming)){
    let index=rows.findIndex(row=>row.id===entry.id);
    if(index>=0&&(baseKey(rows[index])!==baseKey(entry)||
      rows[index].termLanguage&&entry.termLanguage&&rows[index].termLanguage!==entry.termLanguage)){
      throw new Error('生词 ID 冲突，请先修改备份词条 ID。');
    }
    if(index<0)index=rows.findIndex(row=>vocabularyKey(row)===vocabularyKey(entry));
    if(index<0){
      const compatible=rows.filter(row=>Boolean(row.termLanguage)!==Boolean(entry.termLanguage)&&
        baseKey(row)===baseKey(entry)&&normalizeText(row.importMeaning||row.translation)===normalizeText(entry.importMeaning||entry.translation));
      if(compatible.length===1)index=rows.indexOf(compatible[0]);
    }
    if(index<0){rows.push(entry);continue;}
    const old=rows[index],newer=entry.updatedAt>old.updatedAt?entry:old;
    const other=newer===entry?old:entry;
    rows[index]={...newer,id:old.id,termLanguage:newer.termLanguage||other.termLanguage,
      importMeaning:newer.importMeaning||other.importMeaning,
      entryType:newer.termLanguage?newer.entryType:other.termLanguage?other.entryType:newer.entryType,
      reading:newer.reading||other.reading,example:newer.example||other.example,
      ...addedDate(old,entry),sources:joinedSources(old.sources,entry.sources),
      review:reviewIsNewer(entry.review,old.review)?entry.review:old.review};
  }
  return cleanVocabulary(rows);
}
function importWords(rows,words,now){
  if(!Array.isArray(words)||!words.length||words.length>5000)throw new Error('每次可导入 1 至 5000 个词条。');
  const bySense=new Map(),legacy=new Map(),ids=new Set();
  rows.forEach((row,index)=>{
    ids.add(row.id);
    (row.termLanguage?bySense:legacy).set(senseKey(row),index);
  });
  for(const word of words){
    const entry=cleanWord({...word,targetLanguage:'zh-CN',importMeaning:word?.translation,sources:[],createdAt:now,updatedAt:now});
    if(!entry.termLanguage)throw new Error('请选择表达语言。');
    if(!entry.addedOn){entry.addedOn=vocabularyToday(new Date(now));entry.addedSource='import';}
    const key=senseKey(entry),legacyKey=senseKey({...entry,termLanguage:''});
    const index=bySense.get(key)??legacy.get(legacyKey);
    if(index===undefined){
      if(ids.has(entry.id))throw new Error('生词 ID 冲突，请重新导入。');
      bySense.set(key,rows.length);ids.add(entry.id);rows.push(entry);
      continue;
    }
    const old=rows[index],updated={...old,termLanguage:entry.termLanguage,importMeaning:entry.importMeaning,
      entryType:old.termLanguage?old.entryType:entry.entryType,
      reading:entry.reading||old.reading,example:entry.example||old.example,note:old.note||entry.note,
      status:old.status==='new'?entry.status:old.status,...addedDate(old,entry),
      review:old.review.ratedAt||!reviewIsNewer(entry.review,old.review)?old.review:entry.review};
    if(JSON.stringify(updated)!==JSON.stringify(old))rows[index]={...updated,updatedAt:now};
    bySense.set(key,index);legacy.delete(legacyKey);
  }
}
export function editVocabulary(current,operation,now=Date.now()){
  const rows=cleanVocabulary(current);if(!object(operation))throw new Error('生词操作无效。');
  if(operation.type==='add'){
    const incoming=cleanWord({...operation.word,status:'new',note:operation.word?.note??'',sources:operation.word?.sources??[],createdAt:now,updatedAt:now});
    let index=rows.findIndex(row=>vocabularyKey(row)===vocabularyKey(incoming));
    if(index<0&&!incoming.termLanguage){
      const matches=rows.filter(row=>baseKey(row)===baseKey(incoming)&&normalizeText(row.translation)===normalizeText(incoming.translation));
      if(matches.length===1)index=rows.indexOf(matches[0]);
    }
    if(index<0)rows.push(incoming);else{const old=rows[index];rows[index]={...old,updatedAt:now,sources:joinedSources(old.sources,incoming.sources)};}
  }else if(operation.type==='delete'){const index=rows.findIndex(row=>row.id===id(operation.id));if(index>=0)rows.splice(index,1);}
  else if(operation.type==='update'||operation.type==='review'){
    const row=rows.find(row=>row.id===id(operation.id));if(!row)throw new Error('词条已被删除，请刷新生词本。');
    if(operation.type==='review')rateWord(row,operation.rating,now);
    else{
      const patch=operation.patch;if(!object(patch))throw new Error('词条修改格式无效。');
      for(const field of ['translation','note','status','entryType','reading','example'])if(patch[field]!==undefined)row[field]=patch[field];
      row.updatedAt=now;
    }
  }
  else if(operation.type==='import')importWords(rows,operation.words,now);
  else if(operation.type==='restore')return mergeVocabulary(rows,[operation.word]);else throw new Error('不支持的生词操作。');
  return cleanVocabulary(rows);
}
function cacheRow(value){
  if(!object(value)||!/^tx-[a-f\d]{64}$/.test(value.key||''))throw new Error('译文缓存标识无效。');const row={key:value.key,paperId:string(value.paperId,120,'文献 ID'),fingerprint:string(value.fingerprint??'',128,'PDF 标识'),page:value.page,targetLanguage:language(value.targetLanguage),sourceText:string(value.sourceText,120000,'原文'),translatedText:string(value.translatedText,180000,'译文'),updatedAt:time(value.updatedAt)};
  if(!/^[a-z\d_-]+$/i.test(row.paperId)||!Number.isInteger(row.page)||row.page<1||row.page>100000||!row.sourceText||!row.translatedText)throw new Error('译文缓存内容无效。');return row;
}
export function cleanTranslationCache(value=[]){if(!Array.isArray(value)||value.length>300)throw new Error('译文缓存最多 300 页。');const rows=value.map(cacheRow);if(new Set(rows.map(row=>row.key)).size!==rows.length||bytes(rows)>16*1024*1024)throw new Error('译文缓存重复或超过 16 MB。');return rows;}
export function saveTranslationCache(current,entry){const row=cacheRow(entry),rows=cleanTranslationCache(current).filter(old=>old.key!==row.key);rows.push(row);while(rows.length>300||bytes(rows)>16*1024*1024)rows.shift();return rows;}
export function cleanStudy(value={}){if(!object(value))throw new Error('阅读辅助数据无效。');return{preferences:cleanTranslationPreferences(value.preferences),vocabulary:cleanVocabulary(value.vocabulary),cache:cleanTranslationCache(value.cache)};}
export function applyStudyOperation(settings,operation){
  if(!object(operation))throw new Error('阅读辅助操作无效。');
  if(operation.kind==='vocabulary'){settings.vocabulary=editVocabulary(settings.vocabulary,operation.operation);return settings.vocabulary;}
  if(operation.kind==='cache'){settings.translationCache=saveTranslationCache(settings.translationCache,operation.entry);return settings.translationCache;}
  if(operation.kind==='preferences'){settings.translationPreferences=cleanTranslationPreferences(operation.preferences);return settings.translationPreferences;}
  throw new Error('不支持的阅读辅助操作。');
}
export function vocabularyMarkdown(rows){
  return '# 生词本\n\n'+cleanVocabulary(rows).map(row=>{
    const details=[
      row.termLanguage&&['表达语言',TRANSLATION_LANGUAGES[row.termLanguage]],
      ['目标语言',TRANSLATION_LANGUAGES[row.targetLanguage]],
      ['类型',row.entryType==='phrase'?'短语 / 句块':'单词'],
      ['状态',{new:'未学习',learning:'学习中',mastered:'已掌握'}[row.status]],
      ['读音',row.reading],['例句',row.example],['备注',row.note],
      ['录入日期',row.addedOn],['最近练习',row.review.last],['下次复习',row.review.due]
    ].filter(detail=>detail&&detail[1]).map(([label,value])=>`${label}：${value}\n`).join('\n');
    const origins=row.sources.map(s=>`\n出处：${s.title||s.paperId} · 第 ${s.page} 页${s.quote?'\n\n> '+s.quote.replace(/\n/g,'\n> '):''}\n`).join('');
    return `## ${row.term.replace(/[\r\n]/g,' ')}\n\n${row.translation}\n\n${details}${origins}`;
  }).join('\n');
}
