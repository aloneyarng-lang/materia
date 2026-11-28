import {svg, bounds, scale, axes, palette, text, legend, unique} from '../gallery-utils.js';

export function render({data, params: p}) {
  unique(data, ['category', 'component']);
  if (data.some(d => d.value < 0)) throw Error('组成量不能为负');
  const b = bounds(p);
  const cats = [...new Set(data.map(d => d.category))];
  const parts = [...new Set(data.map(d => d.component))];
  const colors = palette(p);
  const y = scale([0, 100], b.b, b.t);
  const slot = (b.r - b.l) / cats.length;
  let s = axes(b, null, y, {...p, yLabel: p.yLabel + ' (%)'}, {box: true, gridY: true});
  cats.forEach((cat, i) => {
    const d = data.filter(d => d.category === cat);
    const total = d.reduce((a, v) => a + v.value, 0);
    if (total <= 0) throw Error('类别 ' + cat + ' 的总量必须大于零');
    let start = 0;
    const bw = slot * p.barWidth;
    const x = b.l + (i + 0.5) * slot - bw / 2;
    parts.forEach((part, j) => {
      const val = (d.find(d => d.component === part)?.value || 0) / total * 100;
      const segY = y(start + val);
      const segH = y(start) - segY;
      const c = colors[j % colors.length];
      s += `<rect x="${x}" y="${segY}" width="${bw}" height="${segH}" rx="1.5" fill="${c}" fill-opacity="0.92" stroke="white" stroke-width="1.4"/>`;
      if (val >= 8 && segH >= 16) {
        s += text(x + bw / 2, segY + segH / 2, val.toFixed(1) + '%', 'text-anchor="middle" dominant-baseline="central" fill="white" font-size="11.5" font-weight="600"');
      }
      start += val;
    });
    const cx = b.l + (i + 0.5) * slot;
    s += `<path d="M${cx},${b.b}v4" stroke="#2f3b49" stroke-width="1"/>`;
    s += text(cx, b.b + 22, cat, 'text-anchor="middle" font-weight="500"');
  });
  return svg(p, s + legend(b, parts, colors));
}
