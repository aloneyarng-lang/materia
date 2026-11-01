export const TRANSLATION_LANGUAGES={'zh-CN':'简体中文',en:'英语',ja:'日语',de:'德语',ko:'韩语',fr:'法语',es:'西班牙语'};
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const string=(value,max,label)=>{if(typeof value!=='string'||value.length>max)throw new Error(`${label}格式不正确或过长。`);return value.trim();};
const id=value=>{if(typeof value!=='string'||!/^[a-z\d_-]{1,120}$/i.test(value))throw new Error('词条 ID 无效。');return value;};
const language=value=>{if(!own(TRANSLATION_LANGUAGES,value))throw new Error('不支持的翻译目标语言。');return value;};
const time=value=>Number.isFinite(value)&&value>=0?value:0;
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
export const termKey=(term,targetLanguage)=>`${language(targetLanguage)}\n${term.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase()}`;
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
  return{id:id(value.id),term,translation,targetLanguage:language(value.targetLanguage),note:string(value.note??'',4000,'词汇备注'),status,sources:sources(value.sources),createdAt:time(value.createdAt),updatedAt:time(value.updatedAt)};
}
export function cleanVocabulary(value=[]){
  if(!Array.isArray(value)||value.length>5000)throw new Error('生词本最多保存 5000 个词条。');const ids=new Set(),keys=new Set();const rows=value.map(value=>{const row=cleanWord(value),key=termKey(row.term,row.targetLanguage);if(ids.has(row.id)||keys.has(key))throw new Error('生词本中有重复词条或 ID。');ids.add(row.id);keys.add(key);return row;});if(bytes(rows)>12*1024*1024)throw new Error('生词本超过 12 MB，请先导出整理。');return rows;
}
export function mergeVocabulary(current,incoming){
  const rows=cleanVocabulary(current);for(const incomingRow of cleanVocabulary(incoming)){const key=termKey(incomingRow.term,incomingRow.targetLanguage),index=rows.findIndex(row=>termKey(row.term,row.targetLanguage)===key);if(index<0){if(rows.some(row=>row.id===incomingRow.id))throw new Error('生词 ID 冲突，请先修改备份词条 ID。');rows.push(incomingRow);}else{const old=rows[index],newer=incomingRow.updatedAt>old.updatedAt?incomingRow:old;rows[index]={...newer,id:old.id,sources:sources([...new Map([...old.sources,...incomingRow.sources].map(row=>[sourceKey(row),row])).values()].slice(-30))};}}
  return cleanVocabulary(rows);
}
export function editVocabulary(current,operation,now=Date.now()){
  const rows=cleanVocabulary(current);if(!object(operation))throw new Error('生词操作无效。');
  if(operation.type==='add'){
    const incoming=cleanWord({...operation.word,status:'new',note:operation.word?.note??'',sources:operation.word?.sources??[],createdAt:now,updatedAt:now}),key=termKey(incoming.term,incoming.targetLanguage),index=rows.findIndex(row=>termKey(row.term,row.targetLanguage)===key);
    if(index<0)rows.push(incoming);else{const old=rows[index];rows[index]={...old,updatedAt:now,sources:sources([...new Map([...old.sources,...incoming.sources].map(row=>[sourceKey(row),row])).values()].slice(-30))};}
  }else if(operation.type==='delete'){const index=rows.findIndex(row=>row.id===id(operation.id));if(index>=0)rows.splice(index,1);}
  else if(operation.type==='update'){const row=rows.find(row=>row.id===id(operation.id));if(!row)throw new Error('词条已被删除，请刷新生词本。');const patch=operation.patch;if(!object(patch))throw new Error('词条修改格式无效。');for(const field of ['translation','note','status'])if(patch[field]!==undefined)row[field]=patch[field];row.updatedAt=now;}
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
export function vocabularyMarkdown(rows){return '# 生词本\n\n'+cleanVocabulary(rows).map(row=>`## ${row.term.replace(/[\r\n]/g,' ')}\n\n${row.translation}\n\n目标语言：${TRANSLATION_LANGUAGES[row.targetLanguage]} · 状态：${{new:'未学习',learning:'学习中',mastered:'已掌握'}[row.status]}\n${row.note?'\n备注：'+row.note+'\n':''}${row.sources.map(s=>`\n出处：${s.title||s.paperId} · 第 ${s.page} 页${s.quote?'\n\n> '+s.quote.replace(/\n/g,'\n> '):''}\n`).join('')}`).join('\n');}
