import {figureAxis,figureInk,plotTheme} from './figure-themes.js';

export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function frame(p){const w=+p.width,h=+p.height;return {w,h,left:80,right:w-155,top:65,bottom:h-80,themed:Boolean(plotTheme(p)),axis:figureAxis(p,'#34475a'),start:`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="white"/><g font-family="${esc(p.font)}" font-size="${p.fontSize}" fill="${figureInk(p,'#243247')}"><text x="${w/2}" y="30" text-anchor="middle">${esc(p.title)}</text>`,end:`<text x="${w/2}" y="${h-15}" text-anchor="middle">${esc(p.xLabel)}</text><text transform="translate(22 ${h/2}) rotate(-90)" text-anchor="middle">${esc(p.yLabel)}</text></g></svg>`};}
export function scale(values,a,b,min='',max='',zero=false){let lo=min===''?Math.min(...values):+min,hi=max===''?Math.max(...values):+max;if(zero&&min==='')lo=Math.min(0,lo);if(zero&&max==='')hi=Math.max(0,hi);if(lo===hi){lo-=1;hi+=1;}if(lo>=hi)throw Error('坐标范围无效');const f=v=>a+(v-lo)/(hi-lo)*(b-a);f.lo=lo;f.hi=hi;return f;}
export function axes(f,x,y){
  const axis=f.axis||'#34475a';
  let s=`<path d="M${f.left},${f.top}V${f.bottom}H${f.right}" fill="none" stroke="${axis}"/>`;
  for(let i=0;i<=4;i++){
    const v=y.lo+(y.hi-y.lo)*i/4,pos=y(v);
    s+=`<text x="${f.left-10}" y="${pos+4}" text-anchor="end">${Number(v.toPrecision(4))}</text>`;
    s+=f.themed?`<path d="M${f.left},${pos}h-4" stroke="${axis}"/>`:`<path d="M${f.left},${pos}H${f.right}" stroke="#e9edf2"/>`;
    if(x){
      const a=x.lo+(x.hi-x.lo)*i/4;
      if(f.themed)s+=`<path d="M${x(a)},${f.bottom}v4" stroke="${axis}"/>`;
      s+=`<text x="${x(a)}" y="${f.bottom+25}" text-anchor="middle">${Number(a.toPrecision(4))}</text>`;
    }
  }
  return s;
}
export function legend(f,p,groups,colors){if(p.legend==='隐藏')return '';const x=p.legend==='左上'?f.left+8:f.right+15;return groups.map((g,i)=>`<rect x="${x}" y="${f.top+i*25}" width="10" height="10" fill="${colors[i%colors.length]}"/><text x="${x+16}" y="${f.top+10+i*25}">${esc(g)}</text>`).join('');}

