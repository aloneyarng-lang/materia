import {svg, bounds, scale, axes, series, palette, text, ticksLabel, esc} from '../gallery-utils.js';

export function render({data, params: p}) {
  const b = bounds(p);
  b.r = p.width - 102;
  const colors = palette(p);
  const x = scale(data.map(d => d.x), b.l, b.r);
  const y = scale(data.map(d => d.left), b.b, b.t, false, false, true);
  const z = scale(data.map(d => d.right), b.b, b.t, false, false, true);
  const rows = [...data].sort((a, b) => a.x - b.x);
  const tickFont = Math.max(10, Number(p.fontSize || 14) - 1.5);
  let s = axes(b, x, y, p, {box: true, gridY: true});
  s += `<path d="M${b.l},${b.t}V${b.b}" stroke="${colors[0]}" stroke-width="1.5"/>`;
  s += series(rows.map(d => ({x: d.x, y: d.left})), x, y, colors[0], p, 0);
  s += series(rows.map(d => ({x: d.x, y: d.right})), x, z, colors[1], p, 2);
  s += `<path d="M${b.r},${b.t}V${b.b}" stroke="${colors[1]}" stroke-width="1.5"/>`;
  for (const v of z.ticks) {
    const pos = z(v);
    s += `<path d="M${b.r},${pos}h4.5" stroke="${colors[1]}" stroke-width="1"/>`;
    s += text(b.r + 8, pos + 4, ticksLabel(v), `fill="${colors[1]}" font-size="${tickFont}"`);
  }
  s += `<text transform="translate(${p.width - 22} ${(b.t + b.b) / 2}) rotate(90)" text-anchor="middle" font-weight="600" fill="${colors[1]}">${esc(p.rightLabel)}</text>`;
  const boxW = Math.min(b.r - b.l - 24, Math.max(140, Math.max(String(p.yLabel).length, String(p.rightLabel).length) * 10 + 54));
  s += `<rect x="${b.l + 12}" y="${b.t + 10}" width="${boxW}" height="48" rx="5" fill="white" fill-opacity="0.94" stroke="#dce2ea" stroke-width="0.9"/>`;
  s += `<line x1="${b.l + 20}" y1="${b.t + 24}" x2="${b.l + 36}" y2="${b.t + 24}" stroke="${colors[0]}" stroke-width="2"/><circle cx="${b.l + 28}" cy="${b.t + 24}" r="3.2" fill="${colors[0]}" stroke="white" stroke-width="1.2"/>` + text(b.l + 42, b.t + 28, p.yLabel, `fill="${colors[0]}" font-size="11.5" font-weight="600"`);
  s += `<line x1="${b.l + 20}" y1="${b.t + 44}" x2="${b.l + 36}" y2="${b.t + 44}" stroke="${colors[1]}" stroke-width="2"/><polygon points="${b.l + 28},${b.t + 40} ${b.l + 32},${b.t + 44} ${b.l + 28},${b.t + 48} ${b.l + 24},${b.t + 44}" fill="${colors[1]}" stroke="white" stroke-width="1.2"/>` + text(b.l + 42, b.t + 48, p.rightLabel, `fill="${colors[1]}" font-size="11.5" font-weight="600"`);
  return svg(p, s);
}
