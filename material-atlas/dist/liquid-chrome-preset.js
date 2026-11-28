import {APPLE_UI_STACK,APPLE_MONO_STACK} from './builtin-fonts.js';
import {graphTokens} from './graph-appearance.js';

const path=(d,attrs={})=>({tag:'path',attrs:{d,...attrs}});
const circle=(cx,cy,r,attrs={})=>({tag:'circle',attrs:{cx,cy,r,...attrs}});
const ellipse=(cx,cy,rx,ry,attrs={})=>({tag:'ellipse',attrs:{cx,cy,rx,ry,...attrs}});
const rect=(x,y,width,height,rx,attrs={})=>({tag:'rect',attrs:{x,y,width,height,rx,...attrs}});
const polygon=(points,attrs={})=>({tag:'polygon',attrs:{points,...attrs}});

const light={
  '--theme-mode':'light',
  '--paper':'#eceff5',
  '--surface':'#fbfcfe',
  '--canvas':'#eceff5',
  '--panel':'#2c426e14',
  '--sidebar':'#e3e8f1',
  '--ink':'#161b26',
  '--muted':'#4d5970',
  '--line':'#1d2b4824',
  '--teal':'#274375',
  '--teal-light':'#2743751a',
  '--on-accent':'#ffffff',
  '--warning':'#94621d',
  '--warning-soft':'#faf0df',
  '--danger':'#b82d46',
  '--danger-soft':'#fce7ec',
  '--shadow':'#0f1a3022',
};

const dark={
  '--theme-mode':'dark',
  '--paper':'#07090f',
  '--surface':'#121622',
  '--canvas':'#07090f',
  '--panel':'#c8d8f01a',
  '--sidebar':'#0c0f18',
  '--ink':'#f2f5fb',
  '--muted':'#96a3ba',
  '--line':'#d2dff526',
  '--teal':'#c8d8f0',
  '--teal-light':'#9cb8e829',
  '--on-accent':'#090d16',
  '--warning':'#f2bc74',
  '--warning-soft':'#3a2d1b',
  '--danger':'#ff8fa3',
  '--danger-soft':'#421e28',
  '--shadow':'#02040a78',
};

