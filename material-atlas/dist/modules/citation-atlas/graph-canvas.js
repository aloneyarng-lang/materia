import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from '../../vendor/d3-force.mjs';
import { shortAuthorLabel } from './model.js';
import {
  DEFAULT_CITATION_THEME,
  normalizeCitationTheme,
  classifyCitationTiers,
  formatCompactCitations,
  highCitedExtraRadius,
} from './themes.js';
import {
  baroqueColors,
  drawBaroqueBackdrop,
  drawBaroqueTimelineBar,
  drawBaroqueEdges,
  drawBaroqueNodes,
  drawBaroqueLabels,
} from './baroque-renderer.js';

function readThemePalette() {
  const style = getComputedStyle(document.documentElement);
  const read = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  const dark = document.documentElement.dataset.themeMode === 'dark';
  return {
    dark,
    paper: read('--paper', dark ? '#11161b' : '#f6f5f0'),
    surface: read('--surface', dark ? '#182026' : '#ffffff'),
    panel: read('--panel', dark ? '#1f2933' : '#ecebe5'),
    ink: read('--ink', dark ? '#e7eef4' : '#1f2426'),
    muted: read('--muted', dark ? '#91a0ad' : '#6b7572'),
    line: read('--line', dark ? '#2a3641' : '#dcdad2'),
    teal: read('--teal', dark ? '#52bfb4' : '#26615c'),
    warning: read('--warning', dark ? '#e88b52' : '#d97757'),
    sans: read('--sans', '"Materia Inter", "Materia Source Han Sans", sans-serif'),
    serif: read('--serif', 'Georgia, "Times New Roman", serif'),
    mono: read('--mono', '"Materia SF Mono", ui-monospace, Consolas, monospace'),
  };
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function tracePolygon(ctx, cx, cy, r, sides, rotation = 0) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = rotation + (i * Math.PI * 2) / sides;
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function traceStar(ctx, cx, cy, outerR, innerR, points, rotation = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? outerR : innerR;
    const angle = rotation + (i * Math.PI) / points;
    const px = cx + Math.cos(angle) * rad;
    const py = cy + Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function traceRoundedSquare(ctx, cx, cy, half, cornerRadius) {
  drawRoundedRect(ctx, cx - half, cy - half, half * 2, half * 2, cornerRadius);
}

function drawArrowhead(ctx, endX, endY, ux, uy, baseColor, isLit, style = 'dart') {
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  if (style === 'open') {
    const arm = isLit ? 8.5 : 6.5;
    const spread = isLit ? 4.2 : 3.2;
    ctx.strokeStyle = baseColor;
    ctx.lineWidth = isLit ? 2 : 1.35;
    ctx.beginPath();
    ctx.moveTo(endX - ux * arm - uy * spread, endY - uy * arm + ux * spread);
    ctx.lineTo(endX, endY);
    ctx.lineTo(endX - ux * arm + uy * spread, endY - uy * arm - ux * spread);
    ctx.stroke();
    return;
  }
  if (style === 'triangle') {
    const arrowLen = isLit ? 8.5 : 6.2;
    const arrowHalf = isLit ? 3.8 : 2.8;
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - ux * arrowLen - uy * arrowHalf, endY - uy * arrowLen + ux * arrowHalf);
    ctx.lineTo(endX - ux * arrowLen + uy * arrowHalf, endY - uy * arrowLen - ux * arrowHalf);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (style === 'slender') {
    const arrowLen = isLit ? 10 : 7.5;
    const arrowHalf = isLit ? 3.1 : 2.3;
    const notch = arrowLen * 0.25;
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - ux * arrowLen - uy * arrowHalf, endY - uy * arrowLen + ux * arrowHalf);
    ctx.lineTo(endX - ux * (arrowLen - notch), endY - uy * (arrowLen - notch));
    ctx.lineTo(endX - ux * arrowLen + uy * arrowHalf, endY - uy * arrowLen - ux * arrowHalf);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (style === 'spear') {
    const arrowLen = isLit ? 10.5 : 7.8;
    const arrowHalf = isLit ? 3.5 : 2.6;
    const tailLen = arrowLen * 0.62;
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - ux * tailLen - uy * arrowHalf, endY - uy * tailLen + ux * arrowHalf);
    ctx.lineTo(endX - ux * arrowLen, endY - uy * arrowLen);
    ctx.lineTo(endX - ux * tailLen + uy * arrowHalf, endY - uy * tailLen - ux * arrowHalf);
    ctx.closePath();
    ctx.fill();
    return;
  }
  // 'dart' (classic default)
  const arrowLen = isLit ? 8.5 : 6;
  const arrowHalf = isLit ? 3.8 : 2.6;
  const notch = arrowLen * 0.32;
  ctx.fillStyle = baseColor;
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - ux * arrowLen - uy * arrowHalf, endY - uy * arrowLen + ux * arrowHalf);
  ctx.lineTo(endX - ux * (arrowLen - notch), endY - uy * (arrowLen - notch));
  ctx.lineTo(endX - ux * arrowLen + uy * arrowHalf, endY - uy * arrowLen - ux * arrowHalf);
  ctx.closePath();
  ctx.fill();
}

function drawCitationPill(ctx, x, y, text, accentColor, pal, glowing) {
  if (!text) return;
  ctx.save();
  ctx.font = `600 9px ${pal.mono || pal.sans}`;
  const textW = ctx.measureText(text).width;
  const padX = 4.5;
  const pillW = Math.ceil(textW + padX * 2);
  const pillH = 14;
  const left = x - pillW / 2;
  const top = y - pillH / 2;
  if (glowing) {
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 0;
  } else {
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }
  drawRoundedRect(ctx, left, top, pillW, pillH, 7);
  ctx.fillStyle = pal.dark ? 'rgba(17, 22, 27, 0.94)' : 'rgba(255, 255, 255, 0.96)';
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = accentColor;
  ctx.stroke();
  ctx.fillStyle = accentColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
  ctx.restore();
}

function drawStandardBackdrop(ctx, targetWidth, targetHeight, targetTransform, pal, themeId) {
  if (themeId === 'editorial') {
    ctx.save();
    const sheen = ctx.createRadialGradient(
      targetWidth * 0.5, targetHeight * 0.45, 24,
      targetWidth * 0.5, targetHeight * 0.45, Math.max(targetWidth, targetHeight) * 0.72,
    );
    sheen.addColorStop(0, pal.dark ? 'rgba(255, 255, 255, 0.025)' : 'rgba(0, 0, 0, 0.012)');
    sheen.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.restore();
    return;
  }

  if (themeId === 'crystal') {
    const minor = 24;
    const major = 120;
    const ox = ((targetTransform.x % minor) + minor) % minor;
    const oy = ((targetTransform.y % minor) + minor) % minor;
    const mx = ((targetTransform.x % major) + major) % major;
    const my = ((targetTransform.y % major) + major) % major;
    ctx.save();
    ctx.strokeStyle = pal.line;
    ctx.globalAlpha = pal.dark ? 0.28 : 0.38;
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    for (let x = ox; x < targetWidth; x += minor) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, targetHeight);
    }
    for (let y = oy; y < targetHeight; y += minor) {
      ctx.moveTo(0, y);
      ctx.lineTo(targetWidth, y);
    }
    ctx.stroke();

    ctx.strokeStyle = pal.teal;
    ctx.globalAlpha = pal.dark ? 0.14 : 0.12;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = mx; x < targetWidth; x += major) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, targetHeight);
    }
    for (let y = my; y < targetHeight; y += major) {
      ctx.moveTo(0, y);
      ctx.lineTo(targetWidth, y);
    }
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (themeId === 'constellation') {
    const step = 36;
    const ox = ((targetTransform.x % step) + step) % step;
    const oy = ((targetTransform.y % step) + step) % step;
    const baseIx = Math.floor((ox - targetTransform.x) / step);
    const baseIy = Math.floor((oy - targetTransform.y) / step);
    ctx.save();
    const nebula = ctx.createRadialGradient(
      targetWidth * 0.48, targetHeight * 0.48, 20,
      targetWidth * 0.48, targetHeight * 0.48, Math.max(targetWidth, targetHeight) * 0.68,
    );
    nebula.addColorStop(0, pal.dark ? 'rgba(82, 191, 180, 0.08)' : 'rgba(38, 97, 92, 0.05)');
    nebula.addColorStop(0.55, pal.dark ? 'rgba(232, 139, 82, 0.035)' : 'rgba(217, 119, 87, 0.025)');
    nebula.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, targetWidth, targetHeight);

    for (let ix = 0, gx = ox; gx < targetWidth; ix++, gx += step) {
      for (let iy = 0, gy = oy; gy < targetHeight; iy++, gy += step) {
        const hash = Math.abs(((baseIx + ix) * 7 + (baseIy + iy) * 13) % 11);
        if (hash === 0) {
          ctx.strokeStyle = pal.dark ? 'rgba(231, 238, 244, 0.22)' : 'rgba(31, 36, 38, 0.16)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(gx - 3, gy);
          ctx.lineTo(gx + 3, gy);
          ctx.moveTo(gx, gy - 3);
          ctx.lineTo(gx, gy + 3);
          ctx.stroke();
        } else if (hash % 3 === 0) {
          ctx.fillStyle = pal.dark ? 'rgba(231, 238, 244, 0.12)' : 'rgba(31, 36, 38, 0.10)';
          ctx.fillRect(gx - 0.6, gy - 0.6, 1.3, 1.3);
        }
      }
    }
    ctx.restore();
    return;
  }

  if (themeId === 'circuit') {
    const step = 30;
    const ox = ((targetTransform.x % step) + step) % step;
    const oy = ((targetTransform.y % step) + step) % step;
    ctx.save();
    const glowA = ctx.createRadialGradient(
      targetWidth * 0.2, targetHeight * 0.25, 16,
      targetWidth * 0.2, targetHeight * 0.25, Math.max(targetWidth, targetHeight) * 0.55,
    );
    glowA.addColorStop(0, pal.dark ? 'rgba(82, 191, 180, 0.09)' : 'rgba(38, 97, 92, 0.045)');
    glowA.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glowA;
    ctx.fillRect(0, 0, targetWidth, targetHeight);

    const glowB = ctx.createRadialGradient(
      targetWidth * 0.82, targetHeight * 0.78, 16,
      targetWidth * 0.82, targetHeight * 0.78, Math.max(targetWidth, targetHeight) * 0.5,
    );
    glowB.addColorStop(0, pal.dark ? 'rgba(232, 139, 82, 0.07)' : 'rgba(217, 119, 87, 0.035)');
    glowB.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glowB;
    ctx.fillRect(0, 0, targetWidth, targetHeight);

    ctx.strokeStyle = pal.line;
    ctx.globalAlpha = pal.dark ? 0.22 : 0.28;
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    for (let x = ox; x < targetWidth; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, targetHeight);
    }
    for (let y = oy; y < targetHeight; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(targetWidth, y);
    }
    ctx.stroke();
    ctx.restore();
    return;
  }

  // 'classic': Subtle drafting dot-matrix backdrop & radial warmth (Heron AI / Floema mood)
  const dotStep = 28;
  const offsetX = ((targetTransform.x % dotStep) + dotStep) % dotStep;
  const offsetY = ((targetTransform.y % dotStep) + dotStep) % dotStep;
  ctx.save();
  const bgGlow = ctx.createRadialGradient(
    targetWidth * 0.5, targetHeight * 0.48, 20,
    targetWidth * 0.5, targetHeight * 0.48, Math.max(targetWidth, targetHeight) * 0.65,
  );
  bgGlow.addColorStop(0, pal.dark ? 'rgba(82, 191, 180, 0.045)' : 'rgba(217, 119, 87, 0.035)');
  bgGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = bgGlow;
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.fillStyle = pal.dark ? 'rgba(231, 238, 244, 0.10)' : 'rgba(31, 36, 38, 0.11)';
  for (let gx = offsetX; gx < targetWidth; gx += dotStep) {
    for (let gy = offsetY; gy < targetHeight; gy += dotStep) {
      ctx.fillRect(gx - 0.5, gy - 0.5, 1.2, 1.2);
    }
  }
  ctx.restore();
}

