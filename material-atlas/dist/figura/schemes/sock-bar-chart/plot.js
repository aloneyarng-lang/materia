// Figura API v1 Scheme: Sock-Height Bar Chart ("袜筒柱状图")
// Pure self-contained SVG generator with 6 stylized leg silhouettes, exact y(value) clipPath mapping,
// curved stocking cuffs, preset/theme sock palettes, and optional value labels.

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// 6 distinct stylized leg silhouettes in normalized [0..100] x [0..260] space
// Top = 0 (thigh fade), Bottom = 260 (ankle resting on X-axis).
const LEG_POSES = [
  // Pose 1: gentle left-leaning knee curve (classic Day 1)
  {
    fill: 'M 22 0 C 20 38 30 76 36 106 C 39 124 27 148 25 170 C 23 196 31 232 33 260 L 58 260 C 57 232 61 198 68 172 C 74 148 80 124 81 102 C 83 70 84 34 80 0 Z',
    left: 'M 22 0 C 20 38 30 76 36 106 C 39 124 27 148 25 170 C 23 196 31 232 33 260',
    right: 'M 80 0 C 84 34 83 70 81 102 C 80 124 74 148 68 172 C 61 198 57 232 58 260',
    knee: 'M 47 110 C 49 116 48 122 46 126',
    cuffArc: 6,
  },
  // Pose 2: forward-bent knee, high-sock stance (Day 2)
  {
    fill: 'M 26 0 C 24 38 28 74 22 104 C 17 124 26 150 34 176 C 42 204 48 234 50 260 L 74 260 C 73 230 71 198 67 170 C 64 146 61 124 65 104 C 72 74 79 38 78 0 Z',
    left: 'M 26 0 C 24 38 28 74 22 104 C 17 124 26 150 34 176 C 42 204 48 234 50 260',
    right: 'M 78 0 C 79 38 72 74 65 104 C 61 124 64 146 67 170 C 71 198 73 230 74 260',
    knee: 'M 38 112 C 41 118 41 123 39 128',
    cuffArc: -5,
  },
  // Pose 3: straight upright over-knee silhouette (Day 3)
  {
    fill: 'M 24 0 C 24 42 30 78 33 108 C 35 128 31 154 31 180 C 31 206 32 234 30 260 L 55 260 C 57 234 65 204 69 176 C 72 150 70 126 73 106 C 78 76 83 40 80 0 Z',
    left: 'M 24 0 C 24 42 30 78 33 108 C 35 128 31 154 31 180 C 31 206 32 234 30 260',
    right: 'M 80 0 C 83 40 78 76 73 106 C 70 126 72 150 69 176 C 65 204 57 234 55 260',
    knee: 'M 50 108 C 52 115 51 121 49 125',
    cuffArc: -6,
  },
  // Pose 4: slender front-facing stance (Day 4)
  {
    fill: 'M 28 0 C 25 40 24 78 26 108 C 28 130 30 156 32 184 C 34 210 35 236 35 260 L 60 260 C 61 234 66 206 69 178 C 72 152 68 128 70 106 C 75 74 82 38 82 0 Z',
    left: 'M 28 0 C 25 40 24 78 26 108 C 28 130 30 156 32 184 C 34 210 35 236 35 260',
    right: 'M 82 0 C 82 38 75 74 70 106 C 68 128 72 152 69 178 C 66 206 61 234 60 260',
    knee: 'M 48 112 C 49 118 48 124 46 128',
    cuffArc: -5,
  },
  // Pose 5: slight right-leaning mid-calf curve (Day 5)
  {
    fill: 'M 34 0 C 31 38 30 76 31 106 C 32 128 24 156 23 182 C 22 208 29 234 32 260 L 56 260 C 56 234 62 204 68 176 C 74 150 72 126 75 104 C 81 74 87 38 86 0 Z',
    left: 'M 34 0 C 31 38 30 76 31 106 C 32 128 24 156 23 182 C 22 208 29 234 32 260',
    right: 'M 86 0 C 87 38 81 74 75 104 C 72 126 74 150 68 176 C 62 204 56 234 56 260',
    knee: 'M 54 108 C 56 115 55 122 53 126',
    cuffArc: -4,
  },
  // Pose 6: subtle inward-tapered ankle stance (Day 6)
  {
    fill: 'M 22 0 C 23 40 28 76 34 108 C 37 128 28 156 29 184 C 31 210 37 236 38 260 L 62 260 C 64 234 71 206 72 178 C 74 152 69 128 71 106 C 75 74 79 38 77 0 Z',
    left: 'M 22 0 C 23 40 28 76 34 108 C 37 128 28 156 29 184 C 31 210 37 236 38 260',
    right: 'M 77 0 C 79 38 75 74 71 106 C 69 128 74 152 72 178 C 71 206 64 234 62 260',
    knee: 'M 50 110 C 51 116 50 122 48 126',
    cuffArc: -5,
  },
];

