import {calibrationPaper} from '../reference-styles.js';
import {svg, scale, axes, palette, legend, text, ticksLabel, drawShapeMarker} from '../gallery-utils.js';

export function metrics(data) {
  const residuals = data.map(d => d.predicted - d.observed);
  const mean = data.reduce((sum, d) => sum + d.observed, 0) / data.length;
  const sse = residuals.reduce((sum, r) => sum + r ** 2, 0);
  const sst = data.reduce((sum, d) => sum + (d.observed - mean) ** 2, 0);
  return {
    residuals,
    mae: residuals.reduce((sum, r) => sum + Math.abs(r), 0) / data.length,
    rmse: Math.sqrt(sse / data.length),
    r2: sst > 0 ? 1 - sse / sst : null,
  };
}

export function render({data, params: p}) {
  if (p.figureStyle === '校准条带') return calibrationPaper(data, p, metrics);
  if (new Set(data.map(d => d.panel || '')).size > 1) throw Error('多个面板请选「校准条带」，避免合并不同量纲');
  const side = Math.min(p.width - 235, p.height - 300);
  if (side < 95) throw Error('校准图需要更高的画布（至少 395 px）');
  const top = {l: 86, r: 86 + side, t: 70, b: 70 + side};
  const bottom = {...top, t: top.b + 58, b: p.height - 68};
  const domain = data.flatMap(d => [d.observed, d.predicted]);
  const x = scale(domain, top.l, top.r, false, false, true);
  const y = scale(domain, top.b, top.t, false, false, true);
  const {residuals, mae, rmse, r2} = metrics(data);
  const ry = scale([0, ...residuals], bottom.b, bottom.t, false, false, true);
  const colors = palette(p);
  const groups = [...new Set(data.map(d => d.group || '数据'))];
  const band = Math.max(8, side * 0.075);
  let s = `<polygon points="${top.l},${top.b} ${top.l + band},${top.b} ${top.r},${top.t + band} ${top.r},${top.t} ${top.r - band},${top.t} ${top.l},${top.b - band}" fill="#eef2f6" fill-opacity="0.75"/>`;
  s += axes(top, x, y, {...p, xLabel: ''}, {box: true, gridY: true, gridX: true});
  s += axes(bottom, x, ry, {...p, yLabel: '残差'}, {box: true, gridY: true, gridX: true});
  s += `<path d="M${top.l},${top.b}L${top.r},${top.t}" stroke="#4a5568" stroke-width="1.1" stroke-dasharray="5 4"/>`;
  s += `<path d="M${bottom.l},${ry(0)}H${bottom.r}" stroke="#4a5568" stroke-width="1.1" stroke-dasharray="5 4"/>`;
  data.forEach((d, i) => {
    const gi = groups.indexOf(d.group || '数据');
    const c = colors[gi % colors.length];
    const px = x(d.observed);
    s += drawShapeMarker(px, y(d.predicted), Number(p.markerSize || 4.5), c, gi);
    s += drawShapeMarker(px, ry(residuals[i]), Math.max(3, Number(p.markerSize || 4.5) - 0.5), c, gi);
  });
  s += legend(top, groups, colors, {style: 'dot'});
  const notes = ['n = ' + data.length, 'MAE = ' + ticksLabel(mae), 'RMSE = ' + ticksLabel(rmse), 'R² = ' + (r2 === null ? '未定义' : ticksLabel(r2))];
  const cardY = top.t + groups.length * 22 + 24;
  s += `<rect x="${top.r + 14}" y="${cardY}" width="128" height="${notes.length * 21 + 14}" rx="5" fill="#f8fafc" stroke="#dce2ea" stroke-width="0.9"/>`;
  notes.forEach((v, i) => {
    s += text(top.r + 24, cardY + 21 + i * 21, v, 'font-size="11.5" font-weight="600"');
  });
  return svg(p, s);
}
