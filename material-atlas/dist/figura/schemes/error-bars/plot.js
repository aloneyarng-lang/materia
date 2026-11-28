import {frame, scale, axes, legend, esc} from '../shared.js';
import {seriesColors} from '../figure-themes.js';

export function render({data, params: p}) {
  const keys = data.map(d => JSON.stringify([d.category, d.group]));
  if (new Set(keys).size !== keys.length) throw Error('类别与分组组合重复，请先明确汇总方式');
  const f = frame(p);
  const cats = [...new Set(data.map(d => d.category))];
  const groups = [...new Set(data.map(d => d.group))];
  const colors = seriesColors(p, [p.color, p.color2]);
  const y = scale(data.flatMap(d => [d.value - d.error, d.value + d.error]), f.bottom, f.top, p.yMin, p.yMax, true);
  const slot = (f.right - f.left) / cats.length;
  const bw = slot * 0.78 / groups.length;
  let s = f.start + axes(f, null, y);
  data.forEach(d => {
    const j = groups.indexOf(d.group);
    const fill = esc(colors[j % colors.length]);
    const barW = bw * p.barWidth;
    const x = f.left + cats.indexOf(d.category) * slot + slot * 0.11 + j * bw + (bw - barW) / 2;
    const b = y(Math.max(y.lo, Math.min(0, y.hi)));
    const v = y(d.value);
    const cx = x + barW / 2;
    const lo = y(d.value - d.error), hi = y(d.value + d.error);
    s += `<rect x="${x}" y="${Math.min(b, v)}" width="${barW}" height="${Math.abs(b - v)}" rx="2.5" fill="${fill}" fill-opacity="0.88" stroke="${fill}" stroke-width="1"/>`;
    s += `<path d="M${cx},${lo}V${hi}M${cx - 4.5},${lo}h9M${cx - 4.5},${hi}h9" stroke="#222c3a" stroke-width="1.35" stroke-linecap="round" fill="none"/>`;
  });
  const tickFont = Math.max(10, (f.fontSize || 14) - 1.5);
  cats.forEach((c, i) => {
    const cx = f.left + (i + 0.5) * slot;
    s += `<path d="M${cx},${f.bottom}v4" stroke="${f.axis}" stroke-width="1"/>`;
    s += `<text x="${cx}" y="${f.bottom + 21}" text-anchor="middle" font-size="${tickFont}">${esc(c)}</text>`;
  });
  return s + legend(f, p, groups, colors) + f.end;
}
