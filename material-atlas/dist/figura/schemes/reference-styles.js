import {paper, panel, marker, colors, star, editorialTicks} from './paper-style.js';
import {scale, text, ticksLabel} from './gallery-utils.js';
import {plotTheme,seriesColors} from './figure-themes.js';

export function intervalPaper(data,p,groups) {
  const groupColors=seriesColors(p,colors);
  const b={l:86,r:p.width-43,t:76,b:p.height-75};
  const padded=values=>{
    const lo=Math.min(...values),hi=Math.max(...values),m=(hi-lo||1)*.05;
    return [lo-m,hi+m];
  };
  const x=editorialTicks(scale(padded(data.map(d=>d.x)),b.l,b.r));
  const y=editorialTicks(scale(padded(data.flatMap(d=>[d.lower,d.upper])),b.b,b.t));
  const occupied=[];
  let ink='';
  groups.forEach((g,i)=>{
    const c=groupColors[i%groupColors.length];
    const rows=data.filter(d=>d.group===g).sort((a,b)=>a.x-b.x);
    if(p.display==='带状包络'&&rows.length>1) {
      const up=rows.map(d=>x(d.x)+','+y(d.upper));
      const low=[...rows].reverse().map(d=>x(d.x)+','+y(d.lower));
      ink+='<polygon points="'+up.concat(low).join(' ')+'" fill="'+c+'" fill-opacity=".12"/>';
    } else {
      for(const d of rows) {
        const px=x(d.x), lo=y(d.lower), hi=y(d.upper);
        ink+='<path d="M'+px+','+lo+'V'+hi+'M'+(px-3)+','+lo+'h6M'+(px-3)+','+hi+'h6" stroke="'+c+'" stroke-opacity=".65" stroke-width=".9" fill="none"/>';
      }
    }
    for(let i=0;i<rows.length;i++){
      const d=rows[i];
      occupied.push([x(d.x),x(d.x),y(d.upper),y(d.lower)]);
      if(i>0){
        const prev=rows[i-1];
        const [hi,lo]=p.display==='带状包络'
          ? [Math.max(prev.upper,d.upper),Math.min(prev.lower,d.lower)]
          : [Math.max(prev.y,d.y),Math.min(prev.y,d.y)];
        occupied.push([x(prev.x),x(d.x),y(hi),y(lo)]);
      }
    }
    const points=rows.map(d=>x(d.x)+','+y(d.y)).join(' ');
    ink+='<polyline points="'+points+'" fill="none" stroke="'+c+'" stroke-width="1.15"/>';
    for(const d of rows) ink+=marker(x(d.x),y(d.y),p.markerSize,c,i);
  });
  const longest=Math.max(...groups.map(g=>Array.from(g).length));
  const rowHeight=p.fontSize+8;
  const lw=Math.min(b.r-b.l-30,Math.max(92,longest*p.fontSize*.9+42));
  const lh=groups.length*rowHeight+12;
  if(lh>b.b-b.t-22) throw Error('图内图例过长，请增加画布高度或减少系列');
  const locations=[
    ['左上',b.l+12,b.t+12],['右下',b.r-lw-12,b.b-lh-12],
    ['左下',b.l+12,b.b-lh-12],['右上',b.r-lw-12,b.t+12]
  ];
  const score=([,lx,ly])=>occupied.filter(([x1,x2,y1,y2])=>lx<=x2+5&&lx+lw>=x1-5&&ly<=y2+5&&ly+lh>=y1-5).length;
  const [,lx,ly]=locations.find(([name])=>name===p.paperLegend) || locations.sort((a,b)=>score(a)-score(b))[0];
  let key='<rect x="'+lx+'" y="'+ly+'" width="'+lw+'" height="'+lh+'" fill="white" fill-opacity=".95" stroke="#777" stroke-width=".7"/>';
  groups.forEach((g,i)=>{
    const py=ly+7+(i+.5)*rowHeight;
    key+=marker(lx+13,py,Math.min(p.markerSize,4),groupColors[i%groupColors.length],i)+text(lx+26,py+4,g);
  });
  return paper(p,panel(b,x,y,p)+ink+key,'Times New Roman');
}

