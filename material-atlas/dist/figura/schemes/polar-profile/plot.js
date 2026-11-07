import {svg, palette, legend, text, unique, ticksLabel} from '../gallery-utils.js';

export function render({data, params: p}) {
  if (data.some(d => d.angle < 0 || d.angle > 360 || d.radius < 0)) throw Error('角度须在 0–360°，径向值须非负');
  const rows = data.map(d => ({...d, angle: d.angle % 360}));
  unique(rows, ['group', 'angle']);
  const cx = (p.width - 145) / 2, cy = (p.height + 20) / 2;
  const radius = Math.min(cx - 43, cy - 82, p.height - cy - 62);
  const max = Math.max(...rows.map(d => d.radius)) || 1;
  const point = (angle, r) => {
    const rad = angle * Math.PI / 180;
    return [cx + r*Math.cos(rad), cy - r*Math.sin(rad)];
  };
  let s = '';
  for (let i = 1; i <= 4; i++) {
    s += '<circle cx="'+cx+'" cy="'+cy+'" r="'+(radius*i/4)+'" fill="none" stroke="#d9e2ed"/>';
    s += text(cx+4,cy-radius*i/4-4,ticksLabel(max*i/4));
  }
  for (let angle=0; angle<360; angle+=45) {
    const [x,y] = point(angle,radius);
    const [lx,ly] = point(angle,radius+22);
    s += '<path d="M'+cx+','+cy+'L'+x+','+y+'" stroke="#d9e2ed"/>';
    s += text(lx,ly+4,angle+'°','text-anchor="middle"');
  }
  const groups = [...new Set(rows.map(d => d.group))], colors = palette(p);
  groups.forEach((g,i) => {
    const pts = rows.filter(d => d.group===g).sort((a,b) => a.angle-b.angle)
      .map(d => point(d.angle, radius*d.radius/max));
    const c = colors[i % colors.length];
    const connected = p.close==='闭合' && pts.length>2 ? [...pts,pts[0]] : pts;
    s += '<polyline points="'+connected.map(v=>v.join(',')).join(' ')+'" fill="none" stroke="'+c+'" stroke-width="2"/>';
    for (const [x,y] of pts) s += '<circle cx="'+x+'" cy="'+y+'" r="'+p.markerSize+'" fill="'+c+'"/>';
  });
  s += text(cx,p.height-12,p.radialLabel,'text-anchor="middle"');
  return svg(p,s+legend({r:p.width-135,t:65},groups,colors));
}
