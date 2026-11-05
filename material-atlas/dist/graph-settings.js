import {THEME_ALIASES} from './theme-variants.js';
export const GRAPH_DEFAULTS = {mode:'similarity',neighbors:3,center:.35,repulsion:2.2,linkStrength:.65,linkDistance:145,inertia:.5,nodeSize:1,linkWidth:.8,labelThreshold:1.3,showRelations:true,colorBy:'tag',localMode:false,localDepth:1,appearance:'theme'};
export function cleanGraphSettings(value = {}) {
  const output={...GRAPH_DEFAULTS},limits={neighbors:[1,12],center:[0,2],repulsion:[.25,4],linkStrength:[.1,2],linkDistance:[40,250],inertia:[0,1],nodeSize:[.6,2],linkWidth:[.3,2.5],labelThreshold:[.5,2.5],localDepth:[0,2]};
  for(const [key,[min,max]]of Object.entries(limits))if(Number.isFinite(Number(value[key])))output[key]=Math.max(min,Math.min(max,Number(value[key])));
  if(['similarity','tags'].includes(value.mode))output.mode=value.mode;
  output.neighbors=Math.round(output.neighbors);
  output.localDepth=Math.round(output.localDepth);
  for(const key of ['showRelations','localMode'])if(typeof value[key]==='boolean')output[key]=value[key];
  if(['tag','journal','collection'].includes(value.colorBy))output.colorBy=value.colorBy;
  if(['theme','classic','orbital','crystal','cosmos'].includes(value.appearance)||/^theme:[a-z][a-z\d-]{0,100}$/i.test(value.appearance||''))output.appearance=value.appearance;
  if(output.appearance.startsWith('theme:')&&THEME_ALIASES[output.appearance.slice(6)])output.appearance='theme:'+THEME_ALIASES[output.appearance.slice(6)].id;
  return output;
}

export function localPapers(papers,groups,id,depth=1) {
  if(!id||!papers.some(p=>p.id===id))return papers;
  const allowed=new Set(groups.map(group=>group.name)),selected=new Set([id]);
  for(let layer=0;layer<depth;layer++){
    const tags=new Set(papers.filter(p=>selected.has(p.id)).flatMap(p=>p.tags).filter(tag=>allowed.has(tag)));
    for(const paper of papers)if(paper.tags.some(tag=>tags.has(tag)))selected.add(paper.id);
  }
  return papers.filter(paper=>selected.has(paper.id));
}

