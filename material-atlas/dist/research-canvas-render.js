import {t as tr,html,msg} from './i18n.js';
import {canvasNodeSize,canvasBounds,wrapCanvasText} from './research-canvas-model.js';
export const xml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const semanticColors={blue:'#3c73a6',purple:'#8262a3',green:'#4b8974',red:'#b86a64',gray:'#7d8895'};
export function canvasPalette(root=document.documentElement){const css=getComputedStyle(root),get=(name,fallback)=>css.getPropertyValue(name).trim()||fallback;return{paper:get('--canvas','#f8f9fb'),surface:get('--surface','#ffffff'),ink:get('--ink','#263a48'),muted:get('--muted','#718091'),line:get('--line','#d8e1e8'),accent:get('--teal','#476f83'),gold:get('--warning','#a27c3f'),...semanticColors,font:get('--sans',"'Segoe UI', 'Microsoft YaHei', sans-serif")};}
const themes={
 paper:{paper:'#f4f0e6',surface:'#fffdf6',ink:'#242321',muted:'#5e574e',line:'#b5aa97',accent:'#804a27',gold:'#895900'},
 blueprint:{paper:'#e8f0fa',surface:'#f9fcff',ink:'#142c43',muted:'#49657d',line:'#9aafc8',accent:'#1b62a3',gold:'#825a11'},
 forest:{paper:'#e7efe8',surface:'#fbfdf8',ink:'#192e24',muted:'#496353',line:'#9aaf9d',accent:'#2f6d4f',gold:'#815a22'},
 night:{paper:'#141d2b',surface:'#202e42',ink:'#f4f7fc',muted:'#b4c4da',line:'#647b98',accent:'#92c7ff',gold:'#f5cd75',blue:'#8ec6ff',purple:'#d0aff7',green:'#89d9b1',red:'#f2a9a3',gray:'#bac8da'},
};
export function canvasBoardPalette(board,root){
 const preset=Object.hasOwn(themes,board?.theme)?themes[board.theme]:null;
 return {...canvasPalette(root),...preset};
}
function outline(kind,x,y){
 switch(kind){
  case 'diamond': return [[0,-y],[x,0],[0,y],[-x,0]];
  case 'hexagon': return [[18-x,-y],[x-18,-y],[x,0],[x-18,y],[18-x,y],[-x,0]];
  case 'parallelogram': return [[24-x,-y],[x,-y],[x-24,y],[-x,y]];
  case 'document': return [[-x,-y],[x-20,-y],[x,20-y],[x,y],[-x,y]];
  case 'octagon': return [[20-x,-y],[x-20,-y],[x,20-y],[x,y-20],[x-20,y],[20-x,y],[-x,y-20],[-x,20-y]];
  default: return null;
 }
}
const cornerRadius=(kind,x,y)=>kind==='pill'?Math.min(x,y):kind==='rect'?2:12;
function shape(kind,w,h,stroke,fill){
 const common=`fill="${xml(fill)}" stroke="${xml(stroke)}" stroke-width="1.5"`;
 const x=w/2,y=h/2,points=outline(kind,x,y);
 if(points)return `<polygon points="${points.map(p=>p.join(',')).join(' ')}" ${common}/>`;
 if(kind==='ellipse')return `<ellipse rx="${x}" ry="${y}" ${common}/>`;
 return `<rect x="${-x}" y="${-y}" width="${w}" height="${h}" rx="${cornerRadius(kind,x,y)}" ${common}/>`;
}
function endpoint(a,b){
 const {width,height}=canvasNodeSize(a),x=width/2,y=height/2;
 const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
 if(!length)return {x:a.x,y:a.y};
 const ux=dx/length,uy=dy/length,points=outline(a.shape,x,y);
 let distance;
 if(points){
  distance=Infinity;
  for(const [i,[px,py]] of points.entries()){
   const [qx,qy]=points[(i+1)%points.length],ex=qx-px,ey=qy-py;
   const approach=ux*ey-uy*ex;
   if(approach>0)distance=Math.min(distance,(px*ey-py*ex)/approach);
  }
 }else if(a.shape==='ellipse')distance=1/Math.hypot(ux/x,uy/y);
 else{
  const radius=cornerRadius(a.shape,x,y);
  let low=0,high=Math.hypot(x,y);
  for(let i=0;i<20;i++){
   const mid=(low+high)/2;
   const cornerX=Math.max(0,Math.abs(ux*mid)-x+radius);
   const cornerY=Math.max(0,Math.abs(uy*mid)-y+radius);
   if(Math.hypot(cornerX,cornerY)<=radius)low=mid;
   else high=mid;
  }
  distance=low;
 }
 return {x:a.x+ux*(distance+3),y:a.y+uy*(distance+3)};
}
export function canvasEdgeGeometry(a,b,board){const p=endpoint(a,b),q=endpoint(b,a);if(!Number.isFinite(p.x+q.x+p.y+q.y))return{path:`M${a.x},${a.y} L${b.x},${b.y}`,x:a.x,y:a.y};if(board.layout==='mindmap'){if(board.direction==='down'){const my=(p.y+q.y)/2;return{path:`M${p.x},${p.y} C${p.x},${my} ${q.x},${my} ${q.x},${q.y}`,x:(p.x+q.x)/2,y:my};}const mx=(p.x+q.x)/2;return{path:`M${p.x},${p.y} C${mx},${p.y} ${mx},${q.y} ${q.x},${q.y}`,x:mx,y:(p.y+q.y)/2};}return{path:`M${p.x},${p.y} L${q.x},${q.y}`,x:(p.x+q.x)/2,y:(p.y+q.y)/2};}
function nodeImage(node,asset,size){
 const {width,height,imageHeight,contentTop}=size;
 const y=contentTop+12;
 const halfWidth=width/2,ratio=Math.max(Math.abs(y),Math.abs(y+imageHeight))/(height/2);
 let available=halfWidth-20;
 if(node.shape==='diamond')available=Math.min(available,halfWidth*(1-ratio)-4);
 if(node.shape==='ellipse')available=Math.min(available,halfWidth*Math.sqrt(1-ratio*ratio)-5);
 if(node.shape==='pill'){
  const radius=cornerRadius(node.shape,halfWidth,height/2);
  const inset=Math.max(0,ratio*height/2-height/2+radius);
  available=Math.min(available,halfWidth-radius+Math.sqrt(radius*radius-inset*inset)-5);
 }
 if(['parallelogram','octagon','document'].includes(node.shape))available=halfWidth-28;
 return `<image href="${xml(asset.data)}" x="${-available}" y="${y}" width="${available*2}" height="${imageHeight}" preserveAspectRatio="xMidYMid meet"/>`;
}
export function canvasContent(board,palette,selected='',interactive=false){
 const p=palette,byId=new Map(board.nodes.map(n=>[n.id,n])),groups=[];
 for(const name of new Set(board.nodes.map(n=>n.group).filter(Boolean))){const b=canvasBounds({nodes:board.nodes.filter(n=>n.group===name)});groups.push(`<g class="rc-group"><rect x="${b.x+40}" y="${b.y+28}" width="${b.width-80}" height="${b.height-50}" rx="16" fill="${xml(p.accent)}" fill-opacity=".045" stroke="${xml(p.line)}" stroke-dasharray="6 5"/><text x="${b.x+55}" y="${b.y+49}" font-size="12" fill="${xml(p.muted)}">${xml(name)}</text></g>`);}
 const defs=`<defs><marker id="rc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M1 1 L9 5 L1 9" fill="none" stroke="${xml(p.muted)}" stroke-width="1.5"/></marker></defs>`;
 const edges=board.edges.map(e=>{const a=byId.get(e.source),b=byId.get(e.target);if(!a||!b)return'';const g=canvasEdgeGeometry(a,b,board),active=selected===e.id;return`<g ${interactive?msg`data-rc-edge="${xml(e.id)}" tabindex="0" role="button" aria-label="连线 ${xml(e.label||a.text+tr(' 到 ',false)+b.text)}"`:''} class="rc-edge"><path d="${g.path}" fill="none" stroke="transparent" stroke-width="18"/><path d="${g.path}" fill="none" stroke="${xml(active?p.accent:p.muted)}" stroke-opacity="${active?1:.65}" stroke-width="${active?2.6:1.6}" ${e.dashed?'stroke-dasharray="7 5"':''} ${e.arrow?'marker-end="url(#rc-arrow)"':''}/>${e.label?`<text x="${g.x}" y="${g.y-9}" text-anchor="middle" font-size="12" fill="${xml(p.muted)}" stroke="${xml(p.paper)}" stroke-width="5" paint-order="stroke">${xml(e.label)}</text>`:''}</g>`;}).join('');
 const nodes=board.nodes.map(n=>{
  const nodePalette=Object.hasOwn(themes,n.theme)?{...semanticColors,...themes[n.theme]}:p;
  const s=canvasNodeSize(n),c=nodePalette[n.color]||n.color;
  const active=selected instanceof Set?selected.has(n.id):n.id===selected;
  const image=n.image?board.assets[n.image]:null,details=n.paperId||n.tag||n.note;
  const x=s.width/2,y=s.height/2;
  const outlineMarkup=shape(n.shape,s.width,s.height,c,nodePalette.surface);
  const fold=n.shape==='document'?`<path d="M${x-20} ${-y} v20 h20" fill="none" stroke="${xml(c)}" stroke-width="1.5"/>`:'';
  const labelY=image?s.contentTop+s.imageHeight+43:-(s.lines.length-1)*11-(details?7:0)+5;
  const detailY=image?-s.contentTop-10:y-13;
  return `<g ${interactive?`data-rc-node="${xml(n.id)}" tabindex="0" role="button" aria-label="${xml(n.text)}" aria-pressed="${active}"`:''} class="rc-node${active?' is-selected':''}" transform="translate(${n.x} ${n.y})">
   <title>${xml(n.text)}${n.note?'\n'+xml(n.note.slice(0,1500)):''}</title>
   ${active?`<rect x="${-x-5}" y="${-y-5}" width="${s.width+10}" height="${s.height+10}" rx="17" fill="none" stroke="${xml(p.accent)}" stroke-opacity=".35" stroke-width="2" stroke-dasharray="4 4"/>`:''}
   ${outlineMarkup}${fold}${image?nodeImage(n,image,s):''}
   <text text-anchor="middle" font-size="16" font-weight="${active?600:400}" fill="${xml(nodePalette.ink)}">${s.lines.map((line,i)=>`<tspan x="0" y="${labelY+i*20}">${xml(line)}</tspan>`).join('')}</text>
   ${details?`<text x="0" y="${detailY}" text-anchor="middle" font-size="10.5" fill="${xml(nodePalette.muted)}">${n.paperId?tr('文献已关联'):n.tag?'# '+xml(n.tag):tr('附有研究笔记')}${n.paperId&&n.note?tr(' · 笔记'):''}</text>`:''}
  </g>`;
 }).join('');
 return defs+groups.join('')+edges+nodes;
}
export function exportCanvasSVG(board,palette){const b=canvasBounds(board),w=Math.ceil(b.width),h=Math.ceil(b.height+60);if(w>24000||h>24000)throw Error(tr('画布范围过大，请先自动整理后再导出。'));return`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${b.x} ${b.y-60} ${w} ${h}" style="font-family:${xml(palette.font)}"><rect x="${b.x}" y="${b.y-60}" width="${w}" height="${h}" fill="${xml(palette.paper)}"/><text x="${b.x+32}" y="${b.y-22}" font-size="20" font-weight="600" fill="${xml(palette.ink)}">${xml(board.name)}</text>${canvasContent(board,palette)}</svg>`;}
