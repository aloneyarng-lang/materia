import {t as tr,html,msg} from './i18n.js';
// Safe graph appearance tokens shared by CSS themes, complete packages and the SVG renderer.
export const GRAPH_APPEARANCE_VERSION=5;
export const GRAPH_FIELDS={
 nodeShape:{token:'--graph-node-shape',default:'circle',values:['circle','diamond','hexagon','square','star','planet','nova','symbol']},
 relationShape:{token:'--graph-relation-shape',default:'circle',values:['circle','diamond','hexagon','square','star','planet','nova','symbol']},
 nodeFill:{token:'--graph-node-fill',default:'solid',values:['solid','hollow']},
 edgeStyle:{token:'--graph-edge-style',default:'straight',values:['straight','curve']},
 edgeDash:{token:'--graph-edge-dash',default:'solid',values:['solid','dashed','dotted']},
 background:{token:'--graph-background',default:'plain',values:['plain','dots','grid','stars','nebula','symbol']},
 colorMode:{token:'--graph-color-mode',default:'category',values:['category','accent']},
 nodeScale:{token:'--graph-node-scale',default:'1',range:[.7,1.8]},
 nodeStroke:{token:'--graph-node-stroke',default:'.7',range:[.4,3]},
 edgeWidth:{token:'--graph-edge-width',default:'1',range:[.4,2.5]},
 edgeOpacity:{token:'--graph-edge-opacity',default:'.2',range:[.05,.8]},
 labelScale:{token:'--graph-label-scale',default:'1',range:[.75,1.5]},
 labelHalo:{token:'--graph-label-halo',default:'3px',range:[0,6],unit:'px'},
 glow:{token:'--graph-glow',default:'0px',range:[0,8],unit:'px'},
 edgeColor:{token:'--graph-edge-color',default:'auto',color:true},
 nodeColor:{token:'--graph-node-color',default:'auto',color:true},
 relationColor:{token:'--graph-relation-color',default:'auto',color:true},
 labelColor:{token:'--graph-label-color',default:'auto',color:true},
 starDensity:{token:'--graph-star-density',default:'1',range:[0,2]},
 starOpacity:{token:'--graph-star-opacity',default:'.55',range:[0,1]},
 starColor:{token:'--graph-star-color',default:'#cfe3ff',color:true},
 nebulaIntensity:{token:'--graph-nebula-intensity',default:'.5',range:[0,1]},
 nebulaColor:{token:'--graph-nebula-color',default:'#6553ab',color:true},
 nebulaColorSecondary:{token:'--graph-nebula-color-secondary',default:'#257c9b',color:true},
 orbitScale:{token:'--graph-orbit-scale',default:'1.65',range:[1.2,2.6]},
 orbitTilt:{token:'--graph-orbit-tilt',default:'25',range:[0,180]},
 twinkle:{token:'--graph-twinkle',default:'off',values:['off','subtle']},
 seed:{token:'--graph-seed',default:'42',range:[0,65535],integer:true},
};
export const GRAPH_THEME_TOKENS=Object.fromEntries(Object.values(GRAPH_FIELDS).map(row=>[row.token,row.default]));
const byToken=new Map(Object.entries(GRAPH_FIELDS).map(([key,row])=>[row.token,{key,...row}]));
export function cleanGraphToken(key,input){
 const row=byToken.get(key);if(!row)throw Error(tr('未知星图变量 ',false)+key);const value=String(input).trim();
 if(row.values){if(!row.values.includes(value))throw Error(msg`${key} 可选：${row.values.join(' / ')}。`);}
 else if(row.color){if(value!=='auto'&&!/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)&&! /^(?:rgb|rgba|hsl|hsla)\([\d\s.,%+\-/]+\)$/i.test(value))throw Error(key+tr(' 请填写 auto 或颜色。',false));}
 else{const numeric=row.unit?value.replace(/px$/,''):value;if(!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(numeric)||row.unit&&!value.endsWith(row.unit)||Number(numeric)<row.range[0]||Number(numeric)>row.range[1]||row.integer&&!Number.isInteger(Number(numeric)))throw Error(msg`${key} 需为 ${row.range.join(tr(' 至 '))}${row.unit||''}${row.integer?tr(' 的整数'):''}。`);}
 return value;
}
export function graphTokens(graph={}){
 if(!graph||typeof graph!=='object'||Array.isArray(graph))throw Error(tr('graph 需为对象。'));const tokens={};
 for(const[key,value]of Object.entries(graph)){const row=GRAPH_FIELDS[key];if(!row)throw Error(tr('graph 不支持字段 ',false)+key);if(row.range&&(typeof value!=='number'||!Number.isFinite(value)))throw Error('graph.'+key+tr(' 需为有限数值。',false));tokens[row.token]=cleanGraphToken(row.token,row.range?String(value)+(row.unit||''):value);}return tokens;
}
export function graphFromTokens(tokens={}){return Object.fromEntries(Object.entries(GRAPH_FIELDS).map(([key,row])=>{let value;try{value=cleanGraphToken(row.token,tokens[row.token]??row.default);}catch{value=row.default;}return[key,row.range?parseFloat(value):value];}));}
export const GRAPH_PRESETS={
 classic:{name:tr('经典圆点'),graph:graphFromTokens()},
 orbital:{name:tr('轨道圆环'),graph:graphFromTokens(graphTokens({nodeFill:'hollow',relationShape:'diamond',edgeStyle:'curve',edgeOpacity:.3,nodeStroke:1.5,nodeScale:1.25,background:'dots'}))},
 crystal:{name:tr('晶格节点'),graph:graphFromTokens(graphTokens({nodeShape:'hexagon',relationShape:'diamond',edgeStyle:'straight',background:'grid',nodeStroke:1.2,nodeScale:1.35,edgeOpacity:.3,edgeDash:'dashed'}))},
 cosmos:{name:tr('宇宙星野'),graph:graphFromTokens(graphTokens({nodeShape:'star',relationShape:'planet',background:'nebula',nodeFill:'solid',colorMode:'accent',nodeScale:1.15,nodeStroke:.5,edgeStyle:'straight',edgeOpacity:.34,glow:4,twinkle:'subtle'}))},
};
let themeProfiles=new Map();
export function setGraphThemeOptions(themes){themeProfiles=new Map(themes.map(t=>['theme:'+t.id,{id:'theme:'+t.id,name:t.name,graph:t.graph||graphFromTokens(t.tokens),symbols:t.assets?.graphSymbols||{}}]));}
export function getGraphThemeOptions(){return [...themeProfiles.values()];}
export function getGraphThemeProfile(id){return themeProfiles.get(id);}
export function graphAppearance(tokens={},preset='theme'){return themeProfiles.has(preset)?{...themeProfiles.get(preset).graph,edgeColor:graphFromTokens(tokens).edgeColor,labelColor:graphFromTokens(tokens).labelColor}:preset!=='theme'&&GRAPH_PRESETS[preset]?{...GRAPH_PRESETS[preset].graph,edgeColor:graphFromTokens(tokens).edgeColor,labelColor:graphFromTokens(tokens).labelColor}:graphFromTokens(tokens);}
export function nodeGeometry(shape,r){
 if(shape==='symbol')return{tag:'g',attrs:{}};
 if(shape==='nova')return{tag:'circle',attrs:{r:r*.46}};
 if(shape==='star')return{tag:'path',attrs:{d:`M0 ${-r*1.25} Q${r*.16} ${-r*.16} ${r*1.05} 0 Q${r*.16} ${r*.16} 0 ${r*1.25} Q${-r*.16} ${r*.16} ${-r*1.05} 0 Q${-r*.16} ${-r*.16} 0 ${-r*1.25} Z`}};
 if(shape==='planet')return{tag:'circle',attrs:{r:r*.68}};
 if(shape==='square')return{tag:'rect',attrs:{x:-r*.85,y:-r*.85,width:r*1.7,height:r*1.7,rx:r*.16}};
 if(shape==='diamond')return{tag:'path',attrs:{d:`M0 ${-r*1.15} L${r*1.15} 0 L0 ${r*1.15} L${-r*1.15} 0 Z`}};
 if(shape==='hexagon')return{tag:'path',attrs:{d:Array.from({length:6},(_,i)=>{const a=Math.PI/3*i;return(i?'L':'M')+(Math.cos(a)*r*1.1)+','+(Math.sin(a)*r*1.1);}).join(' ')+' Z'}};
 return{tag:'circle',attrs:{r}};
}
export function edgeGeometry(a,b,style='straight'){
 const dx=b.x-a.x,dy=b.y-a.y,d=Math.max(1,Math.hypot(dx,dy));if(d<1.01)return`M${a.x},${a.y} L${b.x},${b.y}`;
 const bend=style==='curve'?Math.min(42,d*.13):0,c={x:(a.x+b.x)/2-dy/d*bend,y:(a.y+b.y)/2+dx/d*bend};
 const startVector={x:c.x-a.x,y:c.y-a.y},endVector={x:c.x-b.x,y:c.y-b.y};
 const offset=(n,v)=>{const length=Math.hypot(v.x,v.y)||1,pad=Math.min((n.visualRadius??n.radius)+3,d*.4);return{x:n.x+v.x/length*pad,y:n.y+v.y/length*pad};};
 const s=offset(a,startVector),e=offset(b,endVector);return`M${s.x},${s.y} ${style==='curve'?`Q${c.x},${c.y} `:'L'}${e.x},${e.y}`;
}
