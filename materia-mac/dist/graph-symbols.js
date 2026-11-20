// Declarative theme artwork only; shapes are validated by theme-model before use.
import {getGraphThemeProfile} from './graph-appearance.js';
const NS='http://www.w3.org/2000/svg';
const roles={'theme-accent':'var(--teal)','theme-ink':'var(--ink)','theme-warning':'var(--warning)','theme-paper':'var(--surface)','theme-canvas':'var(--canvas)'};
let current={};
export function setGraphSymbols(value={}){current=value;}
export function getGraphSymbols(preset){return getGraphThemeProfile(preset)?.symbols||current;}
function element(tag,attrs={}){const node=document.createElementNS(NS,tag);for(const[key,value]of Object.entries(attrs))node.setAttribute(key,roles[value]||value);return node;}
export function graphSymbolNode(shapes,r=12){
 const group=element('g',{transform:`scale(${r/12}) translate(-12 -12)`,class:'theme-symbol-art'});
 for(const shape of shapes||[])group.append(element(shape.tag,shape.attrs));
 return group;
}
export class SymbolBackdrop{
 constructor(svg){this.svg=svg;}
 resize(height){this.node?.setAttribute('height',height);}
 sync(appearance,height,symbols=current){
  const symbol=appearance.background==='symbol'?symbols.background:null;
  if(this.symbol===symbol&&this.node?.parentNode===this.svg){this.node.setAttribute('height',height);return;}
  this.node?.remove();this.node=null;this.symbol=symbol;
  if(!symbol?.length)return;
  const scene=this.node=element('svg',{class:'theme-symbol-backdrop',width:1000,height,viewBox:'0 0 1000 700',preserveAspectRatio:'xMidYMid slice','aria-hidden':'true','pointer-events':'none'});
  const center=element('g',{transform:'translate(500 350)',opacity:'.065'});center.append(graphSymbolNode(symbol,250));scene.append(center);this.svg.prepend(scene);
 }
}
