const SVG_NS = 'http://www.w3.org/2000/svg';

export function hawkingReboundFactor(progress) {
  if (!Number.isFinite(progress) || progress <= 0) return 1;
  if (progress >= 1) return 0;
  return Math.exp(-4.2 * progress) * Math.cos(Math.PI * 2.4 * progress);
}

export function computeBlackHoleDisplacement(point, bh) {
  if (!point || !bh) return { dx: 0, dy: 0, pull: 0 };
  const radius = Number(bh.radius) || 0;
  if (radius <= 0) return { dx: 0, dy: 0, pull: 0 };
  const dx = point.x - bh.x;
  const dy = point.y - bh.y;
  const dist = Math.hypot(dx, dy);
  if (dist >= radius || dist < 1e-4) return { dx: 0, dy: 0, pull: 0 };

  const falloff = Math.pow(1 - dist / radius, 1.85);
  const strength = bh.phase === 'evaporating'
    ? Math.max(0, Math.min(1, Number(bh.peakStrength ?? 1)))
    : Math.max(0, Math.min(1, Number(bh.strength ?? 1)));
  if (strength <= 0) return { dx: 0, dy: 0, pull: 0 };

  const horizon = Number(bh.horizon) || 22;
  const safeRadius = Math.max(24, horizon * 1.45);
  const maxPull = Math.max(0, dist - safeRadius);
  const pullDist = Math.min(maxPull, dist * 0.56 * falloff * strength);
  const newDist = dist - pullDist;
  const baseAngle = Math.atan2(dy, dx);
  const swirl = 0.34 * falloff * strength;
  const nextAngle = baseAngle + swirl;
  const targetX = bh.x + Math.cos(nextAngle) * newDist;
  const targetY = bh.y + Math.sin(nextAngle) * newDist;

  let dispX = targetX - point.x;
  let dispY = targetY - point.y;
  const scale = bh.phase === 'evaporating'
    ? (Number.isFinite(bh.reboundFactor) ? bh.reboundFactor : 1)
    : 1;
  dispX *= scale;
  dispY *= scale;

  return {
    dx: dispX,
    dy: dispY,
    pull: falloff * strength * Math.abs(scale),
  };
}

export function computeOrbitSingularityPerturbation(satPos, bh) {
  if (!satPos || !bh) return { dx: 0, dy: 0, speedBoost: 0 };
  const radius = Number(bh.radius) || 0;
  if (radius <= 0) return { dx: 0, dy: 0, speedBoost: 0 };
  const vx = satPos.x - bh.x;
  const vy = satPos.y - bh.y;
  const dist = Math.hypot(vx, vy);
  if (dist >= radius || dist < 1e-4) return { dx: 0, dy: 0, speedBoost: 0 };

  const falloff = Math.pow(1 - dist / radius, 1.6);
  const activeStrength = bh.phase === 'evaporating'
    ? Math.max(0, Math.min(1, Number(bh.peakStrength ?? 1)))
    : Math.max(0, Math.min(1, Number(bh.strength ?? 1)));
  const factor = bh.phase === 'evaporating'
    ? (Number.isFinite(bh.reboundFactor) ? bh.reboundFactor : 1)
    : 1;

  const deflection = Math.min(26, dist * 0.22 * falloff) * activeStrength * factor;
  const inv = 1 / dist;
  const nx = vx * inv;
  const ny = vy * inv;
  // Tangential swirl vector (perpendicular to radial inward vector)
  const tx = -ny;
  const ty = nx;
  const swirlMag = deflection * 0.42;

  return {
    dx: -nx * deflection + tx * swirlMag,
    dy: -ny * deflection + ty * swirlMag,
    speedBoost: bh.phase === 'evaporating'
      ? 0
      : Math.max(0, Math.min(0.55, 0.55 * falloff * activeStrength)),
  };
}

export function solarFlareSpeedMultiplier(elapsedMs, durationMs = 2600, peak = 4.8) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || elapsedMs >= durationMs) return 1;
  const rampMs = Math.min(160, durationMs * 0.2);
  if (elapsedMs < rampMs) {
    const t = elapsedMs / rampMs;
    const eased = 1 - (1 - t) * (1 - t);
    return 1 + (peak - 1) * eased;
  }
  const decayProgress = (elapsedMs - rampMs) / Math.max(1, durationMs - rampMs);
  return 1 + (peak - 1) * Math.exp(-3.4 * decayProgress);
}

