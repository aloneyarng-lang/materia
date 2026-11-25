const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const turn = Math.PI * 2;
const pitchLimit = 1.22; // ~70 deg vertical tilt; yaw wraps 360 deg.
const wrapAngle = a => ((a + Math.PI) % turn + turn) % turn - Math.PI;

function spread(key) {
  let hash = 2166136261;
  for (const char of String(key)) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  return (hash >>> 0) / 2147483648 - 1;
}

const unit = key => (spread(key) + 1) / 2;
const galaxyForms = ['spiral', 'barred', 'ring', 'elliptical'];

function galaxyBasis(key) {
  const az = turn * unit(key + '/azimuth');
  const incSign = unit(key + '/inclinationSign') < 0.5 ? -1 : 1;
  const inc = incSign * (0.48 + 0.52 * unit(key + '/inclination'));
  const roll = turn * unit(key + '/roll');
  const ca = Math.cos(az), sa = Math.sin(az);
  const ci = Math.cos(inc), si = Math.sin(inc);
  const cr = Math.cos(roll), sr = Math.sin(roll);

  const transformVec = (vx, vy, vz) => {
    const x1 = vx * ca - vy * sa;
    const y1 = vx * sa + vy * ca;
    const z1 = vz;
    const x2 = x1;
    const y2 = y1 * ci - z1 * si;
    const z2 = y1 * si + z1 * ci;
    return [x2 * cr - y2 * sr, x2 * sr + y2 * cr, z2];
  };

  return {
    u: transformVec(1, 0, 0),
    v: transformVec(0, 1, 0),
    w: transformVec(0, 0, 1),
  };
}

function toWorld(basis, lx, ly, lz) {
  const {u, v, w} = basis;
  return {
    x: lx * u[0] + ly * v[0] + lz * w[0],
    y: lx * u[1] + ly * v[1] + lz * w[1],
    z: lx * u[2] + ly * v[2] + lz * w[2],
  };
}

function localSpiralPoint(arm, arms, t, R) {
  const r = (0.18 + 0.84 * Math.pow(t, 0.86)) * R;
  const theta = (turn * arm) / arms + 2.55 * Math.log(1 + 3.2 * t);
  return {x: r * Math.cos(theta), y: r * Math.sin(theta), r, theta};
}

function localBarredArmPoint(arm, t, R, barHalf) {
  const baseAngle = arm === 0 ? 0 : Math.PI;
  const r = barHalf + (R - barHalf) * Math.pow(t, 0.90);
  const theta = baseAngle + 2.30 * Math.pow(t, 0.92);
  return {x: r * Math.cos(theta), y: r * Math.sin(theta), r, theta};
}

