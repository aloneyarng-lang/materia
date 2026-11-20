import {esc, text, ticksLabel} from './gallery-utils.js';
import {figureAxis,figureInk} from './figure-themes.js';

export const colors = ['#242c92', '#087d79', '#b72361', '#42464b', '#b76826', '#62778f', '#688137'];

export function paper(p, body, font = 'Arial') {
  const title = p.title ? text(p.width/2, 30, p.title, 'text-anchor="middle" font-size="'+(p.fontSize+2)+'" font-weight="600"') : '';
  return '<svg xmlns="http://www.w3.org/2000/svg" width="'+p.width+'" height="'+p.height+'" viewBox="0 0 '+p.width+' '+p.height+'">'
    + '<rect width="100%" height="100%" fill="white"/>'
    + '<g font-family="'+esc(font)+', Microsoft YaHei, sans-serif" font-size="'+p.fontSize+'" fill="'+figureInk(p,'#202124')+'">'
    + title + body + '</g></svg>';
}

export function editorialTicks(axis, log=false) {
  const [lo,hi]=[axis.ticks.at(0),axis.ticks.at(-1)];
  if(log) {
    const first=Math.ceil(Math.log10(lo)-1e-10), last=Math.floor(Math.log10(hi)+1e-10);
    const stride=Math.max(1,Math.ceil((last-first)/5));
    const ticks=[];
    for(let e=first;e<=last;e+=stride) ticks.push(10**e);
    if(ticks.length>=2) axis.ticks=ticks;
    return axis;
  }
  const target=(hi-lo)/5;
  const power=10**Math.floor(Math.log10(target));
  const step=[1,2,2.5,5,10].map(n=>n*power).find(n=>n>=target);
  if(!Number.isFinite(step)||step<=0) return axis;
  const start=Math.ceil(lo/step-1e-9), end=Math.floor(hi/step+1e-9);
  const ticks=Array.from({length:Math.max(0,end-start+1)},(_,i)=>Number(((start+i)*step).toPrecision(10)));
  if(ticks.length>=2) axis.ticks=ticks;
  return axis;
}

export function panel(bounds, x, y, p, {box=true, minor=true} = {}) {
  const {l,r,t,b} = bounds;
  const axis = figureAxis(p,'#292b2d');
  let s = '<path d="M'+l+','+t+'V'+b+'H'+r+(box?'V'+t+'Z':'')+'" stroke="'+axis+'" stroke-width="1" fill="none"/>';
  const spanTicks = (ticks, fn, makeTick) => {
    const positions = ticks.map(fn);
    return positions.map((pos,i) => makeTick(pos,6)
      + (minor && i>0 ? makeTick((pos+positions[i-1])/2,3) : '')).join('');
  };
  s += spanTicks(x.ticks,x,(pos,len) => '<path d="M'+pos+','+b+'v-'+len+(box?'M'+pos+','+t+'v'+len:'')+'" stroke="'+axis+'"/>');
  s += spanTicks(y.ticks,y,(pos,len) => '<path d="M'+l+','+pos+'h'+len+(box?'M'+r+','+pos+'h-'+len:'')+'" stroke="'+axis+'"/>');
  for (const v of x.ticks) s += text(x(v),b+19,ticksLabel(v),'text-anchor="middle"');
  for (const v of y.ticks) s += text(l-9,y(v)+4,ticksLabel(v),'text-anchor="end"');
  s += text((l+r)/2,b+44,p.xLabel,'text-anchor="middle"');
  s += '<text transform="translate('+(l-61)+' '+((t+b)/2)+') rotate(-90)" text-anchor="middle">'+esc(p.yLabel)+'</text>';
  return s;
}

export function marker(x,y,r,color,index,{open=false,outline=color}={}) {
  const fill = open ? 'white' : color;
  const shape = index % 5;
  const attrs = ' fill="'+fill+'" stroke="'+outline+'" stroke-width="1.15"';
  if (shape===0) return '<circle cx="'+x+'" cy="'+y+'" r="'+r+'"'+attrs+'/>';
  if (shape===1) return '<rect x="'+(x-r)+'" y="'+(y-r)+'" width="'+(2*r)+'" height="'+(2*r)+'"'+attrs+'/>';
  const sides = shape===3 ? 4 : 3;
  const angle = shape===4 ? Math.PI/2 : -Math.PI/2;
  const pts = Array.from({length:sides},(_,i) => {
    const a = angle+i*2*Math.PI/sides;
    return (x+1.23*r*Math.cos(a))+','+(y+1.23*r*Math.sin(a));
  });
  return '<polygon points="'+pts.join(' ')+'"'+attrs+'/>';
}

export function star(x,y,r,color) {
  const pts=Array.from({length:10},(_,i) => {
    const angle=-Math.PI/2+i*Math.PI/5, radius=i%2?r*.43:r;
    return (x+radius*Math.cos(angle))+','+(y+radius*Math.sin(angle));
  });
  return '<polygon points="'+pts.join(' ')+'" fill="white" stroke="'+color+'" stroke-width="2"/>';
}
