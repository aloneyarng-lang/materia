import {graphTokens} from './graph-appearance.js';
const path=(d,attrs={})=>({tag:'path',attrs:{d,...attrs}});
const circle=(cx,cy,r,attrs={})=>({tag:'circle',attrs:{cx,cy,r,...attrs}});
const rect=(x,y,width,height,attrs={})=>({tag:'rect',attrs:{x,y,width,height,...attrs}});
const red='#b52f40',white='#fff8e8';
export const REIMU_SYMBOLS={
 node:[
  path('M7 0H15L17 2V24H7Z',{fill:white,stroke:red,'stroke-width':1}),
  path('M15 0V2H17',{fill:'none',stroke:'#bc9450','stroke-width':.7}),
  rect(9,3,6,5,{fill:red,stroke:'none'}),
  path('M10.5 5.5H13.5M12 4V7',{fill:'none',stroke:white,'stroke-width':.65}),
  path('M12 10V21M9 12H15M10 15H14M9.5 19L12 16.5L14.5 19M10 22H14',{fill:'none',stroke:red,'stroke-width':1}),
 ],
 relation:[
  circle(12,12,11.5,{fill:'none',stroke:'#bc9450','stroke-width':.6}),
  circle(12,12,10,{fill:white,stroke:red,'stroke-width':.75}),
  path('M12 2A10 10 0 0 1 12 22A5 5 0 0 1 12 12A5 5 0 0 0 12 2Z',{fill:red,stroke:'none'}),
  circle(12,7,1.5,{fill:red,stroke:'none'}),
  circle(12,17,1.5,{fill:white,stroke:'none'}),
 ],
 background:[
  circle(12,12,11.5,{fill:'none',stroke:'theme-accent','stroke-width':.035}),
  circle(12,12,9.8,{fill:'none',stroke:'theme-accent','stroke-width':.02}),
  path('M5.5 8.5Q12 10 18.5 8.5M6.5 11.5H17.5M8.5 9L8 19M15.5 9L16 19M10.5 11.5V14H13.5V11.5M7 19H9.5M14.5 19H17',{fill:'none',stroke:'theme-accent','stroke-width':.22}),
  path('M3 12H5M19 12H21M12 3V5M12 19V21',{fill:'none',stroke:'theme-accent','stroke-width':.08}),
 ],
};
const taiji=[circle(12,12,9),path('M12 3A4.5 4.5 0 0 1 12 12A4.5 4.5 0 0 0 12 21'),circle(12,7.5,1.1,{fill:'currentColor',stroke:'none'}),circle(12,16.5,1.1)];
export const REIMU_ICONS={style:'outline',strokeWidth:1.5,size:19,overrides:{
 orbit:taiji,
 library:[rect(4,4,7,16,{rx:1}),rect(13,4,7,16,{rx:1}),path('M7.5 8V13M16.5 8V13M4 17H11M13 17H20')],
 home:[path('M2.5 4.5Q12 7.2 21.5 4.5M4 9H20M7 6.5L6 21M17 6.5L18 21M9 9V12H15V9M4.5 21H8.5M15.5 21H19.5')],
 folder:[path('M3 7V4.5H9L12 7.5H21V20.5H3Z'),path('M3 11H21M7 15H12')],
 tag:[path('M7 2.5H17V21.5L12 19.5L7 21.5Z'),path('M10 7H14M10 10H14M12 6V14M10 15H14')],
 star:[path('M3 7L9 9L12 7L15 9L21 7V18L15 16L12 18L9 16L3 18Z'),rect(9,9,6,7,{rx:1}),path('M6 10V15M18 10V15')],
 assistant:[path('M3 20L15 4M13 3L18 6L15 10L19 12L16 16L20 18L17 21M10 7L14 10M7 11L11 14')],
 network:[circle(12,12,3),circle(12,3,1.5),circle(20,17,1.5),circle(4,17,1.5),path('M12 4.5V9M14.6 13.5L18.7 16.2M9.4 13.5L5.3 16.2')],
 palette:[circle(12,12,9),path('M12 3V21M3 12H21'),circle(7.5,7.5,1.2,{fill:'currentColor',stroke:'none'}),circle(16.5,16.5,1.2)],
 files:[path('M6 2.5H15L19 6.5V21.5H6ZM15 2.5V7.5H19M3 6V21M10 11H15M10 15H15M10 18H13')],
}};
const typography={
 '--sans':"'Materia Inter', 'Materia Source Han Sans', 'Microsoft YaHei', sans-serif",
 '--serif':"Georgia, KaiTi, STKaiti, SimSun, 'Materia Source Han Sans', serif",
 '--numeric':"'Materia Source Code Pro', Consolas, 'Materia Source Han Sans', monospace",
 '--mono':"'Materia Source Code Pro', Consolas, 'Materia Source Han Sans', monospace",
 '--font-size':'13px','--font-weight':'400','--line-height':'1.75','--heading-scale':'1.08','--heading-weight':'400','--heading-line-height':'1.6',
};
const graph=graphTokens({nodeShape:'symbol',relationShape:'symbol',background:'symbol',nodeFill:'solid',nodeScale:1.8,nodeStroke:1,colorMode:'accent',edgeStyle:'curve',edgeDash:'solid',edgeWidth:1.1,edgeOpacity:.46,labelScale:1.08,labelHalo:3.5,glow:0,twinkle:'off'});
const ui={style:'manuscript',density:1.04,radius:4,buttonRadius:5,cardRadius:4,menuRadius:7,borderWidth:1,sidebarWidth:220,controlHeight:34,cardPadding:16,menuPadding:7,cardGap:11,buttonStyle:'solid',cardStyle:'outlined',sidebarStyle:'ruled',shadow:'none'};
export const REIMU_PRESETS=[{
 id:'reimu-day',name:'博丽灵梦 · 朱白结界',description:'折角御札与朱印符线 · 红白阴阳玉 · 鸟居结界底纹',
 tokens:{...typography,...graph,'--paper':'#f7f1e8','--surface':'#fffcf6','--canvas':'#fcf8f0','--panel':'#f0e6d9','--sidebar':'#f1e4dc','--ink':'#302124','--muted':'#745c59','--line':'#dcc9bd','--teal':red,'--teal-light':'#f7e1e0','--on-accent':'#fff9f0','--warning':'#85631c','--warning-soft':'#f5ebd1','--danger':'#9e2642','--danger-soft':'#f9e0e4','--shadow':'#501d2a16','--theme-mode':'light','--graph-edge-color':'#a35353','--graph-label-color':'#684e4b'},
 ui,icons:REIMU_ICONS,assets:{fonts:[],graphSymbols:REIMU_SYMBOLS},
},{
 id:'reimu-night',name:'博丽灵梦 · 梦想封印',description:'夜色御札与朱印符线 · 红白阴阳玉 · 鸟居结界底纹',
 tokens:{...typography,...graph,'--paper':'#181216','--surface':'#241b20','--canvas':'#160f15','--panel':'#302229','--sidebar':'#20161c','--ink':'#f6eae0','--muted':'#c5a9a6','--line':'#4d363e','--teal':'#f28b93','--teal-light':'#46282f','--on-accent':'#2a0e17','--warning':'#e3bd72','--warning-soft':'#3c3022','--danger':'#ffa8af','--danger-soft':'#48252d','--shadow':'#07030766','--theme-mode':'dark','--graph-edge-color':'#bd6974','--graph-label-color':'#e1c6be'},
 ui,icons:REIMU_ICONS,assets:{fonts:[],graphSymbols:REIMU_SYMBOLS},
}];
