import {forceSimulation,forceManyBody,forceLink,forceCollide,forceX,forceY} from './vendor/d3-force.mjs';
import {fitGraphViewport,placeNodeLabels} from './graph-settings.js';

const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const hash=text=>[...text].reduce((n,c)=>Math.imul(n^c.charCodeAt(0),16777619)>>>0,2166136261);
const random=seed=>()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
const pointKey=nodes=>nodes.map(n=>n.id).sort().join('|');
const abort=signal=>{if(signal?.aborted)throw new DOMException('整理已取消。','AbortError');};

export function cleanLayoutInput(input){
  const ids=new Set();
  const nodes=(input?.nodes||[]).slice(0,1000).filter(n=>typeof n.id==='string'&&!ids.has(n.id)&&ids.add(n.id)).map(n=>({
    id:n.id,type:n.type==='relation'?'relation':'paper',title:String(n.title||'').slice(0,1000),group:String(n.group||''),
    x:Number.isFinite(n.x)?n.x:500,y:Number.isFinite(n.y)?n.y:310,pinned:Boolean(n.pinned),radius:clamp(Number(n.radius)||6,3,40),
  })).sort((a,b)=>a.id.localeCompare(b.id));
  const edges=(input?.edges||[]).map(e=>({source:typeof e.source==='object'?e.source.id:e.source,target:typeof e.target==='object'?e.target.id:e.target,...(Number.isFinite(e.similarity)?{similarity:clamp(e.similarity,0,1)}:{})})).filter(e=>ids.has(e.source)&&ids.has(e.target)&&e.source!==e.target);
  return {nodes,edges,width:1000,height:clamp(Number(input?.height)||620,430,1200),activeId:String(input?.activeId||''),threshold:clamp(Number(input?.threshold)||1.3,.5,2.5),showLabels:input?.showLabels!==false,fontScale:clamp(Number(input?.fontScale)||1,.7,2),glyphWidths:input?.glyphWidths||{}};
}
function groupsFor(input){
  const parent=new Map(input.nodes.map(n=>[n.id,n.id]));
  const find=id=>{let root=id;while(parent.get(root)!==root)root=parent.get(root);while(id!==root){const next=parent.get(id);parent.set(id,root);id=next;}return root;};
  for(const edge of input.edges){const a=find(edge.source),b=find(edge.target);if(a!==b)parent.set(a<b?b:a,a<b?a:b);}
  const components=new Map();for(const n of input.nodes){const key=find(n.id),list=components.get(key)||[];list.push(n);components.set(key,list);}
  const groups=new Map();for(const list of components.values()){
    const key=list.length>1?'linked:'+list[0].id:list[0].group?'folder:'+list[0].group:'single:'+list[0].id;
    groups.set(key,[...(groups.get(key)||[]),...list]);
  }
  return [...groups].map(([id,nodes])=>({id,nodes})).sort((a,b)=>b.nodes.length-a.nodes.length||a.id.localeCompare(b.id));
}
const crossing=(a,b,c,d)=>{
  const side=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  return side(a,b,c)*side(a,b,d)<-1e-5&&side(c,d,a)*side(c,d,b)<-1e-5;
};
export function evaluateNaturalLayout(input,points){
  const config=cleanLayoutInput(input),byId=new Map(points.map(p=>[p.id,p]));
  const nodes=config.nodes.map(n=>({...n,...byId.get(n.id),paper:{title:n.title},label:n.title,tag:n.title}));
  if(!nodes.length)return {score:0,overlaps:0,crossings:0,labels:0,camera:{scale:1,x:0,y:0}};
  const camera=fitGraphViewport(nodes.map(n=>({...n,radius:n.radius+24})),1000,config.height);
  let overlaps=0,crossings=0,nearest=0,nearestSquared=0;
  for(let i=0;i<nodes.length;i++){
    let closest=Infinity;const a=nodes[i];
    for(let j=0;j<nodes.length;j++)if(i!==j){const b=nodes[j],distance=Math.hypot(a.x-b.x,a.y-b.y);closest=Math.min(closest,distance);if(i<j&&distance<a.radius+b.radius+10)overlaps++;}
    if(Number.isFinite(closest)){nearest+=closest;nearestSquared+=closest*closest;}
  }
  const edges=config.edges.filter((_,i)=>i%Math.max(1,Math.ceil(config.edges.length/400))===0);
  for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){
    const a=edges[i],b=edges[j];if(a.source===b.source||a.source===b.target||a.target===b.source||a.target===b.target)continue;
    if(crossing(byId.get(a.source),byId.get(a.target),byId.get(b.source),byId.get(b.target)))crossings++;
  }
  const labels=placeNodeLabels(nodes,{...camera,scale:camera.scale,panX:camera.x,panY:camera.y,viewHeight:config.height,activeId:config.activeId,threshold:config.threshold,showLabels:config.showLabels,fontScale:config.fontScale,measureText:(text,font)=>[...text].reduce((sum,c)=>sum+(config.glyphWidths[c]??(c.charCodeAt(0)>255?.96:.54))*font,0)}).size;
  const left=Math.min(...nodes.map(n=>n.x)),right=Math.max(...nodes.map(n=>n.x)),top=Math.min(...nodes.map(n=>n.y)),bottom=Math.max(...nodes.map(n=>n.y));
  const aspect=Math.abs(Math.log(Math.max(1,right-left)/Math.max(1,bottom-top)/(1000/config.height)));
  const mean=nearest/nodes.length,uneven=mean>0?Math.sqrt(Math.max(0,nearestSquared/nodes.length-mean*mean))/mean:10;
  const score=overlaps*90+crossings*.3+(nodes.length-labels)/nodes.length*110+Math.min(3,aspect)*12+Math.min(4,uneven)*9;
  return {score,overlaps,crossings,labels,camera};
}