// Liquid Chrome Neo-Baroque Starburst, Mercury Hubs & Optical Glass Ripple Symbols (24x24, semantic paints).
export const LIQUID_CHROME_SYMBOLS={
  node:[
    circle(12,12,11.1,{fill:'none',stroke:'theme-accent','stroke-width':.45,opacity:.36}),
    circle(12,12,8.4,{fill:'none',stroke:'theme-warning','stroke-width':.42,opacity:.48}),
    circle(12,12,5.6,{fill:'theme-paper',stroke:'theme-accent','stroke-width':.7,'fill-opacity':.94}),
    // 4 long cardinal chrome dagger rays
    polygon('12,1.2 13.15,8.2 12,10.2 10.85,8.2',{fill:'theme-accent',stroke:'theme-paper','stroke-width':.28}),
    polygon('22.8,12 15.8,13.15 13.8,12 15.8,10.85',{fill:'theme-accent',stroke:'theme-paper','stroke-width':.28}),
    polygon('12,22.8 10.85,15.8 12,13.8 13.15,15.8',{fill:'theme-accent',stroke:'theme-paper','stroke-width':.28}),
    polygon('1.2,12 8.2,10.85 10.2,12 8.2,13.15',{fill:'theme-accent',stroke:'theme-paper','stroke-width':.28}),
    // 4 diagonal beveled rays
    polygon('18.6,5.4 14.3,10.9 13.2,9.8',{fill:'theme-warning',stroke:'theme-paper','stroke-width':.22}),
    polygon('18.6,18.6 13.2,14.2 14.3,13.1',{fill:'theme-warning',stroke:'theme-paper','stroke-width':.22}),
    polygon('5.4,18.6 9.8,13.1 10.9,14.2',{fill:'theme-warning',stroke:'theme-paper','stroke-width':.22}),
    polygon('5.4,5.4 10.9,9.8 9.8,10.9',{fill:'theme-warning',stroke:'theme-paper','stroke-width':.22}),
    circle(12,12,2.8,{fill:'theme-paper',stroke:'theme-accent','stroke-width':.65}),
    circle(12,12,1.35,{fill:'theme-warning',stroke:'none'}),
    circle(19.6,5.2,1.1,{fill:'theme-accent',stroke:'theme-paper','stroke-width':.35}),
  ],
  relation:[
    circle(12,12,11.4,{fill:'none',stroke:'theme-warning','stroke-width':.45,opacity:.48}),
    circle(12,12,9.6,{fill:'theme-paper',stroke:'theme-accent','stroke-width':.95,'fill-opacity':.94}),
    circle(12,12,7.1,{fill:'none',stroke:'theme-warning','stroke-width':.55,opacity:.72}),
    path('M12 2.4L12.8 5.2L12 6.4L11.2 5.2Z M21.6 12L18.8 12.8L17.6 12L18.8 11.2Z M12 21.6L11.2 18.8L12 17.6L12.8 18.8Z M2.4 12L5.2 11.2L6.4 12L5.2 12.8Z',{fill:'theme-accent',stroke:'none',opacity:.85}),
    circle(12,12,4.3,{fill:'theme-accent',stroke:'theme-paper','stroke-width':.5,'fill-opacity':.9}),
    path('M9.8 10.2A3.1 3.1 0 0 1 13.8 9.2',{fill:'none',stroke:'theme-paper','stroke-width':.7,opacity:.9}),
    circle(13.4,13.1,.85,{fill:'theme-warning',stroke:'none'}),
    circle(12,12,1.15,{fill:'theme-paper',stroke:'none'}),
  ],
  background:[
    // Concentric optical glass refraction ripples
    circle(12,12,11.6,{fill:'none',stroke:'theme-accent','stroke-width':.055,opacity:.85}),
    circle(12,12,9.8,{fill:'none',stroke:'theme-accent','stroke-width':.04,opacity:.75}),
    circle(12,12,7.8,{fill:'none',stroke:'theme-warning','stroke-width':.045,opacity:.72}),
    circle(12,12,5.6,{fill:'none',stroke:'theme-accent','stroke-width':.038,opacity:.65}),
    circle(12,12,3.4,{fill:'none',stroke:'theme-warning','stroke-width':.035,opacity:.6}),
    // Symmetrical left & right neo-baroque sweeping chrome filigree arcs with thorns
    path('M6.8 3.2C2.2 6.8 2.2 17.2 6.8 20.8C3.5 16.9 3.5 7.1 6.8 3.2Z',{fill:'theme-accent',stroke:'theme-accent','stroke-width':.04,opacity:.85}),
    path('M17.2 3.2C21.8 6.8 21.8 17.2 17.2 20.8C20.5 16.9 20.5 7.1 17.2 3.2Z',{fill:'theme-accent',stroke:'theme-accent','stroke-width':.04,opacity:.85}),
    path('M4.5 7.2L7.3 8.1L4.2 9.4M3.8 11.4L6.7 12L3.8 12.6M4.5 16.8L7.3 15.9L4.2 14.6',{fill:'none',stroke:'theme-warning','stroke-width':.06,opacity:.82}),
    path('M19.5 7.2L16.7 8.1L19.8 9.4M20.2 11.4L17.3 12L20.2 12.6M19.5 16.8L16.7 15.9L19.8 14.6',{fill:'none',stroke:'theme-warning','stroke-width':.06,opacity:.82}),
    // Top & bottom pouring liquid-chrome crown curves
    path('M7.6 1.4C9.5 3.6 10.7 4.4 12 2.4C13.3 4.4 14.5 3.6 16.4 1.4',{fill:'none',stroke:'theme-accent','stroke-width':.06,opacity:.85}),
    path('M7.6 22.6C9.5 20.4 10.7 19.6 12 21.6C13.3 19.6 14.5 20.4 16.4 22.6',{fill:'none',stroke:'theme-accent','stroke-width':.06,opacity:.85}),
    // Meridian crosshairs
    path('M12 0.2V2.6M12 21.4V23.8M0.2 12H2.6M21.4 12H23.8',{fill:'none',stroke:'theme-warning','stroke-width':.05,opacity:.75}),
    // Suspended orbiting mercury droplets
    circle(7.2,5.6,.34,{fill:'theme-accent',stroke:'none'}),
    circle(16.8,5.6,.34,{fill:'theme-warning',stroke:'none'}),
    circle(18.6,12,.3,{fill:'theme-accent',stroke:'none'}),
    circle(5.4,12,.3,{fill:'theme-warning',stroke:'none'}),
    circle(7.2,18.4,.32,{fill:'theme-warning',stroke:'none'}),
    circle(16.8,18.4,.32,{fill:'theme-accent',stroke:'none'}),
  ],
};