function buildDustStars(key, form, count, R, params) {
  const dustCount = Math.min(95, Math.max(44, Math.round(36 + count * 0.45)));
  const stars = [];
  for (let i = 0; i < dustCount; i++) {
    const dk = `${key}/dust/${i}`;
    const p = (i + 0.5) / dustCount;
    const alpha = 0.28 + 0.58 * unit(dk + '/a');
    const rSize = 0.55 + 1.05 * Math.pow(unit(dk + '/s'), 1.6);
    let lx = 0, ly = 0, lz = 0, warm = false;

    if (form === 'spiral') {
      const {arms} = params;
      if (i < Math.round(dustCount * 0.24)) {
        const rad = (0.02 + 0.20 * Math.sqrt((i + 0.5) / Math.round(dustCount * 0.24))) * R;
        const th = i * 2.39996323 + spread(dk + '/az') * 0.4;
        lx = rad * Math.cos(th);
        ly = rad * Math.sin(th);
        lz = spread(dk + '/h') * 0.095 * R * (1 - rad / (0.24 * R));
        warm = true;
      } else {
        const arm = i % arms;
        const t = clamp(unit(dk + '/t') * 1.04, 0.04, 1.04);
        const pt = localSpiralPoint(arm, arms, t, R);
        const next = localSpiralPoint(arm, arms, t + 0.02, R);
        const len = Math.hypot(next.x - pt.x, next.y - pt.y) || 1;
        const nx = -(next.y - pt.y) / len, ny = (next.x - pt.x) / len;
        const jitter = spread(dk + '/p') * (0.045 + 0.085 * t) * R;
        lx = pt.x + nx * jitter;
        ly = pt.y + ny * jitter;
        lz = spread(dk + '/h') * 0.032 * R * (1 - 0.4 * t);
        warm = t < 0.25;
      }
    } else if (form === 'barred') {
      const {barHalf} = params;
      if (i < Math.round(dustCount * 0.34)) {
        const s = unit(dk + '/bar') * 2 - 1;
        lx = Math.sign(s) * Math.pow(Math.abs(s), 1.15) * barHalf;
        ly = spread(dk + '/w') * (0.09 - 0.03 * Math.abs(s)) * R;
        lz = spread(dk + '/h') * (0.085 - 0.045 * Math.abs(s)) * R;
        warm = Math.abs(s) < 0.55;
      } else {
        const arm = i % 2;
        const t = clamp(unit(dk + '/t') * 1.04, 0.01, 1.04);
        const pt = localBarredArmPoint(arm, t, R, barHalf);
        const next = localBarredArmPoint(arm, t + 0.02, R, barHalf);
        const len = Math.hypot(next.x - pt.x, next.y - pt.y) || 1;
        const nx = -(next.y - pt.y) / len, ny = (next.x - pt.x) / len;
        const jitter = spread(dk + '/p') * (0.045 + 0.075 * t) * R;
        lx = pt.x + nx * jitter;
        ly = pt.y + ny * jitter;
        lz = spread(dk + '/h') * 0.030 * R;
      }
    } else if (form === 'ring') {
      const {ringRadius, ringOval} = params;
      if (i < Math.round(dustCount * 0.24)) {
        const rad = (0.02 + 0.16 * Math.sqrt((i + 0.5) / Math.round(dustCount * 0.24))) * R;
        const th = i * 2.39996323 + spread(dk + '/az') * 0.3;
        lx = rad * Math.cos(th);
        ly = rad * Math.sin(th);
        lz = spread(dk + '/h') * 0.08 * R;
        warm = true;
      } else if (i % 9 === 0) {
        const rad = (0.28 + 0.42 * unit(dk + '/sp')) * R;
        const th = turn * Math.floor(unit(dk + '/spk') * 5) / 5 + spread(dk + '/sk') * 0.08;
        lx = rad * Math.cos(th);
        ly = rad * Math.sin(th) * ringOval;
        lz = spread(dk + '/h') * 0.02 * R;
        warm = false;
      } else {
        const rad = ringRadius + spread(dk + '/rr') * 0.085 * R;
        const th = turn * unit(dk + '/rt');
        lx = rad * Math.cos(th);
        ly = rad * Math.sin(th) * ringOval;
        lz = spread(dk + '/h') * 0.032 * R;
      }
    } else {
      const [au, av, aw] = params.axes;
      const rad = 0.04 + 0.96 * Math.pow(p, 1.15);
      const cosPhi = 1 - 2 * ((i * 0.61803398875 + unit(dk + '/phi')) % 1);
      const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
      const lon = i * 2.39996323 + spread(dk + '/az') * 0.45;
      lx = rad * au * sinPhi * Math.cos(lon);
      ly = rad * av * sinPhi * Math.sin(lon);
      lz = rad * aw * cosPhi;
      warm = rad < 0.46;
    }

    stars.push({lx, ly, lz, r: rSize, alpha, warm});
  }
  return stars;
}

