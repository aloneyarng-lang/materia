import {MESSAGES} from './locales.js';
import {GERMAN_MESSAGES} from './locales-de.js';

export const LANGUAGES = Object.freeze([
  {id:'zh-CN',name:'简体中文'}, {id:'en',name:'English'}, {id:'ja',name:'日本語'}, {id:'de',name:'Deutsch'},
]);
const STORAGE_KEY='materia.interface-language';
export const normalizeLocale=value=>LANGUAGES.some(row=>row.id===value)?value:'zh-CN';
let locale='zh-CN';
try { locale=normalizeLocale(globalThis.localStorage?.getItem(STORAGE_KEY)); } catch {}
export const getLocale=()=>locale;
const listeners=new Set();
export const onLocaleChange=callback=>{listeners.add(callback);return()=>listeners.delete(callback);};
const chinese=/[\u3400-\u9fff]/;
const parts=/[^<>"'\n\r]+/g;
const keys=Object.keys(MESSAGES).sort((a,b)=>b.length-a.length);
const sourceByTranslation=new Map();
for(const [source,translations]of Object.entries(MESSAGES))for(const translated of translations)if(!sourceByTranslation.has(translated))sourceByTranslation.set(translated,source);
for(const [source,translated]of Object.entries(GERMAN_MESSAGES))if(!sourceByTranslation.has(translated))sourceByTranslation.set(translated,source);
const escapeRE=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const replacements=new RegExp(keys.map(escapeRE).join('|'),'g');
const messageFor=source=>locale==='de'?GERMAN_MESSAGES[source]:MESSAGES[source]?.[locale==='ja'?1:0];

// Only developer-authored strings enter this function. User text is interpolated
// after translation and is never looked up in the message catalog.
export function t(source,bindMarkup=true){
  source=String(source??'');
  if(bindMarkup&&typeof document!=='undefined'&&chinese.test(source)&&/<\/?[a-zA-Z][^>]*>/.test(source))return html([source]);
  if(locale==='zh-CN'||!chinese.test(source))return source;
  return source.replace(parts,part=>{
    const trimmed=part.trim(),entry=messageFor(trimmed);
    if(entry)return part.replace(trimmed,entry);
    return part.replace(replacements,key=>messageFor(key)||key);
  });
}
export function msg(strings,...values){
  const key=strings.reduce((out,part,i)=>out+part+(i<values.length?`{${i}}`:''),'');
  const entry=messageFor(key);
  if(locale!=='zh-CN'&&entry)return entry.replace(/\{(\d+)\}/g,(_,i)=>String(values[Number(i)]??''));
  return strings.reduce((out,part,i)=>out+t(part)+(i<values.length?values[i]:''),'');
}

const marker='materia-i18n:';
const slots=/__materia_i18n_slot_(\d+)__/g;
// Bind static text with comment anchors. This supports live language changes
// without replacing editors, event handlers, input values, or user content.
export function html(strings,...values){
  const source=strings.reduce((out,part,i)=>out+part+(i<values.length?`__materia_i18n_slot_${i}__`:''),'');
  if(typeof document==='undefined')return msg(strings,...values);
  const template=document.createElement('template');template.innerHTML=source;
  bindStaticDOM(template.content,{slots:true});
  return template.innerHTML.replace(/(__materia_i18n_slot_\d+__)=""/g,'$1').replace(slots,(_,i)=>String(values[Number(i)]??''));
}
export function bindStaticDOM(root,{slots:hasSlots=false,translated=false}={}){
  const doc=root.ownerDocument||document;
  const walker=doc.createTreeWalker(root,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){
    if(node.nodeType===1){
      if(node.matches('script,style,textarea'))continue;
      for(const attr of ['title','aria-label','placeholder','alt','aria-valuetext']){
        if(node.hasAttribute('data-i18n-'+attr))continue;
        const value=node.getAttribute(attr),source=translated?(sourceByTranslation.get(value)||value):value;
        if(!source||!chinese.test(source))continue;
        if(hasSlots&&source.includes('__materia_i18n_slot_')){node.setAttribute(attr,source.split(/(__materia_i18n_slot_\d+__)/).map(part=>t(part)).join(''));continue;}
        node.setAttribute('data-i18n-'+attr,source);node.setAttribute(attr,t(source));
      }
    }else{
      if(node.parentElement?.closest('script,style,textarea,[data-i18n-skip]')||node.previousSibling?.nodeType===8&&node.previousSibling.data.startsWith(marker))continue;
      const source=translated?node.data.replace(node.data.trim(),sourceByTranslation.get(node.data.trim())||node.data.trim()):node.data;
      if(!chinese.test(source))continue;
      const fragment=doc.createDocumentFragment();
      for(const part of source.split(/(__materia_i18n_slot_\d+__)/)){
        if(!chinese.test(part)){fragment.append(doc.createTextNode(part));continue;}
        fragment.append(doc.createComment(marker+encodeURIComponent(part)),doc.createTextNode(t(part)),doc.createComment('/'+marker));
      }
      node.replaceWith(fragment);
    }
  }
}
export function refreshTranslations(root=document){
  for(const element of root.querySelectorAll('[data-i18n-title],[data-i18n-aria-label],[data-i18n-placeholder],[data-i18n-alt],[data-i18n-aria-valuetext]')){
    for(const attr of ['title','aria-label','placeholder','alt','aria-valuetext'])if(element.hasAttribute('data-i18n-'+attr))element.setAttribute(attr,t(element.getAttribute('data-i18n-'+attr)));
  }
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_COMMENT);let node;
  while((node=walker.nextNode()))if(node.data.startsWith(marker)&&node.nextSibling?.nodeType===3)node.nextSibling.data=t(decodeURIComponent(node.data.slice(marker.length)));
}
export async function setLocale(value,{persist=true}={}){
  const next=normalizeLocale(value);
  // Save first so a failed preference write cannot leave a misleading selection.
  if(persist){
    if(globalThis.materiaDesktop?.setLocale)await globalThis.materiaDesktop.setLocale(next);
    else globalThis.localStorage.setItem(STORAGE_KEY,next);
  }
  locale=next;
  try{globalThis.localStorage?.setItem(STORAGE_KEY,next);}catch{}
  if(typeof document!=='undefined'){
    document.documentElement.lang=next;document.title=t('Materia · 材料文献星图');refreshTranslations();
  }
  for(const callback of listeners)await callback(next);
  return next;
}
export async function initializeLocale(){
  if(globalThis.materiaDesktop?.getLocale)await setLocale(await globalThis.materiaDesktop.getLocale(),{persist:false});
  else if(typeof document!=='undefined'){document.documentElement.lang=locale;document.title=t('Materia · 材料文献星图');}
}
