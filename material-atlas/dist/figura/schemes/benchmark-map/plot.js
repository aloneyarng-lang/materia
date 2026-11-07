import {benchmarkPaper} from '../reference-styles.js';
import {svg, bounds, scale, axes, palette, legend, text} from '../gallery-utils.js';

function threshold(input, log, axis) {
  if (String(input).trim() === '') return null;
  const value = Number(input);
  if (!Number.isFinite(value) || (log && value <= 0)) throw Error(axis+' 轴阈值无效');
  return value;
}

export function render({data, params: p}) {
  const b = bounds(p);
  const logX = p.xScale === '对数', logY = p.yScale === '对数';
  const tx = threshold(p.xTarget, logX, 'X'), ty = threshold(p.yTarget, logY, 'Y');
  if (p.figureStyle === '分区聚焦') return benchmarkPaper(data,p,{logX,logY,tx,ty});
  const xs = data.map(d => d.x), ys = data.map(d => d.y);
  if (tx !== null) xs.push(tx);
  if (ty !== null) ys.push(ty);
  const x = scale(xs, b.l, b.r, logX), y = scale(ys, b.b, b.t, logY);
  const colors = palette(p), groups = [...new Set(data.map(d => d.group))];
  let s = axes(b, x, y, p);
  if (tx !== null) s += '<path d="M'+x(tx)+','+b.t+'V'+b.b+'" stroke="#586879" stroke-dasharray="6 4"/>';
  if (ty !== null) s += '<path d="M'+b.l+','+y(ty)+'H'+b.r+'" stroke="#586879" stroke-dasharray="6 4"/>';
  for (const d of data) {
    const px = x(d.x), py = y(d.y), c = colors[groups.indexOf(d.group) % colors.length];
    s += '<circle cx="'+px+'" cy="'+py+'" r="'+p.markerSize+'" fill="'+c+'" stroke="white"/>';
    if (d.label) {
      const right = px > (b.l+b.r)/2;
      s += text(px+(right?-8:8), py-7, d.label, right?'text-anchor="end"':'');
    }
  }
  return svg(p, s+legend(b, groups, colors));
}
