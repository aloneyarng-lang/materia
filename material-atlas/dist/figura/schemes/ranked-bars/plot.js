import {svg, bounds, scale, axes, text, unique, esc, ticksLabel} from '../gallery-utils.js';
import {seriesColors} from '../figure-themes.js';

export function render({data, params: p}) {
  unique(data, ['label']);
  const b = bounds(p);
  b.l = Math.min(p.width * 0.36, 210);
  b.r = p.width - 78;
  const d = [...data];
  if (p.sort !== '原顺序') d.sort((a, b) => p.sort === '降序' ? b.value - a.value : a.value - b.value);
  const maxVal = Math.max(0, ...d.map(r => r.value));
  const minVal = Math.min(0, ...d.map(r => r.value));
  const x = scale([minVal, maxVal * 1.08], b.l, b.r, false, true);
  const slot = (b.b - b.t) / d.length;
  if (slot < 18) throw Error('条目过多，请增大画布高度');
  const mainColor = esc(seriesColors(p, [p.color])[0]);
  let s = axes(b, x, null, {...p, yLabel: ''}, {box: false, gridY: false, gridX: true});
  s += `<path d="M${x(0)},${b.t}V${b.b}" stroke="#4e5d6c" stroke-width="1.2"/>`;
  d.forEach((r, i) => {
    const cy = b.t + (i + 0.5) * slot;
    const h = Math.min(36, slot * 0.62);
    const y = cy - h / 2;
    const w = Math.abs(x(r.value) - x(0));
    const bx = Math.min(x(0), x(r.value));
    const alpha = i === 0 ? 0.96 : Math.max(0.58, 0.88 - i * 0.05);
    s += `<line x1="${b.l}" y1="${cy}" x2="${b.r}" y2="${cy}" stroke="#eef2f6" stroke-width="0.9"/>`;
    s += `<rect x="${bx}" y="${y}" width="${w}" height="${h}" rx="3" fill="${mainColor}" fill-opacity="${alpha}" stroke="${mainColor}" stroke-width="0.9"/>`;
    s += text(b.l - 10, cy + 4.5, r.label, 'text-anchor="end" font-weight="500"');
    const valX = x(r.value) + (r.value < 0 ? -7 : 7);
    s += text(valX, cy + 4.5, ticksLabel(r.value), (r.value < 0 ? 'text-anchor="end" ' : '') + 'font-weight="600" font-size="12.5"');
  });
  return svg(p, s);
}