function niceTicks(maxVal) {
  if (maxVal <= 12 && Number.isInteger(maxVal) && maxVal >= 4) {
    return Array.from({ length: maxVal }, (_, i) => i + 1);
  }
  const roughStep = maxVal / 6;
  const pow = Math.pow(10, Math.floor(Math.log10(roughStep || 1)));
  const norm = roughStep / pow;
  const step = (norm <= 1.5 ? 1 : norm <= 3 ? 2 : norm <= 7 ? 5 : 10) * pow;
  const ticks = [];
  for (let v = step; v <= maxVal + step * 0.001; v += step) {
    ticks.push(Number(v.toPrecision(6)));
  }
  return ticks;
}

function resolveSockColor(preset, customColor, theme, index) {
  switch (preset) {
    case '深邃纯黑': return '#262426';
    case '日系白丝': return '#f4f6fa';
    case '主题配色': {
      const series = Array.isArray(theme?.series) && theme.series.length ? theme.series : ['#326b95', '#d97757', '#2f855a', '#7c5cbf'];
      return series[index % series.length];
    }
    case '自定义颜色': return customColor || '#56514d';
    case '经典炭黑':
    default: return '#56514d';
  }
}

export function render({ data = [], params = {}, theme = {} } = {}) {
  const rows = (Array.isArray(data) ? data : [])
    .map(r => ({ label: String(r.label ?? '').trim(), value: Number(r.value) }))
    .filter(r => r.label !== '' && Number.isFinite(r.value) && r.value >= 0);

  if (!rows.length) {
    throw Error('请提供至少一行包含类目与非负数值的数据。');
  }
  if (rows.length > 16) {
    throw Error('条目过多（建议不超过 16 项），否则腿部剪影会过于拥挤。');
  }

  const W = Math.max(420, Number(params.width) || 820);
  const H = Math.max(360, Number(params.height) || 560);
  const font = esc(params.font || 'Microsoft YaHei');
  const fontSize = Math.max(10, Number(params.fontSize) || 15);
  const ink = esc(theme?.ink || '#24201e');
  const axisColor = esc(theme?.axis || '#2b2623');
  const skinTone = esc(params.skinTone || '#fdf0e6');
  const preset = params.sockPreset || '经典炭黑';
  const sockPreset = preset === '经典炭黑' && theme?.series?.length ? '主题配色' : preset;
  const showValues = params.showValues !== '隐藏';
  const handDrawn = params.axisStyle !== '简洁出版';

  const maxData = Math.max(...rows.map(r => r.value), 1);
  const configuredMax = Number(params.yMax) || 0;
  const yMax = configuredMax > 0 ? Math.max(configuredMax, maxData * 1.05) : Math.ceil(maxData * 1.15);

  const margin = {
    top: 44,
    right: 64,
    bottom: 66,
    left: 74,
  };
  const plotW = W - margin.left - margin.right;
  const plotH = H - margin.top - margin.bottom;
  const baselineY = margin.top + plotH;

  // Map data value -> SVG Y coordinate
  const yOf = val => baselineY - (Math.max(0, Math.min(val, yMax)) / yMax) * plotH;

  const slotW = plotW / rows.length;
  const legW = Math.min(slotW * 0.86, plotH * 0.36);
  const legScaleX = legW / 100;
  const legTopY = yOf(yMax * 0.91);
  const legH = baselineY - legTopY;
  const legScaleY = legH / 260;

  const defs = [
    `<linearGradient id="thigh-fade" x1="0" y1="0" x2="0" y2="1">`,
    `  <stop offset="0" stop-color="#fcfbf9" stop-opacity="1"/>`,
    `  <stop offset="0.11" stop-color="#fcfbf9" stop-opacity="0"/>`,
    `</linearGradient>`,
  ];

  const bars = [];
  rows.forEach((row, i) => {
    const pose = LEG_POSES[i % LEG_POSES.length];
    const centerX = margin.left + (i + 0.5) * slotW;
    const tx = centerX - legW / 2;
    const clipId = `sock-leg-clip-${i}`;
    const sockColor = esc(resolveSockColor(sockPreset, params.color, theme, i));
    const sockTopY = yOf(row.value);
    const localSockY = (sockTopY - legTopY) / legScaleY;
    const cuffY = Math.max(-10, Math.min(258, localSockY));
    const cuffArc = pose.cuffArc;

    defs.push(
      `<clipPath id="${clipId}"><path d="${pose.fill}"/></clipPath>`
    );

    const sockPath = `M -6 ${cuffY.toFixed(1)} Q 50 ${(cuffY + cuffArc).toFixed(1)} 106 ${cuffY.toFixed(1)} L 106 270 L -6 270 Z`;
    const cuffLine = `M -4 ${cuffY.toFixed(1)} Q 50 ${(cuffY + cuffArc).toFixed(1)} 104 ${cuffY.toFixed(1)}`;
    const isWhiteSock = sockPreset === '日系白丝';

    const valueTag = showValues
      ? `<text x="${centerX.toFixed(1)}" y="${(sockTopY - 8).toFixed(1)}" text-anchor="middle" font-size="${Math.max(10, fontSize - 3)}" font-weight="600" fill="${ink}" opacity="0.72">${esc(Number(row.value.toPrecision(4)))}</text>`
      : '';

    bars.push(`
      <g class="sock-bar" data-index="${i}">
        <g transform="translate(${tx.toFixed(1)} ${legTopY.toFixed(1)}) scale(${legScaleX.toFixed(4)} ${legScaleY.toFixed(4)})">
          <path d="${pose.fill}" fill="${skinTone}" stroke="none"/>
          <g clip-path="url(#${clipId})">
            <path d="${sockPath}" fill="${sockColor}" stroke="none"/>
            <path d="${cuffLine}" fill="none" stroke="${isWhiteSock ? '#9ba3b0' : axisColor}" stroke-width="${(2.1 / legScaleX).toFixed(2)}" stroke-opacity="0.72"/>
            <rect x="0" y="0" width="100" height="260" fill="url(#thigh-fade)"/>
          </g>
          <path d="${pose.left}" fill="none" stroke="${axisColor}" stroke-width="${(1.8 / legScaleX).toFixed(2)}" stroke-linecap="round"/>
          <path d="${pose.right}" fill="none" stroke="${axisColor}" stroke-width="${(1.8 / legScaleX).toFixed(2)}" stroke-linecap="round"/>
          ${cuffY > 130 ? `<path d="${pose.knee}" fill="none" stroke="${axisColor}" stroke-width="${(1.3 / legScaleX).toFixed(2)}" stroke-linecap="round" stroke-opacity="0.55"/>` : ''}
        </g>
        ${valueTag}
        <text x="${centerX.toFixed(1)}" y="${(baselineY + fontSize + 14).toFixed(1)}" text-anchor="middle" font-size="${fontSize}" fill="${ink}">${esc(row.label)}</text>
      </g>
    `);
  });

  // Y ticks
  const ticks = niceTicks(yMax);
  const tickSvg = ticks.map(v => {
    const y = yOf(v);
    if (y < margin.top + 4) return '';
    return `
      <line x1="${(margin.left - 5).toFixed(1)}" y1="${y.toFixed(1)}" x2="${(margin.left + 4).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${axisColor}" stroke-width="1.4" stroke-linecap="round"/>
      <text x="${(margin.left - 12).toFixed(1)}" y="${(y + fontSize * 0.34).toFixed(1)}" text-anchor="end" font-size="${Math.max(11, fontSize - 2)}" fill="${ink}">${esc(v)}</text>
    `;
  }).join('');

  // Axes with optional hand-drawn arrow tips
  const arrowY = handDrawn
    ? `<path d="M ${(margin.left - 6).toFixed(1)} ${(margin.top + 2).toFixed(1)} L ${margin.left.toFixed(1)} ${(margin.top - 8).toFixed(1)} L ${(margin.left + 6).toFixed(1)} ${(margin.top + 2).toFixed(1)}" fill="none" stroke="${axisColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
    : '';
  const arrowX = handDrawn
    ? `<path d="M ${(W - margin.right + 6).toFixed(1)} ${(baselineY - 5).toFixed(1)} L ${(W - margin.right + 16).toFixed(1)} ${baselineY.toFixed(1)} L ${(W - margin.right + 6).toFixed(1)} ${(baselineY + 5).toFixed(1)}" fill="none" stroke="${axisColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
    : '';

  const xUnitSvg = params.xLabel
    ? `<text x="${(W - margin.right + 14).toFixed(1)}" y="${(baselineY + fontSize + 14).toFixed(1)}" text-anchor="end" font-size="${fontSize}" fill="${ink}">${handDrawn ? '··· ' : ''}${esc(params.xLabel)}</text>`
    : '';

  const yTitleSvg = params.yLabel
    ? `<text x="20" y="${(margin.top + plotH / 2).toFixed(1)}" text-anchor="middle" font-size="${fontSize}" fill="${ink}" transform="rotate(-90 20 ${(margin.top + plotH / 2).toFixed(1)})">${esc(params.yLabel)}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${font},'PingFang SC',sans-serif">
  <defs>${defs.join('\n')}</defs>
  <rect x="0" y="0" width="${W}" height="${H}" fill="#fcfbf9"/>
  ${yTitleSvg}
  <g class="axes">
    <line x1="${margin.left.toFixed(1)}" y1="${(baselineY + 18).toFixed(1)}" x2="${margin.left.toFixed(1)}" y2="${(margin.top - 7).toFixed(1)}" stroke="${axisColor}" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="${(margin.left - 22).toFixed(1)}" y1="${baselineY.toFixed(1)}" x2="${(W - margin.right + 15).toFixed(1)}" y2="${baselineY.toFixed(1)}" stroke="${axisColor}" stroke-width="1.8" stroke-linecap="round"/>
    ${arrowY}
    ${arrowX}
    ${tickSvg}
    ${xUnitSvg}
  </g>
  <g class="sock-bars">
    ${bars.join('\n')}
  </g>
</svg>`;
}
