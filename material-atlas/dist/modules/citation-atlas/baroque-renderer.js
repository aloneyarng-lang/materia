import { shortAuthorLabel } from './model.js';
import { formatCompactCitations } from './themes.js';

/**
 * Build the dark Prussian-navy / light museum-parchment Baroque palette
 * harmonized with Materia's light/dark theme mode.
 */
export function baroqueColors(pal) {
  if (pal.dark) {
    return {
      dark: true,
      bgCenter: '#111f3d',
      bgMid: '#091122',
      bgEdge: '#050a14',
      goldBright: '#fce8b2',
      goldMain: '#dfba69',
      goldMid: '#b98d3c',
      goldDark: '#6e501f',
      lapisBright: '#3d74cc',
      lapisMain: '#20458c',
      lapisDeep: '#10244d',
      pearlCore: '#f6fbff',
      pearlTint: '#a8d5ee',
      amberBright: '#f5b96b',
      amberDeep: '#9e5d1e',
      cartoucheBg: 'rgba(9, 16, 33, 0.94)',
      plateBg: '#0b1630',
      textMain: '#f5e3b3',
      textMuted: '#a69672',
      serif: pal.serif || 'Georgia, "Times New Roman", serif',
      sans: pal.sans || 'sans-serif',
      mono: pal.mono || 'monospace',
    };
  }
  return {
    dark: false,
    bgCenter: '#fbf6ea',
    bgMid: '#f2e8d4',
    bgEdge: '#e6d6b8',
    goldBright: '#d4a64a',
    goldMain: '#9c7124',
    goldMid: '#7d5616',
    goldDark: '#4f350b',
    lapisBright: '#2f5ea8',
    lapisMain: '#1e4280',
    lapisDeep: '#132a54',
    pearlCore: '#ffffff',
    pearlTint: '#cfe4f2',
    amberBright: '#c97828',
    amberDeep: '#8c4810',
    cartoucheBg: 'rgba(250, 244, 230, 0.96)',
    plateBg: '#efe4cc',
    textMain: '#473210',
    textMuted: '#7d6844',
    serif: pal.serif || 'Georgia, "Times New Roman", serif',
    sans: pal.sans || 'sans-serif',
    mono: pal.mono || 'monospace',
  };
}

function drawFiligreeCorner(ctx, cx, cy, sx, sy, c) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(sx, sy);

  ctx.strokeStyle = c.goldMain;
  ctx.lineWidth = 1.25;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Outer scrolled acanthus bracket
  ctx.beginPath();
  ctx.moveTo(0, 34);
  ctx.bezierCurveTo(2, 18, 12, 10, 24, 10);
  ctx.bezierCurveTo(30, 10, 33, 15, 29, 19);
  ctx.bezierCurveTo(25, 22, 20, 19, 22, 15);
  ctx.moveTo(34, 0);
  ctx.bezierCurveTo(18, 2, 10, 12, 10, 24);
  ctx.bezierCurveTo(10, 30, 15, 33, 19, 29);
  ctx.bezierCurveTo(22, 25, 19, 20, 15, 22);
  ctx.stroke();

  // Secondary inner flourish
  ctx.strokeStyle = c.goldBright;
  ctx.globalAlpha = 0.72;
  ctx.lineWidth = 0.95;
  ctx.beginPath();
  ctx.moveTo(4, 4);
  ctx.quadraticCurveTo(14, 5, 18, 13);
  ctx.moveTo(4, 4);
  ctx.quadraticCurveTo(5, 14, 13, 18);
  ctx.moveTo(4, 4);
  ctx.lineTo(14, 14);
  ctx.stroke();

  // Corner diamond jewel
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = c.goldBright;
  ctx.beginPath();
  ctx.moveTo(4, 0.5);
  ctx.lineTo(7.5, 4);
  ctx.lineTo(4, 7.5);
  ctx.lineTo(0.5, 4);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * Draw Prussian-navy celestial atlas backdrop, zodiac degree circle,
 * meridian arcs, gilded double frame, and 4 symmetrical Baroque corner scrolls.
 */
