import {svg, bounds, scale, axes, text, unique, ticksLabel} from '../gallery-utils.js';
import {plotTheme, rampColor} from '../figure-themes.js';

export function triangleSegment(vertices, level) {
  const crossings = [];
  for (let i = 0; i < 3; i++) {
    const a = vertices[i], b = vertices[(i + 1) % 3];
    if ((a.z < level) === (b.z < level)) continue;
    const t = (level - a.z) / (b.z - a.z);
    crossings.push([a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t]);
  }
  return crossings.length === 2 ? crossings : null;
}

export function render({data, params: p}) {
  unique(data, ['x', 'y']);
  const xs = [...new Set(data.map(d => d.x))].sort((a, b) => a - b);
  const ys = [...new Set(data.map(d => d.y))].sort((a, b) => a - b);
  if (xs.length < 2 || ys.length < 2 || xs.length * ys.length !== data.length) throw Error('网格须至少 2×2，且每个 X/Y 组合都须有值');
  if (data.length > 10000) throw Error('等值线最多支持 10000 个网格节点');
  if (!Number.isInteger(Number(p.levels))) throw Error('等值线级数须为整数');
  const byPoint = new Map(data.map(d => [JSON.stringify([d.x, d.y]), d]));
  const get = (i, j) => byPoint.get(JSON.stringify([xs[i], ys[j]]));
  const triangles = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const a = get(i, j), b = get(i + 1, j), c = get(i + 1, j + 1), d = get(i, j + 1);
      triangles.push([a, b, c], [a, c, d]);
    }
  }
  const z = data.map(d => d.z), min = Math.min(...z), max = Math.max(...z);
  if (min === max) throw Error('所有响应值相同，没有内部等值线');
  const b = bounds(p), x = scale(xs, b.l, b.r), y = scale(ys, b.b, b.t);
  const colors = ['#1b365d', '#214d7c', '#21678f', '#1d808f', '#1f9174', '#438953', '#798e3b', '#aa722b', '#b04e32', '#8f395c'];
  const theme = plotTheme(p);
  let s = `<rect x="${b.l}" y="${b.t}" width="${b.r - b.l}" height="${b.b - b.t}" fill="#fafbfd"/>`;
  s += axes(b, x, y, p, {box: true, gridY: true, gridX: true});
  const levels = Number(p.levels);
  const legX = b.r + 14, legY = b.t + 16, legH = levels * 20 + 28;
  s += `<rect x="${legX}" y="${b.t}" width="128" height="${legH}" rx="5" fill="white" fill-opacity="0.94" stroke="#dce2ea" stroke-width="0.9"/>`;
  s += text(legX + 12, b.t + 18, p.zLabel, 'font-size="11.5" font-weight="600"');
  for (let i = 0; i < levels; i++) {
    const level = min + (max - min) * (i + 1) / (levels + 1);
    const position = levels === 1 ? 0 : i / (levels - 1);
    const c = theme ? rampColor(theme.ramp, 0.45 + 0.55 * position) : colors[Math.round(position * 9)];
    const paths = [];
    for (const tri of triangles) {
      const segment = triangleSegment(tri, level);
      if (!segment) continue;
      const [pa, pb] = segment;
      paths.push('M' + x(pa[0]) + ',' + y(pa[1]) + 'L' + x(pb[0]) + ',' + y(pb[1]));
    }
    s += `<path d="${paths.join('')}" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    const ly = legY + 18 + 20 * i;
    s += `<path d="M${legX + 12},${ly}h18" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>` + text(legX + 36, ly + 4, ticksLabel(level), 'font-size="11"');
  }
  return svg(p, s);
}