function svgEl(doc, tag, attrs = {}) {
  const node = doc.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

export function createBlackHoleSvg(doc, { scale = 1, idPrefix = 'bh' } = {}) {
  const uid = `${idPrefix}-${Math.random().toString(36).slice(2, 8)}`;
  const haloId = `${uid}-halo`;
  const diskId = `${uid}-disk`;

  const root = svgEl(doc, 'g', {
    class: 'graph-black-hole',
    'pointer-events': 'none',
    'aria-hidden': 'true',
  });

  const defs = svgEl(doc, 'defs');
  const haloGrad = svgEl(doc, 'radialGradient', { id: haloId, cx: '50%', cy: '50%', r: '50%' });
  haloGrad.append(
    svgEl(doc, 'stop', { offset: '0%', 'stop-color': '#05060b', 'stop-opacity': '0.96' }),
    svgEl(doc, 'stop', { offset: '28%', 'stop-color': '#1a120a', 'stop-opacity': '0.68' }),
    svgEl(doc, 'stop', { offset: '52%', 'stop-color': '#f5a642', 'stop-opacity': '0.26' }),
    svgEl(doc, 'stop', { offset: '76%', 'stop-color': '#7ab4ff', 'stop-opacity': '0.09' }),
    svgEl(doc, 'stop', { offset: '100%', 'stop-color': '#7ab4ff', 'stop-opacity': '0' }),
  );

  const diskGrad = svgEl(doc, 'linearGradient', { id: diskId, x1: '0%', y1: '0%', x2: '100%', y2: '0%' });
  diskGrad.append(
    svgEl(doc, 'stop', { offset: '0%', 'stop-color': '#d97b2c', 'stop-opacity': '0.2' }),
    svgEl(doc, 'stop', { offset: '25%', 'stop-color': '#ffbe68', 'stop-opacity': '0.9' }),
    svgEl(doc, 'stop', { offset: '50%', 'stop-color': '#fff5db', 'stop-opacity': '0.98' }),
    svgEl(doc, 'stop', { offset: '75%', 'stop-color': '#ffae52', 'stop-opacity': '0.88' }),
    svgEl(doc, 'stop', { offset: '100%', 'stop-color': '#c96824', 'stop-opacity': '0.18' }),
  );

  defs.append(haloGrad, diskGrad);
  root.append(defs);

  const coreScale = svgEl(doc, 'g', {
    class: 'bh-core-scale',
    transform: `scale(${Number(scale).toFixed(3)})`,
  });

  coreScale.append(
    svgEl(doc, 'circle', { class: 'bh-lens-halo', r: '78', fill: `url(#${haloId})` }),
    svgEl(doc, 'ellipse', {
      class: 'bh-accretion-back',
      cx: '0',
      cy: '0',
      rx: '58',
      ry: '16',
      transform: 'rotate(-16)',
      stroke: `url(#${diskId})`,
    }),
    svgEl(doc, 'path', {
      class: 'bh-lens-arc-top',
      d: 'M -34 -3 A 34 26 0 0 1 34 -3',
    }),
    svgEl(doc, 'path', {
      class: 'bh-lens-arc-bottom',
      d: 'M -29 5 A 29 21 0 0 0 29 5',
    }),
    svgEl(doc, 'circle', { class: 'bh-horizon', r: '21' }),
    svgEl(doc, 'circle', { class: 'bh-photon-ring', r: '22.4' }),
    svgEl(doc, 'path', {
      class: 'bh-accretion-front',
      d: 'M -58 0 A 58 16 0 0 0 58 0',
      transform: 'rotate(-16)',
      stroke: `url(#${diskId})`,
    }),
  );

  const dustRing = svgEl(doc, 'g', {
    class: 'bh-dust-ring',
    transform: 'rotate(-16)',
  });
  for (let i = 0; i < 6; i++) {
    const theta = (i / 6) * Math.PI * 2;
    const x = Math.cos(theta) * (36 + (i % 3) * 8);
    const y = Math.sin(theta) * (9.5 + (i % 3) * 2.2);
    dustRing.append(svgEl(doc, 'circle', {
      class: 'bh-dust-mote',
      cx: x.toFixed(1),
      cy: y.toFixed(1),
      r: (1.05 + (i % 2) * 0.55).toFixed(2),
    }));
  }
  coreScale.append(
    dustRing,
    svgEl(doc, 'circle', { class: 'bh-hawking-ring', r: '24' }),
  );

  root.append(coreScale);
  return root;
}
