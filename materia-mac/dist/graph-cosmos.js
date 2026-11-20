// Procedural decoration only. No external assets, graph edges or simulation nodes.
const NS='http://www.w3.org/2000/svg';
let nextScene=0;
const el=(tag,attrs={})=>{const node=document.createElementNS(NS,tag);for(const[key,value]of Object.entries(attrs))node.setAttribute(key,value);return node;};
export function cosmicStars(density=1,seed=42){
 let state=(Number(seed)>>>0)||1;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const count=Math.round(260*Math.max(0,Math.min(2,Number(density)||0)));
 return Array.from({length:count},(_,index)=>({x:random()*1000,y:random()*700,r:.22+random()**3*1.2,opacity:.18+random()*.7,spike:index%47===0,delay:-random()*12,duration:7+random()*6}));
}
export function cosmicNodeParts(shape,r,appearance){
 if(shape==='nova'){
  const halo=[2.4,1.85,1.4,1.02,.72].map((size,i)=>({tag:'circle',attrs:{r:r*size,class:'nova-halo',opacity:[.025,.045,.075,.12,.23][i]}}));
  const rays=[0,45,90,135].map((angle,i)=>({tag:'path',attrs:{d:`M${-r*(i%2?1.45:2.1)} 0 L0 ${-r*.075} L${r*(i%2?1.45:2.1)} 0 L0 ${r*.075} Z`,transform:`rotate(${angle})`,class:'nova-ray',opacity:i%2?.34:.7}}));
  return{back:[...halo,...rays,{tag:'circle',attrs:{r:r*.95,class:'nova-orbit'}}],front:[{tag:'circle',attrs:{r:r*.19,class:'nova-white-core'}}],radius:r*1.25};
 }
 if(shape!=='star'&&shape!=='planet')return{back:[],front:[],radius:r*(shape==='circle'?1:1.21)};
 const corona=[1.8,1.3,.87].map((size,index)=>({tag:'circle',attrs:{r:r*size,class:'cosmic-corona',opacity:[.035,.07,.13][index]}}));
 if(shape==='star')return{back:corona,front:[{tag:'circle',attrs:{r:r*.2,class:'cosmic-star-core'}}],radius:r*1.3};
 const rx=r*appearance.orbitScale,ry=rx*.32,transform=`rotate(${-appearance.orbitTilt})`;
 return{back:[...corona,{tag:'ellipse',attrs:{rx,ry,transform,class:'cosmic-orbit-back'}}],front:[
  {tag:'path',attrs:{d:`M0 ${-r*.68} A${r*.68} ${r*.68} 0 0 1 0 ${r*.68} Q${r*.55} 0 0 ${-r*.68} Z`,class:'cosmic-planet-shade'}},
  {tag:'ellipse',attrs:{cx:-r*.22,cy:-r*.24,rx:r*.2,ry:r*.12,class:'cosmic-planet-sheen'}},
  {tag:'path',attrs:{d:`M${-rx} 0 A${rx} ${ry} 0 0 0 ${rx} 0`,transform,class:'cosmic-orbit-front'}}
 ],radius:Math.max(r,rx)+1};
}
export function cosmicPartNode(part){return el(part.tag,part.attrs);}
export class CosmicBackdrop{
 constructor(svg){this.svg=svg;this.id='materia-cosmos-'+(++nextScene);}
 resize(height){this.node?.setAttribute('height',height);}
 sync(appearance,height){
  const {background,starDensity,starOpacity,seed}=appearance;
  const key=[background,starDensity,starOpacity,seed].join('|');
  if(key===this.key&&this.node?.parentNode===this.svg){this.resize(height);return;}
  this.key=key;this.node?.remove();this.node=null;
  if(!['stars','nebula'].includes(background))return;
  const scene=this.node=el('svg',{class:'cosmic-backdrop',x:0,y:0,width:1000,height,viewBox:'0 0 1000 700',preserveAspectRatio:'xMidYMid slice','aria-hidden':'true','pointer-events':'none'});
  const defs=el('defs');scene.append(defs);
  const dust=el('filter',{id:this.id+'-dust',x:-100,y:-100,width:1200,height:900,filterUnits:'userSpaceOnUse'});dust.append(el('feGaussianBlur',{stdDeviation:22}));defs.append(dust);
  for(const[name,color]of [['primary','var(--render-nebula-color)'],['secondary','var(--render-nebula-secondary)']]){
   const gradient=el('radialGradient',{id:this.id+'-'+name});
   for(const[offset,opacity]of [['0%',.7],['42%',.24],['100%',0]])gradient.append(el('stop',{offset,'stop-color':color,'stop-opacity':opacity}));defs.append(gradient);
  }
  if(background==='nebula'){
   const gas=el('g',{class:'cosmic-nebula'});scene.append(gas);
   for(const[cx,cy,rx,ry,rotation,color]of [[570,295,550,195,-26,'primary'],[410,390,490,155,-26,'secondary'],[780,165,310,140,-30,'primary'],[205,490,280,130,-32,'primary']])gas.append(el('ellipse',{cx,cy,rx,ry,transform:`rotate(${rotation} ${cx} ${cy})`,fill:`url(#${this.id}-${color})`}));
   // Dim, uneven dust lanes give the gas depth while remaining a static SVG.
   gas.append(el('path',{d:'M-80 560C210 350 290 470 470 300S780 230 1090-60',fill:'none',stroke:'var(--canvas)','stroke-width':58,opacity:.42,filter:`url(#${this.id}-dust)`}));
  }
  const stars=el('g',{class:'cosmic-stars',opacity:starOpacity});scene.append(stars);
  for(const[ index,star]of cosmicStars(starDensity,seed).entries()){
   const group=el('g',{class:index%4===0?'cosmic-distant-star cosmic-twinkle':'cosmic-distant-star',opacity:star.opacity});group.style.setProperty('--twinkle-delay',star.delay+'s');group.style.setProperty('--twinkle-duration',star.duration+'s');
   group.append(el('circle',{cx:star.x,cy:star.y,r:star.r}));
   if(star.spike)group.append(el('path',{d:`M${star.x-3.3} ${star.y}h6.6M${star.x} ${star.y-3.3}v6.6`,fill:'none','stroke-width':.45,opacity:.6}));stars.append(group);
  }
  this.svg.prepend(scene);
 }
}
