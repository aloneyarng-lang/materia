import {cleanThemeArtwork} from './theme-artwork.js';
import {GRAPH_THEME_TOKENS,cleanGraphToken,graphTokens,graphFromTokens} from './graph-appearance.js';
import {BUILTIN_FONT_OPTIONS} from './builtin-fonts.js';
import {GLASS_PRESETS} from './glass-presets.js';
import {REIMU_PRESETS} from './reimu-presets.js';
import {STEINS_GATE_PRESET} from './steins-gate-preset.js';
import {THEME_ALIASES,PALETTE_KEYS,curateThemes,glassUI,modeTokens} from './theme-variants.js';
export const THEME_TOKENS={
  ...GRAPH_THEME_TOKENS,
  '--paper':'#f7f7f2','--surface':'#fcfdf9','--canvas':'#fafcf7','--panel':'#f0f4ec','--sidebar':'#f1f4ed',
  '--ink':'#2e4843','--muted':'#718174','--line':'#dce5d7','--teal':'#285d59','--teal-light':'#e7efe3','--on-accent':'#ffffff','--brand-mark':'var(--teal)',
  '--warning':'#9b7946','--warning-soft':'#f5efdf','--danger':'#a15d54','--danger-soft':'#f7ece8','--shadow':'#18362c1c',
  '--serif':`Georgia, 'Noto Serif SC', 'Songti SC', SimSun, serif`,'--sans':`Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif`,
  '--radius':'6px','--theme-mode':'light',
  '--mono':"Consolas, 'Microsoft YaHei', monospace",'--numeric':"'Segoe UI', 'Microsoft YaHei', sans-serif",'--font-size':'13px','--font-weight':'400','--line-height':'1.7','--heading-weight':'400','--heading-line-height':'1.5','--heading-scale':'1',
};
export const BUILTIN_THEMES=[
  ...GLASS_PRESETS,
  ...REIMU_PRESETS,
  STEINS_GATE_PRESET,
  {id:'buaa-blue',name:'北航蓝 · 空天',description:'空天蓝与银白 · 轨道圆环星图',tokens:{'--paper':'#f2f6fb','--surface':'#ffffff','--canvas':'#f8fbff','--panel':'#e8f0f9','--sidebar':'#edf3fa','--ink':'#19364f','--muted':'#637c93','--line':'#d4e1ee','--teal':'#005bac','--teal-light':'#e0edfa','--on-accent':'#ffffff','--warning':'#977333','--warning-soft':'#f7f0e0','--shadow':'#003b7017',...graphTokens({nodeFill:'hollow',relationShape:'diamond',edgeStyle:'curve',edgeOpacity:.32,nodeStroke:1.5,nodeScale:1.3,background:'dots',colorMode:'accent',edgeColor:'#5588b8'})}},
  {id:'paper',name:'学术纸白',description:'柔和纸底 · 松绿与黄铜',tokens:{}},
  {id:'academic-purple',name:'学术紫',description:'雾紫纸底 · 深紫与香槟金',tokens:{'--paper':'#f3f0f7','--surface':'#fffdfd','--canvas':'#fbf9fe','--panel':'#ede7f5','--sidebar':'#eee8f5','--ink':'#352c43','--muted':'#81758e','--line':'#ded5e9','--teal':'#705095','--teal-light':'#e8def3','--on-accent':'#ffffff','--warning':'#a48049','--warning-soft':'#f6efdf','--danger':'#a15b6c','--danger-soft':'#f9eaf0','--shadow':'#38204f18','--radius':'7px'}},
  {id:'ocean',name:'深海蓝',description:'冷白背景 · 海蓝与石板灰',tokens:{'--paper':'#edf2f6','--surface':'#fbfdff','--canvas':'#f4f8fc','--panel':'#e8f0f7','--sidebar':'#e7eef5','--ink':'#233f55','--muted':'#667e91','--line':'#d3e0eb','--teal':'#285f8a','--teal-light':'#deebf5','--warning':'#9b7642','--shadow':'#16374f1c'}},
  {id:'graphite',name:'石墨夜读',description:'深石墨背景 · 冰青与暖金',tokens:{'--paper':'#141c23','--surface':'#202c35','--canvas':'#18222a','--panel':'#26343e','--sidebar':'#1b262e','--ink':'#e0e9eb','--muted':'#a0b3bb','--line':'#3a4b55','--teal':'#8bc6be','--teal-light':'#304c4d','--on-accent':'#142c2b','--warning':'#dec087','--warning-soft':'#413827','--danger':'#e3aaa1','--danger-soft':'#453236','--shadow':'#00000055','--theme-mode':'dark'}},
  {id:'sand',name:'暖砂手稿',description:'暖砂纸底 · 赭石与墨棕',tokens:{'--paper':'#f2eee6','--surface':'#fdfaf4','--canvas':'#faf5eb','--panel':'#efe6d7','--sidebar':'#ede5d8','--ink':'#4c4236','--muted':'#887969','--line':'#ded1be','--teal':'#855e3e','--teal-light':'#eadcc8','--warning':'#916a35','--shadow':'#4935211c'}},
  {id:'wikipedia',name:'维基百科',description:'百科白底 · 蓝色链接与衬线标题',tokens:{'--paper':'#f8f9fa','--surface':'#ffffff','--canvas':'#ffffff','--panel':'#eaecf0','--sidebar':'#f8f9fa','--ink':'#202122','--muted':'#54595d','--line':'#c8ccd1','--teal':'#3366cc','--teal-light':'#eaf3ff','--warning':'#8a6000','--warning-soft':'#fef6e7','--danger':'#b32424','--danger-soft':'#fee7e6','--shadow':'#0000000a','--radius':'2px','--sans':`Arial, 'Microsoft YaHei', sans-serif`,'--serif':`'Linux Libertine', Georgia, 'Times New Roman', SimSun, serif`}},
];
export const FONT_OPTIONS=[
  {id:'theme',name:'跟随主题'},
  ...BUILTIN_FONT_OPTIONS,
  {id:'consolas',name:'Consolas / 等宽',stack:"Consolas, 'Microsoft YaHei', monospace"},
  {id:'yahei',name:'微软雅黑',stack:`'Microsoft YaHei', 'PingFang SC', Arial, sans-serif`},
  {id:'dengxian',name:'等线',stack:`DengXian, 'Microsoft YaHei', Arial, sans-serif`},
  {id:'noto-sans',name:'思源黑体 / Noto Sans',stack:`'Source Han Sans SC', 'Noto Sans CJK SC', 'Noto Sans SC', 'Microsoft YaHei', sans-serif`},
  {id:'simsun',name:'宋体',stack:`SimSun, 'Songti SC', 'Noto Serif SC', serif`},
  {id:'noto-serif',name:'思源宋体 / Noto Serif',stack:`'Source Han Serif SC', 'Noto Serif CJK SC', 'Noto Serif SC', SimSun, serif`},
  {id:'kaiti',name:'楷体',stack:`KaiTi, STKaiti, SimSun, serif`},
  {id:'times',name:'Times New Roman',stack:`'Times New Roman', SimSun, serif`},
  {id:'georgia',name:'Georgia',stack:`Georgia, 'Noto Serif SC', SimSun, serif`},
  {id:'arial',name:'Arial',stack:`Arial, 'Microsoft YaHei', sans-serif`},
];
export const DEFAULT_THEME_PREFERENCES={selected:'paper',themes:[]};
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const safeName=value=>String(value||'自定义主题').replace(/[\r\n\u0000-\u001f]/g,' ').trim().slice(0,60)||'自定义主题';
const colors=new Set(Object.keys(THEME_TOKENS).filter(key=>!['--serif','--sans','--mono','--numeric','--radius','--theme-mode','--font-size','--font-weight','--line-height','--heading-weight','--heading-line-height','--heading-scale'].includes(key)));
function cleanToken(key,value){
  if(Object.hasOwn(GRAPH_THEME_TOKENS,key))return cleanGraphToken(key,value);
  value=String(value).trim();
  if(!value||value.length>500||/[{};\\]|\/\*|\*\//.test(value))throw new Error(`主题变量 ${key} 的值不正确。`);
  if(colors.has(key)){
    if(!(key==='--brand-mark'&&value==='var(--teal)')&&!/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)&&! /^(?:rgb|rgba|hsl|hsla)\([\d\s.,%+\-/]+\)$/i.test(value))throw new Error(`${key} 请使用十六进制、rgb() 或 hsl() 颜色。`);
  }else if(key==='--theme-mode'){
    if(!['light','dark'].includes(value))throw new Error('--theme-mode 只能填写 light 或 dark。');
  }else if(key==='--radius'){
    if(!/^(?:\d+(?:\.\d+)?)px$/.test(value)||parseFloat(value)>20)throw new Error('--radius 请填写 0px 至 20px。');
   }else if(key==='--font-size'){if(!/^\d+(?:\.\d+)?px$/.test(value)||parseFloat(value)<11||parseFloat(value)>16)throw new Error('正文字号需为 11px 至 16px。');
  }else if(['--font-weight','--heading-weight'].includes(key)){if(!/^[3-7]00$/.test(value))throw new Error('字重需为 300 至 700 的整百数。');
  }else if(['--line-height','--heading-line-height'].includes(key)){if(!/^[\d.]+$/.test(value)||Number(value)<1.2||Number(value)>2)throw new Error('行高需为 1.2 至 2。');
  }else if(key==='--heading-scale'){if(!/^[\d.]+$/.test(value)||Number(value)<.85||Number(value)>1.2)throw new Error('标题比例需为 0.85 至 1.2。');
  }else if(!/^[\w\s'",\-\u0080-\uffff]+$/.test(value)||/["']/.test(value.replace(/"[^"\r\n]*"|'[^'\r\n]*'/g,'')))throw new Error(`${key} 请填写字体名称列表，例如 "Microsoft YaHei", sans-serif。`);
  return value;
}

// A deliberately small CSS format: named design tokens, never arbitrary layout rules.
export function parseThemeCSS(input,filename='自定义主题.css'){
  if(typeof input!=='string'||input.length>32768)throw new Error('主题 CSS 需为文本，大小不超过 32 KB。');
  const name=safeName(input.match(/\/\*\s*@name\s*:\s*([^*\r\n]+)\s*\*\//i)?.[1]||filename.replace(/\.css$/i,''));
  const text=input.replace(/^\uFEFF/,'').replace(/\/\*[\s\S]*?\*\//g,'').trim();
  const block=text.match(/^:root\s*\{([^{}]*)\}\s*$/);
  if(!block)throw new Error('请使用主题模板：在 :root { … } 内填写 CSS 变量。暂不支持普通选择器、@import 或外部资源。');
  const tokens={};
  for(const declaration of block[1].split(';').map(part=>part.trim()).filter(Boolean)){
    const pair=declaration.match(/^(--[\w-]+)\s*:\s*([\s\S]+)$/);
    if(!pair||!own(THEME_TOKENS,pair[1]))throw new Error(`不支持的主题变量：${declaration.split(':')[0]}。请下载模板查看可用变量。`);
    tokens[pair[1]]=cleanToken(pair[1],pair[2]);
  }
  if(!Object.keys(tokens).length)throw new Error('主题中至少需要一个有效变量。');
  if(['--graph-node-shape','--graph-relation-shape','--graph-background'].some(key=>tokens[key]==='symbol'))throw new Error('自定义星图图形需使用携带 graphSymbols 的完整 .mtheme.json 主题包。');
  return{name,tokens};
}
export function themeCSS(name,tokens){
  const label=safeName(name).replace(/[*/]/g,'');
  const portable={...tokens};for(const[key,fallback]of [['--graph-node-shape','square'],['--graph-relation-shape','circle'],['--graph-background','plain']])if(portable[key]==='symbol')portable[key]=fallback;
  return `/* @name: ${label} */\n/* Materia 主题：自定义图形资源仅保留在完整 JSON 包；CSS 使用基础形状。 */\n:root {\n${Object.entries(portable).filter(([key])=>own(THEME_TOKENS,key)).map(([key,value])=>`  ${key}: ${cleanToken(key,value)};`).join('\n')}\n}\n`;
}
export const THEME_SCHEMA_VERSION=2;
export const MAX_THEME_BYTES=24*1024*1024;
export const UI_DEFAULTS={style:'editorial',density:1,radius:6,buttonRadius:6,cardRadius:7,menuRadius:8,borderWidth:1,sidebarWidth:216,controlHeight:32,cardPadding:14,menuPadding:6,cardGap:10,buttonStyle:'solid',cardStyle:'outlined',sidebarStyle:'tinted',shadow:'soft'};
export const ICON_DEFAULTS={style:'outline',strokeWidth:1.6,size:18,overrides:{}};
const enumFields={style:['editorial','soft','technical','manuscript','encyclopedia','glass'],buttonStyle:['solid','outlined','soft'],cardStyle:['flat','outlined','elevated','ruled'],sidebarStyle:['flat','tinted','ruled'],shadow:['none','soft','lifted']};
const ranges={density:[.86,1.14],radius:[0,20],buttonRadius:[0,22],cardRadius:[0,20],menuRadius:[0,18],borderWidth:[.5,2],sidebarWidth:[188,244],controlHeight:[30,40],cardPadding:[10,22],menuPadding:[4,12],cardGap:[6,18]};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
function keysOnly(value,allowed,label){if(!object(value))throw new Error(`${label} 需为对象。`);for(const key of Object.keys(value))if(!allowed.includes(key))throw new Error(`${label} 不支持字段 ${key}。`);}
function number(value,min,max,label){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error(`${label} 需为 ${min} 至 ${max} 的数值。`);return value;}
function cleanUI(value={}){keysOnly(value,Object.keys(UI_DEFAULTS),'ui');const result={...UI_DEFAULTS};for(const[key,list]of Object.entries(enumFields))if(value[key]!==undefined){if(!list.includes(value[key]))throw new Error(`ui.${key} 不支持此选项。`);result[key]=value[key];}for(const[key,[min,max]]of Object.entries(ranges))if(value[key]!==undefined)result[key]=number(value[key],min,max,'ui.'+key);return result;}
const shapeAttrs={path:['d','fill','stroke','opacity','fill-opacity','stroke-width'],circle:['cx','cy','r','fill','stroke','opacity','fill-opacity','stroke-width'],rect:['x','y','width','height','rx','ry','fill','stroke','opacity','fill-opacity','stroke-width'],ellipse:['cx','cy','rx','ry','fill','stroke','opacity','fill-opacity','stroke-width'],line:['x1','x2','y1','y2','stroke','opacity','stroke-width'],polyline:['points','fill','stroke','opacity','stroke-width'],polygon:['points','fill','stroke','opacity','fill-opacity','stroke-width']};
export function cleanIconShapes(value){
 if(!Array.isArray(value)||!value.length||value.length>32)throw new Error('每个图标需包含 1 至 32 个声明式 SVG 图形。');
 return value.map(shape=>{keysOnly(shape,['tag','attrs'],'图标图形');if(!own(shapeAttrs,shape.tag))throw new Error('图标只支持 path、rect、circle、ellipse、line、polyline、polygon。');keysOnly(shape.attrs,shapeAttrs[shape.tag],'图标属性');const attrs={};for(const[key,v]of Object.entries(shape.attrs)){
   if(['fill','stroke'].includes(key)){if(!['none','currentColor'].includes(v))throw new Error('图标颜色仅支持 none 或 currentColor。');attrs[key]=v;}
   else if(key==='d'){if(typeof v!=='string'||!v.length||v.length>4096||!/^\s*[Mm]/.test(v)||!/^[MmLlHhVvCcSsQqTtAaZz\d\seE+.,-]+$/.test(v))throw new Error('SVG path 路径无效。');attrs[key]=v;}
   else if(key==='points'){if(typeof v!=='string'||v.length>2048||!/^[-\d\s.,+]+$/.test(v))throw new Error('SVG points 无效。');attrs[key]=v;}
   else attrs[key]=number(v,key.includes('opacity')?0:key==='stroke-width'?0:-64,key.includes('opacity')?1:key==='stroke-width'?3:88,'图标 '+key);
 }if(shape.tag==='path'&&!attrs.d||['polyline','polygon'].includes(shape.tag)&&!attrs.points)throw new Error('图标缺少路径。');return{tag:shape.tag,attrs};});
}
function cleanIcons(value={}){keysOnly(value,Object.keys(ICON_DEFAULTS),'icons');const result={...ICON_DEFAULTS,overrides:{}};if(value.style!==undefined){if(!['outline','rounded','technical','duotone','solid'].includes(value.style))throw new Error('icons.style 不支持此风格。');result.style=value.style;}if(value.strokeWidth!==undefined)result.strokeWidth=number(value.strokeWidth,1,2.4,'图标线宽');if(value.size!==undefined)result.size=number(value.size,16,21,'图标尺寸');if(value.overrides!==undefined){if(!object(value.overrides)||Object.keys(value.overrides).length>64)throw new Error('最多覆盖 64 个语义图标。');for(const[name,shapes]of Object.entries(value.overrides)){if(!/^[a-z][a-z\d-]{0,40}$/.test(name))throw new Error('图标名称无效。');result.overrides[name]=cleanIconShapes(shapes);}}return result;}
export function fontBytes(asset){const text=atob(asset.data);return Uint8Array.from(text,char=>char.charCodeAt(0));}
function cleanFonts(rows=[]){
 if(!Array.isArray(rows)||rows.length>8)throw new Error('最多携带 8 个字体文件。');const families=new Set();let total=0;
 return rows.map(row=>{keysOnly(row,['id','family','format','data','weight','style','license','source'],'字体资源');if(!/^[a-z][a-z\d-]{0,40}$/.test(row.id||'')||!/[\w\u0080-\uffff]/.test(row.family||'')||typeof row.family!=='string'||!/^[-\w\s\u0080-\uffff]{1,80}$/.test(row.family)||families.has(row.id))throw new Error('字体 id 或 family 无效或重复。');families.add(row.id);
 if(!['woff2','woff','ttf','otf'].includes(row.format)||typeof row.data!=='string'||row.data.length>16*1024*1024||!row.data.length||row.data.length%4||!/^[A-Za-z\d+/]+={0,2}$/.test(row.data))throw new Error('字体需为 Base64 编码的 WOFF2 / WOFF / TTF / OTF。');
 const bytes=fontBytes(row);total+=bytes.length;if(bytes.length<100||bytes.length>12*1024*1024||total>16*1024*1024)throw new Error('单个字体限 12 MB，一个主题字体合计限 16 MB。');const magic=String.fromCharCode(...bytes.slice(0,4)),valid={woff2:'wOF2',woff:'wOFF',otf:'OTTO',ttf:'\x00\x01\x00\x00'};if(magic!==valid[row.format])throw new Error('字体文件头与声明格式不符。');
 const weight=String(row.weight||'400');if(!/^[1-9]00(?: [1-9]00)?$/.test(weight))throw new Error('字体字重无效。');const style=row.style||'normal';if(!['normal','italic'].includes(style))throw new Error('字体样式无效。');return{id:row.id,family:row.family,format:row.format,data:row.data,weight,style,license:String(row.license||'').slice(0,30000),source:String(row.source||'').slice(0,1000)};
 });
}
export function cleanGraphSymbols(value={}){
 keysOnly(value,['node','relation','background'],'assets.graphSymbols');const result={};
 const paints=new Set(['none','currentColor','theme-accent','theme-ink','theme-warning','theme-paper','theme-canvas']);
 for(const[role,shapes]of Object.entries(value)){
  if(!Array.isArray(shapes))throw new Error('星图图形需为声明式 SVG 图形数组。');
  const adapted=shapes.map(shape=>({...shape,attrs:Object.fromEntries(Object.entries(shape.attrs||{}).map(([key,v])=>{
   if(!['fill','stroke'].includes(key))return[key,v];
   if(!paints.has(v)&&!/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(v))throw new Error('星图图形颜色需为十六进制颜色或主题语义色。');
   return[key,'currentColor'];
  }))}));
  result[role]=cleanIconShapes(adapted).map((shape,index)=>({...shape,attrs:{...shape.attrs,...Object.fromEntries(['fill','stroke'].filter(k=>own(shapes[index].attrs,k)).map(k=>[k,shapes[index].attrs[k]]))}}));
 }
 return result;
}
export function parseThemePackage(input,filename='自定义主题.mtheme.json'){
 if(typeof input==='string'){if(input.length>MAX_THEME_BYTES)throw new Error('主题包不超过 24 MB。');try{input=JSON.parse(input);}catch{throw new Error('主题包不是有效 JSON。');}}
 keysOnly(input,['format','schemaVersion','name','description','tokens','typography','ui','icons','assets','graph','variants'],'主题包');if(input.format!=='materia-theme'||input.schemaVersion!==2)throw new Error('请使用 format: materia-theme、schemaVersion: 2 的主题包。');
 const tokens={};if(input.tokens!==undefined){if(!object(input.tokens))throw new Error('tokens 需为对象。');for(const[key,value]of Object.entries(input.tokens)){if(!own(THEME_TOKENS,key))throw new Error('不支持主题变量 '+key);tokens[key]=cleanToken(key,value);}}
 if(input.typography!==undefined){keysOnly(input.typography,['body','heading','mono','numeric'],'typography');for(const[role,fields]of Object.entries(input.typography)){keysOnly(fields,role==='body'?['family','size','weight','lineHeight']:role==='heading'?['family','scale','weight','lineHeight']:['family'],'typography.'+role);const names={body:'--sans',heading:'--serif',mono:'--mono',numeric:'--numeric'};if(fields.family!==undefined)tokens[names[role]]=cleanToken(names[role],fields.family);for(const[key,target]of Object.entries(role==='body'?{size:'--font-size',weight:'--font-weight',lineHeight:'--line-height'}:{scale:'--heading-scale',weight:'--heading-weight',lineHeight:'--heading-line-height'}))if(fields[key]!==undefined)tokens[target]=cleanToken(target,key==='size'?fields[key]+'px':String(fields[key]));}}
 Object.assign(tokens,graphTokens(input.graph===undefined?{}:input.graph));
 if(input.ui!==undefined&&!object(input.ui))throw new Error('ui 需为对象。');const ui=cleanUI({...input.ui,...(!input.ui?.radius&&input.ui?.radius!==0&&tokens['--radius']?{radius:parseFloat(tokens['--radius'])}:{})});if(input.ui?.radius!==undefined)tokens['--radius']=ui.radius+'px';
 if(input.assets!==undefined)keysOnly(input.assets,['fonts','graphSymbols','artwork'],'assets');const fonts=cleanFonts(input.assets?.fonts||[]);
 const graphSymbols=input.assets?.graphSymbols===undefined?null:cleanGraphSymbols(input.assets.graphSymbols),graph=graphFromTokens(tokens);
 for(const[role,key]of [['node','nodeShape'],['relation','relationShape'],['background','background']])if(graph[key]==='symbol'&&!graphSymbols?.[role])throw new Error(`assets.graphSymbols.${role} 缺失，无法绘制自定义星图图形。`);
 let variants;
 if(input.variants!==undefined){keysOnly(input.variants,['light','dark'],'variants');variants={};for(const mode of ['light','dark']){if(!input.variants[mode])throw new Error('variants 需同时提供 light 和 dark。');keysOnly(input.variants[mode],PALETTE_KEYS,'variants.'+mode);variants[mode]=Object.fromEntries(Object.entries(input.variants[mode]).map(([key,value])=>[key,cleanToken(key,value)]));if(variants[mode]['--theme-mode']&&variants[mode]['--theme-mode']!==mode)throw new Error('主题明暗模式与 variants 不一致。');variants[mode]['--theme-mode']=mode;}}
 const result={format:'materia-theme',schemaVersion:2,name:safeName(input.name||filename.replace(/\.(mtheme\.)?json$/i,'')),description:String(input.description||'自定义完整外观方案').replace(/[\u0000-\u001f]/g,' ').slice(0,180),tokens,graph,ui,icons:cleanIcons(input.icons||{}),assets:{fonts,...(graphSymbols?{graphSymbols}:{}),...(input.assets?.artwork!==undefined?{artwork:cleanThemeArtwork(input.assets.artwork)}:{})},...(variants?{variants}:{})};if(JSON.stringify(result).length>MAX_THEME_BYTES)throw new Error('规范化后的完整主题包超过 24 MB。');return result;
}
export function themePackage(theme){return JSON.stringify(parseThemePackage({format:'materia-theme',schemaVersion:2,name:theme.name,description:theme.description,tokens:theme.tokens,graph:theme.graph,ui:glassUI(theme.ui||UI_DEFAULTS),icons:theme.icons||ICON_DEFAULTS,assets:theme.assets||{fonts:[]},...(theme.variants?{variants:theme.variants}:{})}),null,2)+'\n';}
const profiles={
 'buaa-blue':{description:'空天蓝与银白 · 轨道圆环 · 克制金色点缀',tokens:{'--sans':"'Segoe UI', 'Microsoft YaHei', sans-serif",'--serif':"'Segoe UI Semibold', 'Microsoft YaHei', sans-serif",'--numeric':"Bahnschrift, Consolas, monospace",'--heading-weight':'600'},ui:{style:'technical',density:1.02,radius:5,buttonRadius:5,cardRadius:7,menuRadius:6,cardPadding:16,cardGap:11,buttonStyle:'outlined',cardStyle:'outlined',sidebarStyle:'ruled',shadow:'none'},icons:{style:'technical',strokeWidth:1.5,size:18}},
 paper:{description:'编辑式留白 · 宋体标题 · 细线图标',tokens:{'--sans':"'Segoe UI', 'Microsoft YaHei', sans-serif",'--font-size':'13px'},ui:{style:'editorial',density:1.06,radius:4,buttonRadius:4,cardRadius:5,menuRadius:5,cardPadding:17,cardGap:12,shadow:'none',sidebarStyle:'flat'},icons:{style:'outline',strokeWidth:1.4,size:18}},
 'academic-purple':{description:'柔润学院风 · 等线正文 · 圆润图标',tokens:{'--sans':"DengXian, 'Microsoft YaHei', sans-serif",'--serif':"Georgia, KaiTi, SimSun, serif",'--font-size':'13px','--heading-weight':'400'},ui:{style:'soft',density:1,radius:10,buttonRadius:10,cardRadius:12,menuRadius:11,cardPadding:15,shadow:'soft',cardStyle:'elevated',sidebarStyle:'tinted'},icons:{style:'rounded',strokeWidth:1.65,size:18}},
 ocean:{description:'技术工作台 · 无衬线标题 · 方笔图标',tokens:{'--sans':"Bahnschrift, DengXian, 'Microsoft YaHei', sans-serif",'--serif':"'Segoe UI Semibold', 'Microsoft YaHei', sans-serif",'--numeric':"Consolas, 'Microsoft YaHei', monospace",'--font-size':'12px','--heading-weight':'600','--heading-scale':'.96'},ui:{style:'technical',density:.9,radius:3,buttonRadius:3,cardRadius:3,menuRadius:3,cardPadding:12,cardGap:7,buttonStyle:'outlined',sidebarStyle:'ruled',shadow:'none'},icons:{style:'technical',strokeWidth:1.6,size:18}},
 graphite:{description:'夜间控制台 · 等宽数字 · 双色图标',tokens:{'--sans':"'Segoe UI', 'Microsoft YaHei', sans-serif",'--serif':"'Segoe UI Semibold', 'Microsoft YaHei', sans-serif",'--numeric':"'Cascadia Mono', Consolas, monospace",'--mono':"'Cascadia Code', Consolas, monospace",'--font-size':'12.5px','--heading-weight':'600'},ui:{style:'technical',density:.94,radius:6,buttonRadius:6,cardRadius:8,menuRadius:8,cardPadding:13,cardStyle:'elevated',shadow:'lifted',sidebarStyle:'tinted'},icons:{style:'duotone',strokeWidth:1.55,size:19}},
 sand:{description:'手稿式版面 · 楷体正文 · 轻盈圆笔',tokens:{'--sans':"Georgia, KaiTi, STKaiti, SimSun, serif",'--serif':"'Palatino Linotype', KaiTi, SimSun, serif",'--font-size':'14px','--line-height':'1.85','--heading-scale':'1.06'},ui:{style:'manuscript',density:1.12,radius:2,buttonRadius:3,cardRadius:2,menuRadius:4,cardPadding:18,cardGap:13,buttonStyle:'soft',cardStyle:'ruled',sidebarStyle:'ruled',shadow:'none'},icons:{style:'rounded',strokeWidth:1.25,size:19}},
 wikipedia:{description:'百科条目式 · 衬线标题 · 实心图标',tokens:{'--font-size':'13px','--heading-weight':'400'},ui:{style:'encyclopedia',density:.94,radius:0,buttonRadius:2,cardRadius:0,menuRadius:1,cardPadding:12,cardGap:6,buttonStyle:'outlined',cardStyle:'ruled',sidebarStyle:'flat',shadow:'none'},icons:{style:'solid',strokeWidth:1.4,size:18}},
};
for(const theme of BUILTIN_THEMES){const profile=profiles[theme.id]||theme;theme.description=profile.description;theme.tokens={...theme.tokens,...profile.tokens};theme.ui=cleanUI(profile.ui);theme.tokens['--radius']=theme.ui.radius+'px';theme.icons=cleanIcons(profile.icons);theme.assets={fonts:[],...(profile.assets?.artwork?{artwork:cleanThemeArtwork(profile.assets.artwork)}:{}),...(profile.assets?.graphSymbols?{graphSymbols:cleanGraphSymbols(profile.assets.graphSymbols)}:{})};theme.graph=graphFromTokens(theme.tokens);}
BUILTIN_THEMES.splice(0,BUILTIN_THEMES.length,...curateThemes(BUILTIN_THEMES));
function savedPackage(row){
 const previous=Array.isArray(row.fontWarnings)?row.fontWarnings.slice(0,8).map(safeName):[];
 try{return{package:parseThemePackage(row.package),fontWarnings:previous};}
 catch(error){
  const source=row.package,rows=source?.assets?.fonts;
  if(source?.format!=='materia-theme'||source.schemaVersion!==2||!Array.isArray(rows)||rows.length>8)throw error;
  const valid=[],missing=[];for(const asset of rows){try{cleanFonts([asset]);valid.push(asset);}catch{missing.push(safeName(asset?.family||asset?.id||'资源字体'));}}
  if(!missing.length)throw error;
  return{package:parseThemePackage({...source,assets:{...source.assets,fonts:valid}}),fontWarnings:[...new Set([...previous,...missing])].slice(0,8)};
 }
}
export function cleanFontScale(value){return typeof value==='number'&&Number.isFinite(value)?Math.round(Math.max(85,Math.min(150,value))/5)*5:100;}
export function cleanThemePreferences(value){
 const themes=[],ids=new Set();let bytes=0;
 if(value&&Array.isArray(value.themes))for(const row of value.themes.slice(0,20)){
  if(!row||!/^custom-[a-z\d-]{1,80}$/i.test(row.id)||ids.has(row.id))continue;
  try{let next;if(row.package){const saved=savedPackage(row),pack=saved.package;next={id:row.id,name:safeName(row.name||pack.name),package:pack,...(saved.fontWarnings.length?{fontWarnings:saved.fontWarnings}:{})};}else{const parsed=parseThemeCSS(row.css,row.name);next={id:row.id,name:safeName(row.name||parsed.name),css:themeCSS(row.name||parsed.name,parsed.tokens)};}bytes+=JSON.stringify(next).length;if(bytes>48*1024*1024)throw new Error('已存主题资源超过 48 MB。');themes.push(next);ids.add(row.id);}catch{}
 }
 const alias=THEME_ALIASES[value?.selected],candidate=alias?.id||value?.selected;
 const selected=BUILTIN_THEMES.some(theme=>theme.id===candidate)||ids.has(candidate)?candidate:'paper';
 const fonts={body:FONT_OPTIONS.some(f=>f.id===value?.fonts?.body)?value.fonts.body:'theme',heading:FONT_OPTIONS.some(f=>f.id===value?.fonts?.heading)?value.fonts.heading:'theme'};
 for(const role of ['mono','numeric'])if(FONT_OPTIONS.some(f=>f.id===value?.fonts?.[role])&&value.fonts[role]!=='theme')fonts[role]=value.fonts[role];
 const fontScale=cleanFontScale(value?.fontScale);
 const mode=['light','dark'].includes(value?.mode)?value.mode:alias?.mode;
 return{selected,themes,...(mode?{mode}:{}),...(Object.values(fonts).some(value=>value!=='theme')?{fonts}:{}),...(fontScale!==100?{fontScale}:{})};
}
function fontTokens(preferences,tokens){const result={...tokens};for(const[role,key]of [['body','--sans'],['heading','--serif'],['mono','--mono'],['numeric','--numeric']]){const font=FONT_OPTIONS.find(f=>f.id===preferences.fonts?.[role]);if(font?.stack)result[key]=font.stack;}return result;}
export function resolveTheme(preferences){
 const prefs=cleanThemePreferences(preferences),base=BUILTIN_THEMES.find(theme=>theme.id===prefs.selected);
 if(base)return{...base,tokens:fontTokens(prefs,{...THEME_TOKENS,...modeTokens(base,prefs.mode||'light')}),graph:graphFromTokens(base.tokens),custom:false};
 const custom=prefs.themes.find(theme=>theme.id===prefs.selected),pack=custom.package||parseThemeCSS(custom.css,custom.name);
 return{id:custom.id,name:custom.name,description:pack.description||'自定义配色',tokens:fontTokens(prefs,{...THEME_TOKENS,...modeTokens(pack,prefs.mode||pack.tokens['--theme-mode']||'light'),'--radius':'16px'}),graph:graphFromTokens(pack.tokens),ui:glassUI({...UI_DEFAULTS,...pack.ui}),icons:pack.icons||ICON_DEFAULTS,assets:pack.assets||{fonts:[]},...(pack.variants?{variants:pack.variants}:{}),fontWarnings:custom.fontWarnings||[],custom:true};
}
export function importThemeFiles(preferences,files,newId){
 if(!Array.isArray(files)||!files.length)throw new Error('请选择 CSS 或 .mtheme.json 主题文件。');const next=cleanThemePreferences(preferences);let lastId='';
 const parsed=files.map(file=>{try{return /\.css$/i.test(file.name)?{kind:'css',value:parseThemeCSS(file.text,file.name)}:{kind:'package',value:parseThemePackage(file.text,file.name)};}catch(error){throw new Error(`${file.name}：${error.message}`);}});
 for(const{kind,value}of parsed){const existing=next.themes.find(row=>row.name.toLocaleLowerCase()===value.name.toLocaleLowerCase()),id=existing?.id||newId();const row=kind==='css'?{id,name:value.name,css:themeCSS(value.name,value.tokens)}:{id,name:value.name,package:value};if(existing){const index=next.themes.indexOf(existing);next.themes[index]=row;}else next.themes.push(row);lastId=id;}
 if(next.themes.length>20)throw new Error('最多保存 20 个自定义主题，请先删除一些。');if(JSON.stringify(next.themes).length>48*1024*1024)throw new Error('已存主题资源总计不超过 48 MB。');next.selected=lastId;return cleanThemePreferences(next);
}
export function removeTheme(preferences,id){const next=cleanThemePreferences(preferences);next.themes=next.themes.filter(row=>row.id!==id);if(next.selected===id)next.selected='paper';return next;}
