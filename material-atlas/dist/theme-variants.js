import {APPLE_UI_STACK,APPLE_MONO_STACK} from './builtin-fonts.js';

export const THEME_ALIASES={
  'liquid-glass-dark':{id:'liquid-glass',mode:'dark'},
  graphite:{id:'liquid-glass',mode:'dark'},ocean:{id:'buaa-blue'},wikipedia:{id:'paper'},
  'reimu-night':{id:'reimu-day',mode:'dark'},
};
export const PALETTE_KEYS=['--paper','--surface','--canvas','--panel','--sidebar','--ink','--muted','--line','--teal','--teal-light','--on-accent','--warning','--warning-soft','--danger','--danger-soft','--shadow','--theme-mode'];
const palette=(mode,background,ink,muted,accent,tint)=>({
  '--theme-mode':mode,'--paper':background,'--canvas':background,'--sidebar':background,
  '--surface':mode==='dark'?'#25262b':'#ffffff','--panel':tint,'--ink':ink,'--muted':muted,
  '--line':mode==='dark'?'#ffffff24':'#25364a24','--teal':accent,'--teal-light':tint,'--on-accent':mode==='dark'?'#10151f':'#ffffff',
  '--warning':mode==='dark'?'#e5bf79':'#866122','--warning-soft':mode==='dark'?'#493b25':'#fbefd6',
  '--danger':mode==='dark'?'#ff909a':'#bd2941','--danger-soft':mode==='dark'?'#4b2832':'#ffe8ed',
  '--shadow':mode==='dark'?'#0000004d':'#1220381c',
});
export function glassUI(ui={}){return {...ui,style:'glass',radius:16,buttonRadius:18,cardRadius:20,menuRadius:18,borderWidth:1,buttonStyle:'solid',cardStyle:'elevated',sidebarStyle:'tinted',shadow:'lifted'};}
export function curateThemes(themes){
  const designs=[
    ['liquid-glass','澄璃','银白与石墨',{...palette('light','#f2f2f7','#1c1c1e','#6c6c70','#0066cc','#007aff12'),'--sidebar':'#e8e8ed','--surface':'#ffffff','--panel':'#ffffff','--line':'#3c3c431f'},{...palette('dark','#000000','#f5f5f7','#a1a1a6','#64b5ff','#0a84ff20'),'--sidebar':'#111113','--surface':'#1c1c1e','--panel':'#1c1c1e','--line':'#ffffff1c'}],
    ['buaa-blue','北航蓝','空天蓝 · 轨道圆环',palette('light','#e7eef7','#152d49','#52677f','#005bac','#0067bc17'),palette('dark','#0e192b','#ebf3ff','#a3b7d2','#75baff','#528ee92b')],
    ['paper','纸白','柔和中性 · 专注阅读',palette('light','#eeeee9','#303d39','#65736d','#38675a','#4e79681a'),palette('dark','#191e1c','#edf1ed','#a8b6ad','#92c6ac','#7aaf9326')],
    ['academic-purple','学术紫','雾紫与鸢尾',palette('light','#eeebf4','#342b43','#756787','#705095','#8456b11a'),palette('dark','#1c1726','#f2eafb','#b8a7cc','#c6a0f0','#aa7bdb27')],
    ['sand','暖砂','暖白与铜棕',palette('light','#f0eae0','#483b30','#81705e','#855e3e','#a4764b1c'),palette('dark','#241d17','#f7ecdf','#c3af98','#ddb78e','#b88c5c28')],
    ['reimu-day','博丽灵梦','朱白结界 · 阴阳御札',palette('light','#f3ede9','#422a30','#80676e','#b52f40','#b52f4017'),palette('dark','#25191f','#fff0ef','#cfafb8','#ff9b9e','#d9687d29')],
  ];
  const steins=themes.find(theme=>theme.id==='steins-gate');
  if(steins)designs.push([steins.id,steins.name,steins.description,steins.variants.light,steins.variants.dark]);
  return designs.map(([id,name,description,light,dark])=>{
    const source=themes.find(t=>t.id===id);
    return {...source,id,name,description,ui:glassUI({...source.ui,controlHeight:36,cardPadding:18,cardGap:12,...(id==='liquid-glass'?{sidebarWidth:236,controlHeight:38,cardPadding:20,cardGap:14}:{})}),tokens:{...source.tokens,...light,'--radius':'16px','--sans':APPLE_UI_STACK,'--serif':id==='sand'||id==='paper'?"'Materia New York', 'Materia Source Han Sans', serif":APPLE_UI_STACK,'--numeric':id==='steins-gate'?APPLE_MONO_STACK:APPLE_UI_STACK,'--mono':APPLE_MONO_STACK,'--font-size':id==='liquid-glass'?'14px':'13px','--font-weight':'400','--heading-weight':'600','--line-height':'1.65','--heading-line-height':'1.4'},variants:{light,dark}};
  });
}
function rgb(value){
  const hex=String(value).match(/^#([a-f\d]{3}|[a-f\d]{6})(?:[a-f\d]{2})?$/i)?.[1];
  if(hex){const text=hex.length===3?[...hex].map(c=>c+c).join(''):hex;return [0,2,4].map(i=>parseInt(text.slice(i,i+2),16));}
  return [48,110,190];
}
const blend=(a,b,f)=>'#'+a.map((v,i)=>Math.round(v*(1-f)+b[i]*f).toString(16).padStart(2,'0')).join('');
// Older single-mode packages keep their original colors in their native mode.
export function modeTokens(theme,mode){
  const native=theme.tokens['--theme-mode']||'light';
  if(theme.variants?.[mode])return {...theme.tokens,...theme.variants[mode],'--theme-mode':mode};
  if(native===mode)return {...theme.tokens,'--theme-mode':mode};
  const accent=rgb(theme.tokens['--teal']),dark=mode==='dark';
  return {...theme.tokens,...palette(mode,blend(accent,dark?[15,17,22]:[245,245,247],dark?.86:.94),dark?'#f2f3f7':'#242734',dark?'#b3bac8':'#626b7b',blend(accent,dark?[220,231,255]:[13,29,60],dark?.55:.12),blend(accent,dark?[23,25,34]:[246,247,250],dark?.78:.89))};
}
