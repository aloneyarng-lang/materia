import {STEINS_ARTWORK} from './steins-artwork.js';
import {APPLE_UI_STACK,APPLE_MONO_STACK} from './builtin-fonts.js';
import {graphTokens} from './graph-appearance.js';
const path=(d,attrs={})=>({tag:'path',attrs:{d,...attrs}}),circle=(cx,cy,r,attrs={})=>({tag:'circle',attrs:{cx,cy,r,...attrs}}),rect=(x,y,width,height,rx,attrs={})=>({tag:'rect',attrs:{x,y,width,height,rx,...attrs}});
const light={
  '--theme-mode':'light','--paper':'#ece9e2','--surface':'#fffdf7','--canvas':'#ece9e2','--panel':'#a85d2815','--sidebar':'#ece9e2',
  '--ink':'#292c2d','--muted':'#676762','--line':'#463a3026','--teal':'#97491e','--teal-light':'#a85d281b','--on-accent':'#ffffff',
  '--warning':'#7c6428','--warning-soft':'#f6e9c8','--danger':'#b63b36','--danger-soft':'#fbe6e0','--shadow':'#3e291c20',
};
const dark={
  '--theme-mode':'dark','--paper':'#101316','--surface':'#25282a','--canvas':'#101316','--panel':'#e89a4d1d','--sidebar':'#101316',
  '--ink':'#f0e8de','--muted':'#b6ada1','--line':'#e8d5b729','--teal':'#ffac62','--teal-light':'#ed974d24','--on-accent':'#261b12',
  '--warning':'#b5c68d','--warning-soft':'#30392a','--danger':'#f29c8a','--danger-soft':'#4d2c29','--shadow':'#00000066',
};
const junction=[circle(12,12,9.5,{fill:'none',stroke:'theme-accent','stroke-width':1.15}),circle(12,12,6,{fill:'none',stroke:'theme-warning','stroke-width':.65}),path('M12 .5v3M12 20.5v3M.5 12h3M20.5 12h3M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2M7 14l5-5 5 3M12 9v8',{fill:'none',stroke:'theme-accent','stroke-width':1.1})];
const meter=[rect(2.5,5,19,14,3),path('M5 8v8M9 8v8M13 8v8M17 8v8M4 19v2M20 19v2M4 3h16')];
const gear=[path('M9 2.5h6l.7 2.3 2.1 1.2 2.4-.5 2 3.5-1.7 1.8v2.4l1.7 1.8-2 3.5-2.4-.5-2.1 1.2-.7 2.3H9l-.7-2.3-2.1-1.2-2.4.5-2-3.5 1.7-1.8v-2.4L1.8 9l2-3.5 2.4.5 2.1-1.2Z'),circle(12,12,4)];
export const STEINS_GATE_PRESET={
  id:'steins-gate',name:'命运石之门',description:'官方视觉 · 橙青星芒',
  tokens:{...light,'--sans':APPLE_UI_STACK,'--serif':APPLE_UI_STACK,'--mono':APPLE_MONO_STACK,'--numeric':APPLE_MONO_STACK,'--radius':'16px','--font-size':'13px','--font-weight':'400','--line-height':'1.7','--heading-weight':'600','--heading-line-height':'1.5','--heading-scale':'1',
    ...graphTokens({nodeShape:'nova',relationShape:'nova',nodeFill:'solid',background:'plain',colorMode:'accent',nodeColor:'#51cbd3',relationColor:'#f5a04b',edgeColor:'#699b9f',edgeStyle:'straight',edgeOpacity:.38,edgeWidth:1,nodeScale:1.12,nodeStroke:.5,labelScale:1,labelHalo:3,glow:4,twinkle:'off'})},
  variants:{light,dark},
  ui:{style:'glass',density:1.04,radius:16,buttonRadius:18,cardRadius:20,menuRadius:18,borderWidth:1,sidebarWidth:224,controlHeight:34,cardPadding:17,menuPadding:8,cardGap:12,buttonStyle:'solid',cardStyle:'elevated',sidebarStyle:'tinted',shadow:'lifted'},
  icons:{style:'technical',strokeWidth:1.45,size:19,overrides:{
    library:meter,files:[path('M7 3h9l4 4v14H7ZM16 3v5h4M3 7v14'),path('M10 11h7M10 14h3M15 14h2M10 17h7')],
    orbit:[circle(12,12,8.5),path('M2 12h5M17 12h5M12 2v5M12 17v5M8 15c3 0 2-6 6-6M8 9h.01M16 15h.01')],
    network:[circle(4,12,2),circle(20,5,2),circle(20,19,2),path('M6 12h4c4 0 2-7 8-7M10 12c4 0 2 7 8 7')],
    chart:[path('M4 3v17h17M7 13h3l2-7 3 12 2-7h4')],settings:gear,
    clock:[circle(12,12,9),path('M12 4v2M12 18v2M4 12h2M18 12h2M12 8v5l4 2')],
    assistant:[rect(3,4,18,15,2),path('M7 9h2M15 9h2M7 14h10M7 19v2M17 19v2M12 2v2')],
    folder:[path('M3 7V5h6l2 2h10v13H3Z'),path('M6 11h12M7 14h3M14 14h3')],
    tag:[path('M3 4h8l10 10-7 7L3 10Z'),circle(7,8,1),path('M11 10l5 5M9 12l5 5')],
    'natural-layout':[path('M4 18c1-9 4-10 8-10s6 3 8 8'),circle(4,18,2),circle(12,8,2),circle(20,16,2),path('M17 3v4M15 5h4')],
  }},
  assets:{fonts:[],artwork:STEINS_ARTWORK,graphSymbols:{relation:junction}},
};
