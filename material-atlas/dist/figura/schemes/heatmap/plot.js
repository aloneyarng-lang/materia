import {frame, esc} from '../shared.js';
import {plotTheme, rampColor, rampTextColor} from '../figure-themes.js';

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  return [0, 2, 4].map(o => Number.parseInt(full.slice(o, o + 2), 16) || 0);
}

function tintHex(hex, whiteRatio) {
  const rgb = hexToRgb(hex);
  return '#' + rgb.map(ch => Math.round(ch + (255 - ch) * whiteRatio).toString(16).padStart(2, '0')).join('');
}

function fallbackRamp(baseColor) {
  const c = /^#[0-9a-f]{3,6}$/i.test(baseColor || '') ? baseColor : '#265d8a';
  return [tintHex(c, 0.88), tintHex(c, 0.66), tintHex(c, 0.42), tintHex(c, 0.18), c];
}

function colorKey(f, ramp, lo, hi) {
  const x = f.right + 18, y = f.top + 8;
  const height = Math.min(f.bottom - f.top - 16, 170);
  if (lo === hi) {
    return `<rect x="${x}" y="${y}" width="16" height="16" rx="2" fill="${rampColor(ramp, 0.5)}" stroke="#ccd4de" stroke-width="0.8"/><text x="${x + 24}" y="${y + 12}" font-size="11.5">${lo}</text>`;
  }
  const stops = ramp.map((color, i) => `<stop offset="${i / (ramp.length - 1)}" stop-color="${color}"/>`).join('');
  let s = `<defs><linearGradient id="heatmap-scale" x1="0%" x2="0%" y1="100%" y2="0%">${stops}</linearGradient></defs>`;
  s += `<rect x="${x}" y="${y}" width="16" height="${height}" rx="2" fill="url(#heatmap-scale)" stroke="#9aa5b1" stroke-width="0.8"/>`;
  for (let i = 0; i <= 4; i++) {
    const frac = i / 4;
    const py = y + height * (1 - frac);
    const val = Number((lo + (hi - lo) * frac).toPrecision(3));
    s += `<path d="M${x + 16},${py}h3.5" stroke="#4a5568" stroke-width="0.9"/><text x="${x + 23}" y="${py + 4}" font-size="11">${val}</text>`;
  }
  return s;
}

export function render({data, params: p}) {
  const f = frame(p);
  const rows = [...new Set(data.map(d => d.row))];
  const cols = [...new Set(data.map(d => d.column))];
  const keys = data.map(d => JSON.stringify([d.row, d.column]));
  if (new Set(keys).size !== keys.length) throw Error('行列组合重复');
  const lo = Math.min(...data.map(d => d.value));
  const hi = Math.max(...data.map(d => d.value));
  const w = (f.right - f.left) / cols.length;
  const h = (f.bottom - f.top) / rows.length;
  const themeRamp = plotTheme(p)?.ramp;
  const ramp = themeRamp || fallbackRamp(p.color);
  let s = f.start;
  s += `<rect x="${f.left}" y="${f.top}" width="${f.right - f.left}" height="${f.bottom - f.top}" fill="none" stroke="${f.axis}" stroke-width="1.2"/>`;
  for (const d of data) {
    const x = f.left + cols.indexOf(d.column) * w;
    const y = f.top + rows.indexOf(d.row) * h;
    const fraction = hi === lo ? 0.5 : (d.value - lo) / (hi - lo);
    const fill = themeRamp ? rampColor(themeRamp, fraction) : rampColor(ramp, fraction);
    const ink = rampTextColor(fill);
    s += `<rect x="${x + 0.75}" y="${y + 0.75}" width="${Math.max(1, w - 1.5)}" height="${Math.max(1, h - 1.5)}" rx="2" fill="${fill}"/>`;
    if (p.showValues === '显示') {
      s += `<text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="central" font-size="12" font-weight="600" fill="${ink}">${d.value}</text>`;
    }
  }
  const tickFont = Math.max(10, (f.fontSize || 14) - 1.5);
  rows.forEach((r, i) => s += `<text x="${f.left - 10}" y="${f.top + (i + 0.5) * h}" text-anchor="end" dominant-baseline="central" font-size="${tickFont}">${esc(r)}</text>`);
  cols.forEach((c, i) => s += `<text x="${f.left + (i + 0.5) * w}" y="${f.bottom + 22}" text-anchor="middle" font-size="${tickFont}">${esc(c)}</text>`);
  s += colorKey(f, ramp, lo, hi);
  return s + f.end;
}