export function calibrationPaper(data,p,metrics) {
  const names=[...new Set(data.map(d=>d.panel||''))];
  if(names.length>4) throw Error('校准条带最多四个面板，请分图展示');
  const gap=78, side=Math.min((p.width-110-(names.length-1)*gap)/names.length,p.height-160,350);
  if(side<128) throw Error('校准条带画布太窄，请增加宽度或减少面板');
  const left=(p.width-(side*names.length+gap*(names.length-1)))/2;
  const top=(p.height-side-28)/2;
  const panelColors=seriesColors(p,['#17667e','#a42f32','#39804c','#6b5586']);
  let s='';
  names.forEach((name,i)=>{
    const rows=data.filter(d=>(d.panel||'')===name);
    const l=left+i*(side+gap);
    const b={l,r:l+side,t:top,b:top+side};
    const values=rows.flatMap(d=>[d.observed,d.predicted]);
    const lo=Math.min(...values), hi=Math.max(...values);
    const pad=(hi-lo || Math.max(1,Math.abs(lo)))*.05;
    const x=editorialTicks(scale([lo-pad,hi+pad],b.l,b.r)), y=editorialTicks(scale([lo-pad,hi+pad],b.b,b.t));
    const c=panelColors[i];
    s+=panel(b,x,y,p,{minor:false});
    if(names.length>1) s+=text(l-16,b.t-20,'('+String.fromCharCode(97+i)+') '+name,'font-size="'+(p.fontSize+4)+'" font-weight="bold"');
    s+='<path d="M'+b.l+','+b.b+'L'+b.r+','+b.t+'" fill="none" stroke="#303236" stroke-width=".85" stroke-dasharray="3 3"/>';
    const groups=[...new Set(rows.map(d=>d.group||''))];
    for(const d of rows) s+=marker(x(d.observed),y(d.predicted),Math.min(p.markerSize,3.3),c,groups.indexOf(d.group||''),{open:groups.indexOf(d.group||'')%2===1});
    groups.filter(Boolean).forEach((g)=>{
      const j=groups.indexOf(g), gy=b.t+15+j*(p.fontSize+5);
      s+=marker(b.l+14,gy,2.8,c,j,{open:j%2===1})+text(b.l+24,gy+4,g,'font-size="'+Math.max(8,p.fontSize-2)+'"');
    });
    const {r2}=metrics(rows);
    s+=text(b.r-9,b.b-12,'R² = '+(r2===null?'—':ticksLabel(r2)),'text-anchor="end" font-family="Times New Roman" font-weight="bold" font-size="'+(p.fontSize+2)+'" stroke="white" stroke-width="3" paint-order="stroke"');
  });
  return paper(p,s);
}

const zoneKeys=['zoneXMin','zoneXMax','zoneYMin','zoneYMax'];
export function zonesFromRows(data,logX,logY) {
  const zones=new Map();
  for(const d of data) {
    const values=zoneKeys.map(k=>d[k]);
    const specified=values.map(v=>v!==undefined&&v!=='');
    if(!specified.some(Boolean)) continue;
    if(!specified.every(Boolean)) throw Error('区块须同时提供 X/Y 的上下限：'+d.group);
    const [xl,xh,yl,yh]=values;
    if(!(xl<xh&&yl<yh) || (logX&&xl<=0) || (logY&&yl<=0)) throw Error('区块边界或对数范围不合法：'+d.group);
    if(zones.has(d.group) && zones.get(d.group).some((v,i)=>v!==values[i])) throw Error('同一材料族的区块边界不一致：'+d.group);
    zones.set(d.group,values);
  }
  return zones;
}

