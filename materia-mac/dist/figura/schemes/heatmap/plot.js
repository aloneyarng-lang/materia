import {frame,esc} from '../shared.js';
import {plotTheme,rampColor,rampTextColor} from '../figure-themes.js';

function colorKey(frame,ramp,lo,hi) {
  const x=frame.right+16, y=frame.top+6, height=Math.min(frame.bottom-frame.top-12,140);
  if(lo===hi) return `<rect x="${x}" y="${y}" width="15" height="15" fill="${rampColor(ramp,.5)}"/><text x="${x+23}" y="${y+12}">${lo}</text>`;
  const stops=ramp.map((color,i)=>`<stop offset="${i/(ramp.length-1)}" stop-color="${color}"/>`).join('');
  return `<defs><linearGradient id="heatmap-scale" x1="0%" x2="0%" y1="100%" y2="0%">${stops}</linearGradient></defs><rect x="${x}" y="${y}" width="15" height="${height}" fill="url(#heatmap-scale)"/><text x="${x+23}" y="${y+9}">${hi}</text><text x="${x+23}" y="${y+height}">${lo}</text>`;
}

export function render({data,params:p}) {
  const f=frame(p), rows=[...new Set(data.map(d=>d.row))], cols=[...new Set(data.map(d=>d.column))];
  const keys=data.map(d=>JSON.stringify([d.row,d.column]));
  if(new Set(keys).size!==keys.length)throw Error('行列组合重复');
  const lo=Math.min(...data.map(d=>d.value)), hi=Math.max(...data.map(d=>d.value));
  const w=(f.right-f.left)/cols.length, h=(f.bottom-f.top)/rows.length, ramp=plotTheme(p)?.ramp;
  let s=f.start;
  for(const d of data){
    const x=f.left+cols.indexOf(d.column)*w, y=f.top+rows.indexOf(d.row)*h;
    const fraction=hi===lo?0:(d.value-lo)/(hi-lo), alpha=.15+.85*(d.value-lo)/(hi-lo||1);
    const fill=ramp?rampColor(ramp,hi===lo?.5:fraction):esc(p.color);
    const ink=ramp?rampTextColor(fill):(alpha>.6?'white':'#243247');
    s+=`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" fill-opacity="${ramp?1:alpha}" stroke="white"/>`;
    if(p.showValues==='显示')s+=`<text x="${x+w/2}" y="${y+h/2}" text-anchor="middle" fill="${ink}">${d.value}</text>`;
  }
  rows.forEach((r,i)=>s+=`<text x="${f.left-10}" y="${f.top+(i+.5)*h}" text-anchor="end">${esc(r)}</text>`);
  cols.forEach((c,i)=>s+=`<text x="${f.left+(i+.5)*w}" y="${f.bottom+25}" text-anchor="middle">${esc(c)}</text>`);
  s+=ramp?colorKey(f,ramp,lo,hi):`<text x="${f.right+10}" y="${f.top+20}">min ${lo}</text><text x="${f.right+10}" y="${f.top+45}">max ${hi}</text>`;
  return s+f.end;
}