function nodeRadius(node) {
  if (node.role === 'seed') return 15;
  const co = Math.max(1, node.coCiteCount || 1);
  const citeBoost = Math.log10(1 + Math.max(0, node.citationCount || 0)) * 1.4;
  return Math.min(24, 9 + (co - 1) * 3.4 + citeBoost);
}

function timelineWidth(nodes, years, horizontal) {
  const span = Math.max(1, years[1] - years[0]);
  if (!horizontal) return Math.max(680, span * 42);
  const counts = new Map();
  for (const {year} of nodes) {
    counts.set(year, (counts.get(year) || 0) + 1);
  }
  const largest = Math.max(1, ...counts.values());
  const lanes = Math.ceil(largest / Math.ceil(Math.sqrt(largest / 2)));
  return Math.max(1000, span * (144 + (lanes - 1) * 90));
}

function computeTimelinePositions(nodes, years, horizontal = false) {
  const [minYear, maxYear] = years;
  const span = Math.max(1, maxYear - minYear);
  const width = timelineWidth(nodes, years, horizontal);
  const buckets = new Map();
  for (const node of nodes) {
    const key = Number.isInteger(node.year) ? node.year : 'unknown';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(node);
  }
  const positions = new Map();
  for (const [key, list] of buckets.entries()) {
    list.sort((a, b) =>
      (Number(b.role === 'seed') - Number(a.role === 'seed'))
      || ((b.coCiteCount || 0) - (a.coCiteCount || 0))
      || ((b.citationCount ?? -1) - (a.citationCount ?? -1)));
    const x = key === 'unknown'
      ? width / 2 + (horizontal ? width / span : 120)
      : ((key - minYear) / span - 0.5) * width;
    const stepY = horizontal ? 54 : 66;
    const startY = -((list.length - 1) * stepY) / 2;
    list.forEach((node, index) => {
      positions.set(node.id, { x, y: startY + index * stepY });
    });
  }
  return positions;
}

// Layer the visible citation graph using an adaptive-density timeline (when years are available)
// or topological Sugiyama ranks, pure real-node 2-opt crossing minimization, and clean single-arc flows.
export function citationArrangement(nodes, edges, horizontal = 1, vertical = 1, options = {}) {
  if (!nodes.length) return { positions: new Map(), routes: new Map(), axisTicks: [] };

  const years = options.years;
  const useTimeline = Array.isArray(years) && years[1] > years[0];

  const vertices = new Map(
    nodes.map(node => [
      node.id,
      { id: node.id, node, rank: 0, incoming: [], outgoing: [], x: 0, y: 0, order: 0 },
    ]),
  );

  const layers = [];
  const layerX = [];
  let axisTicks = [];
  function insert(vertex) {
    (layers[vertex.rank] ??= []).push(vertex);
  }

  if (useTimeline) {
    const bucketCounts = new Map();
    const bucketHasSeed = new Map();
    for (const n of nodes) {
      const key = Number.isInteger(n.year) ? n.year : 'unknown';
      bucketCounts.set(key, (bucketCounts.get(key) || 0) + 1);
      if (n.role === 'seed') bucketHasSeed.set(key, true);
    }
    const distinctYears = [...bucketCounts.keys()].sort((a, b) => {
      if (a === 'unknown') return 1;
      if (b === 'unknown') return -1;
      return a - b;
    });
    const yearToRank = new Map(distinctYears.map((y, idx) => [y, idx]));

    // Adaptive-density X spacing: compress sparse decades, breathe around dense recent years
    let cursorX = 0;
    distinctYears.forEach((y, idx) => {
      if (idx > 0) {
        const prev = distinctYears[idx - 1];
        if (y === 'unknown' || prev === 'unknown') {
          cursorX += 140;
        } else {
          const yearDelta = Math.max(1, y - prev);
          const prevCount = bucketCounts.get(prev) || 1;
          const currCount = bucketCounts.get(y) || 1;
          const gap = 108
            + Math.min(72, Math.log2(yearDelta) * 22)
            + Math.min(56, Math.sqrt(Math.max(prevCount, currCount)) * 14);
          cursorX += gap;
        }
      }
      layerX[idx] = cursorX;
    });

    for (const vertex of vertices.values()) {
      const key = Number.isInteger(vertex.node?.year) ? vertex.node.year : 'unknown';
      vertex.rank = yearToRank.get(key) ?? 0;
      insert(vertex);
    }

    axisTicks = distinctYears.map((y, idx) => ({
      label: y === 'unknown' ? '未知' : String(y),
      x: layerX[idx],
      count: bucketCounts.get(y) || 0,
      hasSeed: bucketHasSeed.get(y) === true,
    }));
  } else {
    const adjacency = new Map(nodes.map(node => [node.id, []]));
    for (const edge of edges) {
      if (vertices.has(edge.source) && vertices.has(edge.target) && edge.source !== edge.target) {
        adjacency.get(edge.source).push(edge.target);
      }
    }

    const visiting = new Set();
    const finished = new Set();
    const order = [];
    function visit(id) {
      visiting.add(id);
      for (const next of adjacency.get(id)) {
        if (!visiting.has(next) && !finished.has(next)) visit(next);
      }
      visiting.delete(id);
      finished.add(id);
      order.push(id);
    }
    for (const node of nodes) {
      if (!finished.has(node.id)) visit(node.id);
    }
    order.reverse();

    const topoIndex = new Map(order.map((id, i) => [id, i]));
    for (const id of order) {
      const source = vertices.get(id);
      for (const next of adjacency.get(id)) {
        if (topoIndex.get(next) > topoIndex.get(id)) {
          const target = vertices.get(next);
          target.rank = Math.max(target.rank, source.rank + 1);
        }
      }
    }
    for (const vertex of vertices.values()) insert(vertex);
  }

  // Direct real-node adjacency (no intermediate dummy guide nodes, eliminating wavy splines)
  const routes = new Map();
  for (const edge of edges) {
    const source = vertices.get(edge.source);
    const target = vertices.get(edge.target);
    if (!source || !target || source === target) continue;
    const [left, right] = source.rank <= target.rank ? [source, target] : [target, source];
    left.outgoing.push(right);
    right.incoming.push(left);
  }

  // Stable initial ordering within each layer: seeds first, then higher co-citation / citation count
  for (const layer of layers) {
    layer.sort((a, b) => {
      const aSeed = a.node?.role === 'seed' ? 0 : 1;
      const bSeed = b.node?.role === 'seed' ? 0 : 1;
      if (aSeed !== bSeed) return aSeed - bSeed;
      const aScore = (a.node?.coCiteCount || 0) * 10000 + (a.node?.citationCount || 0);
      const bScore = (b.node?.coCiteCount || 0) * 10000 + (b.node?.citationCount || 0);
      if (aScore !== bScore) return bScore - aScore;
      return String(a.id).localeCompare(String(b.id));
    });
    layer.forEach((v, idx) => { v.order = idx; });
  }

  function layerStepY(layer) {
    return Math.max(42, Math.min(64, 68 - layer.length * 1.2));
  }

  function packLayer(layer) {
    const stepY = layerStepY(layer);
    const total = Math.max(0, layer.length - 1) * stepY;
    for (let i = 0; i < layer.length; i++) {
      layer[i].y = i * stepY - total / 2;
    }
  }
  for (const layer of layers) packLayer(layer);

  function pairCrossings(u, v, direction) {
    const uAdj = direction === 'in' ? u.incoming : u.outgoing;
    const vAdj = direction === 'in' ? v.incoming : v.outgoing;
    let c = 0;
    for (const a of uAdj) {
      for (const b of vAdj) {
        if (a.order > b.order) c++;
      }
    }
    return c;
  }

  // 16 alternating barycenter + exact adjacent-swap (2-opt) sweeps
  for (let pass = 0; pass < 16; pass++) {
    const forward = pass % 2 === 0;
    for (const layer of forward ? layers : [...layers].reverse()) {
      for (const vertex of layer) {
        const adjacent = forward ? vertex.incoming : vertex.outgoing;
        if (adjacent.length) {
          const sorted = adjacent.map(o => o.y).sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
          const mean = adjacent.reduce((sum, other) => sum + other.y, 0) / adjacent.length;
          vertex.score = median * 0.65 + mean * 0.35;
        } else {
          vertex.score = vertex.y;
        }
      }
      layer.sort((a, b) => (a.score - b.score) || (a.order - b.order));
      layer.forEach((v, idx) => { v.order = idx; });

      let improved = true;
      let guard = 0;
      while (improved && guard++ < 8) {
        improved = false;
        for (let i = 0; i < layer.length - 1; i++) {
          const u = layer[i];
          const v = layer[i + 1];
          const cur = pairCrossings(u, v, 'in') + pairCrossings(u, v, 'out');
          const swapped = pairCrossings(v, u, 'in') + pairCrossings(v, u, 'out');
          if (swapped < cur) {
            layer[i] = v;
            layer[i + 1] = u;
            v.order = i;
            u.order = i + 1;
            improved = true;
          }
        }
      }
      packLayer(layer);
    }
  }

  // 5-pass median Y alignment while enforcing compact per-layer spacing
  for (let pass = 0; pass < 5; pass++) {
    const forward = pass % 2 === 0;
    for (const layer of forward ? layers : [...layers].reverse()) {
      const minGap = layerStepY(layer);
      for (const vertex of layer) {
        const adjacent = forward ? vertex.incoming : vertex.outgoing;
        if (adjacent.length) {
          const ys = adjacent.map(o => o.y).sort((a, b) => a - b);
          const mid = Math.floor(ys.length / 2);
          const targetY = ys.length % 2 ? ys[mid] : (ys[mid - 1] + ys[mid]) / 2;
          vertex.y = vertex.y * 0.25 + targetY * 0.75;
        }
      }
      for (let i = 1; i < layer.length; i++) {
        const prev = layer[i - 1];
        const curr = layer[i];
        if (curr.y < prev.y + minGap) curr.y = prev.y + minGap;
      }
      if (layer.length) {
        const midY = (layer[0].y + layer[layer.length - 1].y) / 2;
        for (const vertex of layer) vertex.y -= midY * 0.15;
      }
    }
  }

  // Assign X, center around (0, 0), and apply horizontal/vertical stretch
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const layer of layers) {
    for (const vertex of layer) {
      vertex.x = useTimeline ? (layerX[vertex.rank] ?? 0) : vertex.rank * 210;
      if (vertex.x < minX) minX = vertex.x;
      if (vertex.x > maxX) maxX = vertex.x;
      if (vertex.y < minY) minY = vertex.y;
      if (vertex.y > maxY) maxY = vertex.y;
    }
  }
  const cx = Number.isFinite(minX) ? (minX + maxX) / 2 : 0;
  const cy = Number.isFinite(minY) ? (minY + maxY) / 2 : 0;
  for (const layer of layers) {
    for (const vertex of layer) {
      vertex.x = (vertex.x - cx) * horizontal;
      vertex.y = (vertex.y - cy) * vertical;
    }
  }
  if (useTimeline) {
    axisTicks = axisTicks.map(tick => ({ ...tick, x: (tick.x - cx) * horizontal }));
  }

  return {
    positions: new Map([...vertices].map(([id, v]) => [id, { x: v.x, y: v.y }])),
    routes,
    axisTicks,
  };
}

