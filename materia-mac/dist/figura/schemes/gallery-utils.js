import {esc} from './shared.js';export {esc};
import {figureAxis,figureInk,plotTheme,seriesColors} from './figure-themes.js';
export function palette(p){return seriesColors(p,p.palette==='色觉友好'?['#0072B2','#D55E00','#009E73','#CC79A7','#E69F00','#56B4E9','#333333']:['#326b95','#dc8751','#3f8c78','#8a6eb0','#bd5668','#78923d','#5b8290']);}
export function text(x,y,s,attrs=''){return `<text x="${x}" y="${y}" ${attrs}>${esc(s)}</text>`;}
export function svg(p,content){return `<svg xmlns="http://www.w3.org/2000/svg" width="${p.width}" height="${p.height}" viewBox="0 0 ${p.width} ${p.height}"><rect width="100%" height="100%" fill="white"/><g font-family="${esc(p.font)}" font-size="${p.fontSize}" fill="${figureInk(p,'#243247')}">${text(p.width/2,30,p.title,'text-anchor="middle"')}${content}</g></svg>`;}
export function bounds(p){return {l:85,r:p.width-155,t:65,b:p.height-85};}
export function scale(values,a,b,log=false,zero=false){if(log&&values.some(v=>v<=0))throw Error('对数轴的全部数值必须大于 0');let lo=Math.min(...values),hi=Math.max(...values);if(zero)lo=Math.min(0,lo);if(lo===hi){if(log){lo/=10;hi*=10;}else{lo-=1;hi+=1;}}const trans=v=>log?Math.log10(v):v;const fn=v=>a+(trans(v)-trans(lo))/(trans(hi)-trans(lo))*(b-a);fn.ticks=Array.from({length:5},(_,i)=>log?10**(Math.log10(lo)+(Math.log10(hi)-Math.log10(lo))*i/4):lo+(hi-lo)*i/4);return fn;}
export function ticksLabel(v){return Math.abs(v)>=1e5||(v!==0&&Math.abs(v)<.001)?v.toExponential(1):Number(v.toPrecision(4));}
export function axes(b,x,y,p){
  const themed=Boolean(plotTheme(p)), axis=figureAxis(p,'#35465c');
  let s=`<path d="M${b.l},${b.t}V${b.b}H${b.r}" fill="none" stroke="${axis}"/>`;
  if(y)for(const v of y.ticks){
    const pos=y(v);
    s+=text(b.l-8,pos+4,ticksLabel(v),'text-anchor="end"');
    s+=themed?`<path d="M${b.l},${pos}h-4" stroke="${axis}"/>`:`<path d="M${b.l},${pos}H${b.r}" stroke="#e8edf2"/>`;
  }
  if(x)for(const v of x.ticks){
    const pos=x(v);
    if(themed)s+=`<path d="M${pos},${b.b}v4" stroke="${axis}"/>`;
    s+=text(pos,b.b+22,ticksLabel(v),'text-anchor="middle"');
  }
  return s+text((b.l+b.r)/2,b.b+53,p.xLabel,'text-anchor="middle"')+`<text transform="translate(${b.l-60} ${(b.t+b.b)/2}) rotate(-90)" text-anchor="middle">${esc(p.yLabel)}</text>`;
}
export function series(rows,x,y,color,p){let s=`<polyline points="${rows.map(d=>`${x(d.x)},${y(d.y)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${p.lineWidth}"/>`;if(p.markerSize>0)for(const d of rows)s+=`<circle cx="${x(d.x)}" cy="${y(d.y)}" r="${p.markerSize}" fill="${color}"/>`;return s;}
export function legend(b,groups,colors){return groups.map((g,i)=>`<rect x="${b.r+15}" y="${b.t+i*22}" width="9" height="9" fill="${colors[i%colors.length]}"/>`+text(b.r+29,b.t+9+i*22,g)).join('');}
export function unique(rows,fields){const k=rows.map(d=>JSON.stringify(fields.map(f=>d[f])));if(new Set(k).size!==k.length)throw Error('存在重复的 '+fields.join(' / ')+' 组合，请先明确汇总方式');}
