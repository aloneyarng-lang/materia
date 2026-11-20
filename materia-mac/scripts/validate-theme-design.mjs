import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {parseThemePackage} from '../dist/theme-model.js';
import {PALETTE_KEYS} from '../dist/theme-variants.js';
const luminance=hex=>{
  const value=String(hex).replace(/^#/,'');if(!/^(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(value))throw Error('用于对比度检查的文字与背景色需使用不带透明度的十六进制颜色。');
  const color=value.length===3?[...value].map(v=>v+v).join(''):value;
  return [0,2,4].map(i=>parseInt(color.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((v,c,i)=>v+c*[.2126,.7152,.0722][i],0);
};
const contrast=(a,b)=>{const first=luminance(a),second=luminance(b);return (Math.max(first,second)+.05)/(Math.min(first,second)+.05);};
export function validateThemeDesign(source){
  const pack=parseThemePackage(source);if(pack.ui.style!=='glass')throw Error('ui.style 必须为 glass。');
  for(const [key,value]of Object.entries({radius:16,buttonRadius:18,cardRadius:20,menuRadius:18}))if(pack.ui[key]!==value)throw Error(`ui.${key} 必须为 ${value}。`);
  if(!pack.variants?.light||!pack.variants?.dark)throw Error('新主题必须同时提供 variants.light 和 variants.dark。');
  for(const mode of ['light','dark']){const palette=pack.variants[mode];for(const key of PALETTE_KEYS)if(!Object.hasOwn(palette,key))throw Error(`${mode} 缺少 ${key}。`);for(const [text,background]of [['--ink','--paper'],['--on-accent','--teal']])if(contrast(palette[text],palette[background])<4.5)throw Error(`${mode} 的 ${text} 与 ${background} 对比度不足 4.5。`);}
  for(const font of pack.assets.fonts){if(!font.source||!font.license)throw Error('内嵌字体必须同时提供来源和原始许可。');if(/\b(?:SF Pro|SF Mono|New York|PingFang)\b/i.test(font.family))throw Error('Apple 内置字体只能引用，不应装入主题包。');}
  return pack;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(!process.argv[2]){console.error('用法：node scripts/validate-theme-design.mjs <主题.mtheme.json>');process.exitCode=1;}
  else try{const pack=validateThemeDesign(await readFile(process.argv[2],'utf8'));console.log(`通过：${pack.name} · 两种明暗模式 · 统一玻璃界面`);}catch(error){console.error(error.message);process.exitCode=1;}
}
