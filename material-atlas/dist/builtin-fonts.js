// Font files are app resources, independent of any imported theme package.
const cjk="'PingFang SC', 'Microsoft YaHei UI', 'Microsoft YaHei', 'Materia Source Han Sans', sans-serif";
export const APPLE_UI_STACK="'Materia SF Pro', -apple-system, BlinkMacSystemFont, 'Materia Inter', "+cjk;
export const APPLE_MONO_STACK="'Materia SF Mono', 'SF Mono', 'Materia Source Code Pro', Consolas, "+cjk;
export const BUILTIN_FONT_OPTIONS=[
  {id:'apple-sf-pro',name:'Apple SF Pro · 本机内置',stack:APPLE_UI_STACK},
  {id:'apple-sf-mono',name:'Apple SF Mono · 本机内置',stack:APPLE_MONO_STACK},
  {id:'apple-new-york',name:'Apple New York · 本机内置',stack:"'Materia New York', 'New York', 'Songti SC', 'Materia Source Han Sans', Georgia, serif"},
  {id:'inter-bundled',name:'Inter · 内置',stack:"'Materia Inter', "+cjk},
  {id:'source-han-bundled',name:'思源黑体 · 内置',stack:"'Materia Source Han Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif"},
  {id:'source-code-bundled',name:'Source Code Pro · 内置',stack:"'Materia Source Code Pro', Consolas, 'Materia Source Han Sans', monospace"},
];
export const BUILTIN_FONT_FAMILIES=[
  {family:'Materia SF Pro',name:'SF Pro'},
  {family:'Materia SF Mono',name:'SF Mono'},
  {family:'Materia New York',name:'New York'},
  {family:'Materia Inter',name:'Inter'},
  {family:'Materia Source Han Sans',name:'思源黑体'},
  {family:'Materia Source Code Pro',name:'Source Code Pro'},
];
export async function loadBuiltinFonts(tokens){
  const used=new Set(['--sans','--serif','--numeric','--mono'].flatMap(key=>(tokens[key]||'').split(',').map(part=>part.trim().replace(/^['"]|['"]$/g,''))));
  const requested=BUILTIN_FONT_FAMILIES.filter(row=>used.has(row.family));
  const result=await Promise.allSettled(requested.map(async row=>{
    const faces=await document.fonts.load('400 13px "'+row.family+'"');
    if(!faces.length)throw Error(row.name+' 未注册');
    return row.name;
  }));
  return{requested:requested.length,loaded:result.flatMap(row=>row.status==='fulfilled'?[row.value]:[]),failed:result.flatMap((row,i)=>row.status==='rejected'?[requested[i].name]:[])};
}
