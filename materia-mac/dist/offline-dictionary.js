import manifest from './dictionaries/manifest.js';
import languageManifest from './language-dictionaries/manifest.js';
import {lookupOfflineDictionary as lookupTerm,searchOfflineDictionary as searchTerms,OFFLINE_DICTIONARY_LANGUAGES} from './offline-terminology.js';
export {OFFLINE_DICTIONARY_LANGUAGES};
export const DICTIONARY_SOURCES={ecdict:'ECDICT 开放英汉词典',wordnet:'Princeton WordNet 3.0',jmdict:'JMdict · EDRDG',ding:'Ding 德英词典 · Frank Richter',terminology:'材料术语补充表'};
const normalize=value=>String(value??'').normalize('NFKC').trim().toLowerCase().replace(/[‐‑‒–—−-]/g,' ').replace(/^[\s.,;:!?()[\]{}“”"'‘’]+|[\s.,;:!?()[\]{}“”"'‘’]+$/g,'').replace(/\s+/g,' ');
const bucket=word=>Array.from(word.slice(0,2)).map(c=>c.charCodeAt(0).toString(16).padStart(4,'0')).join('');
const cache=new Map(),known=new Set(manifest.shards);
const languageCache=new Map(),languageKnown=new Set(languageManifest.shards);
const languageBucket=q=>q.charCodeAt(0)>127?'u'+(q.codePointAt(0)%128):bucket(q);
async function loadLanguage(key){
  if(!languageKnown.has(key))return {};
  if(!languageCache.has(key))languageCache.set(key,import(`./language-dictionaries/${key}.js`).then(m=>m.default).catch(error=>{languageCache.delete(key);throw error;}));
  return languageCache.get(key);
}
async function recordsFor(word){return [...((await load(bucket(word)))[word]||[]),...((await loadLanguage(languageBucket(word)))[word]||[])];}
async function load(key){
  if(!known.has(key))return {};
  if(!cache.has(key))cache.set(key,import(`./dictionaries/${key}.js`).then(m=>m.default).catch(error=>{cache.delete(key);throw error;}));
  return cache.get(key);
}
function candidates(q){
  const words=[q];
  if(q.endsWith('ies'))words.push(q.slice(0,-3)+'y');
  if(q.endsWith('ing')){const stem=q.slice(0,-3);words.push(stem,stem+'e');if(/([a-z])\1$/.test(stem))words.push(stem.slice(0,-1));}
  if(q.endsWith('ed'))words.push(q.slice(0,-2),q.slice(0,-1));
  if(q.endsWith('es'))words.push(q.slice(0,-2));
  if(q.endsWith('s'))words.push(q.slice(0,-1));
  return [...new Set(words)];
}
function result(word,records,targetLanguage){
  const selected=records.filter(r=>r[4]?r[4]===targetLanguage:targetLanguage==='zh-CN'?r[0]==='ecdict':targetLanguage==='en'?r[0]==='wordnet':false);
  if(!selected.length)return null;
  return {found:true,id:word,term:word,sourceLanguage:selected[0][3]||'en',targetLanguage,translation:[...new Set(selected.map(r=>r[1]))].join('\n'),phonetic:selected.find(r=>r[2])?.[2]||'',sources:[...new Set(selected.map(r=>DICTIONARY_SOURCES[r[0]]))],terms:{en:[word]}};
}
async function pivotChinese(word){
  const bilingual=(await recordsFor(word)).filter(r=>r[4]==='en'&&['ja','de'].includes(r[3]));
  const translated=[],sources=new Set();
  for(const record of bilingual){
    const glosses=record[1].split(/[;\n]/).map(s=>normalize(s.replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|<[^>]*>/g,''))).filter(Boolean);
    for(const gloss of glosses.slice(0,30)){
      const rows=(await load(bucket(gloss)))[gloss]||[];
      for(const row of rows.filter(r=>r[0]==='ecdict')){
        translated.push(gloss+' → '+row[1]);sources.add(DICTIONARY_SOURCES[record[0]]);sources.add(DICTIONARY_SOURCES.ecdict);
      }
    }
  }
  if(!translated.length)return null;
  return {found:true,id:word,term:word,sourceLanguage:bilingual[0][3],targetLanguage:'zh-CN',indirect:true,
    translation:'【经英语转译，可能遗漏义项】\n'+[...new Set(translated)].join('\n'),sources:[...sources],phonetic:bilingual.find(r=>r[2])?.[2]||'',terms:{en:[word]}};
}
export async function lookupOfflineDictionary(text,targetLanguage='zh-CN'){
  if(!Object.hasOwn(OFFLINE_DICTIONARY_LANGUAGES,targetLanguage))return {found:false,unsupported:true,targetLanguage};
  const q=normalize(text);if(!q||q.length>160)return {found:false,targetLanguage};
  for(const word of candidates(q)){
    const records=await recordsFor(word);
    if(targetLanguage==='zh-CN'&&records.some(r=>r[4]==='en'&&['ja','de'].includes(r[3]))&&!records.some(r=>r[0]==='wordnet')){
      const supplement=lookupTerm(text,targetLanguage);
      if(supplement.found)return {...supplement,sources:[DICTIONARY_SOURCES.terminology]};
      const pivot=await pivotChinese(word);if(pivot)return {...pivot,query:q};
    }
    const found=records&&result(word,records,targetLanguage);if(found)return {...found,query:q};
  }
  const term=lookupTerm(text,targetLanguage);
  if(term.found)return {...term,sources:[DICTIONARY_SOURCES.terminology]};
  if(targetLanguage==='zh-CN')for(const word of candidates(q)){const pivot=await pivotChinese(word);if(pivot)return {...pivot,query:q};}
  return term;
}
export async function searchOfflineDictionary(text='',targetLanguage='zh-CN',limit=60){
  if(!Object.hasOwn(OFFLINE_DICTIONARY_LANGUAGES,targetLanguage))return [];
  const q=normalize(text),bounded=Math.max(1,Math.min(100,Number(limit)||60));
  if(!q)return [];
  const exact=await lookupOfflineDictionary(q,targetLanguage),rows=exact.found?[exact]:[];
  const keys=q.length>=2?[bucket(q)]:manifest.shards.filter(k=>k.startsWith(bucket(q)));
  const languageKeys=q.charCodeAt(0)>127||q.length>=2?[languageBucket(q)]:languageManifest.shards.filter(k=>k.startsWith(bucket(q)));
  // Merge both indexes so a prefix result retains every available dictionary source.
  const words=new Map();
  for(const key of keys){for(const [word,records] of Object.entries(await load(key))){
    if(word.startsWith(q))words.set(word,records);
  }}
  for(const key of languageKeys){for(const [word,records] of Object.entries(await loadLanguage(key))){
    if(word.startsWith(q))words.set(word,[...(words.get(word)||[]),...records]);
  }}
  for(const [word,records] of words){
    if(!word.startsWith(q)||rows.some(r=>r.term===word))continue;
    const row=result(word,records,targetLanguage);if(row)rows.push(row);
    if(rows.length>=bounded)return rows.slice(0,bounded);
  }
  for(const row of searchTerms(q,targetLanguage,bounded))if(!rows.some(r=>r.term===row.term))rows.push({...row,sources:[DICTIONARY_SOURCES.terminology]});
  return rows.slice(0,bounded);
}
export const offlineDictionarySize=()=>manifest.headwords;
export const offlineDictionaryInfo=()=>({...manifest.counts,...languageManifest.counts});
