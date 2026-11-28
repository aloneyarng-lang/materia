import {svg, palette, legend, text, unique, ticksLabel, drawShapeMarker} from '../gallery-utils.js';

export function render({data, params: p}) {
  if (data.some(d => d.angle < 0 || d.angle > 360 || d.radius < 0)) throw Error('角度须在 0–360°，径向值须非负');
  const rows = data.map(d => ({...d, angle: d.angle % 360}));
  unique(rows, ['group', 'angle']);
  const cx = (p.width - 150) / 2, cy = (p.height + 16) / 2;
  const radius = Math.min(cx - 48, cy - 82, p.height - cy - 64);
  const max = Math.max(...rows.map(d => d.radius)) || 1;
  const point = (angle, r) => {
    const rad = angle * Math.PI / 180;
    return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)];
  };
  let s = '';
  for (let i = 4; i >= 1; i--) {
    const rr = radius * i / 4;
    s += `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="${i % 2 === 0 ? '#f7f9fc' : 'white'}" stroke="${i === 4 ? '#94a3b8' : '#dce3ec'}" stroke-width="${i === 4 ? 1.25 : 0.85}"/>`;
  }
  for (let angle = 0; angle < 360; angle += 45) {
    const [x, y] = point(angle, radius);
    const [lx, ly] = point(angle, radius + 22);
    s += `<path d="M${cx},${cy}L${x},${y}" stroke="#dce3ec" stroke-width="0.85" stroke-dasharray="2 3"/>`;
    s += text(lx, ly + 4, angle + '°', 'text-anchor="middle" font-size="11.5" font-weight="600"');
  }
  for (let i = 1; i <= 4; i++) {
    s += text(cx + 5, cy - radius * i / 4 - 4, ticksLabel(max * i / 4), 'font-size="10.5" fill="#5b6776"');
  }
  const groups = [...new Set(rows.map(d => d.group))], colors = palette(p);
  groups.forEach((g, i) => {
    const pts = rows.filter(d => d.group === g).sort((a, b) => a.angle - b.angle)
      .map(d => point(d.angle, radius * d.radius / max));
    const c = colors[i % colors.length];
    const connected = p.close === '闭合' && pts.length > 2 ? [...pts, pts[0]] : pts;
    if (p.close === '闭合' && pts.length > 2) {
      s += `<polygon points="${pts.map(v => v.join(',')).join(' ')}" fill="${c}" fill-opacity="0.10"/>`;
    }
    s += `<polyline points="${connected.map(v => v.join(',')).join(' ')}" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    for (const [x, y] of pts) s += drawShapeMarker(x, y, Number(p.markerSize || 4), c, i);
  });
  s += text(cx, p.height - 14, p.radialLabel, 'text-anchor="middle" font-weight="600"');
  return svg(p, s + legend({r: p.width - 148, t: 66}, groups, colors, {style: 'line'}));
}
