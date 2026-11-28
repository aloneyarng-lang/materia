import {svg, bounds, scale, axes, text, esc} from '../gallery-utils.js';
import {plotTheme, seriesColors} from '../figure-themes.js';

export function distribution(values, bins) {
  if (!Number.isInteger(+bins)) throw Error('分箱数必须为整数');
  let lo = Math.min(...values), hi = Math.max(...values);
  if (lo === hi) { lo -= 0.5; hi += 0.5; }
  const step = (hi - lo) / bins;
  const counts = Array(+bins).fill(0);
  values.forEach(v => counts[Math.min(bins - 1, Math.floor((v - lo) / step))]++);
  return {lo, hi, step, counts};
}

export function render({data, params: p}) {
  const values = data.map(d => d.value).sort((a, b) => a - b);
  const dist = distribution(values, +p.bins);
  const b = bounds(p);
  b.r = p.width - 102;
  const x = scale([dist.lo, dist.hi], b.l, b.r);
  const maxC = Math.max(...dist.counts);
  const y = scale([0, maxC], b.b, b.t);
  const z = scale([0, 100], b.b, b.t);
  const barColor = esc(seriesColors(p, [p.color])[0]);
  const barW = (b.r - b.l) / Number(p.bins);
  const tickFont = Math.max(10, Number(p.fontSize || 14) - 1.5);
  let s = axes(b, x, y, {...p, yLabel: '频数'}, {box: true, gridY: true});
  dist.counts.forEach((n, i) => {
    const bx = x(dist.lo + i * dist.step) + 1;
    const by = y(n);
    const bh = b.b - by;
    s += `<rect x="${bx}" y="${by}" width="${Math.max(1, barW - 2)}" height="${bh}" rx="2" fill="${barColor}" fill-opacity="0.72" stroke="${barColor}" stroke-width="0.9"/>`;
  });
  if (p.cdf === '显示') {
    const curve = plotTheme(p)?.series[1] ?? '#b95148';
    let points = `${b.l},${b.b} `, prev = 0;
    values.forEach((v, i) => {
      points += `${x(v)},${z(prev)} ${x(v)},${z((i + 1) / values.length * 100)} `;
      prev = (i + 1) / values.length * 100;
    });
    points += `${b.r},${b.t}`;
    s += `<polyline points="${points}" fill="none" stroke="white" stroke-width="4" stroke-linejoin="round" stroke-opacity="0.75"/>`;
    s += `<polyline points="${points}" fill="none" stroke="${curve}" stroke-width="2.1" stroke-linejoin="round"/>`;
    s += `<path d="M${b.r},${b.t}V${b.b}" stroke="${curve}" stroke-width="1.4"/>`;
    for (const v of z.ticks) {
      const py = z(v);
      s += `<path d="M${b.r},${py}h4.5" stroke="${curve}" stroke-width="1"/>`;
      s += text(b.r + 8, py + 4, v + '%', `fill="${curve}" font-size="${tickFont}"`);
    }
    s += `<text transform="translate(${p.width - 22} ${(b.t + b.b) / 2}) rotate(90)" text-anchor="middle" font-weight="600" fill="${curve}">累计比例</text>`;
    s += `<rect x="${b.l + 12}" y="${b.t + 10}" width="112" height="46" rx="5" fill="white" fill-opacity="0.94" stroke="#dce2ea" stroke-width="0.9"/>`;
    s += `<rect x="${b.l + 20}" y="${b.t + 18}" width="10" height="10" rx="2" fill="${barColor}" fill-opacity="0.78"/>` + text(b.l + 36, b.t + 27, '频数分布', 'font-size="11.5"');
    s += `<line x1="${b.l + 19}" y1="${b.t + 43}" x2="${b.l + 31}" y2="${b.t + 43}" stroke="${curve}" stroke-width="2.1"/>` + text(b.l + 36, b.t + 47, '累计比例', `fill="${curve}" font-size="11.5"`);
  }
  return svg(p, s);
}
