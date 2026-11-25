function hashStr(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function mixRgb(a, b, t) {
  const k = clamp(t, 0, 1);
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

function parseCssColor(css, fallback = [140, 185, 255]) {
  if (!css || typeof css !== 'string') return fallback;
  const trimmed = css.trim();
  if (trimmed.startsWith('#')) {
    let hex = trimmed.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      hex = hex.slice(0, 3).split('').map((ch) => ch + ch).join('');
    }
    if (hex.length >= 6) {
      const r = Number.parseInt(hex.slice(0, 2), 16);
      const g = Number.parseInt(hex.slice(2, 4), 16);
      const b = Number.parseInt(hex.slice(4, 6), 16);
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) return [r, g, b];
    }
  }
  const m = trimmed.match(/rgba?\(\s*([0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)/i);
  if (m) {
    return [
      clamp(Math.round(Number(m[1])), 0, 255),
      clamp(Math.round(Number(m[2])), 0, 255),
      clamp(Math.round(Number(m[3])), 0, 255),
    ];
  }
  return fallback;
}

function makeOffscreenCanvas(size) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

function bakeNebulaSprite(rgb, isLight) {
  const size = 64;
  const c = makeOffscreenCanvas(size);
  if (!c) return null;
  const ctx = c.getContext('2d');
  const half = size * 0.5;
  const [r, g, b] = rgb;
  const gRad = ctx.createRadialGradient(half, half, 0, half, half, half);
  if (isLight) {
    gRad.addColorStop(0, `rgba(${r},${g},${b},0.17)`);
    gRad.addColorStop(0.28, `rgba(${r},${g},${b},0.095)`);
    gRad.addColorStop(0.64, `rgba(${r},${g},${b},0.03)`);
    gRad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  } else {
    gRad.addColorStop(0, `rgba(${r},${g},${b},0.25)`);
    gRad.addColorStop(0.26, `rgba(${r},${g},${b},0.135)`);
    gRad.addColorStop(0.62, `rgba(${r},${g},${b},0.04)`);
    gRad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  }
  ctx.fillStyle = gRad;
  ctx.fillRect(0, 0, size, size);
  return c;
}

function bakeStarSprite(rgb, isLight) {
  const size = 32;
  const c = makeOffscreenCanvas(size);
  if (!c) return null;
  const ctx = c.getContext('2d');
  const half = size * 0.5;
  const [r, g, b] = rgb;
  const gRad = ctx.createRadialGradient(half, half, 0, half, half, half);
  if (isLight) {
    gRad.addColorStop(0, `rgba(${r},${g},${b},0.98)`);
    gRad.addColorStop(0.2, `rgba(${r},${g},${b},0.72)`);
    gRad.addColorStop(0.5, `rgba(${r},${g},${b},0.18)`);
    gRad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  } else {
    gRad.addColorStop(0, 'rgba(255,255,255,0.98)');
    gRad.addColorStop(0.18, `rgba(${r},${g},${b},0.88)`);
    gRad.addColorStop(0.48, `rgba(${r},${g},${b},0.22)`);
    gRad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  }
  ctx.fillStyle = gRad;
  ctx.fillRect(0, 0, size, size);
  return c;
}

function bakeGlintSprite(rgb, isLight) {
  const size = 48;
  const c = makeOffscreenCanvas(size);
  if (!c) return null;
  const ctx = c.getContext('2d');
  const half = size * 0.5;
  const [r, g, b] = rgb;

  const gRad = ctx.createRadialGradient(half, half, 0, half, half, half * 0.85);
  if (isLight) {
    gRad.addColorStop(0, `rgba(${r},${g},${b},0.98)`);
    gRad.addColorStop(0.18, `rgba(${r},${g},${b},0.65)`);
    gRad.addColorStop(0.52, `rgba(${r},${g},${b},0.14)`);
    gRad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  } else {
    gRad.addColorStop(0, 'rgba(255,255,255,1)');
    gRad.addColorStop(0.16, `rgba(${r},${g},${b},0.9)`);
    gRad.addColorStop(0.46, `rgba(${r},${g},${b},0.22)`);
    gRad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  }
  ctx.fillStyle = gRad;
  ctx.fillRect(0, 0, size, size);

  // Subtle 4-point diffraction glint
  const drawRay = (vertical) => {
    ctx.save();
    ctx.translate(half, half);
    if (!vertical) ctx.rotate(Math.PI * 0.5);
    const rg = ctx.createLinearGradient(0, -half * 0.9, 0, half * 0.9);
    const coreCol = isLight ? `rgba(${r},${g},${b},0.72)` : 'rgba(255,255,255,0.88)';
    const edgeCol = `rgba(${r},${g},${b},0)`;
    rg.addColorStop(0, edgeCol);
    rg.addColorStop(0.5, coreCol);
    rg.addColorStop(1, edgeCol);
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(0, -half * 0.9);
    ctx.lineTo(1.5, 0);
    ctx.lineTo(0, half * 0.9);
    ctx.lineTo(-1.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  drawRay(true);
  drawRay(false);
  return c;
}

function gauss(rand) {
  const u1 = Math.max(1e-6, rand());
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(Math.PI * 2 * u2);
}

function fromUvw(meta, uVal, vVal, wVal) {
  const { center, basis } = meta;
  const { u, v, w } = basis;
  return [
    center.x + u[0] * uVal + v[0] * vVal + w[0] * wVal,
    center.y + u[1] * uVal + v[1] * vVal + w[1] * wVal,
    center.z + u[2] * uVal + v[2] * vVal + w[2] * wVal,
  ];
}

function projectOntoUvw(meta, p) {
  const dx = p.x - meta.center.x;
  const dy = p.y - meta.center.y;
  const dz = p.z - meta.center.z;
  const { u, v, w } = meta.basis;
  return [
    dx * u[0] + dy * u[1] + dz * u[2],
    dx * v[0] + dy * v[1] + dz * v[2],
    dx * w[0] + dy * w[1] + dz * w[2],
  ];
}

function buildGalaxyField(galaxy) {
  const { meta, points } = galaxy;
  const form = meta.form || 'spiral';
  const radius = Math.max(36, meta.radius || 75);
  const memberCount = meta.memberIds?.length || points?.length || 12;
  const seed = hashStr(`${meta.id}|${form}|${(meta.memberIds || []).join(',')}`);
  const rand = mulberry32(seed);

  const localPts = (points || [])
    .filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y) && Number.isFinite(p?.z))
    .map((p) => projectOntoUvw(meta, p));
  const starCount = clamp(Math.round(960 + Math.sqrt(memberCount) * 145), 960, 1650);
  const puffCount = clamp(Math.round(34 + Math.sqrt(memberCount) * 4), 34, 54);

  // stride 7: wx, wy, wz, size, alpha, bucket(0..3), kind(0=pin, 1=glint, 2=micro)
  const stars = new Float32Array(starCount * 7);
  // stride 6: wx, wy, wz, radius, alpha, bucket(0..2)
  const puffs = new Float32Array(puffCount * 6);

  const arms = Math.max(2, meta.arms || 2);
  const barHalf = meta.barHalf || radius * 0.44;
  const ringRadius = meta.ringRadius || radius * 0.64;
  const ringOval = meta.ringOval || 0.78;
  const axes = meta.axes || [radius * 1.12, radius * 0.76, radius * 0.48];
  const windDir = rand() < 0.5 ? 1 : -1;
  const phaseShift = rand() * Math.PI * 2;
  const spiralTwist = 2.4 + rand() * 0.9;

  for (let i = 0; i < starCount; i += 1) {
    let uVal = 0;
    let vVal = 0;
    let wVal = 0;
    let size = 1.6;
    let alpha = 0.75;
    let bucket = 1;
    let kind = 0;

    const rRoll = rand();
    // ~24% of stars drape organically around real cluster papers so river visibly embraces nodes
    if (localPts.length > 0 && rRoll < 0.24) {
      const idx = Math.floor(rand() * localPts.length);
      const nextIdx = (idx + 1 + Math.floor(rand() * Math.min(3, localPts.length))) % localPts.length;
      const p0 = localPts[idx];
      const p1 = localPts[nextIdx];
      const lerpT = rand();
      const arcSpread = radius * (0.045 + rand() * 0.14);
      uVal = p0[0] + (p1[0] - p0[0]) * lerpT + gauss(rand) * arcSpread;
      vVal = p0[1] + (p1[1] - p0[1]) * lerpT + gauss(rand) * arcSpread;
      wVal = p0[2] + (p1[2] - p0[2]) * lerpT + gauss(rand) * arcSpread * 0.38;
      size = 1.15 + Math.pow(rand(), 2) * 3.1;
      alpha = 0.42 + rand() * 0.54;
      bucket = rand() < 0.38 ? 3 : rand() < 0.65 ? 1 : 0;
      kind = rand() < 0.032 ? 1 : rand() < 0.34 ? 2 : 0;
    } else if (form === 'spiral') {
      const subRoll = rand();
      if (subRoll < 0.17) {
        // Warm luminous galactic bulge
        const br = radius * 0.21 * Math.pow(rand(), 0.72);
        const theta = rand() * Math.PI * 2;
        uVal = Math.cos(theta) * br + gauss(rand) * radius * 0.04;
        vVal = Math.sin(theta) * br + gauss(rand) * radius * 0.04;
        wVal = gauss(rand) * radius * 0.075;
        size = 1.3 + Math.pow(rand(), 1.8) * 3.2;
        alpha = 0.55 + rand() * 0.45;
        bucket = rand() < 0.68 ? 0 : 3;
        kind = rand() < 0.04 ? 1 : 0;
      } else if (subRoll < 0.85) {
        // Sweeping logarithmic / river spiral arms + leading spurs
        const armIdx = i % arms;
        const t = Math.pow(rand(), 0.76);
        const rad = radius * (0.1 + t * 0.98);
        const spur = rand() < 0.18 ? (rand() < 0.5 ? 0.34 : -0.28) : 0;
        const theta = phaseShift + (armIdx * Math.PI * 2) / arms + windDir * (t * spiralTwist + spur);
        const ridgeJitter = radius * (0.038 + 0.095 * t);
        uVal = Math.cos(theta) * rad + gauss(rand) * ridgeJitter;
        vVal = Math.sin(theta) * rad + gauss(rand) * ridgeJitter;
        wVal = gauss(rand) * radius * (0.048 * (1 - 0.42 * t));
        const starRoll = rand();
        size = 0.95 + Math.pow(starRoll, 2.2) * 3.6;
        alpha = (0.36 + rand() * 0.62) * (1 - 0.28 * t);
        bucket = t < 0.25 ? 0 : rand() < 0.22 ? 3 : rand() < 0.7 ? 1 : 2;
        kind = starRoll > 0.972 ? 1 : starRoll < 0.36 ? 2 : 0;
      } else {
        // Outer stellar halo & disk dust veil
        const rad = radius * (0.28 + Math.pow(rand(), 0.58) * 0.95);
        const theta = rand() * Math.PI * 2;
        uVal = Math.cos(theta) * rad + gauss(rand) * radius * 0.08;
        vVal = Math.sin(theta) * rad + gauss(rand) * radius * 0.08;
        wVal = gauss(rand) * radius * 0.14;
        size = 0.8 + rand() * 1.9;
        alpha = 0.22 + rand() * 0.38;
        bucket = rand() < 0.55 ? 2 : 1;
        kind = 2;
      }
    } else if (form === 'barred') {
      const subRoll = rand();
      if (subRoll < 0.36) {
        // Dense glowing galactic bar + warm central nucleus
        const along = (rand() * 2 - 1) * barHalf * (rand() < 0.35 ? 0.45 : 1.0);
        const coreRatio = 1 - Math.abs(along) / Math.max(1, barHalf);
        const perp = gauss(rand) * radius * (0.075 + 0.065 * coreRatio);
        uVal = along;
        vVal = perp;
        wVal = gauss(rand) * radius * (0.055 + 0.04 * coreRatio);
        size = 1.2 + Math.pow(rand(), 1.9) * 3.4;
        alpha = 0.52 + rand() * 0.46;
        bucket = Math.abs(along) < barHalf * 0.38 ? 0 : rand() < 0.3 ? 3 : 1;
        kind = rand() < 0.036 ? 1 : rand() < 0.25 ? 2 : 0;
      } else if (subRoll < 0.88) {
        // Two sweeping spiral wings peeling off bar ends (+barHalf / -barHalf)
        const side = i % 2 === 0 ? 1 : -1;
        const baseTheta = side > 0 ? 0 : Math.PI;
        const t = Math.pow(rand(), 0.78);
        const rad = barHalf * 0.94 + t * (radius * 1.04 - barHalf * 0.65);
        const theta = baseTheta + windDir * Math.pow(t, 0.9) * (Math.PI * 1.25);
        const jitter = radius * (0.042 + 0.085 * t);
        uVal = Math.cos(theta) * rad + gauss(rand) * jitter;
        vVal = Math.sin(theta) * rad + gauss(rand) * jitter;
        wVal = gauss(rand) * radius * 0.046;
        const starRoll = rand();
        size = 0.95 + Math.pow(starRoll, 2.2) * 3.5;
        alpha = (0.34 + rand() * 0.6) * (1 - 0.24 * t);
        bucket = rand() < 0.2 ? 3 : t < 0.3 ? 0 : rand() < 0.72 ? 1 : 2;
        kind = starRoll > 0.974 ? 1 : starRoll < 0.38 ? 2 : 0;
      } else {
        // Barred halo scatter
        const rad = radius * (0.24 + rand() * 0.96);
        const theta = rand() * Math.PI * 2;
        uVal = Math.cos(theta) * rad;
        vVal = Math.sin(theta) * rad * 0.88;
        wVal = gauss(rand) * radius * 0.13;
        size = 0.8 + rand() * 1.8;
        alpha = 0.22 + rand() * 0.36;
        bucket = 2;
        kind = 2;
      }
    } else if (form === 'ring') {
      const subRoll = rand();
      if (subRoll < 0.64) {
        // Luminous star-forming Hoag/Cartwheel outer ring
        const theta = rand() * Math.PI * 2;
        const clumpBoost = 0.55 + 0.45 * Math.sin(theta * 3 + phaseShift);
        const radScale = ringRadius + gauss(rand) * radius * 0.078;
        uVal = Math.cos(theta) * radScale;
        vVal = Math.sin(theta) * radScale * ringOval;
        wVal = gauss(rand) * radius * 0.042;
        const starRoll = rand();
        size = (0.95 + Math.pow(starRoll, 2.1) * 3.5) * (0.85 + 0.35 * clumpBoost);
        alpha = 0.42 + rand() * 0.56;
        bucket = starRoll > 0.82 ? 3 : rand() < 0.68 ? 1 : 2;
        kind = starRoll > 0.968 ? 1 : starRoll < 0.32 ? 2 : 0;
      } else if (subRoll < 0.82) {
        // Golden central nucleus
        const br = radius * 0.22 * Math.pow(rand(), 0.78);
        const theta = rand() * Math.PI * 2;
        uVal = Math.cos(theta) * br;
        vVal = Math.sin(theta) * br * ringOval;
        wVal = gauss(rand) * radius * 0.072;
        size = 1.2 + Math.pow(rand(), 1.8) * 3.1;
        alpha = 0.55 + rand() * 0.43;
        bucket = rand() < 0.74 ? 0 : 3;
        kind = rand() < 0.04 ? 1 : 0;
      } else {
        // Delicate Cartwheel radial spokes & tenuous outer veil
        const isSpoke = rand() < 0.58;
        if (isSpoke) {
          const spokeCount = 5;
          const spokeAngle = ((i % spokeCount) * Math.PI * 2) / spokeCount + phaseShift;
          const rt = 0.22 + rand() * 0.74;
          const twist = spokeAngle + windDir * rt * 0.38;
          uVal = Math.cos(twist) * ringRadius * rt + gauss(rand) * radius * 0.032;
          vVal = Math.sin(twist) * ringRadius * ringOval * rt + gauss(rand) * radius * 0.032;
          wVal = gauss(rand) * radius * 0.04;
          alpha = 0.28 + rand() * 0.36;
          bucket = 2;
        } else {
          const theta = rand() * Math.PI * 2;
          const rOut = ringRadius * (1.02 + rand() * 0.34);
          uVal = Math.cos(theta) * rOut;
          vVal = Math.sin(theta) * rOut * ringOval;
          wVal = gauss(rand) * radius * 0.1;
          alpha = 0.2 + rand() * 0.32;
          bucket = 2;
        }
        size = 0.8 + rand() * 2.0;
        kind = 2;
      }
    } else {
      // Elliptical: triaxial Sersic-like star swarm + subtle diagonal shell ripples
      const rCore = Math.pow(rand(), 1.55);
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      const sp = Math.sin(phi);
      const sx = sp * Math.cos(theta);
      const sy = sp * Math.sin(theta);
      const sz = Math.cos(phi);
      const shellBoost = rand() < 0.18 ? 0.88 + rand() * 0.16 : rCore;
      uVal = sx * axes[0] * shellBoost + gauss(rand) * radius * 0.035;
      vVal = sy * axes[1] * shellBoost + gauss(rand) * radius * 0.035;
      wVal = sz * axes[2] * shellBoost + gauss(rand) * radius * 0.035;
      const starRoll = rand();
      size = 0.9 + Math.pow(starRoll, 2.1) * 3.3;
      alpha = (0.34 + rand() * 0.62) * (1.05 - 0.45 * shellBoost);
      bucket = shellBoost < 0.36 ? 0 : rand() < 0.18 ? 3 : rand() < 0.62 ? 1 : 2;
      kind = starRoll > 0.976 ? 1 : starRoll < 0.42 ? 2 : 0;
    }

    const [wx, wy, wz] = fromUvw(meta, uVal, vVal, wVal);
    const o = i * 7;
    stars[o] = wx;
    stars[o + 1] = wy;
    stars[o + 2] = wz;
    stars[o + 3] = size;
    stars[o + 4] = alpha;
    stars[o + 5] = bucket;
    stars[o + 6] = kind;
  }

  for (let i = 0; i < puffCount; i += 1) {
    let uVal = 0;
    let vVal = 0;
    let wVal = 0;
    let pRad = radius * 0.34;
    let pAlpha = 0.22;
    let bucket = 1;

    if (i < 5) {
      // Warm glowing galactic center puffs
      uVal = gauss(rand) * radius * 0.06;
      vVal = gauss(rand) * radius * 0.06;
      wVal = gauss(rand) * radius * 0.04;
      pRad = radius * (i === 0 ? 0.56 : 0.32 + rand() * 0.14);
      pAlpha = i === 0 ? 0.36 : 0.24;
      bucket = 0;
    } else if (localPts.length > 0 && i % 3 === 0) {
      // Volumetric nebula cloud around actual cluster member neighborhoods
      const pt = localPts[i % localPts.length];
      uVal = pt[0] * 0.86 + gauss(rand) * radius * 0.08;
      vVal = pt[1] * 0.86 + gauss(rand) * radius * 0.08;
      wVal = pt[2] * 0.86 + gauss(rand) * radius * 0.05;
      pRad = radius * (0.28 + rand() * 0.22);
      pAlpha = 0.18 + rand() * 0.1;
      bucket = rand() < 0.65 ? 1 : 2;
    } else if (form === 'spiral') {
      const armIdx = i % arms;
      const t = 0.14 + (i / puffCount) * 0.82;
      const rad = radius * t;
      const theta = phaseShift + (armIdx * Math.PI * 2) / arms + windDir * t * spiralTwist;
      uVal = Math.cos(theta) * rad;
      vVal = Math.sin(theta) * rad;
      wVal = gauss(rand) * radius * 0.04;
      pRad = radius * (0.26 + 0.18 * (1 - t));
      pAlpha = 0.16 + rand() * 0.12;
      bucket = t < 0.3 ? 0 : rand() < 0.7 ? 1 : 2;
    } else if (form === 'barred') {
      if (i % 3 === 1) {
        uVal = ((rand() * 2 - 1) * barHalf) * 0.9;
        vVal = gauss(rand) * radius * 0.06;
        wVal = gauss(rand) * radius * 0.04;
        pRad = radius * 0.32;
        pAlpha = 0.22;
        bucket = 0;
      } else {
        const side = i % 2 === 0 ? 1 : -1;
        const t = rand();
        const rad = barHalf * 0.94 + t * (radius - barHalf * 0.6);
        const theta = (side > 0 ? 0 : Math.PI) + windDir * Math.pow(t, 0.9) * Math.PI * 1.2;
        uVal = Math.cos(theta) * rad;
        vVal = Math.sin(theta) * rad;
        wVal = gauss(rand) * radius * 0.04;
        pRad = radius * 0.3;
        pAlpha = 0.18;
        bucket = 1;
      }
    } else if (form === 'ring') {
      const theta = (i / Math.max(1, puffCount - 5)) * Math.PI * 2 + phaseShift;
      uVal = Math.cos(theta) * ringRadius;
      vVal = Math.sin(theta) * ringRadius * ringOval;
      wVal = gauss(rand) * radius * 0.04;
      pRad = radius * 0.28;
      pAlpha = 0.19;
      bucket = i % 2 === 0 ? 1 : 2;
    } else {
      uVal = gauss(rand) * axes[0] * 0.34;
      vVal = gauss(rand) * axes[1] * 0.34;
      wVal = gauss(rand) * axes[2] * 0.34;
      pRad = radius * (0.36 + rand() * 0.24);
      pAlpha = 0.2;
      bucket = rand() < 0.45 ? 0 : 1;
    }

    const [wx, wy, wz] = fromUvw(meta, uVal, vVal, wVal);
    const o = i * 6;
    puffs[o] = wx;
    puffs[o + 1] = wy;
    puffs[o + 2] = wz;
    puffs[o + 3] = pRad;
    puffs[o + 4] = pAlpha;
    puffs[o + 5] = bucket;
  }

  return {
    id: meta.id,
    community: meta.community,
    form,
    color: meta.color || '#6da8ff',
    radius,
    center: meta.center,
    stars,
    starCount,
    puffs,
    puffCount,
  };
}

function buildMilkyWayBand(space) {
  const rand = mulberry32(hashStr(`milkyway|${Math.round(space.extent || 420)}`));
  const cx = space.x || 500;
  const cy = space.y || 310;
  const extent = Math.max(320, space.extent || 440);
  const starCount = 1850;
  const puffCount = 44;
  const stars = new Float32Array(starCount * 6); // wx, wy, wz, size, alpha, tintIdx
  const puffs = new Float32Array(puffCount * 5); // wx, wy, wz, rad, alpha

  // Tilted sweeping great-circle Milky Way ribbon diagonally across 3D sky
  const tilt = 0.42;
  const roll = -0.44;
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);
  const cosR = Math.cos(roll);
  const sinR = Math.sin(roll);

  const rotateToWorld = (lx, ly, lz) => {
    const y1 = ly * cosT - lz * sinT;
    const z1 = ly * sinT + lz * cosT;
    const x2 = lx * cosR - y1 * sinR;
    const y2 = lx * sinR + y1 * cosR;
    return [cx + x2, cy + y2, z1];
  };

  for (let i = 0; i < starCount; i += 1) {
    const rollBand = rand();
    let lx;
    let ly;
    let lz;
    if (rollBand < 0.78) {
      // Sweeping S-curved Milky Way Star-River core & wings
      const u = (rand() * 2 - 1) * extent * 1.45;
      const wave = Math.sin(u / (extent * 0.52)) * extent * 0.16;
      const coreLane = rollBand < 0.44;
      const bandWidth = extent * (coreLane ? 0.11 : 0.24 + 0.08 * Math.abs(Math.cos(u / extent)));
      lx = u;
      ly = wave + gauss(rand) * bandWidth;
      lz = -extent * (0.18 + rand() * 0.55) + gauss(rand) * extent * 0.18;
    } else {
      // Deep all-sky sparse starfield shell
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      const dist = extent * (0.65 + rand() * 0.72);
      lx = Math.sin(phi) * Math.cos(theta) * dist * 1.35;
      ly = Math.sin(phi) * Math.sin(theta) * dist;
      lz = Math.cos(phi) * dist * 0.85;
    }
    const [wx, wy, wz] = rotateToWorld(lx, ly, lz);
    const o = i * 6;
    const sRoll = rand();
    const inBand = rollBand < 0.78;
    stars[o] = wx;
    stars[o + 1] = wy;
    stars[o + 2] = wz;
    stars[o + 3] = inBand ? (0.72 + Math.pow(sRoll, 2.3) * 2.35) : (0.65 + Math.pow(sRoll, 2.2) * 1.9);
    stars[o + 4] = inBand ? (0.24 + rand() * 0.48) : (0.15 + rand() * 0.34);
    stars[o + 5] = sRoll < 0.24 ? 0 : sRoll < 0.62 ? 1 : 2;
  }

  for (let i = 0; i < puffCount; i += 1) {
    const t = i / Math.max(1, puffCount - 1);
    const u = (t * 2 - 1) * extent * 1.38;
    const wave = Math.sin(u / (extent * 0.52)) * extent * 0.16;
    const lx = u + gauss(rand) * extent * 0.045;
    const ly = wave + gauss(rand) * extent * 0.065;
    const lz = -extent * (0.22 + rand() * 0.26);
    const [wx, wy, wz] = rotateToWorld(lx, ly, lz);
    const o = i * 5;
    puffs[o] = wx;
    puffs[o + 1] = wy;
    puffs[o + 2] = wz;
    puffs[o + 3] = extent * (0.16 + rand() * 0.14);
    puffs[o + 4] = 0.09 + rand() * 0.065;
  }

  return { stars, starCount, puffs, puffCount };
}

function buildTidalStreams(space, network, galaxyMap) {
  if (!network?.edges?.length || galaxyMap.size < 2) return [];
  const paperCommunity = new Map();
  for (const g of galaxyMap.values()) {
    for (const id of g.meta.memberIds || []) paperCommunity.set(id, String(g.meta.community));
  }
  const tagOwners = new Map();
  const pairWeights = new Map();

  for (const edge of network.edges) {
    const s = String(edge.source);
    const t = String(edge.target);
    const cs = paperCommunity.get(s);
    const ct = paperCommunity.get(t);
    if (cs && ct && cs !== ct) {
      const key = cs < ct ? `${cs}|${ct}` : `${ct}|${cs}`;
      pairWeights.set(key, (pairWeights.get(key) || 0) + (edge.weight || 1.5));
    } else if (cs && t.startsWith('tag:')) {
      if (!tagOwners.has(t)) tagOwners.set(t, new Set());
      tagOwners.get(t).add(cs);
    } else if (ct && s.startsWith('tag:')) {
      if (!tagOwners.has(s)) tagOwners.set(s, new Set());
      tagOwners.get(s).add(ct);
    }
  }

  for (const owners of tagOwners.values()) {
    if (owners.size < 2 || owners.size > 5) continue;
    const list = [...owners];
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        pairWeights.set(key, (pairWeights.get(key) || 0) + 0.6);
      }
    }
  }

  const byComm = new Map();
  for (const g of galaxyMap.values()) byComm.set(String(g.meta.community), g.meta);

  const pairs = [...pairWeights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  const streams = [];
  for (const [key, weight] of pairs) {
    const [ca, cb] = key.split('|');
    const a = byComm.get(ca);
    const b = byComm.get(cb);
    if (!a || !b) continue;

    const dx = b.center.x - a.center.x;
    const dy = b.center.y - a.center.y;
    const dz = b.center.z - a.center.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 24) continue;

    const rand = mulberry32(hashStr(`stream|${key}`));
    // Bow midpoint slightly perpendicular in 3D so streams arch organically like tidal ribbons
    let px = -dy;
    let py = dx;
    let pz = (dx - dy) * 0.25;
    const plen = Math.hypot(px, py, pz) || 1;
    px /= plen;
    py /= plen;
    pz /= plen;
    const bowDir = rand() < 0.5 ? 1 : -1;
    const bow = dist * (0.14 + rand() * 0.1) * bowDir;
    const mx = (a.center.x + b.center.x) * 0.5 + px * bow;
    const my = (a.center.y + b.center.y) * 0.5 + py * bow;
    const mz = (a.center.z + b.center.z) * 0.5 + pz * bow;

    const count = clamp(Math.round(52 + Math.min(8, weight) * 5), 55, 95);
    const pts = new Float32Array(count * 6); // wx, wy, wz, size, alpha, sideMix(0..1)
    for (let i = 0; i < count; i += 1) {
      const t = 0.08 + (i / Math.max(1, count - 1)) * 0.84 + (rand() - 0.5) * 0.03;
      const tc = clamp(t, 0.04, 0.96);
      const inv = 1 - tc;
      const spread = (6 + 18 * Math.sin(tc * Math.PI));
      const bx = inv * inv * a.center.x + 2 * inv * tc * mx + tc * tc * b.center.x;
      const by = inv * inv * a.center.y + 2 * inv * tc * my + tc * tc * b.center.y;
      const bz = inv * inv * a.center.z + 2 * inv * tc * mz + tc * tc * b.center.z;
      const o = i * 6;
      pts[o] = bx + gauss(rand) * spread;
      pts[o + 1] = by + gauss(rand) * spread;
      pts[o + 2] = bz + gauss(rand) * spread * 0.65;
      pts[o + 3] = 0.75 + Math.pow(rand(), 2) * 1.9;
      pts[o + 4] = (0.22 + rand() * 0.42) * Math.sin(tc * Math.PI);
      pts[o + 5] = tc;
    }

    streams.push({
      commA: a.community,
      commB: b.community,
      colorA: a.color || '#6da8ff',
      colorB: b.color || '#6da8ff',
      pts,
      count,
    });
  }

  return streams;
}

