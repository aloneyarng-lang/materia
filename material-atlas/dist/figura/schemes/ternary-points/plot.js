import {svg, palette, text, legend, drawShapeMarker} from '../gallery-utils.js';

export function render({data, params: p}) {
  const total = +p.total;
  for (const d of data) {
    if (Math.min(d.a, d.b, d.c) < 0 || Math.abs(d.a + d.b + d.c - total) > total * 1e-6) {
      throw Error('三组分必须非负且总和为 ' + total + '；不会自动归一');
    }
  }
  const side = Math.min(p.width - 270, (p.height - 160) / 0.866);
  const x0 = 104, y0 = p.height - 76, h = side * Math.sqrt(3) / 2;
  const xy = (a, b, c) => [x0 + side * (c / total + a / total / 2), y0 - h * a / total];
  const topPt = xy(total, 0, 0), leftPt = xy(0, total, 0), rightPt = xy(0, 0, total);
  let s = `<polygon points="${topPt.join(',')} ${leftPt.join(',')} ${rightPt.join(',')}" fill="#fafbfd"/>`;
  for (let i = 1; i < 5; i++) {
    const v = total * i / 5;
    for (const pair of [[[v, total - v, 0], [v, 0, total - v]], [[0, v, total - v], [total - v, v, 0]], [[total - v, 0, v], [0, total - v, v]]]) {
      const [a, b] = pair.map(pt => xy(...pt));
      s += `<path d="M${a[0]},${a[1]}L${b[0]},${b[1]}" stroke="#dce4ee" stroke-width="0.9" stroke-dasharray="2 3" fill="none"/>`;
    }
  }
  for (let i = 0; i <= 5; i++) {
    const v = total * i / 5;
    const pt = xy(v, total - v, 0);
    s += `<path d="M${pt[0]},${pt[1]}h-5" stroke="#334155" stroke-width="1"/>`;
    s += text(pt[0] - 9, pt[1] + 4, Math.round(v * 100 / total) + '%', 'text-anchor="end" font-size="11"');
  }
  s += `<polygon points="${topPt.join(',')} ${leftPt.join(',')} ${rightPt.join(',')}" fill="none" stroke="#2f3b49" stroke-width="1.5" stroke-linejoin="round"/>`;
  s += text(x0 + side / 2, y0 - h - 18, p.aLabel, 'text-anchor="middle" font-weight="700"');
  s += text(x0 - 6, y0 + 28, p.bLabel, 'text-anchor="middle" font-weight="700"');
  s += text(x0 + side + 6, y0 + 28, p.cLabel, 'text-anchor="middle" font-weight="700"');
  const groups = [...new Set(data.map(d => d.group))], colors = palette(p);
  for (const d of data) {
    const [x, y] = xy(d.a, d.b, d.c);
    const gi = groups.indexOf(d.group);
    s += drawShapeMarker(x, y, Number(p.markerSize || 4.5), colors[gi % colors.length], gi);
  }
  return svg(p, s + legend({r: x0 + side + 20, t: 74}, groups, colors, {style: 'dot'}));
}