export const LIQUID_CHROME_ICONS={
  style:'technical',
  strokeWidth:1.45,
  size:19,
  overrides:{
    assistant:[
      path('M12 2.4L13.8 9.2L20.8 12L13.8 14.8L12 21.6L10.2 14.8L3.2 12L10.2 9.2Z'),
      circle(12,12,2.1),
      circle(18.5,5.5,1.1,{fill:'currentColor',stroke:'none'}),
    ],
    orbit:[
      circle(12,12,8.8),
      circle(12,12,4.6),
      path('M12 1.8V4.2M12 19.8V22.2M1.8 12H4.2M19.8 12H22.2'),
      circle(17.8,6.2,1.35,{fill:'currentColor',stroke:'none'}),
    ],
    network:[
      path('M8.5 4.2L9.6 7.4L12.8 8.5L9.6 9.6L8.5 12.8L7.4 9.6L4.2 8.5L7.4 7.4Z'),
      circle(18.2,7.2,2),
      circle(16.5,18.2,2),
      circle(6.2,17.8,1.7),
      path('M11.8 8.2L16.2 7.5M10.4 10.6L15.1 16.7M8.1 12.2L6.7 16.1'),
    ],
    star:[
      path('M12 2L14 9.5L21.6 12L14 14.5L12 22L10 14.5L2.4 12L10 9.5Z'),
      circle(12,12,1.4,{fill:'currentColor',stroke:'none'}),
    ],
    library:[
      rect(3.5,3.8,17,16.4,3),
      path('M9.4 3.8V20.2M13 8.6H17.2M13 12.4H17.2M13 16.2H15.8'),
      circle(6.4,8.6,1,{fill:'currentColor',stroke:'none'}),
    ],
    folder:[
      path('M3 8.2A2.6 2.6 0 0 1 5.6 5.6H9.6L12 8H18.4A2.6 2.6 0 0 1 21 10.6V17.8A2.6 2.6 0 0 1 18.4 20.4H5.6A2.6 2.6 0 0 1 3 17.8Z'),
      circle(15.8,14.1,1.9),
      path('M15.8 11.1V17.1M12.8 14.1H18.8'),
    ],
    chart:[
      rect(3,3.5,18,17,3.5),
      path('M6.6 16.2L10.4 12.2L13.5 14.2L17.4 8.4'),
      circle(17.4,8.4,1.25,{fill:'currentColor',stroke:'none'}),
    ],
    palette:[
      circle(12,12,9),
      circle(12,12,4.2),
      path('M12 3V5.5M12 18.5V21M3 12H5.5M18.5 12H21'),
      circle(12,12,1.2,{fill:'currentColor',stroke:'none'}),
    ],
    settings:[
      path('M4 6.5H20M4 12H20M4 17.5H20'),
      circle(9,6.5,2.1),
      circle(15.5,12,2.1),
      circle(10,17.5,2.1),
    ],
    files:[
      rect(6.5,3,13.5,18,2.8),
      path('M3.5 7V18.2A3 3 0 0 0 6.5 21.2M10.2 9H16.2M10.2 13H16.2M10.2 16.8H13.8'),
    ],
    tag:[
      path('M3.5 5.6A2.1 2.1 0 0 1 5.6 3.5H11.2L20.1 12.4A2 2 0 0 1 20.1 15.2L15.2 20.1A2 2 0 0 1 12.4 20.1L3.5 11.2Z'),
      circle(8.1,8.1,1.25,{fill:'currentColor',stroke:'none'}),
    ],
    search:[
      circle(10.8,10.8,6.8),
      path('M15.8 15.8L20.6 20.6M10.8 7.8V13.8M7.8 10.8H13.8'),
    ],
    'natural-layout':[
      path('M4.5 18C5.6 10.2 8.4 8.4 12 8.4C15.6 8.4 18 11.2 19.5 16.2'),
      circle(4.5,18,1.8),
      circle(12,8.4,2.1),
      circle(19.5,16.2,1.8),
      path('M18 3.2L18.5 4.8L20.1 5.3L18.5 5.8L18 7.4L17.5 5.8L15.9 5.3L17.5 4.8Z'),
    ],
    flask:[
      path('M9 3H15M10 3V9.4L4.8 18.2A1.8 1.8 0 0 0 6.4 21H17.6A1.8 1.8 0 0 0 19.2 18.2L14 9.4V3'),
      path('M7.4 15.2H16.6'),
      circle(12,17.8,1.1,{fill:'currentColor',stroke:'none'}),
    ],
  },
};

export const LIQUID_CHROME_PRESET={
  id:'liquid-chrome',
  name:'液态铂金',
  description:'水银圣殿 · 镀铬星芒',
  tokens:{
    ...light,
    '--sans':APPLE_UI_STACK,
    '--serif':"'Materia New York', 'Materia Source Han Sans', serif",
    '--mono':APPLE_MONO_STACK,
    '--numeric':APPLE_MONO_STACK,
    '--radius':'16px',
    '--font-size':'13px',
    '--font-weight':'400',
    '--line-height':'1.65',
    '--heading-weight':'600',
    '--heading-line-height':'1.4',
    '--heading-scale':'1',
    ...graphTokens({
      nodeShape:'symbol',
      relationShape:'symbol',
      background:'symbol',
      nodeFill:'solid',
      colorMode:'accent',
      edgeStyle:'curve',
      edgeDash:'solid',
      nodeScale:1.52,
      nodeStroke:1,
      edgeWidth:1.05,
      edgeOpacity:.38,
      edgeColor:'auto',
      labelColor:'auto',
      labelScale:1.02,
      labelHalo:3,
      glow:2.4,
      twinkle:'off',
    }),
  },
  variants:{light,dark},
  ui:{
    style:'glass',
    density:1.04,
    radius:16,
    buttonRadius:18,
    cardRadius:20,
    menuRadius:18,
    borderWidth:1,
    sidebarWidth:224,
    controlHeight:36,
    cardPadding:18,
    menuPadding:8,
    cardGap:12,
    buttonStyle:'solid',
    cardStyle:'elevated',
    sidebarStyle:'tinted',
    shadow:'lifted',
  },
  icons:LIQUID_CHROME_ICONS,
  assets:{fonts:[],graphSymbols:LIQUID_CHROME_SYMBOLS},
};
