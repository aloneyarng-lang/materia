import {esc} from './shared.js';
export {esc};
import {figureAxis, figureInk, plotTheme, seriesColors} from './figure-themes.js';

export function palette(p) {
  return seriesColors(p, p.palette === '色觉友好'
    ? ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#333333']
    : ['#265d8a', '#c95e33', '#2a7f6f', '#72579c', '#a8475c', '#698237', '#4a6e7c']);
}

export function text(x, y, s, attrs = '') {
  return `<text x="${x}" y="${y}" ${attrs}>${esc(s)}</text>`;
}

export function svg(p, content) {
  const fontStack = `${esc(p.font || 'Arial')}, Helvetica Neue, Arial, PingFang SC, Microsoft YaHei, sans-serif`;
  const titleSize = Number(p.fontSize || 14) + 2.5;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${p.width}" height="${p.height}" viewBox="0 0 ${p.width} ${p.height}" text-rendering="geometricPrecision">`
    + `<rect width="100%" height="100%" fill="white"/>`
    + `<g font-family="${fontStack}" font-size="${p.fontSize}" fill="${figureInk(p, '#20252c')}" font-variant-numeric="tabular-nums">`
    + (p.title ? text(p.width / 2, 32, p.title, `text-anchor="middle" font-size="${titleSize}" font-weight="700" letter-spacing="-0.2"`) : '')
    + `${content}</g></svg>`;
}

export function bounds(p) {
  return {l: 86, r: p.width - 158, t: 66, b: p.height - 84};
}

function niceTicksList(lo, hi, log = false, targetCount = 5) {
  if (log) {
    const first = Math.ceil(Math.log10(lo) - 1e-10);
    const last = Math.floor(Math.log10(hi) + 1e-10);
    const stride = Math.max(1, Math.ceil((last - first) / 5));
    const ticks = [];
    for (let e = first; e <= last; e += stride) ticks.push(10 ** e);
    if (ticks.length >= 2) return ticks;
    return Array.from({length: 5}, (_, i) => 10 ** (Math.log10(lo) + (Math.log10(hi) - Math.log10(lo)) * i / 4));
  }
  const span = hi - lo;
  if (!(span > 0) || !Number.isFinite(span)) return [lo, hi];
  const rough = span / Math.max(2, targetCount - 1);
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map(n => n * power).find(n => n >= rough * 0.85) || rough;
  const start = Math.ceil(lo / step - 1e-9);
  const end = Math.floor(hi / step + 1e-9);
  const ticks = Array.from({length: Math.max(0, end - start + 1)}, (_, i) => Number(((start + i) * step).toPrecision(10)));
  if (ticks.length >= 2) return ticks;
  return Array.from({length: 5}, (_, i) => Number((lo + span * i / 4).toPrecision(6)));
}

export function scale(values, a, b, log = false, zero = false, pad = false) {
  if (log && values.some(v => v <= 0)) throw Error('对数轴的全部数值必须大于 0');
  let lo = Math.min(...values), hi = Math.max(...values);
  if (zero) lo = Math.min(0, lo);
  if (lo === hi) {
    if (log) { lo /= 10; hi *= 10; }
    else { lo -= 1; hi += 1; }
  } else if (pad && !log) {
    const m = (hi - lo) * 0.05;
    if (!(zero && lo === 0)) lo -= m;
    hi += m;
  }
  const trans = v => log ? Math.log10(v) : v;
  const fn = v => a + (trans(v) - trans(lo)) / (trans(hi) - trans(lo)) * (b - a);
  fn.lo = lo;
  fn.hi = hi;
  fn.ticks = niceTicksList(lo, hi, log);
  return fn;
}

export function ticksLabel(v) {
  if (Object.is(v, -0) || Math.abs(v) < 1e-12) return 0;
  return Math.abs(v) >= 1e5 || (v !== 0 && Math.abs(v) < 0.001) ? v.toExponential(1) : Number(v.toPrecision(4));
}

