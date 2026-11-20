import {calibrationPaper} from '../reference-styles.js';
import {svg, scale, axes, palette, legend, text, ticksLabel} from '../gallery-utils.js';

export function metrics(data) {
  const residuals = data.map(d => d.predicted - d.observed);
  const mean = data.reduce((sum, d) => sum + d.observed, 0) / data.length;
  const sse = residuals.reduce((sum, r) => sum + r ** 2, 0);
  const sst = data.reduce((sum, d) => sum + (d.observed - mean) ** 2, 0);
  return {residuals, mae: residuals.reduce((sum, r) => sum + Math.abs(r), 0) / data.length,
    rmse: Math.sqrt(sse / data.length), r2: sst > 0 ? 1 - sse / sst : null};
}

export function render({data, params: p}) {
  if (p.figureStyle === '校准条带') return calibrationPaper(data,p,metrics);
  if (new Set(data.map(d=>d.panel||'')).size>1) throw Error('多个面板请选「校准条带」，避免合并不同量纲');
  const side = Math.min(p.width - 225, p.height - 300);
  if (side < 95) throw Error('校准图需要更高的画布（至少 395 px）');
  const top = {l: 85, r: 85 + side, t: 70, b: 70 + side};
  const bottom = {...top, t: top.b + 64, b: p.height - 65};
  const domain = data.flatMap(d => [d.observed, d.predicted]);
  const x = scale(domain, top.l, top.r);
  const y = scale(domain, top.b, top.t);
  const {residuals, mae, rmse, r2} = metrics(data);
  const ry = scale([0, ...residuals], bottom.b, bottom.t);
  const colors = palette(p);
  const groups = [...new Set(data.map(d => d.group || '数据'))];
  let s = axes(top, x, y, {...p, xLabel: ''});
  s += axes(bottom, x, ry, {...p, yLabel: '残差'});
  s += '<path d="M'+top.l+','+top.b+'L'+top.r+','+top.t+'" stroke="#778394" stroke-dasharray="5 4"/>';
  s += '<path d="M'+bottom.l+','+ry(0)+'H'+bottom.r+'" stroke="#778394" stroke-dasharray="5 4"/>';
  data.forEach((d, i) => {
    const c = colors[groups.indexOf(d.group || '数据') % colors.length];
    for (const cy of [y(d.predicted), ry(residuals[i])]) {
      s += '<circle cx="'+x(d.observed)+'" cy="'+cy+'" r="'+p.markerSize+'" fill="'+c+'" fill-opacity=".8"/>';
    }
  });
  s += legend(top, groups, colors);
  const notes = ['n = '+data.length, 'MAE = '+ticksLabel(mae), 'RMSE = '+ticksLabel(rmse), 'R² = '+(r2===null?'未定义':ticksLabel(r2))];
  notes.forEach((v,i) => s += text(top.r+15, top.t+groups.length*22+25+i*21, v));
  return svg(p, s);
}