function galaxyOffsets(nodes, previous, extent = 400) {
  const communities = new Map();
  for (const node of nodes) {
    if (node.community == null || node.type !== 'paper') continue;
    if (!communities.has(node.community)) communities.set(node.community, []);
    communities.get(node.community).push(node);
  }

  const qualifying = [];
  for (const [communityId, members] of communities.entries()) {
    if (members.length < 8) continue;
    const idSorted = members.slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const key = JSON.stringify(idSorted.map(node => node.id));
    const count = members.length;
    const center = idSorted.reduce((sum, node) => ({x: sum.x + node.x / count, y: sum.y + node.y / count}), {x: 0, y: 0});
    const variance = idSorted.reduce((sum, node) => sum + ((node.x - center.x) ** 2 + (node.y - center.y) ** 2) / count, 0);
    qualifying.push({communityId, members, idSorted, key, count, center, variance});
  }
  qualifying.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

  if (qualifying.length >= 2) {
    const depthOrder = qualifying.map((entry, idx) => ({idx, score: spread(entry.key + '/zOrder')}))
      .sort((a, b) => a.score - b.score || a.idx - b.idx);
    depthOrder.forEach((item, rank) => {
      const entry = qualifying[item.idx];
      const base = -0.82 + 1.64 * (rank / (qualifying.length - 1));
      entry.clusterDepth = clamp(base + spread(entry.key + '/depth') * 0.06, -0.9, 0.9);
      entry.centerZ = extent * 0.22 * entry.clusterDepth;
    });
  } else if (qualifying.length === 1) {
    qualifying[0].clusterDepth = spread(qualifying[0].key + '/depth');
    qualifying[0].centerZ = extent * 0.22 * qualifying[0].clusterDepth;
  }

  const galaxies = new Map(), offsets = new Map();
  for (const entry of qualifying) {
    const {communityId, idSorted, key, count, center, variance, clusterDepth, centerZ} = entry;
    let galaxy = previous?.get(key);
    if (!galaxy) {
      const rawR = Math.max(96, Math.sqrt(count) * 19.5, Math.sqrt(variance) * 1.12);
      let nearestDist3D = Infinity;
      for (const other of qualifying) {
        if (other === entry) continue;
        const d = Math.hypot(other.center.x - center.x, other.center.y - center.y, other.centerZ - centerZ);
        if (d < nearestDist3D) nearestDist3D = d;
      }
      const R = Number.isFinite(nearestDist3D)
        ? Math.min(rawR, Math.max(Math.min(rawR, 76), nearestDist3D * 0.44))
        : rawR;

      const form = galaxyForms[Math.floor(unit(key) * galaxyForms.length)];
      const basis = galaxyBasis(key);

      // Sort by degree descending so foundational hubs sit inside the luminous galactic core,
      // breaking ties deterministically by ID so order independence holds.
      const ordered = idSorted.slice().sort((a, b) =>
        (b.degree || 0) - (a.degree || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      );

      let arms = 2;
      let barHalf = 0.44 * R;
      const ringRadius = 0.85 * R;
      const ringOval = 0.94;
      const axes = [R, 0.72 * R, 0.54 * R];
      const armPaths = [];
      let barPath = null;
      const spokes = [];

      if (form === 'spiral') {
        arms = count >= 34 && unit(key + '/arms') > 0.45 ? 3 : 2;
        for (let arm = 0; arm < arms; arm++) {
          const pts = [];
          for (let s = 0; s <= 25; s++) {
            const t = 0.04 + (s / 25) * 1.0;
            const pt = localSpiralPoint(arm, arms, t, R);
            pts.push([pt.x, pt.y, 0]);
          }
          armPaths.push(pts);
        }
      } else if (form === 'barred') {
        barPath = [[-barHalf, 0, 0], [barHalf, 0, 0]];
        for (let arm = 0; arm < 2; arm++) {
          const pts = [];
          for (let s = 0; s <= 21; s++) {
            const t = (s / 21) * 1.04;
            const pt = localBarredArmPoint(arm, t, R, barHalf);
            pts.push([pt.x, pt.y, 0]);
          }
          armPaths.push(pts);
        }
      } else if (form === 'ring') {
        const spokeCount = 5;
        for (let s = 0; s < spokeCount; s++) {
          const angle = turn * (s / spokeCount) + spread(key + '/spoke/' + s) * 0.16;
          spokes.push([
            [0.21 * R * Math.cos(angle), 0.21 * R * Math.sin(angle) * ringOval, 0],
            [0.81 * R * Math.cos(angle), 0.81 * R * Math.sin(angle) * ringOval, 0],
          ]);
        }
      }

      const bulgeCount = form === 'spiral' ? Math.max(2, Math.round(count * 0.14))
        : form === 'barred' ? Math.max(3, Math.round(count * 0.30))
        : form === 'ring' ? Math.max(2, Math.round(count * 0.18))
        : count;

      const bridgeCount = form === 'ring' && count >= 28 ? Math.min(3, Math.floor((count - bulgeCount) * 0.1)) : 0;

      const points = ordered.map((node, i) => {
        let lx = 0, ly = 0, lz = 0;
        if (form === 'spiral') {
          if (i < bulgeCount) {
            const rad = (0.03 + 0.19 * Math.sqrt((i + 0.5) / bulgeCount)) * R;
            const theta = i * 2.39996323 + spread(node.id + '/azimuth') * 0.32;
            lx = rad * Math.cos(theta);
            ly = rad * Math.sin(theta);
            lz = spread(node.id + '/height') * 0.11 * R * (1 - rad / (0.25 * R));
          } else {
            const j = i - bulgeCount;
            const armCount = count - bulgeCount;
            const t = (j + 0.5) / armCount;
            const arm = j % arms;
            const pt = localSpiralPoint(arm, arms, t, R);
            const next = localSpiralPoint(arm, arms, t + 0.02, R);
            const len = Math.hypot(next.x - pt.x, next.y - pt.y) || 1;
            const nx = -(next.y - pt.y) / len, ny = (next.x - pt.x) / len;
            const perp = spread(node.id + '/azimuth') * (0.055 + 0.065 * t) * R;
            lx = pt.x + nx * perp;
            ly = pt.y + ny * perp;
            lz = spread(node.id + '/height') * 0.038 * R * (1 - 0.45 * t);
          }
        } else if (form === 'barred') {
          if (i < bulgeCount) {
            const s = ((i + 0.5) / bulgeCount) * 2 - 1;
            lx = Math.sign(s) * Math.pow(Math.abs(s), 1.15) * barHalf;
            ly = spread(node.id + '/azimuth') * (0.095 - 0.03 * Math.abs(s)) * R;
            lz = spread(node.id + '/height') * (0.095 - 0.055 * Math.abs(s)) * R;
          } else {
            const j = i - bulgeCount;
            const armCount = count - bulgeCount;
            const t = (j + 0.5) / armCount;
            const arm = j % 2;
            const pt = localBarredArmPoint(arm, t, R, barHalf);
            const next = localBarredArmPoint(arm, t + 0.02, R, barHalf);
            const len = Math.hypot(next.x - pt.x, next.y - pt.y) || 1;
            const nx = -(next.y - pt.y) / len, ny = (next.x - pt.x) / len;
            const perp = spread(node.id + '/azimuth') * (0.05 + 0.065 * t) * R;
            lx = pt.x + nx * perp;
            ly = pt.y + ny * perp;
            lz = spread(node.id + '/height') * 0.036 * R;
          }
        } else if (form === 'ring') {
          if (i < bulgeCount) {
            const rad = (0.02 + 0.18 * Math.sqrt((i + 0.5) / bulgeCount)) * R;
            const theta = i * 2.39996323 + spread(node.id + '/azimuth') * 0.3;
            lx = rad * Math.cos(theta);
            ly = rad * Math.sin(theta);
            lz = spread(node.id + '/height') * 0.085 * R;
          } else if (i < bulgeCount + bridgeCount) {
            const b = i - bulgeCount;
            const rad = (0.36 + 0.28 * ((b + 0.5) / bridgeCount)) * R;
            const theta = turn * ((b + 0.5) / bridgeCount) + spread(node.id + '/azimuth') * 0.3;
            lx = rad * Math.cos(theta);
            ly = rad * Math.sin(theta) * ringOval;
            lz = spread(node.id + '/height') * 0.028 * R;
          } else {
            const k = i - bulgeCount - bridgeCount;
            const ringCount = count - bulgeCount - bridgeCount;
            const rad = ringRadius + spread(node.id + '/ring') * 0.095 * R;
            const theta = turn * ((k + 0.5) / ringCount) + 0.14 * spread(node.id + '/azimuth');
            lx = rad * Math.cos(theta);
            ly = rad * Math.sin(theta) * ringOval;
            lz = spread(node.id + '/height') * 0.038 * R;
          }
        } else {
          const p = (i + 0.5) / count;
          const rad = 0.05 + 0.95 * Math.pow(p, 1.15);
          const cosPhi = 1 - 2 * ((i * 0.61803398875 + unit(node.id + '/phi')) % 1);
          const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
          const lon = i * 2.39996323 + spread(node.id + '/azimuth') * 0.35;
          lx = rad * axes[0] * sinPhi * Math.cos(lon);
          ly = rad * axes[1] * sinPhi * Math.sin(lon);
          lz = rad * axes[2] * cosPhi;
        }

        const w = toWorld(basis, lx, ly, lz);
        return [node.id, {
          x: center.x + w.x - node.x,
          y: center.y + w.y - node.y,
          z: w.z,
          clusterDepth,
        }];
      });

      const dustStars = buildDustStars(key, form, count, R, {arms, barHalf, ringRadius, ringOval, axes});
      const color = ordered.find(n => n.color)?.color || '#72b8ff';
      const baseSumX = ordered.reduce((s, n) => s + n.x, 0);
      const baseSumY = ordered.reduce((s, n) => s + n.y, 0);
      const meta = {
        id: 'gal-' + Math.abs(Math.round(spread(key) * 1e8)).toString(36),
        community: communityId,
        form,
        center: {x: center.x, y: center.y, depthFactor: clusterDepth},
        baseSumX,
        baseSumY,
        radius: R,
        basis,
        arms,
        barHalf,
        ringRadius,
        ringOval,
        axes,
        armPaths,
        barPath,
        spokes,
        dustStars,
        memberIds: ordered.map(n => n.id),
        color,
      };
      galaxy = {form, points, meta};
    }
    galaxies.set(key, galaxy);
    for (const [id, offset] of galaxy.points) offsets.set(id, offset);
  }
  return {galaxies, offsets};
}

export class GraphSpace {
  constructor(nodes, previous, shapeGalaxies = true) {
    const sameNodes = previous?.depths.size === nodes.length && nodes.every(node => previous.depths.has(node.id));
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const node of nodes) {
      left = Math.min(left, node.x);
      right = Math.max(right, node.x);
      top = Math.min(top, node.y);
      bottom = Math.max(bottom, node.y);
    }
    this.x = sameNodes ? previous.x : nodes.length ? (left + right) / 2 : 0;
    this.y = sameNodes ? previous.y : nodes.length ? (top + bottom) / 2 : 0;
    this.extent = sameNodes ? previous.extent : nodes.length ? Math.max(140, Math.hypot(right - left, bottom - top)) : 140;
    this.focal = sameNodes ? previous.focal : Math.max(460, this.extent * 2.1);

    const {galaxies, offsets} = shapeGalaxies
      ? galaxyOffsets(nodes, previous?.galaxies, this.extent)
      : {galaxies:new Map(),offsets:new Map()};
    this.galaxies = galaxies;
    this.offsets = offsets;
    for (const galaxy of galaxies.values()) {
      if (galaxy.meta && galaxy.meta.center.z === undefined) {
        galaxy.meta.center.z = this.extent * 0.22 * galaxy.meta.center.depthFactor;
      }
    }

    this.depths = new Map(nodes.map(node => {
      const cluster = node.community != null ? node.community : node.paper?.collection || node.type;
      const offset = offsets.get(node.id);
      return [node.id, this.extent * (.22 * (offset?.clusterDepth ?? spread(cluster)) + (offset ? 0 : .13 * spread(node.id))) + (offset?.z ?? 0)];
    }));
    this.yaw = previous?.yaw ?? -0.34;
    this.pitch = previous?.pitch ?? 0.30;
    this.rotate(0, 0);
  }

  rotate(yaw, pitch) {
    this.yaw = wrapAngle(this.yaw + yaw);
    this.pitch = clamp(this.pitch + pitch, -pitchLimit, pitchLimit);
    this.cy = Math.cos(this.yaw);
    this.sy = Math.sin(this.yaw);
    this.cp = Math.cos(this.pitch);
    this.sp = Math.sin(this.pitch);
  }

  projectPoint(wx, wy, wz, out = {}) {
    const X = wx - this.x;
    const Y = wy - this.y;
    const Z = wz;
    const rx = X * this.cy + Z * this.sy;
    const rz = Z * this.cy - X * this.sy;
    const ry = Y * this.cp - rz * this.sp;
    const depth = Y * this.sp + rz * this.cp;
    const denom = Math.max(this.focal * 0.35, this.focal - depth);
    const persp = this.focal / denom;
    out.x = this.x + rx * persp;
    out.y = this.y + ry * persp;
    out.depth = depth;
    out.scale = clamp(persp, 0.52, 1.9);
    out.depthFade = clamp(0.56 + 0.44 * ((depth / (this.extent * 0.55) + 1) / 2), 0.5, 1);
    return out;
  }

  project(node, point = Object.create(node)) {
    const offset = this.offsets.get(node.id);
    const wx = node.x + (offset?.x ?? 0);
    const wy = node.y + (offset?.y ?? 0);
    const wz = this.depths.get(node.id) ?? 0;
    this.projectPoint(wx, wy, wz, point);
    point.radius = (node.visualRadius ?? node.radius) * point.scale;
    return point;
  }

  unproject(point, node) {
    const offset = this.offsets.get(node.id);
    const Z = this.depths.get(node.id) ?? 0;
    const px = point.x - this.x;
    const py = point.y - this.y;
    const f = this.focal;
    const a11 = f * this.cy - px * this.sy * this.cp;
    const a12 = px * this.sp;
    const b1 = px * (f - Z * this.cy * this.cp) - f * Z * this.sy;
    const a21 = f * this.sy * this.sp - py * this.sy * this.cp;
    const a22 = f * this.cp + py * this.sp;
    const b2 = py * (f - Z * this.cy * this.cp) + f * Z * this.cy * this.sp;
    const det = a11 * a22 - a12 * a21;
    if (Math.abs(det) < 1e-6) return {x: node.x, y: node.y};
    const X = (b1 * a22 - a12 * b2) / det;
    const Y = (a11 * b2 - b1 * a21) / det;
    return {x: X + this.x - (offset?.x ?? 0), y: Y + this.y - (offset?.y ?? 0)};
  }
}