export function axes(b, x, y, p, {box = true, gridY = true, gridX = false} = {}) {
  const axis = figureAxis(p, '#2f3b49');
  const tickFont = Math.max(10, Number(p.fontSize || 14) - 1.5);
  let s = '';
  if (y && gridY) {
    for (const v of y.ticks) {
      const pos = y(v);
      if (pos > b.t + 2 && pos < b.b - 2) {
        s += `<path d="M${b.l},${pos}H${b.r}" stroke="#e7ecf2" stroke-width="0.75" stroke-dasharray="2 3"/>`;
      }
    }
  }
  if (x && gridX) {
    for (const v of x.ticks) {
      const pos = x(v);
      if (pos > b.l + 2 && pos < b.r - 2) {
        s += `<path d="M${pos},${b.t}V${b.b}" stroke="#e7ecf2" stroke-width="0.75" stroke-dasharray="2 3"/>`;
      }
    }
  }
  if (box) {
    s += `<path d="M${b.l},${b.t}H${b.r}V${b.b}" fill="none" stroke="#dce2ea" stroke-width="0.9"/>`;
  }
  s += `<path d="M${b.l},${b.t}V${b.b}H${b.r}" fill="none" stroke="${axis}" stroke-width="1.35" stroke-linecap="square"/>`;
  if (y) {
    y.ticks.forEach((v, i) => {
      const pos = y(v);
      s += `<path d="M${b.l},${pos}h-4.5" stroke="${axis}" stroke-width="1"/>`;
      if (i > 0) {
        const mid = (pos + y(y.ticks[i - 1])) / 2;
        s += `<path d="M${b.l},${mid}h-2.5" stroke="${axis}" stroke-width="0.8"/>`;
      }
      s += text(b.l - 8, pos + 4, ticksLabel(v), `text-anchor="end" font-size="${tickFont}"`);
    });
  }
  if (x) {
    x.ticks.forEach((v, i) => {
      const pos = x(v);
      s += `<path d="M${pos},${b.b}v4.5" stroke="${axis}" stroke-width="1"/>`;
      if (i > 0) {
        const mid = (pos + x(x.ticks[i - 1])) / 2;
        s += `<path d="M${mid},${b.b}v2.5" stroke="${axis}" stroke-width="0.8"/>`;
      }
      s += text(pos, b.b + 21, ticksLabel(v), `text-anchor="middle" font-size="${tickFont}"`);
    });
  }
  const xLab = p.xLabel ? text((b.l + b.r) / 2, b.b + 52, p.xLabel, 'text-anchor="middle" font-weight="600"') : '';
  const yLab = p.yLabel ? `<text transform="translate(${b.l - 60} ${(b.t + b.b) / 2}) rotate(-90)" text-anchor="middle" font-weight="600">${esc(p.yLabel)}</text>` : '';
  return s + xLab + yLab;
}

export function drawShapeMarker(cx, cy, r, color, shapeIndex = 0, open = false) {
  const fill = open ? 'white' : color;
  const stroke = open ? color : 'white';
  const sw = open ? 1.4 : 1.35;
  const shape = shapeIndex % 4;
  if (shape === 0) return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
  if (shape === 1) return `<rect x="${cx - r * 0.9}" y="${cy - r * 0.9}" width="${r * 1.8}" height="${r * 1.8}" rx="1.2" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
  if (shape === 2) {
    const d = r * 1.22;
    return `<polygon points="${cx},${cy - d} ${cx + d},${cy} ${cx},${cy + d} ${cx - d},${cy}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  }
  const d = r * 1.25;
  return `<polygon points="${cx},${cy - d} ${cx + d * 0.9},${cy + d * 0.72} ${cx - d * 0.9},${cy + d * 0.72}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
}

export function series(rows, x, y, color, p, shapeIndex = 0) {
  const lw = p.lineWidth || 2;
  let s = `<polyline points="${rows.map(d => `${x(d.x)},${y(d.y)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${lw}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const r = Number(p.markerSize ?? 4);
  if (r > 0) {
    for (const d of rows) s += drawShapeMarker(x(d.x), y(d.y), r, color, shapeIndex);
  }
  return s;
}

export function legend(b, groups, colors, {style = 'bar', x: customX, y: customY} = {}) {
  if (!groups.length) return '';
  const x = customX ?? (b.r + 14);
  const y = customY ?? b.t;
  const rowH = 22;
  const maxLen = Math.max(...groups.map(g => String(g).length));
  const boxW = Math.min(140, Math.max(76, maxLen * 8 + 38));
  const boxH = groups.length * rowH + 10;
  let s = `<rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="5" fill="white" fill-opacity="0.94" stroke="#dce2ea" stroke-width="0.9"/>`;
  s += groups.map((g, i) => {
    const c = colors[i % colors.length];
    const py = y + 16 + i * rowH;
    const glyph = style === 'line'
      ? `<line x1="${x + 8}" y1="${py}" x2="${x + 24}" y2="${py}" stroke="${c}" stroke-width="2" stroke-linecap="round"/>${drawShapeMarker(x + 16, py, 3.3, c, i)}`
      : style === 'dot'
        ? drawShapeMarker(x + 14, py, 3.8, c, i)
        : `<rect x="${x + 9}" y="${py - 5}" width="10" height="10" rx="2.5" fill="${c}"/>`;
    const tx = style === 'line' ? x + 30 : x + 25;
    return glyph + text(tx, py + 4, g, 'font-size="11.5"');
  }).join('');
  return s;
}

export function unique(rows, fields) {
  const k = rows.map(d => JSON.stringify(fields.map(f => d[f])));
  if (new Set(k).size !== k.length) throw Error('存在重复的 ' + fields.join(' / ') + ' 组合，请先明确汇总方式');
}