async function candidate(input,groups,seed,attempt,{signal,yieldTask}){
  const rng=random(seed+attempt*977),width=1000,height=input.height,degree=new Map(input.nodes.map(n=>[n.id,0]));
  for(const e of input.edges){degree.set(e.source,degree.get(e.source)+1);degree.set(e.target,degree.get(e.target)+1);}
  const area=(width-150)*(height-150),spacing=clamp(Math.sqrt(area/Math.max(1,input.nodes.length))*.75,44,100);
  const centers=groups.map((group,i)=>{
    const angle=i*2.39996323+attempt*.47+(.5-rng())*.3,distance=groups.length===1?0:Math.sqrt((i+.5)/groups.length);
    return {...group,x:width/2+Math.cos(angle)*distance*(width*.34),y:height/2+Math.sin(angle)*distance*(height*.32),r:Math.max(spacing*.42,Math.sqrt(group.nodes.length)*spacing*.49)};
  });
  const packing=forceSimulation(centers).stop().randomSource(rng).force('collide',forceCollide(c=>c.r+spacing*.18).strength(.95).iterations(3)).force('x',forceX(width/2).strength(.025)).force('y',forceY(height/2).strength(.035));
  for(let i=0;i<100;i++)packing.tick();
  const pins=new Map(input.nodes.filter(n=>n.pinned).map(n=>[n.id,n])),nodes=[];
  for(const center of centers){
    const members=[...center.nodes].sort((a,b)=>(degree.get(b.id)||0)-(degree.get(a.id)||0)||a.id.localeCompare(b.id));
    const fixed=members.filter(n=>n.pinned);if(fixed.length){center.x=fixed.reduce((s,n)=>s+n.x,0)/fixed.length;center.y=fixed.reduce((s,n)=>s+n.y,0)/fixed.length;}
    members.forEach((n,i)=>{
      const angle=i*2.39996323+attempt*.71+(rng()-.5)*.6,distance=members.length===1?0:Math.sqrt((i+.35)/members.length)*center.r;
      nodes.push({...n,x:n.pinned?n.x:center.x+Math.cos(angle)*distance,y:n.pinned?n.y:center.y+Math.sin(angle)*distance,tx:center.x,ty:center.y,fx:n.pinned?n.x:null,fy:n.pinned?n.y:null});
    });
  }
  const links=input.edges.map(e=>({...e})),simulation=forceSimulation(nodes).stop().randomSource(rng).alphaDecay(.027).velocityDecay(.52)
    .force('link',forceLink(links).id(n=>n.id).distance(e=>spacing*(.9+attempt*.055)*(e.similarity===undefined?1:1.65-1.15*e.similarity)).strength(e=>e.similarity===undefined?.38:.38*(.4+1.6*e.similarity)))
    .force('charge',forceManyBody().strength(-spacing*.8).distanceMax(spacing*5))
    .force('collision',forceCollide(n=>Math.max(n.radius+11,spacing*.28)).strength(.95).iterations(3))
    .force('x',forceX(n=>n.tx).strength(.032)).force('y',forceY(n=>n.ty).strength(.045));
  for(let batch=0;batch<15;batch++){
    abort(signal);for(let i=0;i<16;i++)simulation.tick();await yieldTask();
  }
  simulation.stop();
  // Preserve pins exactly. In the unpinned case use the available rectangle rather than a round cloud.
  if(!pins.size&&nodes.length>2){
    const minX=Math.min(...nodes.map(n=>n.x)),maxX=Math.max(...nodes.map(n=>n.x)),minY=Math.min(...nodes.map(n=>n.y)),maxY=Math.max(...nodes.map(n=>n.y));
    const sx=clamp((width-170)/Math.max(80,maxX-minX),.55,2),sy=clamp((height-155)/Math.max(80,maxY-minY),.55,2),balanced=Math.sqrt(sx*sy);
    const stretchX=balanced*clamp(sx/balanced,.78,1.28),stretchY=balanced*clamp(sy/balanced,.78,1.28);
    for(const n of nodes){n.x=width/2+(n.x-(minX+maxX)/2)*stretchX;n.y=height/2-8+(n.y-(minY+maxY)/2)*stretchY;}
  }
  return nodes.map(n=>({id:n.id,x:n.x,y:n.y,pinned:n.pinned}));
}
export async function solveNaturalLayout(source,options={},hooks={}){
  const input=cleanLayoutInput(source),signal=hooks.signal,yieldTask=hooks.yieldTask||(()=>Promise.resolve());abort(signal);
  if(options.releasePins)for(const node of input.nodes)node.pinned=false;
  const before=evaluateNaturalLayout(input,input.nodes),groups=groupsFor(input),seed=hash(pointKey(input.nodes));
  if(input.nodes.length<2||input.nodes.every(n=>n.pinned))return {points:input.nodes.map(({id,x,y,pinned})=>({id,x,y,pinned})),camera:before.camera,before,after:before};
  let best=null;
  for(let i=0;i<5;i++){
    const points=await candidate(input,groups,seed,i,{signal,yieldTask}),quality=evaluateNaturalLayout(input,points);if(!best||quality.score<best.quality.score)best={points,quality};
    hooks.progress?.({completed:i+1,total:5});await yieldTask();
  }
  abort(signal);
  if(before.score<best.quality.score*.96)best={points:input.nodes.map(({id,x,y,pinned})=>({id,x,y,pinned})),quality:before};
  return {points:best.points,camera:best.quality.camera,before,after:best.quality};
}
