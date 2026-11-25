// Interactive SVG diagnostics for Materia's Materials ML Engine (ml/engine.py).
// Renders:
// 1. 3-tier Confidence Badge + Half-L1 Applicability Domain progress bar
// 2. Outer-fold Actual vs. Predicted scatter (auto log-log for multiplicative models)
// 3. Applicability Domain Half-L1 distance vs. Absolute Error diagnostic scatter

const SVG_NS = 'http://www.w3.org/2000/svg';
const FOLD_COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777'];

function svgEl(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function fmtNum(v) {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1000 || (abs > 0 && abs < 0.01)) return v.toExponential(2);
  return Number(v.toPrecision(4)).toString();
}

export function assessPredictionConfidence({
  r2 = null,
  usable = true,
  domainDistance = null,
  domainThreshold = null,
  warnings = [],
} = {}) {
  const ratio = Number.isFinite(domainDistance) && Number.isFinite(domainThreshold) && domainThreshold > 0
    ? domainDistance / domainThreshold
    : null;
  if (!usable || (ratio !== null && ratio > 1.25)) {
    return { tier: 'high-risk', label: '高风险外推', color: 'var(--danger, #c62828)', ratio };
  }
  if ((ratio !== null && ratio > 0.85) || (Number.isFinite(r2) && r2 < 0.5) || warnings.length > 0) {
    return { tier: 'caution', label: '谨慎参考', color: 'var(--warning, #b26a00)', ratio };
  }
  return { tier: 'reliable', label: '可靠内插', color: 'var(--teal, #0f766e)', ratio };
}

export function renderConfidenceCard(predictionResult = {}) {
  const assessment = assessPredictionConfidence(predictionResult);
  const card = document.createElement('div');
  card.className = 'ml-confidence-card';
  card.dataset.tier = assessment.tier;
  card.style.cssText = [
    'display:grid',
    'gap:8px',
    'padding:12px 14px',
    'border-radius:12px',
    'border:1px solid var(--glass-edge, var(--line))',
    'background:var(--glass-field, var(--panel))',
    'font-variant-numeric:tabular-nums',
  ].join(';');

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:.75rem';
  const badge = document.createElement('span');
  badge.textContent = assessment.label;
  badge.style.cssText = `padding:2px 9px;border-radius:999px;font-weight:600;color:#fff;background:${assessment.color}`;
  const meta = document.createElement('span');
  meta.style.color = 'var(--muted)';
  const { domainDistance, domainThreshold } = predictionResult;
  meta.textContent = Number.isFinite(domainDistance) && Number.isFinite(domainThreshold)
    ? `半 L1 距离 ${fmtNum(domainDistance)} / P95 阈值 ${fmtNum(domainThreshold)}`
    : '适用域距离未提供';
  header.append(badge, meta);
  card.append(header);

  if (assessment.ratio !== null) {
    const track = document.createElement('div');
    track.style.cssText = 'height:6px;border-radius:999px;background:color-mix(in srgb,var(--ink) 10%,transparent);overflow:hidden';
    const fill = document.createElement('div');
    const pct = Math.min(100, Math.round(assessment.ratio * 100));
    fill.style.cssText = `height:100%;width:${pct}%;border-radius:999px;background:${assessment.color};transition:width .25s ease`;
    track.append(fill);
    card.append(track);
  }

  return card;
}

export function renderResidualScatter(report = {}, { width = 360, height = 260, onSelectSource = null } = {}) {
  const points = (report.validationPoints || []).filter(
    p => Number.isFinite(p.actual) && Number.isFinite(p.predicted)
  );
  const useLog = report.targetScale === 'log' && points.every(p => p.actual > 0 && p.predicted > 0);
  const pad = { top: 20, right: 18, bottom: 38, left: 48 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'ml-diagnostic-svg',
    role: 'img',
    'aria-label': '实测值与预测值外层折散点图',
  });
  svg.style.cssText = 'width:100%;height:auto;display:block;font-family:var(--numeric,sans-serif)';

  if (!points.length) {
    svg.append(svgEl('text', {
      x: width / 2, y: height / 2, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 12,
    }, '暂无外层交叉验证样本'));
    return svg;
  }

  const mapVal = v => (useLog ? Math.log10(v) : v);
  const all = points.flatMap(p => [mapVal(p.actual), mapVal(p.predicted)]);
  let minV = Math.min(...all), maxV = Math.max(...all);
  if (maxV - minV < 1e-9) { minV -= 1; maxV += 1; }
  const margin = (maxV - minV) * 0.08;
  minV -= margin;
  maxV += margin;

  const sx = v => pad.left + ((mapVal(v) - minV) / (maxV - minV)) * plotW;
  const sy = v => pad.top + plotH - ((mapVal(v) - minV) / (maxV - minV)) * plotH;

  // Axes
  svg.append(svgEl('path', {
    d: `M ${pad.left} ${pad.top} V ${pad.top + plotH} H ${pad.left + plotW}`,
    fill: 'none', stroke: 'var(--line, #888)', 'stroke-width': 1.2,
  }));
  // y = x parity line
  svg.append(svgEl('line', {
    x1: pad.left, y1: pad.top + plotH, x2: pad.left + plotW, y2: pad.top,
    stroke: 'var(--muted, #888)', 'stroke-width': 1, 'stroke-dasharray': '4 4',
  }));

  // Points colored by outer fold
  for (const p of points) {
    const cx = sx(p.actual), cy = sy(p.predicted);
    const foldIdx = Number.isInteger(p.fold) ? Math.abs(p.fold) % FOLD_COLORS.length : 0;
    const dot = svgEl('circle', {
      cx: cx.toFixed(1),
      cy: cy.toFixed(1),
      r: 4,
      fill: FOLD_COLORS[foldIdx],
      'fill-opacity': 0.82,
      stroke: 'var(--surface, #fff)',
      'stroke-width': 1,
      style: onSelectSource && p.source ? 'cursor:pointer' : '',
    });
    const tip = [
      `Fold ${(p.fold ?? 0) + 1}`,
      `实测: ${fmtNum(p.actual)}`,
      `预测: ${fmtNum(p.predicted)}`,
      p.source ? `来源: ${p.source}` : '',
    ].filter(Boolean).join(' · ');
    dot.append(svgEl('title', {}, tip));
    if (onSelectSource && p.source) {
      dot.addEventListener('click', () => onSelectSource(p));
    }
    svg.append(dot);
  }

  svg.append(svgEl('text', {
    x: pad.left + plotW / 2, y: height - 8, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 11,
  }, useLog ? '实测值 (log10)' : '实测值'));
  svg.append(svgEl('text', {
    x: 13, y: pad.top + plotH / 2, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 11,
    transform: `rotate(-90 13 ${pad.top + plotH / 2})`,
  }, useLog ? '折外预测 (log10)' : '折外预测'));

  return svg;
}
