import {svg, bounds, scale, axes, text, unique, ticksLabel} from '../gallery-utils.js';
import {plotTheme,rampColor} from '../figure-themes.js';

export function triangleSegment(vertices, level) {
  const crossings = [];
  for (let i=0;i<3;i++) {
    const a=vertices[i], b=vertices[(i+1)%3];
    if ((a.z<level) === (b.z<level)) continue;
    const t=(level-a.z)/(b.z-a.z);
    crossings.push([a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t]);
  }
  return crossings.length===2 ? crossings : null;
}

export function render({data, params: p}) {
  unique(data,['x','y']);
  const xs=[...new Set(data.map(d=>d.x))].sort((a,b)=>a-b);
  const ys=[...new Set(data.map(d=>d.y))].sort((a,b)=>a-b);
  if(xs.length<2||ys.length<2||xs.length*ys.length!==data.length) throw Error('网格须至少 2×2，且每个 X/Y 组合都须有值');
  if(data.length>10000) throw Error('等值线最多支持 10000 个网格节点');
  if(!Number.isInteger(Number(p.levels))) throw Error('等值线级数须为整数');
  const byPoint=new Map(data.map(d=>[JSON.stringify([d.x,d.y]),d]));
  const get=(i,j)=>byPoint.get(JSON.stringify([xs[i],ys[j]]));
  const triangles=[];
  for(let i=0;i<xs.length-1;i++) for(let j=0;j<ys.length-1;j++){
    const a=get(i,j),b=get(i+1,j),c=get(i+1,j+1),d=get(i,j+1);
    triangles.push([a,b,c],[a,c,d]);
  }
  const z=data.map(d=>d.z), min=Math.min(...z), max=Math.max(...z);
  if(min===max) throw Error('所有响应值相同，没有内部等值线');
  const b=bounds(p),x=scale(xs,b.l,b.r),y=scale(ys,b.b,b.t);
  const colors=['#172b54','#244b7a','#256287','#217b8c','#178575','#347c51','#71813c','#a36c2c','#a54e34','#8e3f64'];
  const theme=plotTheme(p);
  let s=axes(b,x,y,p)+text(b.r+14,b.t-14,p.zLabel);
  for(let i=0;i<p.levels;i++){
    const level=min+(max-min)*(i+1)/(Number(p.levels)+1);
    const position=i/(Number(p.levels)-1);
    const c=theme?rampColor(theme.ramp,.45+.55*position):colors[Math.round(position*9)];
    const paths=[];
    for(const tri of triangles){
      const segment=triangleSegment(tri,level);
      if(!segment) continue;
      const [a,b]=segment;
      paths.push('M'+x(a[0])+','+y(a[1])+'L'+x(b[0])+','+y(b[1]));
    }
    s+='<path d="'+paths.join('')+'" fill="none" stroke="'+c+'" stroke-width="2"/>';
    const ly=b.t+19*i;
    s+='<path d="M'+(b.r+14)+','+ly+'h17" stroke="'+c+'" stroke-width="2"/>'+text(b.r+37,ly+4,ticksLabel(level));
  }
  return svg(p,s);
}
