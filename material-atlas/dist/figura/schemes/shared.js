import {figureAxis, figureInk, plotTheme} from './figure-themes.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

export function frame(p) {
  const w = +p.width, h = +p.height;
  const fontStack = `${esc(p.font || 'Arial')}, Helvetica Neue, Arial, PingFang SC, Microsoft YaHei, sans-serif`;
  const titleSize = Number(p.fontSize || 14) + 2.5;
  return {
    w, h, left: 84, right: w - 158, top: 66, bottom: h - 84,
    themed: Boolean(plotTheme(p)),
    axis: figureAxis(p, '#2f3b49'),
    fontSize: Number(p.fontSize || 14),
    start: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" text-rendering="geometricPrecision"><rect width="100%" height="100%" fill="white"/><g font-family="${fontStack}" font-size="${p.fontSize}" fill="${figureInk(p, '#20252c')}" font-variant-numeric="tabular-nums"><text x="${w / 2}" y="32" text-anchor="middle" font-size="${titleSize}" font-weight="700" letter-spacing="-0.2">${esc(p.title)}</text>`,
    end: `<text x="${w / 2}" y="${h - 16}" text-anchor="middle" font-weight="600">${esc(p.xLabel)}</text><text transform="translate(22 ${h / 2}) rotate(-90)" text-anchor="middle" font-weight="600">${esc(p.yLabel)}</text></g></svg>`,
  };
}

function niceTicks(lo, hi, count = 5) {
  const span = hi - lo;
  if (!(span > 0) || !Number.isFinite(span)) return [lo, hi];
  const rough = span / Math.max(2, count - 1);
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map(n => n * power).find(n => n >= rough * 0.85) || rough;
  const start = Math.ceil(lo / step - 1e-9);
  const end = Math.floor(hi / step + 1e-9);
  const ticks = Array.from({length: Math.max(0, end - start + 1)}, (_, i) => Number(((start + i) * step).toPrecision(10)));
  if (ticks.length >= 2) return ticks;
  return Array.from({length: 5}, (_, i) => Number((lo + span * i / 4).toPrecision(4)));
}

export function scale(values, a, b, min = '', max = '', zero = false) {
  let lo = min === '' ? Math.min(...values) : +min;
  let hi = max === '' ? Math.max(...values) : +max;
  if (zero && min === '') lo = Math.min(0, lo);
  if (zero && max === '') hi = Math.max(0, hi);
  if (lo === hi) { lo -= 1; hi += 1; }
  if (lo >= hi) throw Error('坐标范围无效');
  const f = v => a + (v - lo) / (hi - lo) * (b - a);
  f.lo = lo;
  f.hi = hi;
  f.ticks = niceTicks(lo, hi);
  return f;
}

function fmtTick(v) {
  if (Object.is(v, -0) || Math.abs(v) < 1e-12) return 0;
  return Math.abs(v) >= 1e5 || (v !== 0 && Math.abs(v) < 0.001) ? v.toExponential(1) : Number(v.toPrecision(4));
}

export function axes(f, x, y) {
  const axis = f.axis || '#2f3b49';
  const tickFont = Math.max(10, (f.fontSize || 14) - 1.5);
  let s = '';
  const yTicks = y.ticks || Array.from({length: 5}, (_, i) => y.lo + (y.hi - y.lo) * i / 4);
  for (const v of yTicks) {
    const pos = y(v);
    if (pos > f.top + 2 && pos < f.bottom - 2) {
      s += `<path d="M${f.left},${pos}H${f.right}" stroke="#e7ecf2" stroke-width="0.75" stroke-dasharray="2 3"/>`;
    }
  }
  s += `<path d="M${f.left},${f.top}H${f.right}V${f.bottom}" fill="none" stroke="#dce2ea" stroke-width="0.9"/>`;
  s += `<path d="M${f.left},${f.top}V${f.bottom}H${f.right}" fill="none" stroke="${axis}" stroke-width="1.35" stroke-linecap="square"/>`;
  yTicks.forEach((v, i) => {
    const pos = y(v);
    s += `<path d="M${f.left},${pos}h-4.5" stroke="${axis}" stroke-width="1"/>`;
    if (i > 0) {
      const mid = (pos + y(yTicks[i - 1])) / 2;
      s += `<path d="M${f.left},${mid}h-2.5" stroke="${axis}" stroke-width="0.8"/>`;
    }
    s += `<text x="${f.left - 9}" y="${pos + 4}" text-anchor="end" font-size="${tickFont}">${fmtTick(v)}</text>`;
  });
  if (x) {
    const xTicks = x.ticks || Array.from({length: 5}, (_, i) => x.lo + (x.hi - x.lo) * i / 4);
    xTicks.forEach((a, i) => {
      const pos = x(a);
      s += `<path d="M${pos},${f.bottom}v4.5" stroke="${axis}" stroke-width="1"/>`;
      if (i > 0) {
        const mid = (pos + x(xTicks[i - 1])) / 2;
        s += `<path d="M${mid},${f.bottom}v2.5" stroke="${axis}" stroke-width="0.8"/>`;
      }
      s += `<text x="${pos}" y="${f.bottom + 21}" text-anchor="middle" font-size="${tickFont}">${fmtTick(a)}</text>`;
    });
  }
  return s;
}

export function legend(f, p, groups, colors, {style = 'bar'} = {}) {
  if (p.legend === '隐藏' || !groups.length) return '';
  const x = p.legend === '左上' ? f.left + 12 : f.right + 14;
  const y = p.legend === '左上' ? f.top + 10 : f.top;
  const rowH = 22;
  const maxLen = Math.max(...groups.map(g => String(g).length));
  const boxW = Math.min(140, Math.max(76, maxLen * 8 + 38));
  const boxH = groups.length * rowH + 10;
  let s = `<rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="5" fill="white" fill-opacity="0.94" stroke="#dce2ea" stroke-width="0.9"/>`;
  s += groups.map((g, i) => {
    const c = esc(colors[i % colors.length]);
    const py = y + 16 + i * rowH;
    const glyph = style === 'line'
      ? `<line x1="${x + 8}" y1="${py}" x2="${x + 24}" y2="${py}" stroke="${c}" stroke-width="2" stroke-linecap="round"/><circle cx="${x + 16}" cy="${py}" r="3.3" fill="${c}" stroke="white" stroke-width="1.2"/>`
      : `<rect x="${x + 9}" y="${py - 5}" width="10" height="10" rx="2.5" fill="${c}"/>`;
    const tx = style === 'line' ? x + 30 : x + 25;
    return glyph + `<text x="${tx}" y="${py + 4}" font-size="11.5">${esc(g)}</text>`;
  }).join('');
  return s;
}
