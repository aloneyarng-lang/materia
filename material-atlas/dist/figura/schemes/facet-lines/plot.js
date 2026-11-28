import {svg, scale, axes, series, palette, text, legend} from '../gallery-utils.js';

export function render({data, params: p}) {
  const panels = [...new Set(data.map(d => d.panel))];
  const groups = [...new Set(data.map(d => d.group))];
  const c = palette(p);
  if (panels.length > 6) throw Error('最多六个面板');
  if (!Number.isInteger(+p.columns)) throw Error('面板列数必须为整数');
  const cols = Math.min(+p.columns, panels.length);
  const rows = Math.ceil(panels.length / cols);
  const cw = (p.width - 140) / cols;
  const ch = (p.height - 62) / rows;
  if (cw < 240 || ch < 190) throw Error('面板过密，请增大画布或减少列数');
  let s = '';
  panels.forEach((name, i) => {
    const d = data.filter(d => d.panel === name);
    const col = i % cols, row = Math.floor(i / cols);
    const b = {l: col * cw + 72, r: (col + 1) * cw - 18, t: row * ch + 76, b: (row + 1) * ch - 24};
    const x = scale(data.map(d => d.x), b.l, b.r, false, false, true);
    const y = scale((p.sharedY === '共享范围' ? data : d).map(d => d.y), b.b, b.t, false, false, true);
    s += `<rect x="${b.l}" y="${b.t - 22}" width="${b.r - b.l}" height="19" rx="3" fill="#f2f5f9"/>`;
    s += text(b.l + 8, b.t - 9, `(${String.fromCharCode(97 + i)}) ${name}`, 'font-size="12" font-weight="700"');
    s += axes(b, x, y, {xLabel: '', yLabel: '', fontSize: Number(p.fontSize || 14) - 1}, {box: true, gridY: true});
    groups.forEach((g, j) => {
      const seriesRows = d.filter(d => d.group === g).sort((a, b) => a.x - b.x);
      if (seriesRows.length) s += series(seriesRows, x, y, c[j % c.length], p, j);
    });
  });
  s += text((p.width - 140) / 2 + 12, p.height - 14, p.xLabel, 'text-anchor="middle" font-weight="600"');
  s += `<text transform="translate(20 ${(p.height - 20) / 2}) rotate(-90)" text-anchor="middle" font-weight="600">${p.yLabel}</text>`;
  s += legend({r: p.width - 142, t: 76}, groups, c, {style: 'line'});
  return svg(p, s);
}
