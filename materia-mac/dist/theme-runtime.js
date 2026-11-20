import {t as tr,html,msg} from './i18n.js';
import {applyThemeArtwork,artworkURL} from './theme-artwork.js';
import {GRAPH_THEME_TOKENS,GRAPH_FIELDS} from './graph-appearance.js';
import {THEME_TOKENS,fontBytes} from './theme-model.js';
import {setIconTheme} from './icons.js';
import {setGlassInteractions} from './glass-interactions.js';
import {loadBuiltinFonts} from './builtin-fonts.js';
import {setGraphSymbols} from './graph-symbols.js';
const uiVariables={density:['--ui-density',''],radius:['--radius','px'],buttonRadius:['--button-radius','px'],cardRadius:['--card-radius','px'],menuRadius:['--menu-radius','px'],borderWidth:['--border-width','px'],sidebarWidth:['--sidebar-width','px'],controlHeight:['--control-height','px'],cardPadding:['--card-padding','px'],menuPadding:['--menu-padding','px'],cardGap:['--card-gap','px']};
const hash=text=>[...text].reduce((v,c)=>(v*31+c.charCodeAt(0))>>>0,7).toString(36);
const properties={'--sans':'font-family','--serif':'font-family','--mono':'font-family','--numeric':'font-family','--radius':'border-radius','--theme-mode':'color-scheme','--font-size':'font-size','--font-weight':'font-weight','--heading-weight':'font-weight','--line-height':'line-height','--heading-line-height':'line-height','--heading-scale':'opacity'};
const validToken=(key,value)=>Object.hasOwn(GRAPH_THEME_TOKENS,key)?(!Object.values(GRAPH_FIELDS).find(row=>row.token===key).color||value==='auto'||CSS.supports('color',value)):key==='--heading-scale'||CSS.supports(properties[key]||'color',value);
export async function validateThemeResources(theme){
 for(const[key,value]of Object.entries(theme.tokens))if(!validToken(key,value))throw new Error(tr('主题变量 ',false)+key+tr(' 的 CSS 值无法识别。',false));
 for(const asset of theme.assets?.fonts||[]){const face=new FontFace('MateriaValidation_'+asset.id,fontBytes(asset),{weight:asset.weight,style:asset.style});try{await face.load();}catch{throw new Error(msg`字体「${asset.family}」无法解码，主题未导入。`);}}
 for(const asset of Object.values(theme.assets?.artwork||{})){const image=new Image();image.src=artworkURL(asset);try{await image.decode();if(image.naturalWidth>8192||image.naturalHeight>8192)throw Error();}catch{throw new Error(tr('主题图片无法解码或尺寸超过 8192 像素。'));}}
}
export function createThemeRuntime(changed){
 let generation=0,faces=[],ready=Promise.resolve(),status='';
 function apply(theme,effects={}){
  const ticket=++generation,root=document.documentElement;for(const face of faces)document.fonts.delete(face);faces=[];
  const aliases=new Map((theme.assets?.fonts||[]).map(asset=>[asset.family,'MateriaTheme_'+hash(theme.id+'|'+asset.family)+'_'+ticket]));
  for(const[key,defaultValue]of Object.entries(THEME_TOKENS)){
   let value=theme.tokens[key]??defaultValue;if(!validToken(key,value))value=defaultValue;
   if(['--sans','--serif','--mono','--numeric'].includes(key)&&aliases.size)value=value.split(',').map(part=>{const name=part.trim().replace(/^['"]|['"]$/g,'');return aliases.has(name)?'"'+aliases.get(name)+'"':part.trim();}).join(', ');
   root.style.setProperty(key,value);
  }
  for(const[key,[variable,unit]]of Object.entries(uiVariables))root.style.setProperty(variable,String(theme.ui[key])+unit);
  root.style.setProperty('--icon-stroke',String(theme.icons.strokeWidth));root.style.setProperty('--icon-size',theme.icons.size+'px');
  Object.assign(root.dataset,{theme:theme.id,themeMode:theme.tokens['--theme-mode'],themeStyle:theme.ui.style,themeButtons:theme.ui.buttonStyle,themeCards:theme.ui.cardStyle,themeSidebar:theme.ui.sidebarStyle,themeShadow:theme.ui.shadow,themeIcons:theme.icons.style});root.style.colorScheme=theme.tokens['--theme-mode'];setIconTheme(theme.icons);
  const glass=true;root.dataset.liquidGlass='true';root.dataset.themeStyle='glass';
  applyThemeArtwork(theme);setGlassInteractions(glass);setGraphSymbols(theme.assets?.graphSymbols||{});
  const assets=theme.assets?.fonts||[],missing=theme.fontWarnings?.length||0;status=assets.length?'正在加载主题字体…':missing?'主题资源字体缺失或损坏，已使用后备字体。':'使用系统字体，缺少字体时采用后备字体。';root.dataset.themeFonts=assets.length?'loading':missing?'fallback':'system';
  const embedded=Promise.allSettled(assets.map(async asset=>{const face=new FontFace(aliases.get(asset.family),fontBytes(asset),{weight:asset.weight,style:asset.style,display:'swap'});await face.load();if(ticket===generation){document.fonts.add(face);faces.push(face);}}));
  ready=Promise.all([embedded,loadBuiltinFonts(theme.tokens)]).then(([results,builtin])=>{
   if(ticket!==generation)return;const failed=results.filter(row=>row.status==='rejected').length+missing+builtin.failed.length;
   status=assets.length?`${results.filter(row=>row.status==='fulfilled').length} 个主题字体已加载。`:'';
   if(builtin.loaded.length)status+=`内置字体已就绪：${builtin.loaded.join('、')}。`;
   if(failed)status+=` ${failed} 个字体未加载，已采用后备字体。`;
   if(!assets.length&&!builtin.requested&&!missing)status='使用系统字体，缺少字体时采用后备字体。';
   root.dataset.themeFonts=failed?'fallback':assets.length||builtin.loaded.length?'loaded':'system';const node=document.querySelector('#theme-resource-status');if(node)node.textContent=tr(status);changed?.();
  });
  requestAnimationFrame(()=>changed?.());return theme;
 }
 return{apply,ready:()=>ready,status:()=>tr(status)};
}
