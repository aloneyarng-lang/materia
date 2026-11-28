import {frame, scale, axes, legend, esc} from '../shared.js';
import {seriesColors} from '../figure-themes.js';

export function render({data, params: p}) {
  const f = frame(p);
  const x = scale(data.map(d => d.x), f.left, f.right, p.xMin, p.xMax);
  const y = scale(data.map(d => d.y), f.bottom, f.top, p.yMin, p.yMax);
  const groups = [...new Set(data.map(d => d.group))];
  const colors = seriesColors(p, [p.color, p.color2]);
  let s = f.start + axes(f, x, y);
  groups.forEach((g, i) => {
    const rows = data.filter(d => d.group === g).sort((a, b) => a.x - b.x);
    const c = esc(colors[i % colors.length]);
    s += `<polyline points="${rows.map(d => `${x(d.x)},${y(d.y)}`).join(' ')}" fill="none" stroke="${c}" stroke-width="${p.lineWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
    for (const d of rows) {
      const px = x(d.x), py = y(d.y);
      if (p.marker === '圆形') s += `<circle cx="${px}" cy="${py}" r="4.2" fill="${c}" stroke="white" stroke-width="1.4"/>`;
      if (p.marker === '方形') s += `<rect x="${px - 3.8}" y="${py - 3.8}" width="7.6" height="7.6" rx="1.2" fill="${c}" stroke="white" stroke-width="1.4"/>`;
    }
  });
  return s + legend(f, p, groups, colors, {style: 'line'}) + f.end;
}
