import {intervalPaper} from '../reference-styles.js';
import {svg, bounds, scale, axes, series, legend, palette, unique} from '../gallery-utils.js';

export function render({data, params: p}) {
  unique(data, ['group', 'x']);
  if (data.some(d => d.lower > d.y || d.upper < d.y)) {
    throw Error('每行须满足下限 ≤ 中心值 ≤ 上限');
  }
  const b = bounds(p);
  const x = scale(data.map(d => d.x), b.l, b.r);
  const y = scale(data.flatMap(d => [d.lower, d.upper]), b.b, b.t);
  const colors = palette(p);
  const groups = [...new Set(data.map(d => d.group))];
  if (p.figureStyle === '细框内刻度') return intervalPaper(data,p,groups);
  let s = axes(b, x, y, p);
  groups.forEach((g, i) => {
    const rows = data.filter(d => d.group === g).sort((a, b) => a.x - b.x);
    const c = colors[i % colors.length];
    if (p.display === '带状包络' && rows.length > 1) {
      const points = rows.map(d => x(d.x)+','+y(d.upper))
        .concat([...rows].reverse().map(d => x(d.x)+','+y(d.lower)));
      s += '<polygon points="'+points.join(' ')+'" fill="'+c+'" fill-opacity=".18"/>';
    } else {
      for (const d of rows) {
        const px = x(d.x), low = y(d.lower), high = y(d.upper);
        s += '<path d="M'+px+','+low+'V'+high+'M'+(px-4)+','+low+'h8M'+(px-4)+','+high+'h8" stroke="'+c+'" fill="none"/>';
      }
    }
    s += series(rows, x, y, c, {...p, lineWidth: 2});
  });
  return svg(p, s + legend(b, groups, colors));
}