const intersects=(a,b,padding=4)=>a.x<b.x+b.width+padding&&a.x+a.width+padding>b.x&&a.y<b.y+b.height+padding&&a.y+a.height+padding>b.y;
// Index screen-space rectangles so a label checks nearby obstacles only.
function rectangleIndex(cell=64){
  const buckets=new Map();
  const visit=(box,padding,fn)=>{
    for(let x=Math.floor((box.x-padding)/cell);x<=Math.floor((box.x+box.width+padding)/cell);x++)
      for(let y=Math.floor((box.y-padding)/cell);y<=Math.floor((box.y+box.height+padding)/cell);y++)if(fn(x+':'+y))return true;
    return false;
  };
  return {
    add(box){visit(box,0,key=>{if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(box);});},
    hits(box,padding=4,except){return visit(box,padding,key=>(buckets.get(key)||[]).some(other=>(except===undefined||other.id!==except)&&intersects(box,other,padding)));},
  };
}
const widthOf=(text,font)=>[...text].reduce((sum,char)=>sum+font*(char.charCodeAt(0)>255?.96:.54),0);
function labelLines(raw,limit,wrap){
  let text=raw;if(text.length>limit){let cut=text.slice(0,limit-1);const space=cut.lastIndexOf(' ');if(space>limit*.65)cut=cut.slice(0,space);text=cut.trimEnd()+'…';}
  if(!wrap||text.length<=35)return[text];
  let split=text.lastIndexOf(' ',35);if(split<18){const next=text.indexOf(' ',35);split=next>=0&&next<45?next:35;}
  return[text.slice(0,split).trimEnd(),text.slice(split).trimStart()];
}
export function fitGraphViewport(nodes,width=1000,height=620){
  if(!nodes.length)return{scale:1,x:0,y:0};
  const left=Math.min(...nodes.map(n=>n.x-n.radius)),right=Math.max(...nodes.map(n=>n.x+n.radius)),top=Math.min(...nodes.map(n=>n.y-n.radius)),bottom=Math.max(...nodes.map(n=>n.y+n.radius));
  const scale=Math.max(.12,Math.min(1.8,(width-150)/Math.max(130,right-left),(height-150)/Math.max(100,bottom-top)));
  return{scale,x:width/2-(left+right)/2*scale,y:height/2-(top+bottom)/2*scale};
}
export function placeNodeLabels(nodes,options={}) {
  const {scale=1,viewportScale=1,panX=0,panY=0,activeId='',relatedIds=new Set(),showLabels=true,threshold=1.3,measureText=widthOf,viewHeight=620,fontScale=1,previous=new Map()}=options;
  const boxes=[{x:0,y:viewHeight-35,width:380,height:35},{x:800,y:viewHeight-45,width:200,height:45}],placed=new Map(),fontFor=node=>(node.id===activeId?11:10.5*Math.min(1.2,Math.pow(scale,.25)))*fontScale/(scale*Math.max(.1,viewportScale));
  const labelIndex=rectangleIndex(),nodeIndex=rectangleIndex();
  for(const box of boxes)labelIndex.add(box);
  for(const other of nodes)nodeIndex.add({id:other.id,x:other.x*scale+panX-other.radius*scale-2,y:other.y*scale+panY-other.radius*scale-2,width:(other.radius*2+4)*scale,height:(other.radius*2+4)*scale});
  const candidates=nodes.filter(node=>node.id===activeId || node.type==='relation'&&scale>=.72 || showLabels&&node.type==='paper'&&scale>=threshold*.65).sort((a,b)=>Number(b.id===activeId)-Number(a.id===activeId)||Number(relatedIds.has(b.id))-Number(relatedIds.has(a.id))||Number(b.type==='relation')-Number(a.type==='relation')||(b.members?.length||0)-(a.members?.length||0));
  for(const node of candidates){
    const active=node.id===activeId,font=fontFor(node),raw=node.type==='relation'?node.label:node.paper.title;
    const limit=node.type==='relation'?23:active?72:42,lines=labelLines(raw,limit,active&&node.type==='paper');
    const width=Math.max(...lines.map(line=>measureText(line,font)))+font*.2,height=lines.length*font*1.35,radius=node.radius+7;
    const choices=[{x:radius,y:-font*.8,anchor:'start'},{x:-radius-width,y:-font*.8,anchor:'start'},{x:-width/2,y:radius+3,anchor:'start'},{x:-width/2,y:-radius-height,anchor:'start'}];
    const previousSlot=previous.get(node.id)?.slot,slots=[0,1,2,3];if(Number.isInteger(previousSlot))slots.sort((a,b)=>Number(b===previousSlot)-Number(a===previousSlot));
    for(const slot of slots){const choice=choices[slot];
      const box={x:(node.x+choice.x)*scale+panX,y:(node.y+choice.y)*scale+panY,width:width*scale,height:height*scale};
      if(box.x<10||box.y<10||box.x+box.width>990||box.y+box.height>viewHeight-10||labelIndex.hits(box))continue;
      if(!active && nodeIndex.hits(box,1,node.id))continue;
      labelIndex.add(box);placed.set(node.id,{x:choice.x,y:choice.y+font,font,lines,box,slot,opacity:active?1:relatedIds.has(node.id)?.94:node.type==='paper'?.88*(.5+.5*Math.max(0,Math.min(1,(scale-threshold*.65)/(threshold*.45)))):.76});break;
    }
  }
  return placed;
}