export class GalaxyLayer {
  constructor(svg) {
    this.svg = svg;
    this.canvas = null;
    this.ctx = null;
    this.cssW = 1000;
    this.cssH = 620;
    this.dpr = 1;
    this.viewHeight = 620;
    this.activeCommunity = null;
    this.hasFocus = false;
    this.cachedSpace = null;
    this.cachedNetwork = null;
    this.lastDraw = null;
    this.particleCount = 0;
    this.cachedGalaxies = [];
    this.cachedStreams = [];
    this.cachedMilkyWay = null;
    this.spriteCache = new Map();
    this.themeCacheKey = '';
    this.themeTokens = null;
    this.colorProbe = null;
    this.proj = { x: 0, y: 0, depth: 0, scale: 1, depthFade: 1 };
  }

  attach() {
    if (typeof document === 'undefined' || !this.svg?.parentElement) return;
    const parent = this.svg.parentElement;
    if (this.canvas && this.canvas.parentElement === parent) return;
    let existing = parent.querySelector(':scope > .galaxy-starfield-canvas');
    if (!existing) {
      existing = document.createElement('canvas');
      existing.className = 'galaxy-starfield-canvas';
      existing.setAttribute('aria-hidden', 'true');
      parent.insertBefore(existing, this.svg);
    }
    this.canvas = existing;
    this.ctx = existing.getContext('2d');
    this.lastDraw = null;
    this.syncBackingSize();
  }