export function benchmarkPaper(data,p,{logX,logY,tx,ty}) {
  const zones=zonesFromRows(data,logX,logY);
  const b={l:90,r:p.width-60,t:72,b:p.height-76};
  const xs=data.map(d=>d.x), ys=data.map(d=>d.y);
  for(const [xl,xh,yl,yh] of zones.values()) { xs.push(xl,xh);ys.push(yl,yh); }
  if(tx!==null) xs.push(tx);
  if(ty!==null) ys.push(ty);
  const pad=(values,log)=>{
    const f=log?Math.log10:v=>v, inv=log?v=>10**v:v=>v;
    if(log&&values.some(v=>v<=0)) throw Error('对数轴的全部数值必须大于 0');
    const lo=f(Math.min(...values)),hi=f(Math.max(...values)),margin=(hi-lo||1)*.08;
    return [inv(lo-margin),inv(hi+margin)];
  };
  const x=scale(pad(xs,logX),b.l,b.r,logX);
  const yLimits=pad(ys,logY);
  if(!logY && Math.min(...ys)>=0) yLimits[0]=Math.max(0,yLimits[0]);
  const y=editorialTicks(scale(yLimits,b.b,b.t,logY),logY);
  editorialTicks(x,logX);
  const families=[...new Set(data.map(d=>d.group))];
  const theme=plotTheme(p), highlightColor=theme?.highlight??'#842331';
  const palette=seriesColors(p,['#46599b','#798235','#87603f','#397a78','#8b343c','#765987']);
  let s='';
  const height=b.b-b.t, strips=80;
  for(let i=0;!theme&&i<strips;i++){
    const t=i/(strips-1);
    const rgb=[139,202,233].map((v,k)=>Math.round(v+(248-v)*t));
    s+='<rect x="'+b.l+'" y="'+(b.t+i*height/strips)+'" width="'+(b.r-b.l)+'" height="'+(height/strips+.15)+'" fill="rgb('+rgb.join(',')+')"/>';
  }
  for(const [family,[xl,xh,yl,yh]] of zones){
    const c=palette[families.indexOf(family)%palette.length];
    const attrs=' fill="'+c+'" fill-opacity=".17" stroke="'+c+'" stroke-opacity=".72"';
    s+='<rect x="'+x(xl)+'" y="'+y(yh)+'" width="'+(x(xh)-x(xl))+'" height="'+(y(yl)-y(yh))+'"'+attrs+'/>';
    s+=text((x(xl)+x(xh))/2,y(yh)-8,family,'text-anchor="middle" font-weight="600" fill="'+c+'"');
  }
  if(tx!==null) s+='<path d="M'+x(tx)+','+b.t+'V'+b.b+'" stroke="#566875" stroke-dasharray="6 4"/>';
  if(ty!==null) s+='<path d="M'+b.l+','+y(ty)+'H'+b.r+'" stroke="#566875" stroke-dasharray="6 4"/>';
  for(const d of data) {
    const px=x(d.x), py=y(d.y), i=families.indexOf(d.group), c=palette[i%palette.length];
    const highlight=p.highlightGroup && d.group===p.highlightGroup;
    s+=highlight?star(px,py,p.markerSize*2,highlightColor):marker(px,py,p.markerSize,c,i,{open:true});
    const label=d.label||(highlight?d.group:'');
    if(label) s+=text(px-10,py-9,label,'text-anchor="end" fill="'+(highlight?highlightColor:c)+'"');
  }
  const unzoned=families.filter(g=>!zones.has(g)&&g!==p.highlightGroup);
  unzoned.forEach((g,i)=>{
    const gx=b.r-130, gy=b.t+18+i*(p.fontSize+8), ix=families.indexOf(g);
    s+=marker(gx,gy,3.2,palette[ix%palette.length],ix,{open:true})+text(gx+12,gy+4,g);
  });
  return paper(p,s+panel(b,x,y,p,{box:false}));
}
