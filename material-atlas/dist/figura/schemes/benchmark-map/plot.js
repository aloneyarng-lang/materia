import {benchmarkPaper} from '../reference-styles.js';
import {svg, bounds, scale, axes, palette, legend, text, drawShapeMarker, ticksLabel} from '../gallery-utils.js';

function threshold(input, log, axis) {
  if (String(input).trim() === '') return null;
  const value = Number(input);
  if (!Number.isFinite(value) || (log && value <= 0)) throw Error(axis + ' 轴阈值无效');
  return value;
}

export function render({data, params: p}) {
  const b = bounds(p);
  const logX = p.xScale === '对数', logY = p.yScale === '对数';
  const tx = threshold(p.xTarget, logX, 'X'), ty = threshold(p.yTarget, logY, 'Y');
  if (p.figureStyle === '分区聚焦') return benchmarkPaper(data, p, {logX, logY, tx, ty});
  const xs = data.map(d => d.x), ys = data.map(d => d.y);
  if (tx !== null) xs.push(tx);
  if (ty !== null) ys.push(ty);
  const x = scale(xs, b.l, b.r, logX, false, true);
  const y = scale(ys, b.b, b.t, logY, false, true);
  const colors = palette(p), groups = [...new Set(data.map(d => d.group))];
  let s = '';
  // Subtle Ashby target quadrant highlight
  if (tx !== null || ty !== null) {
    const qx = tx !== null ? x(tx) : b.l;
    const qy = ty !== null ? y(ty) : b.b;
    s += `<rect x="${qx}" y="${b.t}" width="${Math.max(0, b.r - qx)}" height="${Math.max(0, qy - b.t)}" fill="${colors[0]}" fill-opacity="0.055"/>`;
  }
  s += axes(b, x, y, p, {box: true, gridY: true, gridX: true});
  if (tx !== null) {
    s += `<path d="M${x(tx)},${b.t}V${b.b}" stroke="#586879" stroke-width="1.15" stroke-dasharray="5 4"/>`;
    s += text(x(tx) + 5, b.t + 14, `Target X = ${ticksLabel(tx)}`, 'font-size="10.5" fill="#586879" font-weight="600"');
  }
  if (ty !== null) {
    s += `<path d="M${b.l},${y(ty)}H${b.r}" stroke="#586879" stroke-width="1.15" stroke-dasharray="5 4"/>`;
    s += text(b.r - 6, y(ty) - 6, `Target Y = ${ticksLabel(ty)}`, 'text-anchor="end" font-size="10.5" fill="#586879" font-weight="600"');
  }
  for (const d of data) {
    const px = x(d.x), py = y(d.y), gi = groups.indexOf(d.group);
    const c = colors[gi % colors.length];
    s += drawShapeMarker(px, py, Number(p.markerSize || 5), c, gi);
    if (d.label) {
      const right = px > (b.l + b.r) / 2;
      s += text(px + (right ? -9 : 9), py - 8, d.label, `${right ? 'text-anchor="end" ' : ''}font-size="11.5" font-weight="600" fill="${c}" stroke="white" stroke-width="3" paint-order="stroke"`);
    }
  }
  return svg(p, s + legend(b, groups, colors, {style: 'dot'}));
}