function runForceLayout(nodes, edges, savedPositions) {
  const simNodes = nodes.map((node, index) => {
    const prev = savedPositions.get(node.id);
    if (prev) return { id: node.id, node, x: prev.x, y: prev.y };
    if (node.role === 'seed') {
      const seeds = nodes.filter(n => n.role === 'seed');
      const sIndex = seeds.indexOf(node);
      const angle = (sIndex / Math.max(1, seeds.length)) * Math.PI * 2 - Math.PI / 2;
      const radius = seeds.length === 1 ? 0 : Math.min(260, 120 + seeds.length * 18);
      return { id: node.id, node, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    }
    const golden = index * 2.39996;
    const r = 130 + 26 * Math.sqrt(index);
    return { id: node.id, node, x: Math.cos(golden) * r, y: Math.sin(golden) * r };
  });

  const simById = new Map(simNodes.map(item => [item.id, item]));
  const simEdges = edges
    .filter(edge => simById.has(edge.source) && simById.has(edge.target))
    .map(edge => ({ source: edge.source, target: edge.target, kind: edge.kind }));

  const sim = forceSimulation(simNodes)
    .stop()
    .force('link', forceLink(simEdges).id(d => d.id)
      .distance(d => (d.kind === 'seed_ref' ? 145 : 110))
      .strength(d => (d.kind === 'seed_ref' ? 0.42 : 0.16)))
    .force('charge', forceManyBody().strength(d => (d.node.role === 'seed' ? -420 : -210)))
    .force('collide', forceCollide().radius(d => nodeRadius(d.node) + 26).iterations(3))
    .force('x', forceX(0).strength(0.05))
    .force('y', forceY(0).strength(0.05));

  sim.tick(200);
  const positions = new Map();
  for (const item of simNodes) {
    positions.set(item.id, { x: item.x, y: item.y });
  }
  return positions;
}

export function createCitationCanvas({ container, tooltipEl, onSelect, onZoomChange }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'citation-canvas-el';
  canvas.setAttribute('aria-label', '引文交叉图谱画布');
  container.append(canvas);

  const ctx = canvas.getContext('2d');
  let palette = readThemePalette();
  let nodes = [];
  let edges = [];
  let layout = 'force';
  let years = [0, 0];
  let selectedId = null;
  let hoveredId = null;
  let positions = new Map();
  let transform = { x: 0, y: 0, scale: 1 };
  let width = 640;
  let height = 480;
  let dpr = window.devicePixelRatio || 1;
  let dragState = null;
  let organized = false;
  let stretch = 1;
  let vertical = 1;
  let routes = new Map();
  let axisTicks = [];
  function arrangedPositions() {
    const result = citationArrangement(nodes, edges, stretch, vertical, years[1] > years[0] ? { years } : {});
    routes = result.routes;
    axisTicks = result.axisTicks || [];
    return result.positions;
  }
  let axisWidth = 680;
  let originalPositions = new Map();
  let animation = 0;
  let ambientRaf = 0;
  let lastAmbientTick = 0;
  const reducedMotionQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  let graphThemeId = DEFAULT_CITATION_THEME;
  let citationTiers = new Map();

  function nodeTier(node) {
    return citationTiers.get(node?.id)?.tier || 'normal';
  }

  function nodeVisualPad(node) {
    if (graphThemeId === 'baroque' && node?.role === 'seed') return 11;
    return highCitedExtraRadius(graphThemeId, nodeTier(node));
  }

  function wantsAmbientLoop() {
    return graphThemeId === 'baroque'
      && nodes.length > 0
      && !animation
      && !reducedMotionQuery?.matches
      && (typeof document === 'undefined' || !document.hidden)
      && canvas.isConnected;
  }

  function stopAmbientLoop() {
    if (ambientRaf) {
      cancelAnimationFrame(ambientRaf);
      ambientRaf = 0;
    }
  }

  function syncAmbientLoop() {
    if (!wantsAmbientLoop()) {
      stopAmbientLoop();
      return;
    }
    if (ambientRaf) return;
    const step = now => {
      ambientRaf = 0;
      if (!wantsAmbientLoop()) return;
      if (now - lastAmbientTick >= 33) {
        lastAmbientTick = now;
        paint(ctx, width, height, transform, palette, dpr, now * 0.001);
      }
      ambientRaf = requestAnimationFrame(step);
    };
    ambientRaf = requestAnimationFrame(step);
  }

  function stopAnimation() {
    cancelAnimationFrame(animation);
    animation = 0;
    stopAmbientLoop();
  }

  function transitionTo(target, toCamera = fittedCamera(target)) {
    stopAnimation();
    const start = positions;
    const fromCamera = transform;
    const started = performance.now();
    function frame(now) {
      const t = Math.min(1, Math.max(0, (now - started) / 360));
      const eased = t * t * (3 - 2 * t);
      const mix = (a, b) => a + (b - a) * eased;
      positions = new Map();
      for (const [id, end] of target) {
        const from = start.get(id) || end;
        positions.set(id, { x: mix(from.x, end.x), y: mix(from.y, end.y) });
      }
      transform = {x: mix(fromCamera.x, toCamera.x), y: mix(fromCamera.y, toCamera.y),
        scale: mix(fromCamera.scale, toCamera.scale)};
      draw();
      if (t < 1) animation = requestAnimationFrame(frame);
      else { animation = 0; onZoomChange?.(transform.scale); syncAmbientLoop(); }
    }
    animation = requestAnimationFrame(frame);
  }

  const onVisibility = () => syncAmbientLoop();
  document.addEventListener('visibilitychange', onVisibility);
  reducedMotionQuery?.addEventListener?.('change', onVisibility);

  const observer = new MutationObserver(() => {
    palette = readThemePalette();
    draw();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['style', 'data-theme-mode', 'data-theme-fonts'],
  });

  function resize() {
    const rect = container.getBoundingClientRect();
    width = Math.max(200, rect.width || 640);
    height = Math.max(200, rect.height || 480);
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    draw();
  }

  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  function worldToScreen(wx, wy) {
    return {
      x: wx * transform.scale + transform.x,
      y: wy * transform.scale + transform.y,
    };
  }

  function screenToWorld(sx, sy) {
    return {
      x: (sx - transform.x) / transform.scale,
      y: (sy - transform.y) / transform.scale,
    };
  }

  function fittedCamera(coords) {
    if (!nodes.length) return { x: width / 2, y: height / 2, scale: 1 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const node of nodes) {
      const pos = coords.get(node.id);
      if (!pos) continue;
      const r = nodeRadius(node) + nodeVisualPad(node) + 28;
      minX = Math.min(minX, pos.x - r);
      maxX = Math.max(maxX, pos.x + r);
      minY = Math.min(minY, pos.y - r);
      maxY = Math.max(maxY, pos.y + r);
    }
    const bw = Math.max(120, maxX - minX);
    const bh = Math.max(120, maxY - minY);
    const topPad = (organized || layout === 'timeline') && years[1] > years[0] ? 42 : 24;
    const scale = Math.min(1.08, (width - 96) / bw, (height - topPad - 48) / bh);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return {
      x: width / 2 - cx * scale,
      y: topPad + (height - topPad) / 2 - cy * scale,
      scale,
    };
  }

  function fit() {
    stopAnimation();
    transform = fittedCamera(positions);
    onZoomChange?.(transform.scale);
    draw();
  }

  function zoomBy(factor, cx = width / 2, cy = height / 2) {
    stopAnimation();
    const nextScale = Math.max(Math.min(0.15, fittedCamera(positions).scale), Math.min(4, transform.scale * factor));
    const world = screenToWorld(cx, cy);
    transform = {
      scale: nextScale,
      x: cx - world.x * nextScale,
      y: cy - world.y * nextScale,
    };
    onZoomChange?.(nextScale);
    draw();
  }

  function focusNode(id) {
    stopAnimation();
    const pos = positions.get(id);
    if (!pos) return;
    const targetScale = Math.max(transform.scale, 1.05);
    transform = {
      scale: targetScale,
      x: width / 2 - pos.x * targetScale,
      y: height / 2 - pos.y * targetScale,
    };
    onZoomChange?.(targetScale);
    draw();
  }

  function hitTestNode(sx, sy) {
    const world = screenToWorld(sx, sy);
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      const pos = positions.get(node.id);
      if (!pos) continue;
      const r = nodeRadius(node) + nodeVisualPad(node) + 6 / Math.max(0.5, transform.scale);
      const dx = world.x - pos.x;
      const dy = world.y - pos.y;
      if (dx * dx + dy * dy <= r * r) return node;
    }
    return null;
  }

  function updateTooltip(node, sx, sy) {
    if (!tooltipEl) return;
    if (!node) {
      tooltipEl.hidden = true;
      return;
    }
    const tierText = node.role === 'seed'
      ? '所选种子文献'
      : node.statusTier === 'missing'
        ? '未入库'
        : node.statusTier === 'unread'
          ? '库内未读'
          : '库内已读';
    const meta = node.role === 'seed'
      ? `${tierText} · ${node.year ?? '年份未知'}`
      : `${tierText} · 共引 ${node.coCiteCount} 篇 · ${node.year ?? '年份未知'} · 被引 ${node.citationCount?.toLocaleString() ?? '—'}`;
    tooltipEl.innerHTML = '';
    const titleEl = document.createElement('strong');
    titleEl.textContent = node.title;
    const metaEl = document.createElement('small');
    metaEl.textContent = meta;
    tooltipEl.append(titleEl, metaEl);
    tooltipEl.hidden = false;
    tooltipEl.style.left = `${Math.max(8, Math.min(width - 250, sx + 14))}px`;
    tooltipEl.style.top = `${Math.max(8, Math.min(height - 96, sy + 14))}px`;
  }

  function paint(targetCtx, targetWidth, targetHeight, targetTransform, activePalette, dprScale, timeSec = 0) {
    targetCtx.save();
    targetCtx.setTransform(dprScale, 0, 0, dprScale, 0, 0);
    targetCtx.clearRect(0, 0, targetWidth, targetHeight);

    const activeSet = new Set();
    if (selectedId) {
      activeSet.add(selectedId);
      for (const edge of edges) {
        if (edge.source === selectedId) activeSet.add(edge.target);
        if (edge.target === selectedId) activeSet.add(edge.source);
      }
    }

    const nodeById = new Map(nodes.map(n => [n.id, n]));
    const sortedEdges = [...edges].sort((a, b) => {
      const aLit = selectedId && (a.source === selectedId || a.target === selectedId) ? 2 : a.kind === 'seed_ref' ? 1 : 0;
      const bLit = selectedId && (b.source === selectedId || b.target === selectedId) ? 2 : b.kind === 'seed_ref' ? 1 : 0;
      return aLit - bLit;
    });
    const denseGraph = edges.length > 40;
    const theme = graphThemeId;
    const isBaroque = theme === 'baroque';
    const isThemed = theme !== 'classic';

    const orderedNodes = [...nodes].sort((a, b) => {
      const rank = n => (
        n.id === selectedId ? 6
          : n.id === hoveredId ? 5
            : n.role === 'seed' ? 4
              : (isThemed && nodeTier(n) === 'landmark') ? 3
                : (isThemed && nodeTier(n) === 'high') ? 2
                  : 1
      );
      return rank(a) - rank(b);
    });

    const labelQueue = [...nodes]
      .filter(node => {
        const isSelected = node.id === selectedId;
        const isHovered = node.id === hoveredId;
        return (organized && nodes.length <= 44) || node.role === 'seed'
          || isSelected
          || isHovered
          || activeSet.has(node.id)
          || (isThemed && nodeTier(node) === 'landmark' && targetTransform.scale >= 0.55)
          || (node.coCiteCount >= 2 && targetTransform.scale >= 0.55)
          || targetTransform.scale >= 0.95;
      })
      .sort((a, b) => {
        const tierBoost = n => {
          if (!isThemed) return 0;
          const t = nodeTier(n);
          return t === 'landmark' ? 5e6 : t === 'high' ? 1e6 : 0;
        };
        const score = n => (
          n.id === selectedId ? 1e9
            : n.id === hoveredId ? 5e8
              : n.role === 'seed' ? 1e8
                : (activeSet.has(n.id) ? 1e7 : 0) + tierBoost(n) + (n.coCiteCount || 0) * 1e4 + (n.citationCount || 0)
        );
        return score(b) - score(a);
      });

    if (isBaroque) {
      drawBaroqueBackdrop(targetCtx, targetWidth, targetHeight, targetTransform, activePalette, timeSec);
      drawBaroqueTimelineBar(targetCtx, targetWidth, targetHeight, targetTransform, activePalette, {
        organized,
        layout,
        axisTicks,
        years,
        axisWidth,
      });
      drawBaroqueEdges(targetCtx, {
        edges: sortedEdges,
        positions,
        nodeById,
        selectedId,
        organized,
        denseGraph,
        transform: targetTransform,
        activePalette,
        nodeRadiusFn: nodeRadius,
        nodeVisualPadFn: nodeVisualPad,
        timeSec,
      });
      const nodeScreens = drawBaroqueNodes(targetCtx, {
        orderedNodes,
        positions,
        transform: targetTransform,
        activePalette,
        selectedId,
        hoveredId,
        activeSet,
        nodeRadiusFn: nodeRadius,
        nodeTierFn: nodeTier,
        timeSec,
      });
      drawBaroqueLabels(targetCtx, {
        labelQueue,
        nodeScreens,
        selectedId,
        hoveredId,
        activeSet,
        organized,
        nodesCount: nodes.length,
        activePalette,
      });
      targetCtx.restore();
      return;
    }

    drawStandardBackdrop(targetCtx, targetWidth, targetHeight, targetTransform, activePalette, theme);

    // Architectural top timeline datum bar & adaptive hairline year ticks
    if (organized && axisTicks.length) {
      targetCtx.save();
      targetCtx.fillStyle = activePalette.dark ? 'rgba(17, 22, 27, 0.80)' : 'rgba(255, 255, 255, 0.78)';
      targetCtx.fillRect(0, 0, targetWidth, 32);
      targetCtx.strokeStyle = activePalette.line;
      targetCtx.lineWidth = 1;
      targetCtx.beginPath();
      targetCtx.moveTo(0, 32);
      targetCtx.lineTo(targetWidth, 32);
      targetCtx.stroke();

      targetCtx.font = `500 10.5px ${activePalette.mono || activePalette.sans}`;
      targetCtx.textAlign = 'center';
      targetCtx.textBaseline = 'middle';

      // Prioritize seed years first so landmark anchor years always show cleanly
      const prioritized = [...axisTicks].sort((a, b) => Number(b.hasSeed) - Number(a.hasSeed) || b.count - a.count);
      const shownX = [];
      const toDraw = [];
      for (const tick of prioritized) {
        const sx = tick.x * targetTransform.scale + targetTransform.x;
        if (sx < 26 || sx > targetWidth - 26) continue;
        if (shownX.some(x => Math.abs(x - sx) < 48)) continue;
        shownX.push(sx);
        toDraw.push({ tick, sx });
      }
      for (const { tick, sx } of toDraw) {
        targetCtx.save();
        targetCtx.strokeStyle = tick.hasSeed ? activePalette.teal : activePalette.line;
        targetCtx.globalAlpha = tick.hasSeed ? 0.36 : 0.28;
        targetCtx.lineWidth = 1;
        targetCtx.setLineDash([2, 5]);
        targetCtx.beginPath();
        targetCtx.moveTo(sx, 33);
        targetCtx.lineTo(sx, targetHeight - 18);
        targetCtx.stroke();
        targetCtx.setLineDash([]);
        targetCtx.globalAlpha = 0.9;
        targetCtx.beginPath();
        targetCtx.moveTo(sx, 28);
        targetCtx.lineTo(sx, 32);
        targetCtx.stroke();
        targetCtx.fillStyle = tick.hasSeed ? activePalette.teal : activePalette.muted;
        targetCtx.font = `${tick.hasSeed ? '600 ' : '500 '}10.5px ${activePalette.mono || activePalette.sans}`;
        targetCtx.fillText(tick.label, sx, 16);
        targetCtx.restore();
      }
      targetCtx.restore();
    } else if (!organized && layout === 'timeline' && years[1] > years[0]) {
      const span = years[1] - years[0];
      const worldWidth = axisWidth;
      const step = span > 35 ? 10 : span > 15 ? 5 : 2;
      targetCtx.save();
      targetCtx.fillStyle = activePalette.dark ? 'rgba(17, 22, 27, 0.78)' : 'rgba(255, 255, 255, 0.72)';
      targetCtx.fillRect(0, 0, targetWidth, 30);
      targetCtx.strokeStyle = activePalette.line;
      targetCtx.lineWidth = 1;
      targetCtx.beginPath();
      targetCtx.moveTo(0, 30);
      targetCtx.lineTo(targetWidth, 30);
      targetCtx.stroke();

      targetCtx.font = `500 10.5px ${activePalette.mono || activePalette.sans}`;
      targetCtx.textAlign = 'center';
      targetCtx.textBaseline = 'middle';
      for (let y = Math.ceil(years[0] / step) * step; y <= years[1]; y += step) {
        const wx = ((y - years[0]) / span - 0.5) * worldWidth;
        const sx = wx * targetTransform.scale + targetTransform.x;
        if (sx < 24 || sx > targetWidth - 24) continue;
        targetCtx.save();
        targetCtx.strokeStyle = activePalette.line;
        targetCtx.globalAlpha = 0.32;
        targetCtx.lineWidth = 1;
        targetCtx.setLineDash([2, 5]);
        targetCtx.beginPath();
        targetCtx.moveTo(sx, 31);
        targetCtx.lineTo(sx, targetHeight - 18);
        targetCtx.stroke();
        targetCtx.setLineDash([]);
        targetCtx.globalAlpha = 0.85;
        targetCtx.beginPath();
        targetCtx.moveTo(sx, 26);
        targetCtx.lineTo(sx, 30);
        targetCtx.stroke();
        targetCtx.fillStyle = activePalette.muted;
        targetCtx.fillText(String(y), sx, 15);
        targetCtx.restore();
      }
      targetCtx.restore();
    }

    const arrowStyle = theme === 'constellation'
      ? 'slender'
      : theme === 'crystal'
        ? 'triangle'
        : theme === 'editorial'
          ? 'open'
          : theme === 'circuit'
            ? 'spear'
            : 'dart';

    // Edges: clean single cubic Bezier flows in organized mode (no wavy intermediate guides)
    for (const edge of sortedEdges) {
      const from = positions.get(edge.source);
      const to = positions.get(edge.target);
      const targetNode = nodeById.get(edge.target);
      if (!from || !to || !targetNode) continue;

      const isLit = selectedId && (edge.source === selectedId || edge.target === selectedId);
      const isDim = selectedId && !isLit;
      const p1 = { x: from.x * targetTransform.scale + targetTransform.x, y: from.y * targetTransform.scale + targetTransform.y };
      const p2 = { x: to.x * targetTransform.scale + targetTransform.x, y: to.y * targetTransform.scale + targetTransform.y };
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      if (len < 6) continue;

      const targetR = nodeRadius(targetNode) * Math.max(0.55, Math.min(1.45, targetTransform.scale))
        + nodeVisualPad(targetNode)
        + 5;
      const sameCol = organized && Math.abs(dx) < 10;
      let endX, endY, ux, uy, ctrlX, ctrlY;

      if (sameCol) {
        ux = -1;
        uy = 0;
        endX = p2.x + targetR;
        endY = p2.y;
      } else if (organized) {
        ux = Math.sign(dx) || 1;
        uy = 0;
        endX = p2.x - ux * targetR;
        endY = p2.y;
      } else if (theme === 'constellation' || theme === 'editorial' || theme === 'circuit') {
        const nx = -dy / len;
        const ny = dx / len;
        const bend = theme === 'editorial' ? Math.min(18, len * 0.07) : Math.min(36, len * 0.13);
        const sign = (edge.id?.length || 0) % 2 === 0 ? 1 : -1;
        ctrlX = (p1.x + p2.x) / 2 + nx * bend * sign;
        ctrlY = (p1.y + p2.y) / 2 + ny * bend * sign;
        const tdx = p2.x - ctrlX;
        const tdy = p2.y - ctrlY;
        const tLen = Math.hypot(tdx, tdy) || 1;
        ux = tdx / tLen;
        uy = tdy / tLen;
        endX = p2.x - ux * targetR;
        endY = p2.y - uy * targetR;
      } else {
        ux = dx / len;
        uy = dy / len;
        endX = p2.x - ux * targetR;
        endY = p2.y - uy * targetR;
      }

      targetCtx.save();
      targetCtx.lineCap = theme === 'crystal' ? 'butt' : 'round';
      targetCtx.lineJoin = theme === 'crystal' ? 'miter' : 'round';
      if (theme === 'editorial') {
        targetCtx.globalAlpha = organized
          ? (isLit ? 0.96 : isDim ? 0.08 : edge.kind === 'seed_ref' ? (denseGraph ? 0.34 : 0.48) : (denseGraph ? 0.22 : 0.32))
          : (isDim ? 0.18 : isLit ? 0.95 : 0.65);
      } else if (theme === 'circuit') {
        targetCtx.globalAlpha = organized
          ? (isLit ? 0.98 : isDim ? 0.07 : edge.kind === 'seed_ref' ? (denseGraph ? 0.32 : 0.46) : (denseGraph ? 0.18 : 0.28))
          : (isDim ? 0.16 : isLit ? 0.96 : 0.62);
      } else {
        targetCtx.globalAlpha = organized
          ? (isLit ? 0.95 : isDim ? 0.06 : edge.kind === 'seed_ref' ? (denseGraph ? 0.22 : 0.36) : (denseGraph ? 0.14 : 0.24))
          : (isDim ? 0.18 : isLit ? 0.92 : 0.56);
      }

      const baseColor = isLit
        ? (targetNode.statusTier === 'missing' ? activePalette.warning : activePalette.teal)
        : edge.kind === 'seed_ref'
          ? (theme === 'editorial' ? activePalette.ink : activePalette.teal)
          : activePalette.muted;

      if (isLit && theme !== 'editorial') {
        targetCtx.shadowColor = baseColor;
        targetCtx.shadowBlur = theme === 'circuit' ? 10 : 7;
      }

      if (theme === 'editorial') {
        targetCtx.strokeStyle = baseColor;
      } else if (Math.hypot(endX - p1.x, endY - p1.y) > 4) {
        const grad = targetCtx.createLinearGradient(p1.x, p1.y, endX, endY);
        grad.addColorStop(0, activePalette.muted);
        grad.addColorStop(0.28, baseColor);
        grad.addColorStop(1, baseColor);
        targetCtx.strokeStyle = isLit ? baseColor : grad;
      } else {
        targetCtx.strokeStyle = baseColor;
      }

      targetCtx.lineWidth = isLit
        ? (theme === 'circuit' ? 2.3 : 2.1)
        : organized
          ? (edge.kind === 'seed_ref' ? 1.05 : 0.9)
          : (theme === 'editorial' ? 1.15 : 1.2);

      if (edge.kind === 'ref_ref' && !isLit) {
        if (theme === 'constellation') targetCtx.setLineDash([2, 4]);
        else if (theme === 'crystal') targetCtx.setLineDash([5, 3]);
        else if (theme === 'editorial') targetCtx.setLineDash([2.5, 3.5]);
        else if (theme === 'circuit') targetCtx.setLineDash([6, 4]);
        else if (!organized) targetCtx.setLineDash([4, 4]);
      }

      const traceEdgePath = () => {
        targetCtx.beginPath();
        targetCtx.moveTo(p1.x, p1.y);
        if (theme === 'crystal') {
          if (sameCol) {
            const off = Math.min(64, Math.max(24, Math.abs(dy) * 0.24));
            const chamfer = 6;
            const elbowX = Math.max(p1.x, endX) + off;
            targetCtx.lineTo(elbowX - chamfer, p1.y);
            targetCtx.lineTo(elbowX, p1.y + Math.sign(dy || 1) * Math.min(chamfer, Math.abs(dy) * 0.4));
            targetCtx.lineTo(elbowX, endY - Math.sign(dy || 1) * Math.min(chamfer, Math.abs(dy) * 0.4));
            targetCtx.lineTo(elbowX - chamfer, endY);
            targetCtx.lineTo(endX, endY);
          } else if (organized) {
            const dir = Math.sign(endX - p1.x) || 1;
            const spanX = Math.abs(endX - p1.x);
            const diag = Math.min(Math.abs(dy), Math.max(12, spanX * 0.25));
            const stub = Math.max(8, (spanX - diag) * 0.35);
            const mid1X = p1.x + dir * stub;
            const mid2X = mid1X + dir * diag;
            targetCtx.lineTo(mid1X, p1.y);
            targetCtx.lineTo(mid2X, endY);
            targetCtx.lineTo(endX, endY);
          } else {
            targetCtx.lineTo(endX, endY);
          }
        } else if (sameCol) {
          const arcOffset = Math.min(72, Math.max(26, Math.abs(dy) * 0.28));
          targetCtx.bezierCurveTo(p1.x + arcOffset, p1.y, p2.x + arcOffset, p2.y, endX, endY);
        } else if (organized) {
          const dir = Math.sign(endX - p1.x) || 1;
          const factor = theme === 'constellation' ? 0.5 : theme === 'editorial' ? 0.42 : 0.46;
          const maxPull = theme === 'constellation' ? 220 : theme === 'editorial' ? 180 : 200;
          const pull = Math.min(Math.abs(endX - p1.x) * factor, maxPull);
          targetCtx.bezierCurveTo(p1.x + dir * pull, p1.y, endX - dir * pull, endY, endX, endY);
        } else if (ctrlX !== undefined) {
          targetCtx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
        } else {
          targetCtx.lineTo(endX, endY);
        }
      };

      if (theme === 'circuit' && (isLit || (edge.kind === 'seed_ref' && !isDim))) {
        targetCtx.save();
        targetCtx.globalAlpha *= isLit ? 0.28 : 0.22;
        targetCtx.lineWidth += 3.2;
        targetCtx.strokeStyle = baseColor;
        targetCtx.shadowBlur = 0;
        targetCtx.setLineDash([]);
        traceEdgePath();
        targetCtx.stroke();
        targetCtx.restore();
      }

      traceEdgePath();
      targetCtx.stroke();

      if (theme === 'crystal' && !isDim && (!denseGraph || isLit)) {
        targetCtx.save();
        targetCtx.setLineDash([]);
        targetCtx.shadowBlur = 0;
        targetCtx.fillStyle = baseColor;
        targetCtx.beginPath();
        targetCtx.arc(p1.x, p1.y, 1.8, 0, Math.PI * 2);
        targetCtx.fill();
        targetCtx.restore();
      }

      // Dart / themed arrowhead aligned to true arrival tangent
      if (!organized || isLit || !denseGraph || edge.kind === 'ref_ref') {
        drawArrowhead(targetCtx, endX, endY, ux, uy, baseColor, isLit, arrowStyle);
      }
      targetCtx.restore();
    }

    // Nodes (classic + constellation/crystal/editorial/circuit)
    const nodeScreens = new Map();
    for (const node of orderedNodes) {
      const pos = positions.get(node.id);
      if (!pos) continue;
      const screen = {
        x: pos.x * targetTransform.scale + targetTransform.x,
        y: pos.y * targetTransform.scale + targetTransform.y,
      };
      const r = nodeRadius(node) * Math.max(0.55, Math.min(1.45, targetTransform.scale));
      const tier = nodeTier(node);
      const visualR = r + highCitedExtraRadius(theme, tier);
      nodeScreens.set(node.id, { ...screen, r, visualR, tier });

      const isSelected = node.id === selectedId;
      const isHovered = node.id === hoveredId;
      const isDim = selectedId && !activeSet.has(node.id);

      const accentColor = node.role === 'seed' || node.statusTier === 'unread'
        ? activePalette.teal
        : node.statusTier === 'missing'
          ? activePalette.warning
          : activePalette.ink;
      const statusTint = node.statusTier === 'missing'
        ? (activePalette.dark ? 'rgba(232, 139, 82, 0.28)' : 'rgba(217, 119, 87, 0.18)')
        : node.statusTier === 'unread'
          ? (activePalette.dark ? 'rgba(82, 191, 180, 0.25)' : 'rgba(38, 97, 92, 0.14)')
          : activePalette.panel;

      targetCtx.save();
      targetCtx.globalAlpha = isDim ? 0.5 : 1;

      if (!isDim && theme !== 'editorial') {
        targetCtx.shadowColor = activePalette.dark ? 'rgba(0, 0, 0, 0.45)' : 'rgba(31, 36, 38, 0.14)';
        targetCtx.shadowBlur = isSelected || isHovered ? 14 : 8;
        targetCtx.shadowOffsetY = 2.5;
      }

      if (theme === 'classic') {
        if (node.role === 'seed') {
          targetCtx.save();
          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r + 7, 0, Math.PI * 2);
          targetCtx.strokeStyle = activePalette.teal;
          targetCtx.globalAlpha = (isDim ? 0.5 : 1) * 0.22;
          targetCtx.lineWidth = 4;
          targetCtx.stroke();

          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r + 3.5, 0, Math.PI * 2);
          targetCtx.globalAlpha = (isDim ? 0.5 : 1) * 0.75;
          targetCtx.lineWidth = 1.4;
          targetCtx.stroke();
          targetCtx.restore();

          const grad = targetCtx.createRadialGradient(
            screen.x - r * 0.28, screen.y - r * 0.28, r * 0.12,
            screen.x, screen.y, r,
          );
          grad.addColorStop(0, activePalette.dark ? '#73d4ca' : '#357e78');
          grad.addColorStop(1, activePalette.teal);
          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
          targetCtx.fillStyle = grad;
          targetCtx.fill();

          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, Math.max(2.4, r * 0.24), 0, Math.PI * 2);
          targetCtx.fillStyle = '#ffffff';
          targetCtx.globalAlpha = (isDim ? 0.5 : 1) * 0.92;
          targetCtx.fill();
        } else if (node.statusTier === 'missing') {
          // Solid opaque surface base + warm amber tint fill + crisp solid ring
          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
          targetCtx.fillStyle = activePalette.surface;
          targetCtx.fill();
          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          targetCtx.fillStyle = activePalette.dark ? 'rgba(232, 139, 82, 0.24)' : 'rgba(217, 119, 87, 0.16)';
          targetCtx.fill();
          targetCtx.lineWidth = isSelected || isHovered ? 2.4 : 1.65;
          targetCtx.strokeStyle = activePalette.warning;
          targetCtx.stroke();
        } else if (node.statusTier === 'unread') {
          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
          targetCtx.fillStyle = activePalette.surface;
          targetCtx.fill();
          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          targetCtx.fillStyle = activePalette.dark ? 'rgba(82, 191, 180, 0.22)' : 'rgba(38, 97, 92, 0.12)';
          targetCtx.fill();
          targetCtx.lineWidth = isSelected || isHovered ? 2.4 : 1.65;
          targetCtx.strokeStyle = activePalette.teal;
          targetCtx.stroke();
        } else {
          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
          targetCtx.fillStyle = activePalette.surface;
          targetCtx.fill();
          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          targetCtx.fillStyle = activePalette.panel;
          targetCtx.fill();
          targetCtx.lineWidth = isSelected || isHovered ? 2.2 : 1.25;
          targetCtx.strokeStyle = activePalette.muted;
          targetCtx.stroke();
        }
      } else if (theme === 'constellation') {
        if (node.role === 'seed') {
          targetCtx.save();
          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          targetCtx.setLineDash([3, 3]);
          targetCtx.strokeStyle = activePalette.teal;
          targetCtx.globalAlpha = (isDim ? 0.5 : 1) * 0.72;
          targetCtx.lineWidth = 1.25;
          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r + 6, 0, Math.PI * 2);
          targetCtx.stroke();
          targetCtx.setLineDash([]);
          const tickOut = r + 9;
          const tickIn = r + 3.5;
          targetCtx.beginPath();
          targetCtx.moveTo(screen.x - tickOut, screen.y);
          targetCtx.lineTo(screen.x - tickIn, screen.y);
          targetCtx.moveTo(screen.x + tickIn, screen.y);
          targetCtx.lineTo(screen.x + tickOut, screen.y);
          targetCtx.moveTo(screen.x, screen.y - tickOut);
          targetCtx.lineTo(screen.x, screen.y - tickIn);
          targetCtx.moveTo(screen.x, screen.y + tickIn);
          targetCtx.lineTo(screen.x, screen.y + tickOut);
          targetCtx.stroke();
          targetCtx.restore();

          const grad = targetCtx.createRadialGradient(
            screen.x - r * 0.25, screen.y - r * 0.25, r * 0.1,
            screen.x, screen.y, r,
          );
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.38, activePalette.dark ? '#73d4ca' : '#357e78');
          grad.addColorStop(1, activePalette.teal);
          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
          targetCtx.fillStyle = grad;
          targetCtx.fill();
        } else if (tier === 'landmark') {
          targetCtx.save();
          targetCtx.shadowColor = accentColor;
          targetCtx.shadowBlur = isDim ? 4 : 16;
          targetCtx.shadowOffsetY = 0;
          targetCtx.strokeStyle = accentColor;
          targetCtx.globalAlpha = (isDim ? 0.5 : 1) * 0.48;
          targetCtx.lineWidth = 1.2;
          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r + 9.5, 0, Math.PI * 2);
          targetCtx.stroke();

          targetCtx.setLineDash([3, 3]);
          targetCtx.globalAlpha = (isDim ? 0.5 : 1) * 0.85;
          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r + 5.5, 0, Math.PI * 2);
          targetCtx.stroke();
          targetCtx.setLineDash([]);

          for (const angle of [-Math.PI / 4, (3 * Math.PI) / 4]) {
            const mx = screen.x + Math.cos(angle) * (r + 9.5);
            const my = screen.y + Math.sin(angle) * (r + 9.5);
            targetCtx.beginPath();
            targetCtx.arc(mx, my, 2.1, 0, Math.PI * 2);
            targetCtx.fillStyle = accentColor;
            targetCtx.fill();
          }
          targetCtx.restore();

          traceStar(targetCtx, screen.x, screen.y, r + 8.5, (r + 8.5) * 0.55, 8);
          targetCtx.fillStyle = activePalette.surface;
          targetCtx.fill();
          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          targetCtx.fillStyle = statusTint;
          targetCtx.fill();
          targetCtx.lineWidth = isSelected || isHovered ? 2.4 : 1.75;
          targetCtx.strokeStyle = accentColor;
          targetCtx.stroke();
        } else if (tier === 'high') {
          targetCtx.save();
          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          targetCtx.setLineDash([2.5, 3]);
          targetCtx.strokeStyle = accentColor;
          targetCtx.globalAlpha = (isDim ? 0.5 : 1) * 0.65;
          targetCtx.lineWidth = 1.2;
          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r + 5, 0, Math.PI * 2);
          targetCtx.stroke();
          targetCtx.restore();

          traceStar(targetCtx, screen.x, screen.y, r + 6, (r + 6) * 0.52, 4);
          targetCtx.fillStyle = activePalette.surface;
          targetCtx.fill();
          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          targetCtx.fillStyle = statusTint;
          targetCtx.fill();
          targetCtx.lineWidth = isSelected || isHovered ? 2.3 : 1.7;
          targetCtx.strokeStyle = accentColor;
          targetCtx.stroke();
        } else if (node.statusTier === 'unread') {
          tracePolygon(targetCtx, screen.x, screen.y, r * 1.12, 4, 0);
          targetCtx.fillStyle = activePalette.surface;
          targetCtx.fill();
          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          targetCtx.fillStyle = statusTint;
          targetCtx.fill();
          targetCtx.lineWidth = isSelected || isHovered ? 2.2 : 1.55;
          targetCtx.strokeStyle = activePalette.teal;
          targetCtx.stroke();
          if (node.coCiteCount < 2) {
            targetCtx.beginPath();
            targetCtx.arc(screen.x, screen.y, 1.9, 0, Math.PI * 2);
            targetCtx.fillStyle = activePalette.teal;
            targetCtx.fill();
          }
        } else if (node.statusTier === 'missing') {
          targetCtx.save();
          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r + 2.8, 0, Math.PI * 2);
          targetCtx.strokeStyle = activePalette.warning;
          targetCtx.globalAlpha = (isDim ? 0.5 : 1) * 0.45;
          targetCtx.lineWidth = 1;
          targetCtx.stroke();
          targetCtx.restore();

          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
          targetCtx.fillStyle = activePalette.surface;
          targetCtx.fill();
          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          targetCtx.fillStyle = statusTint;
          targetCtx.fill();
          targetCtx.lineWidth = isSelected || isHovered ? 2.2 : 1.6;
          targetCtx.strokeStyle = activePalette.warning;
          targetCtx.stroke();
        } else {
          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r * 0.92, 0, Math.PI * 2);
          targetCtx.fillStyle = activePalette.surface;
          targetCtx.fill();
          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          targetCtx.fillStyle = activePalette.panel;
          targetCtx.fill();
          targetCtx.lineWidth = isSelected || isHovered ? 2 : 1.2;
          targetCtx.strokeStyle = activePalette.muted;
          targetCtx.stroke();
        }
      } else if (theme === 'crystal') {
        const hexRot = -Math.PI / 6;
        if (node.role === 'seed') {
          targetCtx.save();
          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          tracePolygon(targetCtx, screen.x, screen.y, r + 5.5, 6, hexRot);
          targetCtx.strokeStyle = activePalette.teal;
          targetCtx.globalAlpha = (isDim ? 0.5 : 1) * 0.72;
          targetCtx.lineWidth = 1.4;
          targetCtx.stroke();
          targetCtx.restore();

          tracePolygon(targetCtx, screen.x, screen.y, r * 1.05, 6, hexRot);
          targetCtx.fillStyle = activePalette.teal;
          targetCtx.fill();

          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          tracePolygon(targetCtx, screen.x, screen.y, Math.max(3, r * 0.42), 6, hexRot);
          targetCtx.fillStyle = '#ffffff';
          targetCtx.globalAlpha = (isDim ? 0.5 : 1) * 0.9;
          targetCtx.fill();
        } else if (tier === 'landmark') {
          targetCtx.save();
          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          tracePolygon(targetCtx, screen.x, screen.y, r + 7.5, 8, Math.PI / 8);
          targetCtx.fillStyle = activePalette.surface;
          targetCtx.fill();
          targetCtx.strokeStyle = accentColor;
          targetCtx.lineWidth = 1.7;
          targetCtx.stroke();

          targetCtx.strokeStyle = accentColor;
          targetCtx.lineWidth = 1.4;
          for (let i = 0; i < 6; i++) {
            const ang = (i * Math.PI) / 3;
            targetCtx.beginPath();
            targetCtx.moveTo(screen.x + Math.cos(ang) * (r + 7.5), screen.y + Math.sin(ang) * (r + 7.5));
            targetCtx.lineTo(screen.x + Math.cos(ang) * (r + 11.5), screen.y + Math.sin(ang) * (r + 11.5));
            targetCtx.stroke();
          }
          targetCtx.restore();

          tracePolygon(targetCtx, screen.x, screen.y, r * 1.04, 8, Math.PI / 8);
          targetCtx.fillStyle = activePalette.surface;
          targetCtx.fill();
          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          targetCtx.fillStyle = statusTint;
          targetCtx.fill();
          targetCtx.lineWidth = isSelected || isHovered ? 2.3 : 1.75;
          targetCtx.strokeStyle = accentColor;
          targetCtx.stroke();
        } else if (tier === 'high') {
          targetCtx.save();
          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          tracePolygon(targetCtx, screen.x, screen.y, r + 5, 6, hexRot);
          targetCtx.strokeStyle = accentColor;
          targetCtx.lineWidth = 1.35;
          targetCtx.stroke();

          const b = r + 6.5;
          const arm = 4;
          targetCtx.beginPath();
          for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            targetCtx.moveTo(screen.x + sx * b, screen.y + sy * (b - arm));
            targetCtx.lineTo(screen.x + sx * b, screen.y + sy * b);
            targetCtx.lineTo(screen.x + sx * (b - arm), screen.y + sy * b);
          }
          targetCtx.stroke();
          targetCtx.restore();

          tracePolygon(targetCtx, screen.x, screen.y, r, 6, hexRot);
          targetCtx.fillStyle = activePalette.surface;
          targetCtx.fill();
          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          targetCtx.fillStyle = statusTint;
          targetCtx.fill();
          targetCtx.lineWidth = isSelected || isHovered ? 2.2 : 1.65;
          targetCtx.strokeStyle = accentColor;
          targetCtx.stroke();
        } else if (node.statusTier === 'missing') {
          targetCtx.save();
          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          targetCtx.setLineDash([3, 2.5]);
          tracePolygon(targetCtx, screen.x, screen.y, r * 1.18 + 3, 4, 0);
          targetCtx.strokeStyle = activePalette.warning;
          targetCtx.lineWidth = 1.1;
          targetCtx.stroke();
          targetCtx.restore();

          tracePolygon(targetCtx, screen.x, screen.y, r * 1.14, 4, 0);
          targetCtx.fillStyle = activePalette.surface;
          targetCtx.fill();
          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          targetCtx.fillStyle = statusTint;
          targetCtx.fill();
          targetCtx.lineWidth = isSelected || isHovered ? 2.2 : 1.65;
          targetCtx.strokeStyle = activePalette.warning;
          targetCtx.stroke();
        } else if (node.statusTier === 'unread') {
          traceRoundedSquare(targetCtx, screen.x, screen.y, r * 0.92, 3.5);
          targetCtx.fillStyle = activePalette.surface;
          targetCtx.fill();
          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          targetCtx.fillStyle = statusTint;
          targetCtx.fill();
          targetCtx.lineWidth = isSelected || isHovered ? 2.2 : 1.6;
          targetCtx.strokeStyle = activePalette.teal;
          targetCtx.stroke();
        } else {
          tracePolygon(targetCtx, screen.x, screen.y, r * 0.95, 6, hexRot);
          targetCtx.fillStyle = activePalette.surface;
          targetCtx.fill();
          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          targetCtx.fillStyle = activePalette.panel;
          targetCtx.fill();
          targetCtx.lineWidth = isSelected || isHovered ? 2 : 1.25;
          targetCtx.strokeStyle = activePalette.muted;
          targetCtx.stroke();
        }
      } else if (theme === 'editorial') {
        if (node.role === 'seed') {
          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r + 4.5, 0, Math.PI * 2);
          targetCtx.strokeStyle = activePalette.teal;
          targetCtx.lineWidth = 1.1;
          targetCtx.stroke();

          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
          targetCtx.fillStyle = activePalette.teal;
          targetCtx.fill();

          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, Math.max(3, r * 0.52), 0, Math.PI * 2);
          targetCtx.strokeStyle = '#ffffff';
          targetCtx.lineWidth = 1.4;
          targetCtx.stroke();
        } else if (tier === 'landmark') {
          targetCtx.save();
          targetCtx.strokeStyle = accentColor;
          targetCtx.lineWidth = 1.3;
          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r + 7.2, 0, Math.PI * 2);
          targetCtx.stroke();
          for (let i = 0; i < 8; i++) {
            const ang = (i * Math.PI) / 4;
            targetCtx.beginPath();
            targetCtx.moveTo(screen.x + Math.cos(ang) * (r + 5), screen.y + Math.sin(ang) * (r + 5));
            targetCtx.lineTo(screen.x + Math.cos(ang) * (r + 9.4), screen.y + Math.sin(ang) * (r + 9.4));
            targetCtx.stroke();
          }
          targetCtx.restore();

          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
          targetCtx.fillStyle = activePalette.surface;
          targetCtx.fill();
          targetCtx.fillStyle = statusTint;
          targetCtx.fill();
          targetCtx.lineWidth = isSelected || isHovered ? 2.5 : 2;
          targetCtx.strokeStyle = accentColor;
          targetCtx.stroke();

          traceStar(targetCtx, screen.x, screen.y - r - 8.2, 4.4, 1.9, 5);
          targetCtx.fillStyle = accentColor;
          targetCtx.fill();
        } else if (tier === 'high') {
          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r + 4.5, 0, Math.PI * 2);
          targetCtx.strokeStyle = accentColor;
          targetCtx.lineWidth = 1.35;
          targetCtx.stroke();

          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
          targetCtx.fillStyle = activePalette.surface;
          targetCtx.fill();
          targetCtx.fillStyle = statusTint;
          targetCtx.fill();
          targetCtx.lineWidth = isSelected || isHovered ? 2.4 : 1.9;
          targetCtx.strokeStyle = accentColor;
          targetCtx.stroke();

          traceStar(targetCtx, screen.x, screen.y - r - 5.2, 3.6, 1.5, 5);
          targetCtx.fillStyle = accentColor;
          targetCtx.fill();
        } else if (node.statusTier === 'missing') {
          targetCtx.save();
          targetCtx.setLineDash([3, 2.5]);
          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r + 3, 0, Math.PI * 2);
          targetCtx.strokeStyle = activePalette.warning;
          targetCtx.lineWidth = 1.1;
          targetCtx.stroke();
          targetCtx.restore();

          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
          targetCtx.fillStyle = activePalette.surface;
          targetCtx.fill();
          targetCtx.lineWidth = isSelected || isHovered ? 2.4 : 1.8;
          targetCtx.strokeStyle = activePalette.warning;
          targetCtx.stroke();
        } else if (node.statusTier === 'unread') {
          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
          targetCtx.fillStyle = activePalette.surface;
          targetCtx.fill();
          targetCtx.lineWidth = isSelected || isHovered ? 2.4 : 1.8;
          targetCtx.strokeStyle = activePalette.teal;
          targetCtx.stroke();
          if (node.coCiteCount < 2) {
            targetCtx.beginPath();
            targetCtx.arc(screen.x, screen.y, Math.max(2.2, r * 0.34), 0, Math.PI * 2);
            targetCtx.fillStyle = activePalette.teal;
            targetCtx.fill();
          }
        } else {
          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r * 0.92, 0, Math.PI * 2);
          targetCtx.fillStyle = activePalette.surface;
          targetCtx.fill();
          targetCtx.lineWidth = isSelected || isHovered ? 2.1 : 1.3;
          targetCtx.strokeStyle = activePalette.muted;
          targetCtx.stroke();
        }
      } else {
        // 'circuit' theme
        if (node.role === 'seed') {
          targetCtx.save();
          targetCtx.shadowColor = activePalette.teal;
          targetCtx.shadowBlur = isDim ? 4 : 14;
          targetCtx.shadowOffsetY = 0;
          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r + 6.5, 0, Math.PI * 2);
          targetCtx.strokeStyle = activePalette.teal;
          targetCtx.globalAlpha = (isDim ? 0.5 : 1) * 0.45;
          targetCtx.lineWidth = 2;
          targetCtx.stroke();
          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r + 3.2, 0, Math.PI * 2);
          targetCtx.globalAlpha = (isDim ? 0.5 : 1) * 0.85;
          targetCtx.lineWidth = 1.2;
          targetCtx.stroke();
          targetCtx.restore();

          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
          targetCtx.fillStyle = activePalette.teal;
          targetCtx.fill();

          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, Math.max(2.6, r * 0.28), 0, Math.PI * 2);
          targetCtx.fillStyle = '#ffffff';
          targetCtx.fill();
        } else if (tier === 'landmark') {
          targetCtx.save();
          targetCtx.shadowColor = accentColor;
          targetCtx.shadowBlur = isDim ? 4 : 18;
          targetCtx.shadowOffsetY = 0;
          targetCtx.strokeStyle = accentColor;
          targetCtx.lineWidth = 2;
          for (let i = 0; i < 4; i++) {
            const a0 = i * (Math.PI / 2) + 0.18;
            const a1 = (i + 1) * (Math.PI / 2) - 0.18;
            targetCtx.beginPath();
            targetCtx.arc(screen.x, screen.y, r + 6.5, a0, a1);
            targetCtx.stroke();
          }
          targetCtx.strokeStyle = activePalette.teal;
          targetCtx.lineWidth = 1.4;
          targetCtx.globalAlpha = (isDim ? 0.5 : 1) * 0.78;
          for (const [a0, a1] of [[-0.65, 0.65], [Math.PI - 0.65, Math.PI + 0.65]]) {
            targetCtx.beginPath();
            targetCtx.arc(screen.x, screen.y, r + 10, a0, a1);
            targetCtx.stroke();
          }
          targetCtx.restore();

          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
          targetCtx.fillStyle = activePalette.surface;
          targetCtx.fill();
          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          targetCtx.fillStyle = statusTint;
          targetCtx.fill();
          targetCtx.lineWidth = isSelected || isHovered ? 2.5 : 1.9;
          targetCtx.strokeStyle = accentColor;
          targetCtx.stroke();
        } else if (tier === 'high') {
          targetCtx.save();
          targetCtx.shadowColor = accentColor;
          targetCtx.shadowBlur = isDim ? 3 : 12;
          targetCtx.shadowOffsetY = 0;
          targetCtx.fillStyle = accentColor;
          const reach = r + 7;
          const waist = Math.max(2.2, r * 0.24);
          for (const [dxRay, dyRay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            targetCtx.beginPath();
            targetCtx.moveTo(screen.x + dxRay * reach, screen.y + dyRay * reach);
            targetCtx.lineTo(screen.x - dyRay * waist, screen.y + dxRay * waist);
            targetCtx.lineTo(screen.x + dyRay * waist, screen.y - dxRay * waist);
            targetCtx.closePath();
            targetCtx.fill();
          }
          targetCtx.restore();

          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
          targetCtx.fillStyle = activePalette.surface;
          targetCtx.fill();
          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          targetCtx.fillStyle = statusTint;
          targetCtx.fill();
          targetCtx.lineWidth = isSelected || isHovered ? 2.4 : 1.8;
          targetCtx.strokeStyle = accentColor;
          targetCtx.stroke();
        } else if (node.statusTier === 'missing') {
          targetCtx.save();
          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          targetCtx.setLineDash([4, 3]);
          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r + 3.2, 0, Math.PI * 2);
          targetCtx.strokeStyle = activePalette.warning;
          targetCtx.lineWidth = 1.15;
          targetCtx.stroke();
          targetCtx.restore();

          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
          targetCtx.fillStyle = activePalette.surface;
          targetCtx.fill();
          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          targetCtx.fillStyle = statusTint;
          targetCtx.fill();
          targetCtx.lineWidth = isSelected || isHovered ? 2.4 : 1.7;
          targetCtx.strokeStyle = activePalette.warning;
          targetCtx.stroke();
        } else if (node.statusTier === 'unread') {
          tracePolygon(targetCtx, screen.x, screen.y, r * 1.12, 4, 0);
          targetCtx.fillStyle = activePalette.surface;
          targetCtx.fill();
          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          targetCtx.fillStyle = statusTint;
          targetCtx.fill();
          targetCtx.lineWidth = isSelected || isHovered ? 2.3 : 1.7;
          targetCtx.strokeStyle = activePalette.teal;
          targetCtx.stroke();
        } else {
          targetCtx.beginPath();
          targetCtx.arc(screen.x, screen.y, r * 0.9, 0, Math.PI * 2);
          targetCtx.fillStyle = activePalette.surface;
          targetCtx.fill();
          targetCtx.shadowBlur = 0;
          targetCtx.shadowOffsetY = 0;
          targetCtx.fillStyle = activePalette.panel;
          targetCtx.fill();
          targetCtx.lineWidth = isSelected || isHovered ? 2 : 1.2;
          targetCtx.strokeStyle = activePalette.muted;
          targetCtx.stroke();
        }
      }

      if (isSelected || isHovered) {
        targetCtx.shadowBlur = 0;
        targetCtx.shadowOffsetY = 0;
        targetCtx.beginPath();
        targetCtx.arc(screen.x, screen.y, visualR + (theme === 'classic' ? 6.5 : 5.5), 0, Math.PI * 2);
        targetCtx.strokeStyle = isSelected ? activePalette.ink : activePalette.teal;
        targetCtx.globalAlpha = isSelected ? 0.9 : 0.55;
        targetCtx.lineWidth = 1.6;
        targetCtx.stroke();
      }

      // Co-citation count badge on nodes cited by >=2 seeds
      if (node.role === 'cited' && node.coCiteCount >= 2 && targetTransform.scale >= 0.45) {
        targetCtx.shadowBlur = 0;
        targetCtx.shadowOffsetY = 0;
        targetCtx.fillStyle = node.statusTier === 'missing'
          ? activePalette.warning
          : node.statusTier === 'unread'
            ? activePalette.teal
            : activePalette.ink;
        targetCtx.font = `600 10px ${activePalette.mono || activePalette.sans}`;
        targetCtx.textAlign = 'center';
        targetCtx.textBaseline = 'middle';
        targetCtx.fillText(`×${node.coCiteCount}`, screen.x, screen.y + 0.5);
      }

      // Compact global citation pill at top-right shoulder for landmark nodes in non-classic themes
      if (theme !== 'classic' && node.role === 'cited' && tier === 'landmark' && targetTransform.scale >= 0.45) {
        const citeText = formatCompactCitations(node.citationCount);
        if (citeText) {
          drawCitationPill(
            targetCtx,
            screen.x + visualR * 0.78,
            screen.y - visualR * 0.78,
            citeText,
            accentColor,
            activePalette,
            theme === 'circuit' || theme === 'constellation',
          );
        }
      }

      targetCtx.restore();
    }

    // Editorial capsule labels rendered on top with 2D collision avoidance
    const placedLabels = [];
    for (const node of labelQueue) {
      const sc = nodeScreens.get(node.id);
      if (!sc) continue;
      const isSelected = node.id === selectedId;
      const isHovered = node.id === hoveredId;
      const isDim = selectedId && !activeSet.has(node.id);
      const label = organized && (!node.authors?.length || nodes.length <= 36)
        ? (node.title.length > 22 ? node.title.slice(0, 21) + '…' : node.title)
        : shortAuthorLabel(node);

      targetCtx.save();
      const fontSize = organized ? 11.5 : 11;
      targetCtx.font = `${node.role === 'seed' || isSelected ? '600 ' : '500 '}${fontSize}px ${activePalette.sans}`;
      const metrics = targetCtx.measureText(label);
      const padX = 7;
      const boxW = Math.ceil(metrics.width + padX * 2);
      const boxH = 19;
      const boxX = sc.x - boxW / 2;
      const boxY = sc.y + (sc.visualR ?? sc.r) + 6;

      if (!isSelected && !isHovered) {
        const overlaps = placedLabels.some(
          b => !(boxX + boxW + 4 < b.x || boxX > b.x + b.w + 4 || boxY + boxH + 3 < b.y || boxY > b.y + b.h + 3),
        );
        if (overlaps) {
          targetCtx.restore();
          continue;
        }
      }
      placedLabels.push({ x: boxX, y: boxY, w: boxW, h: boxH });

      targetCtx.globalAlpha = isDim ? 0.55 : 0.98;
      if (isSelected || node.role === 'seed') {
        targetCtx.shadowColor = activePalette.dark ? 'rgba(0,0,0,0.45)' : 'rgba(31,36,38,0.12)';
        targetCtx.shadowBlur = 10;
        targetCtx.shadowOffsetY = 2;
      }
      drawRoundedRect(targetCtx, boxX, boxY, boxW, boxH, 6);
      targetCtx.fillStyle = activePalette.dark ? 'rgba(24, 32, 38, 0.96)' : 'rgba(255, 255, 255, 0.96)';
      targetCtx.fill();

      targetCtx.shadowBlur = 0;
      targetCtx.shadowOffsetY = 0;
      targetCtx.lineWidth = isSelected || node.role === 'seed' ? 1.2 : 1;
      targetCtx.strokeStyle = isSelected
        ? activePalette.ink
        : node.role === 'seed'
          ? activePalette.teal
          : activePalette.line;
      targetCtx.stroke();

      targetCtx.fillStyle = node.role === 'seed' ? activePalette.teal : activePalette.ink;
      targetCtx.textAlign = 'center';
      targetCtx.textBaseline = 'middle';
      targetCtx.fillText(label, sc.x, boxY + boxH / 2 + 0.5);
      targetCtx.restore();
    }

    targetCtx.restore();
  }

  function draw() {
    const timeSec = wantsAmbientLoop() ? performance.now() * 0.001 : 0;
    paint(ctx, width, height, transform, palette, dpr, timeSec);
    syncAmbientLoop();
  }

  canvas.addEventListener('pointerdown', event => {
    stopAnimation();
    const rect = canvas.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const hit = hitTestNode(sx, sy);
    canvas.setPointerCapture(event.pointerId);
    dragState = {
      pointerId: event.pointerId,
      startX: sx,
      startY: sy,
      moved: false,
      nodeId: hit?.id || null,
      originPos: hit ? { ...positions.get(hit.id) } : null,
      originTransform: { ...transform },
    };
  });

  canvas.addEventListener('pointermove', event => {
    const rect = canvas.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    if (dragState && dragState.pointerId === event.pointerId) {
      const dx = sx - dragState.startX;
      const dy = sy - dragState.startY;
      if (Math.hypot(dx, dy) > 4) dragState.moved = true;
      if (dragState.moved) {
        updateTooltip(null, sx, sy);
        if (dragState.nodeId && dragState.originPos) {
          positions.set(dragState.nodeId, {
            x: dragState.originPos.x + dx / transform.scale,
            y: dragState.originPos.y + dy / transform.scale,
          });
        } else {
          transform = {
            ...dragState.originTransform,
            x: dragState.originTransform.x + dx,
            y: dragState.originTransform.y + dy,
          };
        }
        draw();
      }
      return;
    }

    const hit = hitTestNode(sx, sy);
    const nextHover = hit?.id || null;
    canvas.style.cursor = hit ? 'pointer' : 'grab';
    if (nextHover !== hoveredId) {
      hoveredId = nextHover;
      draw();
    }
    updateTooltip(hit, sx, sy);
  });

  canvas.addEventListener('pointerup', event => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const wasMoved = dragState.moved;
    const hitId = dragState.nodeId;
    dragState = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!wasMoved) {
      onSelect?.(hitId);
    }
  });

  canvas.addEventListener('pointerleave', () => {
    if (!dragState) {
      hoveredId = null;
      updateTooltip(null, 0, 0);
      draw();
    }
  });

  canvas.addEventListener('wheel', event => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const factor = event.deltaY < 0 ? 1.14 : 1 / 1.14;
    zoomBy(factor, event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });

  return {
    setStretch(value, heightFactor) {
      if (stretch === value && vertical === heightFactor) return;
      vertical = heightFactor;
      stretch = value;
      if (organized && nodes.length) {
        axisWidth = timelineWidth(nodes, years, true) * stretch;
        const target = arrangedPositions();
        transitionTo(target);
      }
    },
    setOrganized(enabled) {
      if (organized === enabled) return;
      if (enabled && !animation) originalPositions = new Map(positions);
      organized = enabled;
      axisWidth = timelineWidth(nodes, years, organized) * (organized ? stretch : 1);
      if (nodes.length) transitionTo(enabled ? arrangedPositions() : originalPositions);
    },
    setData({ nodes: nextNodes, edges: nextEdges, layout: nextLayout = 'force', years: nextYears = [0, 0], relayout = false }) {
      const sameStructure = !relayout
        && nextLayout === layout
        && (!organized || (edges.length === nextEdges.length && edges.every((e, i) => e.id === nextEdges[i].id)))
        && nextNodes.length === nodes.length
        && nextNodes.every((n, i) => n.id === nodes[i]?.id);
      nodes = nextNodes;
      edges = nextEdges;
      layout = nextLayout;
      years = nextYears;
      citationTiers = classifyCitationTiers(nodes, edges);
      if (!sameStructure) {
        axisWidth = timelineWidth(nodes, years, organized) * (organized ? stretch : 1);
        stopAnimation();
        originalPositions = layout === 'timeline'
          ? computeTimelinePositions(nodes, years)
          : runForceLayout(nodes, edges, relayout ? new Map() : originalPositions);
        positions = organized ? arrangedPositions() : originalPositions;
        fit();
      } else {
        draw();
      }
    },
    setTheme(nextTheme) {
      const normalized = normalizeCitationTheme(nextTheme);
      if (normalized === graphThemeId) return;
      graphThemeId = normalized;
      draw();
    },
    setSelection(id) {
      selectedId = id || null;
      draw();
    },
    focusNode,
    fit,
    zoomBy,
    exportPng() {
      if (!nodes.length) return null;
      const offscreen = document.createElement('canvas');
      offscreen.width = Math.round(width * 2);
      offscreen.height = Math.round(height * 2);
      const offCtx = offscreen.getContext('2d');
      offCtx.fillStyle = graphThemeId === 'baroque' ? baroqueColors(palette).bgEdge : palette.paper;
      offCtx.fillRect(0, 0, offscreen.width, offscreen.height);
      paint(offCtx, width, height, transform, palette, 2, 0);
      return offscreen.toDataURL('image/png');
    },
    dispose() {
      stopAnimation();
      document.removeEventListener('visibilitychange', onVisibility);
      reducedMotionQuery?.removeEventListener?.('change', onVisibility);
      observer.disconnect();
      ro.disconnect();
      canvas.remove();
    },
  };
}
