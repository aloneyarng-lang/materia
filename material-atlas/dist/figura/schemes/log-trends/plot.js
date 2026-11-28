import {svg, bounds, scale, axes, series, legend, palette} from '../gallery-utils.js';

export function render({data, params: p}) {
  const b = bounds(p);
  const colors = palette(p);
  const groups = [...new Set(data.map(d => d.group))];
  const logX = p.xScale === '对数', logY = p.yScale === '对数';
  const x = scale(data.map(d => d.x), b.l, b.r, logX, false, !logX);
  const y = scale(data.map(d => d.y), b.b, b.t, logY, false, !logY);
  let s = axes(b, x, y, p, {box: true, gridY: true, gridX: true});
  groups.forEach((g, i) => {
    const rows = data.filter(d => d.group === g);
    if (p.order === '横坐标排序') rows.sort((a, b) => a.x - b.x);
    s += series(rows, x, y, colors[i % colors.length], p, i);
  });
  return svg(p, s + legend(b, groups, colors, {style: 'line'}));
}