  syncBackingSize(bounds, moving = false) {
    if (!this.canvas || typeof window === 'undefined') return;
    let width = bounds?.width;
    let height = bounds?.height;
    if ((!width || !height) && this.svg?.getBoundingClientRect) {
      const r = this.svg.getBoundingClientRect();
      width = r.width;
      height = r.height;
    }
    if (!width || !height) return;
    this.cssW = width;
    this.cssH = height;
    this.dpr = Math.min(moving ? 1 : 2, window.devicePixelRatio || 1);
    const pw = Math.max(1, Math.round(width * this.dpr));
    const ph = Math.max(1, Math.round(height * this.dpr));
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
      this.lastDraw = null;
    }
  }

  resize(bounds, viewHeight) {
    if (typeof bounds === 'number') {
      this.viewHeight = bounds;
      this.syncBackingSize();
      return;
    }
    if (Number.isFinite(viewHeight)) this.viewHeight = viewHeight;
    this.syncBackingSize(bounds);
  }

  clear() {
    if (this.ctx && this.canvas) {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    if (this.canvas?.parentElement) {
      this.canvas.remove();
    }
    this.canvas = null;
    this.ctx = null;
    this.activeCommunity = null;
    this.hasFocus = false;
    this.cachedSpace = null;
    this.cachedNetwork = null;
    this.lastDraw = null;
    this.cachedGalaxies = [];
    this.cachedStreams = [];
    this.cachedMilkyWay = null;
  }

  setFocus(activeCommunity, hasFocus) {
    this.activeCommunity = activeCommunity ?? null;
    this.hasFocus = Boolean(hasFocus);
  }

  resolveThemeTokens() {
    if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') {
      return {
        isLight: false,
        warm: [248, 222, 168],
        cool: [168, 208, 255],
        mist: [120, 162, 232],
        ink: [28, 42, 62],
      };
    }
    const root = document.documentElement;
    const isLight = root.dataset.themeMode === 'light';
    const themeKey = `${root.dataset.theme || ''}|${root.dataset.themeMode || ''}`;
    if (this.themeTokens && this.themeCacheKey === themeKey) return this.themeTokens;

    const cs = getComputedStyle(root);
    const accent = parseCssColor(cs.getPropertyValue('--teal') || cs.getPropertyValue('--accent'), [67, 133, 245]);
    const warning = parseCssColor(cs.getPropertyValue('--warning'), isLight ? [178, 114, 24] : [245, 208, 132]);
    const ink = parseCssColor(cs.getPropertyValue('--ink'), isLight ? [26, 38, 52] : [235, 244, 255]);
    const muted = parseCssColor(cs.getPropertyValue('--muted'), isLight ? [92, 108, 128] : [142, 168, 210]);

    this.themeCacheKey = themeKey;
    this.spriteCache.clear();
    this.themeTokens = {
      isLight,
      warm: isLight ? mixRgb(warning, [152, 92, 18], 0.35) : mixRgb(warning, [255, 249, 232], 0.56),
      cool: isLight ? mixRgb(accent, ink, 0.32) : mixRgb(accent, [224, 242, 255], 0.45),
      mist: isLight ? mixRgb(accent, muted, 0.45) : mixRgb(muted, [132, 178, 245], 0.48),
      ink,
    };
    return this.themeTokens;
  }

  getPaletteSprites(colorHex, tokens) {
    const modeKey = tokens.isLight ? 'L' : 'D';
    const key = `${modeKey}|${colorHex}`;
    let entry = this.spriteCache.get(key);
    if (entry) return entry;

    const base = parseCssColor(colorHex, [109, 168, 255]);
    let buckets;
    if (tokens.isLight) {
      // Mineral & jewel inks calibrated for pale surfaces without muddying
      buckets = [
        mixRgb(base, tokens.warm, 0.48),
        mixRgb(base, tokens.ink, 0.2),
        mixRgb(base, tokens.cool, 0.42),
        mixRgb(base, tokens.ink, 0.42),
      ];
    } else {
      // Luminous spectral tiers for deep-space dark glow
      buckets = [
        mixRgb(base, tokens.warm, 0.58),
        mixRgb(base, [255, 255, 255], 0.16),
        mixRgb(base, tokens.cool, 0.46),
        mixRgb(base, [255, 255, 255], 0.72),
      ];
    }

    entry = {
      dots: buckets.map(rgb => 'rgb(' + rgb.join(',') + ')'),
      nebula: buckets.slice(0, 3).map((rgb) => bakeNebulaSprite(rgb, tokens.isLight)),
      stars: buckets.map((rgb) => bakeStarSprite(rgb, tokens.isLight)),
      glints: [buckets[0], buckets[3]].map((rgb) => bakeGlintSprite(rgb, tokens.isLight)),
    };
    this.spriteCache.set(key, entry);
    return entry;
  }

  getSkySprites(tokens) {
    const key = `SKY|${tokens.isLight ? 'L' : 'D'}|${tokens.mist.join(',')}`;
    let entry = this.spriteCache.get(key);
    if (entry) return entry;
    const warmTint = tokens.isLight ? mixRgb(tokens.warm, tokens.ink, 0.25) : mixRgb(tokens.warm, [255, 250, 238], 0.45);
    const coolTint = tokens.isLight ? mixRgb(tokens.mist, tokens.ink, 0.22) : mixRgb(tokens.mist, [215, 232, 255], 0.4);
    const whiteTint = tokens.isLight ? mixRgb(tokens.ink, tokens.cool, 0.3) : [238, 245, 255];
    entry = {
      nebula: bakeNebulaSprite(tokens.mist, tokens.isLight),
      dots: [warmTint, coolTint, whiteTint].map(rgb => 'rgb(' + rgb.join(',') + ')'),
      stars: [warmTint, coolTint, whiteTint].map((rgb) => bakeStarSprite(rgb, tokens.isLight)),
    };
    this.spriteCache.set(key, entry);
    return entry;
  }

  ensureCache(space, network) {
    if (this.cachedSpace === space && this.cachedNetwork === network) return false;
    const entries = [...(space.galaxies?.values() || [])];
    const formCounts = { spiral: 0, barred: 0, ring: 0, elliptical: 0 };
    for (const g of entries) {
      const f = g.meta?.form || 'spiral';
      formCounts[f] = (formCounts[f] || 0) + 1;
    }
    this.cachedSpace = space;
    this.cachedNetwork = network;
    this.cachedGalaxies = entries.map(buildGalaxyField);
    this.cachedStreams = buildTidalStreams(space, network, space.galaxies);
    this.cachedMilkyWay = buildMilkyWayBand(space);
    this.particleCount = this.cachedMilkyWay.starCount
      + this.cachedStreams.reduce((count, stream) => count + stream.count, 0)
      + this.cachedGalaxies.reduce((count, galaxy) => count + galaxy.starCount, 0);
    if (this.canvas) {
      this.canvas.dataset.galaxyCount = String(entries.length);
      this.canvas.dataset.galaxyForms = JSON.stringify(formCounts);
    }
    return true;
  }

  render(space, network, appearance, camera) {
    if (!space) return;
    if (!this.canvas && typeof document !== 'undefined') this.attach();
    if (!this.canvas || !this.ctx) return;

    const bounds = camera?.bounds;
    const viewHeight = Number.isFinite(camera?.viewHeight) ? camera.viewHeight : (typeof camera === 'number' ? camera : this.viewHeight);
    if (Number.isFinite(viewHeight)) this.viewHeight = viewHeight;
    const moving = Boolean(camera?.moving);
    this.syncBackingSize(bounds,moving);

    const changed = this.ensureCache(space, network);
    const tokens = this.resolveThemeTokens();
    const state = [space.yaw,space.pitch,camera?.x,camera?.y,camera?.scale,this.cssW,this.cssH,this.dpr,
      this.viewHeight,moving,this.activeCommunity,this.hasFocus,tokens];
    if (!changed && this.lastDraw && state.every((value, index) => value === this.lastDraw[index])) return;
    this.lastDraw = state;
    const skySprites = this.getSkySprites(tokens);

    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);

    const viewScale = Math.min(this.cssW / 1000, this.cssH / (this.viewHeight || 620));
    if (!(viewScale > 0)) return;
    const padX = (this.cssW - 1000 * viewScale) * 0.5;
    const padY = (this.cssH - (this.viewHeight || 620) * viewScale) * 0.5;
    const camX = Number.isFinite(camera?.x) ? camera.x : 0;
    const camY = Number.isFinite(camera?.y) ? camera.y : 0;
    const camScale = Number.isFinite(camera?.scale) ? camera.scale : 1;
    const totalScale = camScale * viewScale;
    const proj = this.proj;
    const skyAlphaMul = this.hasFocus ? 0.45 : 1;
    // A stride coprime to 2 and 3 keeps both barred arms and all spiral arms visible.
    let stride = moving ? Math.max(5, Math.ceil(this.particleCount / 3500)) : 1;
    while (stride % 2 === 0 || stride % 3 === 0) stride++;
    const puffStride = moving ? 2 : 1;
    const glow = moving ? 1.35 : 1;
    const zoomSqrt = Math.sqrt(totalScale);

    // 1. Background 3D Milky Way Band (mist puffs + pinpoint star field)
    ctx.globalCompositeOperation = tokens.isLight ? 'source-over' : 'lighter';
    const skyLightScale = tokens.isLight ? 0.52 : 1;
    if (this.cachedMilkyWay) {
      const mw = this.cachedMilkyWay;
      if (skySprites.nebula) {
        const puffs = mw.puffs;
        for (let i = 0; i < mw.puffCount; i += puffStride) {
          const o = i * 5;
          space.projectPoint(puffs[o], puffs[o + 1], puffs[o + 2], proj);
          if (!(proj.scale > 0.08 && proj.scale < 8)) continue;
          const sx = padX + (camX + proj.x * camScale) * viewScale;
          const sy = padY + (camY + proj.y * camScale) * viewScale;
          const rPx = puffs[o + 3] * proj.scale * totalScale;
          if (sx + rPx < -40 || sx - rPx > this.cssW + 40 || sy + rPx < -40 || sy - rPx > this.cssH + 40) continue;
          ctx.globalAlpha = puffs[o + 4] * proj.depthFade * skyAlphaMul * skyLightScale;
          ctx.drawImage(skySprites.nebula, sx - rPx, sy - rPx, rPx * 2, rPx * 2);
        }
      }

      const stars = mw.stars;
      for (let i = 0; i < mw.starCount; i += moving ? 3 : 1) {
        const o = i * 6;
        space.projectPoint(stars[o], stars[o + 1], stars[o + 2], proj);
        if (!(proj.scale > 0.08 && proj.scale < 8)) continue;
        const sx = padX + (camX + proj.x * camScale) * viewScale;
        const sy = padY + (camY + proj.y * camScale) * viewScale;
        if (sx < -16 || sx > this.cssW + 16 || sy < -16 || sy > this.cssH + 16) continue;
        const sz = stars[o + 3] * Math.max(0.55, Math.min(1.55, proj.scale * zoomSqrt));
        const tintIdx = stars[o + 5] | 0;
        const a = stars[o + 4] * proj.depthFade * skyAlphaMul * skyLightScale;
        if (a <= 0.015) continue;
        ctx.globalAlpha = a;
        if (sz < 1.25 || !skySprites.stars[tintIdx]) {
          ctx.fillStyle = skySprites.dots[tintIdx];
          ctx.fillRect(sx - sz * 0.5, sy - sz * 0.5, sz, sz);
        } else {
          const half = sz * 2.1;
          ctx.drawImage(skySprites.stars[tintIdx], sx - half, sy - half, half * 2, half * 2);
        }
      }
    }

    // 2. Inter-Galactic Tidal Star Streams
    for (const stream of this.cachedStreams) {
      const touchesActive = this.hasFocus && this.activeCommunity != null
        && (String(stream.commA) === String(this.activeCommunity) || String(stream.commB) === String(this.activeCommunity));
      const streamAlpha = this.hasFocus ? (touchesActive ? 1.15 : 0.16) : 0.78;
      const spA = this.getPaletteSprites(stream.colorA, tokens);
      const spB = this.getPaletteSprites(stream.colorB, tokens);
      const pts = stream.pts;
      for (let i = 0; i < stream.count; i += stride) {
        const o = i * 6;
        space.projectPoint(pts[o], pts[o + 1], pts[o + 2], proj);
        if (!(proj.scale > 0.08 && proj.scale < 8)) continue;
        const sx = padX + (camX + proj.x * camScale) * viewScale;
        const sy = padY + (camY + proj.y * camScale) * viewScale;
        if (sx < -20 || sx > this.cssW + 20 || sy < -20 || sy > this.cssH + 20) continue;
        const sz = pts[o + 3] * Math.max(0.6, Math.min(1.8, proj.scale * zoomSqrt));
        const a = clamp(pts[o + 4] * proj.depthFade * streamAlpha, 0, 1);
        if (a <= 0.015) continue;
        const useB = pts[o + 5] >= 0.5;
        const spr = (useB ? spB : spA).stars[i % 4];
        ctx.globalAlpha = a;
        if (spr && sz >= 1.1) {
          const half = sz * 2.2;
          ctx.drawImage(spr, sx - half, sy - half, half * 2, half * 2);
        } else {
          ctx.fillStyle = (useB ? spB : spA).dots[1];
          ctx.fillRect(sx - sz * 0.5, sy - sz * 0.5, sz, sz);
        }
      }
    }

    // 3. Depth-sort Galaxies back-to-front (smaller depth = farther, larger depth = closer)
    const ordered = this.cachedGalaxies.map((g) => {
      const p = space.projectPoint(g.center.x, g.center.y, g.center.z);
      return { g, depth: p.depth };
    }).sort((a, b) => a.depth - b.depth);

    for (const { g } of ordered) {
      const isFocused = this.hasFocus && this.activeCommunity != null && String(g.community) === String(this.activeCommunity);
      const galAlpha = this.hasFocus ? (isFocused ? 1.08 : 0.22) : 1;
      const palette = this.getPaletteSprites(g.color, tokens);

      // 3a. Volumetric Nebula Puffs
      const puffs = g.puffs;
      for (let i = 0; i < g.puffCount; i += puffStride) {
        const o = i * 6;
        space.projectPoint(puffs[o], puffs[o + 1], puffs[o + 2], proj);
        if (!(proj.scale > 0.08 && proj.scale < 8)) continue;
        const sx = padX + (camX + proj.x * camScale) * viewScale;
        const sy = padY + (camY + proj.y * camScale) * viewScale;
        const rPx = puffs[o + 3] * proj.scale * totalScale;
        if (sx + rPx < -40 || sx - rPx > this.cssW + 40 || sy + rPx < -40 || sy - rPx > this.cssH + 40) continue;
        const spr = palette.nebula[puffs[o + 5] | 0] || palette.nebula[1];
        if (!spr) continue;
        ctx.globalAlpha = clamp(puffs[o + 4] * proj.depthFade * galAlpha, 0, 1);
        ctx.drawImage(spr, sx - rPx, sy - rPx, rPx * 2, rPx * 2);
      }

      // 3b. Dense 3D Starlight Particles (micro-sand + pinpoint stars + diamond glints)
      const stars = g.stars;
      const zoomSpread = Math.max(0.55, Math.min(2.1, Math.sqrt(Math.max(0.35, totalScale))));
      for (let i = 0; i < g.starCount; i += stride) {
        const o = i * 7;
        space.projectPoint(stars[o], stars[o + 1], stars[o + 2], proj);
        if (!(proj.scale > 0.08 && proj.scale < 8)) continue;
        const sx = padX + (camX + proj.x * camScale) * viewScale;
        const sy = padY + (camY + proj.y * camScale) * viewScale;
        if (sx < -24 || sx > this.cssW + 24 || sy < -24 || sy > this.cssH + 24) continue;

        const bucket = stars[o + 5] | 0;
        const kind = stars[o + 6] | 0;
        const sz = stars[o + 3] * proj.scale * zoomSpread;
        const a = clamp(stars[o + 4] * proj.depthFade * galAlpha * glow, 0, 1);
        if (a <= 0.015) continue;

        ctx.globalAlpha = a;
        if (kind === 1) {
          const glint = palette.glints[bucket === 0 ? 0 : 1];
          if (glint) {
            const half = Math.max(5.5, sz * 3.6);
            ctx.drawImage(glint, sx - half, sy - half, half * 2, half * 2);
            continue;
          }
        }
        if (kind === 2 || sz < 1.15) {
          ctx.fillStyle = palette.dots[bucket] || palette.dots[1];
          const pxSz = Math.max(0.95, sz * 0.85);
          ctx.fillRect(sx - pxSz * 0.5, sy - pxSz * 0.5, pxSz, pxSz);
        } else {
          const spr = palette.stars[bucket] || palette.stars[1];
          const half = Math.max(2.2, sz * 2.25);
          ctx.drawImage(spr, sx - half, sy - half, half * 2, half * 2);
        }
      }
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