export function drawBaroqueBackdrop(ctx, width, height, transform, activePalette, timeSec = 0) {
  const c = baroqueColors(activePalette);
  ctx.save();

  // Rich radial celestial base
  const bg = ctx.createRadialGradient(
    width * 0.5, height * 0.48, 24,
    width * 0.5, height * 0.48, Math.max(width, height) * 0.74,
  );
  bg.addColorStop(0, c.bgCenter);
  bg.addColorStop(0.58, c.bgMid);
  bg.addColorStop(1, c.bgEdge);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Subtle parallaxed celestial sphere & ecliptic circles
  const sphereX = width * 0.5 + (transform.x - width * 0.5) * 0.12;
  const sphereY = height * 0.52 + (transform.y - height * 0.52) * 0.12;
  const sphereR = Math.max(180, Math.min(width, height) * 0.46);

  ctx.save();
  ctx.strokeStyle = c.goldMain;
  ctx.globalAlpha = c.dark ? 0.2 : 0.22;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(sphereX, sphereY, sphereR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = c.dark ? 0.13 : 0.15;
  ctx.beginPath();
  ctx.arc(sphereX, sphereY, sphereR - 9, 0, Math.PI * 2);
  ctx.stroke();

  // Fine 2-deg / 10-deg zodiac ticks around perimeter
  for (let deg = 0; deg < 360; deg += 2) {
    const rad = (deg * Math.PI) / 180;
    const major = deg % 10 === 0;
    const inner = sphereR - (major ? 9 : 4.5);
    ctx.globalAlpha = major ? (c.dark ? 0.24 : 0.26) : (c.dark ? 0.11 : 0.14);
    ctx.lineWidth = major ? 1 : 0.65;
    ctx.beginPath();
    ctx.moveTo(sphereX + Math.cos(rad) * inner, sphereY + Math.sin(rad) * inner);
    ctx.lineTo(sphereX + Math.cos(rad) * sphereR, sphereY + Math.sin(rad) * sphereR);
    ctx.stroke();
  }

  // Faint degree markers
  ctx.fillStyle = c.goldMain;
  ctx.globalAlpha = c.dark ? 0.26 : 0.3;
  ctx.font = `500 9.5px ${c.serif}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [deg, label] of [[35, '30°'], [145, '200°'], [215, '120°'], [325, '330°']]) {
    const rad = (deg * Math.PI) / 180;
    const lr = sphereR - 18;
    ctx.fillText(label, sphereX + Math.cos(rad) * lr, sphereY + Math.sin(rad) * lr);
  }

  // Sweeping meridian & equatorial celestial arcs
  ctx.globalAlpha = c.dark ? 0.12 : 0.15;
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  ctx.moveTo(18, sphereY);
  ctx.lineTo(width - 18, sphereY);
  ctx.moveTo(sphereX, 34);
  ctx.lineTo(sphereX, height - 18);
  ctx.stroke();

  for (const rxFactor of [0.35, 0.68]) {
    ctx.beginPath();
    ctx.ellipse(sphereX, sphereY, sphereR * rxFactor, sphereR, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(sphereX, sphereY, sphereR, sphereR * 0.44, -0.18, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Sparse twinkling star dust
  const step = 64;
  const ox = ((transform.x * 0.25 % step) + step) % step;
  const oy = ((transform.y * 0.25 % step) + step) % step;
  const baseIx = Math.floor((ox - transform.x * 0.25) / step);
  const baseIy = Math.floor((oy - transform.y * 0.25) / step);
  ctx.save();
  for (let ix = 0, gx = ox; gx < width; ix++, gx += step) {
    for (let iy = 0, gy = oy; gy < height; iy++, gy += step) {
      const h = Math.abs(((baseIx + ix) * 17 + (baseIy + iy) * 31) % 19);
      if (h !== 3 && h !== 11) continue;
      const pulse = timeSec > 0 ? 0.55 + 0.45 * Math.sin(timeSec * 1.4 + h) : 0.85;
      ctx.globalAlpha = (c.dark ? 0.22 : 0.18) * pulse;
      ctx.fillStyle = c.goldBright;
      const s = h === 3 ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(gx, gy - s);
      ctx.lineTo(gx + s * 0.28, gy - s * 0.28);
      ctx.lineTo(gx + s, gy);
      ctx.lineTo(gx + s * 0.28, gy + s * 0.28);
      ctx.lineTo(gx, gy + s);
      ctx.lineTo(gx - s * 0.28, gy + s * 0.28);
      ctx.lineTo(gx - s, gy);
      ctx.lineTo(gx - s * 0.28, gy - s * 0.28);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();

  // Gilded double inner border + 4 Baroque corner filigree brackets
  const pad = 9;
  ctx.save();
  ctx.strokeStyle = c.goldMain;
  ctx.globalAlpha = c.dark ? 0.42 : 0.45;
  ctx.lineWidth = 1;
  ctx.strokeRect(pad, pad, Math.max(0, width - pad * 2), Math.max(0, height - pad * 2));
  ctx.globalAlpha = c.dark ? 0.18 : 0.2;
  ctx.strokeRect(pad + 3.5, pad + 3.5, Math.max(0, width - (pad + 3.5) * 2), Math.max(0, height - (pad + 3.5) * 2));
  ctx.restore();

  drawFiligreeCorner(ctx, pad + 2, pad + 2, 1, 1, c);
  drawFiligreeCorner(ctx, width - pad - 2, pad + 2, -1, 1, c);
  drawFiligreeCorner(ctx, pad + 2, height - pad - 2, 1, -1, c);
  drawFiligreeCorner(ctx, width - pad - 2, height - pad - 2, -1, -1, c);

  ctx.restore();
}

/**
 * Draw ornate gilded Baroque timeline datum cartouche across the top edge.
 */
export function drawBaroqueTimelineBar(
  ctx,
  width,
  height,
  transform,
  activePalette,
  { organized, layout, axisTicks, years, axisWidth },
) {
  const showOrganized = organized && axisTicks.length > 0;
  const showTimeline = !organized && layout === 'timeline' && years[1] > years[0];
  if (!showOrganized && !showTimeline) return false;

  const c = baroqueColors(activePalette);
  const barX = 46;
  const barY = 7;
  const barW = Math.max(120, width - 92);
  const barH = 27;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, 6);
  ctx.fillStyle = c.cartoucheBg;
  ctx.fill();
  ctx.strokeStyle = c.goldMain;
  ctx.lineWidth = 1.1;
  ctx.stroke();

  ctx.beginPath();
  ctx.roundRect(barX + 2.5, barY + 2.5, Math.max(0, barW - 5), barH - 5, 4);
  ctx.strokeStyle = c.goldMid;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const tickEntries = [];
  if (showOrganized) {
    const prioritized = [...axisTicks].sort((a, b) => Number(b.hasSeed) - Number(a.hasSeed) || b.count - a.count);
    const shownX = [];
    for (const tick of prioritized) {
      const sx = tick.x * transform.scale + transform.x;
      if (sx < barX + 26 || sx > barX + barW - 26) continue;
      if (shownX.some(x => Math.abs(x - sx) < 48)) continue;
      shownX.push(sx);
      tickEntries.push({ label: tick.label, sx, hasSeed: tick.hasSeed });
    }
  } else {
    const span = years[1] - years[0];
    const step = span > 35 ? 10 : span > 15 ? 5 : 2;
    for (let y = Math.ceil(years[0] / step) * step; y <= years[1]; y += step) {
      const wx = ((y - years[0]) / span - 0.5) * axisWidth;
      const sx = wx * transform.scale + transform.x;
      if (sx < barX + 24 || sx > barX + barW - 24) continue;
      tickEntries.push({ label: String(y), sx, hasSeed: false });
    }
  }

  for (const entry of tickEntries) {
    ctx.save();
    ctx.strokeStyle = entry.hasSeed ? c.goldBright : c.goldMid;
    ctx.globalAlpha = entry.hasSeed ? 0.34 : 0.2;
    ctx.lineWidth = 0.9;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(entry.sx, barY + barH + 1);
    ctx.lineTo(entry.sx, height - 20);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = entry.hasSeed ? c.goldBright : c.textMain;
    ctx.font = `${entry.hasSeed ? '700 ' : '500 '}11px ${c.serif}`;
    ctx.fillText(entry.label, entry.sx, barY + barH / 2 + 0.5);
    ctx.restore();
  }

  ctx.restore();
  return true;
}

function evalQuad(p0, p1, p2, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
    tx: 2 * mt * (p1.x - p0.x) + 2 * t * (p2.x - p1.x),
    ty: 2 * mt * (p1.y - p0.y) + 2 * t * (p2.y - p1.y),
  };
}

function evalCubic(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
    y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
    tx: 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    ty: 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
}

function drawCelestialArrow(ctx, endX, endY, ux, uy, color, isLit) {
  const len = isLit ? 9.5 : 7;
  const half = isLit ? 3.5 : 2.6;
  const notch = len * 0.34;
  ctx.save();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - ux * len - uy * half, endY - uy * len + ux * half);
  ctx.lineTo(endX - ux * (len - notch), endY - uy * (len - notch));
  ctx.lineTo(endX - ux * len + uy * half, endY - uy * len - ux * half);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Draw Baroque double-stranded gilded Bezier links, companion filigree dotted arcs,
 * midpoint diamond clasps, celestial dart arrows, and optional flowing gold pulses.
 */
export function drawBaroqueEdges(
  ctx,
  {
    edges,
    positions,
    nodeById,
    selectedId,
    organized,
    denseGraph,
    transform,
    activePalette,
    nodeRadiusFn,
    nodeVisualPadFn,
    timeSec = 0,
  },
) {
  const c = baroqueColors(activePalette);
  const scaleFactor = Math.max(0.55, Math.min(1.45, transform.scale));

  for (let idx = 0; idx < edges.length; idx++) {
    const edge = edges[idx];
    const from = positions.get(edge.source);
    const to = positions.get(edge.target);
    const targetNode = nodeById.get(edge.target);
    if (!from || !to || !targetNode) continue;

    const isLit = Boolean(selectedId && (edge.source === selectedId || edge.target === selectedId));
    const isDim = Boolean(selectedId && !isLit);
    const p1 = { x: from.x * transform.scale + transform.x, y: from.y * transform.scale + transform.y };
    const p2 = { x: to.x * transform.scale + transform.x, y: to.y * transform.scale + transform.y };
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 6) continue;

    const targetR = nodeRadiusFn(targetNode) * scaleFactor + nodeVisualPadFn(targetNode) + 5;
    const sameCol = organized && Math.abs(dx) < 10;

    let endX, endY, ux, uy, sampleAt;
    let tracePath;

    if (sameCol) {
      ux = -1;
      uy = 0;
      endX = p2.x + targetR;
      endY = p2.y;
      const arcOffset = Math.min(72, Math.max(26, Math.abs(dy) * 0.28));
      const c1 = { x: p1.x + arcOffset, y: p1.y };
      const c2 = { x: p2.x + arcOffset, y: p2.y };
      const end = { x: endX, y: endY };
      tracePath = (off = 0) => {
        ctx.beginPath();
        ctx.moveTo(p1.x + off, p1.y);
        ctx.bezierCurveTo(c1.x + off, c1.y, c2.x + off, c2.y, end.x + off * 0.4, end.y);
      };
      sampleAt = t => evalCubic(p1, c1, c2, end, t);
    } else if (organized) {
      ux = Math.sign(dx) || 1;
      uy = 0;
      endX = p2.x - ux * targetR;
      endY = p2.y;
      const dir = Math.sign(endX - p1.x) || 1;
      const pull = Math.min(Math.abs(endX - p1.x) * 0.48, 210);
      const c1 = { x: p1.x + dir * pull, y: p1.y };
      const c2 = { x: endX - dir * pull, y: endY };
      const end = { x: endX, y: endY };
      tracePath = (off = 0) => {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y + off);
        ctx.bezierCurveTo(c1.x, c1.y + off, c2.x, c2.y + off, end.x, end.y + off * 0.35);
      };
      sampleAt = t => evalCubic(p1, c1, c2, end, t);
    } else {
      const nx = -dy / len;
      const ny = dx / len;
      const sign = ((edge.id?.length || 0) % 2 === 0 ? 1 : -1);
      const bend = Math.min(34, len * 0.13);
      const ctrl = {
        x: (p1.x + p2.x) / 2 + nx * bend * sign,
        y: (p1.y + p2.y) / 2 + ny * bend * sign,
      };
      const tdx = p2.x - ctrl.x;
      const tdy = p2.y - ctrl.y;
      const tLen = Math.hypot(tdx, tdy) || 1;
      ux = tdx / tLen;
      uy = tdy / tLen;
      endX = p2.x - ux * targetR;
      endY = p2.y - uy * targetR;
      const end = { x: endX, y: endY };
      tracePath = (off = 0) => {
        ctx.beginPath();
        ctx.moveTo(p1.x + nx * off * 0.4, p1.y + ny * off * 0.4);
        ctx.quadraticCurveTo(ctrl.x + nx * off, ctrl.y + ny * off, end.x + nx * off * 0.4, end.y + ny * off * 0.4);
      };
      sampleAt = t => evalQuad(p1, ctrl, end, t);
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = organized
      ? (isLit ? 0.96 : isDim ? 0.08 : edge.kind === 'seed_ref' ? (denseGraph ? 0.28 : 0.44) : (denseGraph ? 0.16 : 0.26))
      : (isDim ? 0.16 : isLit ? 0.96 : edge.kind === 'seed_ref' ? 0.62 : 0.42);

    const strokeColor = isLit ? c.goldBright : edge.kind === 'seed_ref' ? c.goldMain : c.goldMid;
    if (isLit) {
      ctx.shadowColor = c.goldBright;
      ctx.shadowBlur = 9;
    }

    if (Math.hypot(endX - p1.x, endY - p1.y) > 4 && !isLit) {
      const grad = ctx.createLinearGradient(p1.x, p1.y, endX, endY);
      grad.addColorStop(0, c.goldDark);
      grad.addColorStop(0.35, strokeColor);
      grad.addColorStop(1, c.goldBright);
      ctx.strokeStyle = grad;
    } else {
      ctx.strokeStyle = strokeColor;
    }

    ctx.lineWidth = isLit ? 2 : organized ? (edge.kind === 'seed_ref' ? 1.15 : 0.85) : 1.15;
    if (edge.kind === 'ref_ref' && !isLit) ctx.setLineDash([1.6, 3.6]);

    tracePath(0);
    ctx.stroke();

    // Double-strand companion dotted filigree curve + midpoint diamond clasp
    if ((isLit || (edge.kind === 'seed_ref' && !isDim && !denseGraph)) && len > 46) {
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.setLineDash([1.3, 2.8]);
      ctx.lineWidth = 0.85;
      ctx.strokeStyle = c.goldBright;
      ctx.globalAlpha *= isLit ? 0.72 : 0.45;
      tracePath(4.5);
      ctx.stroke();
      ctx.restore();

      const mid = sampleAt(0.5);
      const claspSize = isLit ? 3.4 : 2.3;
      ctx.save();
      ctx.setLineDash([]);
      ctx.shadowBlur = isLit ? 5 : 0;
      ctx.shadowColor = c.goldBright;
      ctx.fillStyle = isLit ? c.pearlCore : c.goldBright;
      ctx.strokeStyle = c.goldDark;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(mid.x, mid.y - claspSize);
      ctx.lineTo(mid.x + claspSize, mid.y);
      ctx.lineTo(mid.x, mid.y + claspSize);
      ctx.lineTo(mid.x - claspSize, mid.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Subtle flowing gold pulse on lit edges when ambient animation is active
    if (isLit && timeSec > 0) {
      const phase = ((timeSec * 0.48 + (idx % 5) * 0.17) % 1 + 1) % 1;
      const pt = sampleAt(phase);
      ctx.save();
      ctx.shadowColor = c.goldBright;
      ctx.shadowBlur = 8;
      ctx.fillStyle = c.pearlCore;
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (!organized || isLit || !denseGraph || edge.kind === 'ref_ref') {
      drawCelestialArrow(ctx, endX, endY, ux, uy, isLit ? c.goldBright : strokeColor, isLit);
    }

    ctx.restore();
  }
}

function drawFacetedCompassStar(ctx, cx, cy, outerR, innerR, points, brightColor, darkColor, rotation = -Math.PI / 2) {
  for (let i = 0; i < points; i++) {
    const aTip = rotation + (i * Math.PI * 2) / points;
    const aLeft = aTip - Math.PI / points;
    const aRight = aTip + Math.PI / points;
    const tipX = cx + Math.cos(aTip) * outerR;
    const tipY = cy + Math.sin(aTip) * outerR;
    const leftX = cx + Math.cos(aLeft) * innerR;
    const leftY = cy + Math.sin(aLeft) * innerR;
    const rightX = cx + Math.cos(aRight) * innerR;
    const rightY = cy + Math.sin(aRight) * innerR;

    // Left sunlit facet
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(tipX, tipY);
    ctx.closePath();
    ctx.fillStyle = brightColor;
    ctx.fill();

    // Right shaded metallic facet
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fillStyle = darkColor;
    ctx.fill();
  }
}

function drawMilgrainRing(ctx, cx, cy, ringR, count, beadR, c, detailed) {
  if (!detailed) {
    ctx.save();
    ctx.setLineDash([1.6, 2.6]);
    ctx.strokeStyle = c.goldBright;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.save();
  for (let i = 0; i < count; i++) {
    const angle = (i * Math.PI * 2) / count;
    const bx = cx + Math.cos(angle) * ringR;
    const by = cy + Math.sin(angle) * ringR;
    ctx.beginPath();
    ctx.arc(bx, by, beadR, 0, Math.PI * 2);
    ctx.fillStyle = c.goldMain;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bx - beadR * 0.28, by - beadR * 0.28, Math.max(0.45, beadR * 0.4), 0, Math.PI * 2);
    ctx.fillStyle = c.goldBright;
    ctx.fill();
  }
  ctx.restore();
}

function drawBaroqueCartouche(ctx, cx, cy, text, c, emphasized = false) {
  ctx.save();
  ctx.font = `${emphasized ? '600 ' : '500 '}10.5px ${c.serif}`;
  const metrics = ctx.measureText(text);
  const padX = 11;
  const w = Math.ceil(metrics.width + padX * 2);
  const h = 19;
  const left = cx - w / 2;
  const right = cx + w / 2;
  const top = cy - h / 2;
  const bottom = cy + h / 2;
  const ear = 4.5;

  ctx.beginPath();
  ctx.moveTo(left + 6, top);
  ctx.lineTo(right - 6, top);
  ctx.quadraticCurveTo(right - 2, top, right, cy - 3);
  ctx.lineTo(right + ear, cy);
  ctx.lineTo(right, cy + 3);
  ctx.quadraticCurveTo(right - 2, bottom, right - 6, bottom);
  ctx.lineTo(left + 6, bottom);
  ctx.quadraticCurveTo(left + 2, bottom, left, cy + 3);
  ctx.lineTo(left - ear, cy);
  ctx.lineTo(left, cy - 3);
  ctx.quadraticCurveTo(left + 2, top, left + 6, top);
  ctx.closePath();

  ctx.fillStyle = c.cartoucheBg;
  ctx.fill();
  ctx.lineWidth = emphasized ? 1.35 : 1;
  ctx.strokeStyle = emphasized ? c.goldBright : c.goldMain;
  ctx.stroke();

  ctx.fillStyle = emphasized ? c.goldBright : c.textMain;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 0.5);
  ctx.restore();
}

function drawSunburstMedallion(ctx, cx, cy, r, c, detailed) {
  // Soft radial golden aura
  const aura = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * 2.05);
  aura.addColorStop(0, c.dark ? 'rgba(252, 232, 178, 0.28)' : 'rgba(212, 166, 74, 0.22)');
  aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 2.05, 0, Math.PI * 2);
  ctx.fill();

  // 12 alternating rays: 6 straight faceted, 6 sinuous flame rays
  const outer = r * 1.92;
  const baseR = r * 0.72;
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 12;
    const tipX = cx + Math.cos(a) * outer;
    const tipY = cy + Math.sin(a) * outer;
    const aL = a - 0.17;
    const aR = a + 0.17;
    const lx = cx + Math.cos(aL) * baseR;
    const ly = cy + Math.sin(aL) * baseR;
    const rx = cx + Math.cos(aR) * baseR;
    const ry = cy + Math.sin(aR) * baseR;

    if (i % 2 === 0 || !detailed) {
      // Straight faceted ray
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(lx, ly);
      ctx.lineTo(tipX, tipY);
      ctx.closePath();
      ctx.fillStyle = c.goldBright;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(rx, ry);
      ctx.closePath();
      ctx.fillStyle = c.goldMid;
      ctx.fill();
    } else {
      // Sinuous Baroque flame ray
      const nx = -Math.sin(a);
      const ny = Math.cos(a);
      const mid1 = r * 1.15;
      const mid2 = r * 1.55;
      const c1x = cx + Math.cos(a) * mid1 + nx * r * 0.22;
      const c1y = cy + Math.sin(a) * mid1 + ny * r * 0.22;
      const c2x = cx + Math.cos(a) * mid2 - nx * r * 0.2;
      const c2y = cy + Math.sin(a) * mid2 - ny * r * 0.2;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, tipX, tipY);
      ctx.bezierCurveTo(c2x - nx * r * 0.08, c2y - ny * r * 0.08, c1x - nx * r * 0.08, c1y - ny * r * 0.08, rx, ry);
      ctx.closePath();
      ctx.fillStyle = c.goldMain;
      ctx.fill();
      ctx.strokeStyle = c.goldDark;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }

  // Double gold bezel + luminous pearl-aquamarine cabochon core
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.78, 0, Math.PI * 2);
  ctx.fillStyle = c.goldMain;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = c.goldDark;
  ctx.stroke();

  const cab = ctx.createRadialGradient(
    cx - r * 0.22, cy - r * 0.22, r * 0.08,
    cx, cy, r * 0.62,
  );
  cab.addColorStop(0, c.pearlCore);
  cab.addColorStop(0.65, c.pearlTint);
  cab.addColorStop(1, c.lapisBright);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
  ctx.fillStyle = cab;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = c.goldBright;
  ctx.stroke();
}

function drawArmillaryLandmark(ctx, cx, cy, r, statusTier, c, detailed, timeSec, isLandmark) {
  const outerRingR = isLandmark ? r + 11.5 : r + 6.5;
  const plateR = isLandmark ? r + 8 : r + 4;
  const tilt = -0.58;
  const rx = outerRingR - 0.5;
  const ry = outerRingR * (isLandmark ? 0.34 : 0.3);

  // Subtle warm gold halo
  const pulse = timeSec > 0 ? 0.88 + 0.12 * Math.sin(timeSec * 1.6) : 1;
  const halo = ctx.createRadialGradient(cx, cy, plateR * 0.4, cx, cy, outerRingR + 8);
  halo.addColorStop(0, c.dark ? `rgba(252, 232, 178, ${(0.22 * pulse).toFixed(3)})` : `rgba(212, 166, 74, ${(0.18 * pulse).toFixed(3)})`);
  halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, outerRingR + 8, 0, Math.PI * 2);
  ctx.fill();

  // Inner celestial plate tinted subtly by statusTier
  ctx.beginPath();
  ctx.arc(cx, cy, plateR, 0, Math.PI * 2);
  ctx.fillStyle = statusTier === 'unread' ? c.lapisDeep : c.plateBg;
  ctx.fill();
  ctx.lineWidth = 1.15;
  ctx.strokeStyle = statusTier === 'missing' ? c.amberBright : c.goldMid;
  ctx.stroke();

  if (detailed) {
    ctx.save();
    ctx.strokeStyle = c.goldMid;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.arc(cx, cy, plateR * 0.65, 0, Math.PI * 2);
    ctx.moveTo(cx - plateR, cy);
    ctx.lineTo(cx + plateR, cy);
    ctx.moveTo(cx, cy - plateR);
    ctx.lineTo(cx, cy + plateR);
    ctx.stroke();
    ctx.restore();
  }

  // Back half of tilted ecliptic ring (behind compass rose)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, Math.PI, Math.PI * 2);
  ctx.strokeStyle = c.goldDark;
  ctx.lineWidth = isLandmark ? 3.2 : 2.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, Math.PI, Math.PI * 2);
  ctx.strokeStyle = c.goldMid;
  ctx.lineWidth = isLandmark ? 1.5 : 1.1;
  ctx.stroke();
  ctx.restore();

  // Outer Milgrain pearl ring (24 beads for landmark, 16 for high)
  drawMilgrainRing(
    ctx,
    cx,
    cy,
    outerRingR,
    isLandmark ? 24 : 16,
    isLandmark ? 1.55 : 1.2,
    c,
    detailed,
  );

  // Center 8-point faceted metallic compass rose
  const starR = isLandmark ? r + 5.2 : r + 2.5;
  drawFacetedCompassStar(
    ctx,
    cx,
    cy,
    starR,
    starR * 0.31,
    8,
    statusTier === 'missing' ? c.amberBright : c.goldBright,
    statusTier === 'missing' ? c.amberDeep : c.goldDark,
  );

  // Ice-pearl core glint
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(2.2, starR * 0.2), 0, Math.PI * 2);
  ctx.fillStyle = c.pearlCore;
  ctx.fill();

  // Front half of tilted ecliptic gold band (crossing OVER the lower star rays!)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI);
  ctx.strokeStyle = c.goldDark;
  ctx.lineWidth = isLandmark ? 4.2 : 2.8;
  ctx.stroke();

  const bandGrad = ctx.createLinearGradient(-rx, 0, rx, 0);
  bandGrad.addColorStop(0, c.goldMid);
  bandGrad.addColorStop(0.5, c.goldBright);
  bandGrad.addColorStop(1, c.goldMid);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI);
  ctx.strokeStyle = bandGrad;
  ctx.lineWidth = isLandmark ? 2.6 : 1.7;
  ctx.stroke();

  if (isLandmark && detailed) {
    ctx.strokeStyle = c.goldDark;
    ctx.lineWidth = 0.7;
    for (let a = 0.2; a < Math.PI - 0.15; a += 0.28) {
      const px = Math.cos(a) * rx;
      const py = Math.sin(a) * ry;
      ctx.beginPath();
      ctx.moveTo(px * 0.94, py * 0.94);
      ctx.lineTo(px * 1.04, py * 1.04);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Draw all Baroque nodes (12-ray sunburst seeds, armillary spheres, compass stars,
 * lapis lazuli discs, and quiet gold micro-stars) and return screen bounds for labels.
 */
export function drawBaroqueNodes(
  ctx,
  {
    orderedNodes,
    positions,
    transform,
    activePalette,
    selectedId,
    hoveredId,
    activeSet,
    nodeRadiusFn,
    nodeTierFn,
    timeSec = 0,
  },
) {
  const c = baroqueColors(activePalette);
  const scaleFactor = Math.max(0.55, Math.min(1.45, transform.scale));
  const detailed = transform.scale >= 0.48;
  const nodeScreens = new Map();

  for (const node of orderedNodes) {
    const pos = positions.get(node.id);
    if (!pos) continue;
    const screen = {
      x: pos.x * transform.scale + transform.x,
      y: pos.y * transform.scale + transform.y,
    };
    const r = nodeRadiusFn(node) * scaleFactor;
    const tier = nodeTierFn(node);
    const visualR = node.role === 'seed'
      ? r * 1.72
      : tier === 'landmark'
        ? r + 14.5
        : tier === 'high'
          ? r + 8.5
          : r;
    nodeScreens.set(node.id, { ...screen, r, visualR, tier });

    const isSelected = node.id === selectedId;
    const isHovered = node.id === hoveredId;
    const isDim = Boolean(selectedId && !activeSet.has(node.id));

    ctx.save();
    ctx.globalAlpha = isDim ? 0.48 : 1;

    if (node.role === 'seed') {
      drawSunburstMedallion(ctx, screen.x, screen.y, r, c, detailed);
    } else if (tier === 'landmark' || tier === 'high') {
      drawArmillaryLandmark(ctx, screen.x, screen.y, r, node.statusTier, c, detailed, timeSec, tier === 'landmark');
    } else if (node.statusTier === 'missing') {
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, r * 0.92, 0, Math.PI * 2);
      ctx.fillStyle = c.plateBg;
      ctx.fill();
      if (detailed) {
        drawMilgrainRing(ctx, screen.x, screen.y, r + 1.2, 12, 0.95, c, true);
      } else {
        ctx.lineWidth = 1;
        ctx.strokeStyle = c.amberBright;
        ctx.stroke();
      }
      drawFacetedCompassStar(ctx, screen.x, screen.y, r * 1.05, r * 0.34, 8, c.amberBright, c.amberDeep);
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, Math.max(1.5, r * 0.18), 0, Math.PI * 2);
      ctx.fillStyle = c.pearlCore;
      ctx.fill();
    } else if (node.statusTier === 'unread') {
      const lapis = ctx.createRadialGradient(
        screen.x - r * 0.25, screen.y - r * 0.25, r * 0.1,
        screen.x, screen.y, r,
      );
      lapis.addColorStop(0, c.lapisBright);
      lapis.addColorStop(0.7, c.lapisMain);
      lapis.addColorStop(1, c.lapisDeep);
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
      ctx.fillStyle = lapis;
      ctx.fill();
      ctx.lineWidth = isSelected || isHovered ? 2.2 : 1.5;
      ctx.strokeStyle = c.goldMain;
      ctx.stroke();

      if (detailed) {
        ctx.save();
        ctx.strokeStyle = c.goldBright;
        ctx.globalAlpha *= 0.72;
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(screen.x - r * 0.76, screen.y);
        ctx.lineTo(screen.x + r * 0.76, screen.y);
        ctx.moveTo(screen.x, screen.y - r * 0.76);
        ctx.lineTo(screen.x, screen.y + r * 0.76);
        ctx.stroke();
        ctx.restore();
      }
      if (node.coCiteCount < 2) {
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, Math.max(1.4, r * 0.2), 0, Math.PI * 2);
        ctx.fillStyle = c.pearlCore;
        ctx.fill();
      }
    } else {
      // Quiet antique-gold celestial star-dot for read nodes
      drawFacetedCompassStar(ctx, screen.x, screen.y, r * 0.78, r * 0.28, 4, c.goldMain, c.goldDark);
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, Math.max(1.3, r * 0.16), 0, Math.PI * 2);
      ctx.fillStyle = c.goldBright;
      ctx.fill();
    }

    if (isSelected || isHovered) {
      ctx.save();
      ctx.shadowColor = isSelected ? c.goldBright : c.pearlTint;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, visualR + 5, 0, Math.PI * 2);
      ctx.strokeStyle = isSelected ? c.goldBright : c.pearlTint;
      ctx.globalAlpha = isSelected ? 0.92 : 0.65;
      ctx.lineWidth = 1.65;
      ctx.stroke();
      ctx.restore();
    }

    // Co-citation count badge with compact contrast backing pill
    if (node.role === 'cited' && node.coCiteCount >= 2 && transform.scale >= 0.45) {
      const label = `×${node.coCiteCount}`;
      ctx.save();
      ctx.font = `600 9.5px ${c.mono}`;
      const w = Math.ceil(ctx.measureText(label).width + 8);
      ctx.beginPath();
      ctx.roundRect(screen.x - w / 2, screen.y - 6.5, w, 13, 6.5);
      ctx.fillStyle = c.cartoucheBg;
      ctx.fill();
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = c.goldMid;
      ctx.stroke();
      ctx.fillStyle = c.goldBright;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, screen.x, screen.y + 0.5);
      ctx.restore();
    }

    // Ornate Baroque citation cartouche above landmark armillary nodes
    if (node.role === 'cited' && tier === 'landmark' && transform.scale >= 0.45) {
      const citeText = formatCompactCitations(node.citationCount);
      if (citeText) {
        drawBaroqueCartouche(ctx, screen.x, screen.y - visualR - 12, `✦ ${citeText}`, c, true);
      }
    }

    ctx.restore();
  }

  return nodeScreens;
}

/**
 * Draw collision-avoided Baroque pointed-ear gilded cartouche labels beneath nodes.
 */
export function drawBaroqueLabels(
  ctx,
  {
    labelQueue,
    nodeScreens,
    selectedId,
    hoveredId,
    activeSet,
    organized,
    nodesCount,
    activePalette,
  },
) {
  const c = baroqueColors(activePalette);
  const placedLabels = [];

  for (const node of labelQueue) {
    const sc = nodeScreens.get(node.id);
    if (!sc) continue;
    const isSelected = node.id === selectedId;
    const isHovered = node.id === hoveredId;
    const isDim = Boolean(selectedId && !activeSet.has(node.id));
    const label = organized && (!node.authors?.length || nodesCount <= 36)
      ? (node.title.length > 22 ? node.title.slice(0, 21) + '…' : node.title)
      : shortAuthorLabel(node);

    ctx.save();
    ctx.font = `${node.role === 'seed' || isSelected ? '600 ' : '500 '}10.5px ${c.serif}`;
    const metrics = ctx.measureText(label);
    const boxW = Math.ceil(metrics.width + 26);
    const boxH = 19;
    const boxX = sc.x - boxW / 2;
    const boxY = sc.y + (sc.visualR ?? sc.r) + 8;

    if (!isSelected && !isHovered) {
      const overlaps = placedLabels.some(
        b => !(boxX + boxW + 4 < b.x || boxX > b.x + b.w + 4 || boxY + boxH + 3 < b.y || boxY > b.y + b.h + 3),
      );
      if (overlaps) {
        ctx.restore();
        continue;
      }
    }
    placedLabels.push({ x: boxX, y: boxY, w: boxW, h: boxH });

    ctx.globalAlpha = isDim ? 0.56 : 0.98;
    drawBaroqueCartouche(ctx, sc.x, boxY + boxH / 2, label, c, isSelected || node.role === 'seed');
    ctx.restore();
  }
}
