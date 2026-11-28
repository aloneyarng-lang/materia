import {getLocale, msg, t} from './i18n.js';
import {reportAchievement} from './flow-achievements.js';
import {normalizedTagSet} from './shared-tag-links.js';
import {researchNeighbors} from './research-graph.js';
import {computeOrbitSingularityPerturbation, createBlackHoleSvg, hawkingReboundFactor, solarFlareSpeedMultiplier} from './black-hole-physics.js';

const NS = 'http://www.w3.org/2000/svg';
const fullTurn = 2 * Math.PI;
const reversalInterval = 5000;
const centerRadius = 34;
const defaultView = [{x: 1, y: 0, z: 0}, {x: 0, y: 1, z: 0}, {x: 0, y: 0, z: 1}];
const equatorPlane = {u: {x: 1, y: 0, z: 0}, v: {x: 0, y: 0.32, z: Math.sqrt(1 - 0.32 * 0.32)}};
const quarterCircle = 4 * (Math.SQRT2 - 1) / 3;
const planetColors = ['#70aebe', '#d7a071', '#a7abdf', '#659e86', '#b67b70'];
const orbitStyleKey = 'materia.orbit-style';

export function normalizeOrbitStyle(value) {
  return value === 'armillary' ? 'armillary' : 'cosmos';
}

function svgElement(tag, attributes, content) {
  const element = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  if (content !== undefined) element.textContent = content;
  return element;
}

function orbitDefinitions(centerY, wakeStyles = []) {
  const defs = svgElement('defs', {});
  for (const [id, cx, cy, r, stops] of [
    ['halo', '50%', '50%', '50%', [[.28,'#c2d8ff',.35],[.5,'#a6b9f4',.14],[1,'#a6b9f4',0]]],
    ['corona', '50%', '50%', '50%', [[0,'#d7e7ff',.26],[.45,'#94b9f7',.1],[1,'#94b9f7',0]]],
    ['light', '73%', '40%', '80%', [[0,'#fff4d3',.48],[.33,'#fff4d3',.12],[.54,'#121831',0],[.77,'#121831',.64],[1,'#111427',.93]]],
  ]) {
    const gradient = svgElement('radialGradient', {id: 'graph-orbit-' + id, cx, cy, r});
    for (const [offset, color, opacity] of stops) {
      gradient.append(svgElement('stop', {offset, 'stop-color': color, 'stop-opacity': opacity}));
    }
    defs.append(gradient);
  }
  for (let i = 0; i < wakeStyles.length; i++) {
    const color = wakeStyles[i] || '#9cc7ff';
    const grad = svgElement('linearGradient', {
      id: `graph-orbit-wake-${i}`,
      gradientUnits: 'userSpaceOnUse',
      x1: '0', y1: '0', x2: '1', y2: '0',
    });
    grad.append(
      svgElement('stop', {offset: '0', 'stop-color': color, 'stop-opacity': '0'}),
      svgElement('stop', {offset: '0.55', 'stop-color': color, 'stop-opacity': '0.32'}),
      svgElement('stop', {offset: '1', 'stop-color': '#e8f4ff', 'stop-opacity': '0.88'})
    );
    defs.append(grad);
  }
  const clip = svgElement('clipPath', {id: 'graph-orbit-disc'});
  clip.append(svgElement('circle', {r: 1}));
  const mask = svgElement('mask', {id: 'graph-orbit-behind-center', maskUnits: 'userSpaceOnUse',
    x: 0, y: 0, width: 1000, height: centerY * 2});
  mask.append(svgElement('rect', {width: 1000, height: centerY * 2, fill: 'white'}),
    svgElement('circle', {cx: 500, cy: centerY, r: centerRadius, fill: 'black'}));
  defs.append(clip, mask);
  return defs;
}

function seededRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function orbitStarfield(height) {
  const sky = svgElement('g', {class: 'graph-orbit-starfield', 'aria-hidden': 'true'});
  const far = svgElement('g', {class: 'graph-orbit-stars-far'});
  const near = svgElement('g', {class: 'graph-orbit-stars-near'});
  const random = seededRandom(6284);

  for (let i = 0; i < 60; i++) {
    const twinkle = i % 5 === 0;
    const star = svgElement('circle', {
      cx: (12 + random() * 976).toFixed(1),
      cy: (height * (.03 + random() * .94)).toFixed(1),
      r: (.4 + random() * .55).toFixed(2),
      opacity: (.18 + random() * .35).toFixed(2),
      ...(twinkle ? {class: 'is-twinkle'} : {}),
    });
    if (twinkle) star.style.setProperty('--twinkle-delay', `${((i % 7) * 0.55).toFixed(2)}s`);
    far.append(star);
  }

  for (let i = 0; i < 28; i++) {
    const cx = 24 + random() * 952;
    const cy = height * (.05 + random() * .9);
    const bright = i % 7 === 0;
    const star = svgElement('circle', {
      cx: cx.toFixed(1),
      cy: cy.toFixed(1),
      r: bright ? '1.65' : (.75 + random() * .55).toFixed(2),
      opacity: bright ? '0.82' : (.35 + random() * .4).toFixed(2),
      class: 'is-twinkle',
    });
    star.style.setProperty('--twinkle-delay', `${((i % 9) * 0.42).toFixed(2)}s`);
    near.append(star);
    if (bright) {
      near.append(svgElement('path', {
        class: 'graph-orbit-star-glint',
        d: `M ${cx - 5} ${cy} L ${cx + 5} ${cy} M ${cx} ${cy - 5} L ${cx} ${cy + 5}`,
      }));
    }
  }

  const meteor = svgElement('line', {
    class: 'graph-orbit-meteor',
    x1: '860', y1: String(Math.round(height * 0.08)),
    x2: '775', y2: String(Math.round(height * 0.19)),
  });

  sky.append(far, near, meteor);
  return sky;
}

function orbitSeed(id) {
  let seed = 2166136261;
  for (const character of String(id)) {
    seed = Math.imul(seed ^ character.codePointAt(0), 16777619);
  }
  return seed;
}

export function orbitPlanetStyle(id) {
  const seed = orbitSeed(id);
  const random = seededRandom(seed);
  return {
    seed,
    color: planetColors[Math.floor(random() * planetColors.length)],
    form: ['banded', 'rocky', 'ringed', 'mottled'][Math.floor(random() * 4)],
    angle: Math.round(random() * 80 - 40),
  };
}

export function orbitPlane(centerId, paperId) {
  const random = seededRandom(orbitSeed(JSON.stringify([centerId, paperId])));
  const rotation = random() * fullTurn;
  const flattening = .34 + random() * .55;
  const cos = Math.cos(rotation), sin = Math.sin(rotation);
  return {rotation, phase: random() * fullTurn,
    u: {x: cos, y: sin, z: 0},
    v: {x: -sin * flattening, y: cos * flattening, z: Math.sqrt(1 - flattening ** 2)},
  };
}

export function projectOrbit({u, v}, radius, phase) {
  const cos = radius * Math.cos(phase), sin = radius * Math.sin(phase);
  return {x: u.x * cos + v.x * sin, y: u.y * cos + v.y * sin, z: u.z * cos + v.z * sin};
}

export function rotateOrbitView(view, yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  return view.map(({x, y, z}) => {
    const depth = z * cy - x * sy;
    return {x: x * cy + z * sy, y: y * cp - depth * sp, z: y * sp + depth * cp};
  });
}

export function orbitEntryView() {
  return rotateOrbitView(defaultView, 0.34, -0.28);
}

export function orbitWarpStreaks(centerY, count = 24) {
  const random = seededRandom(4917);
  const streaks = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * fullTurn + (random() - 0.5) * 0.14;
    const inner = 54 + random() * 44;
    const outer = 260 + random() * 270;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    streaks.push({
      x1: Number((500 + cos * inner).toFixed(2)),
      y1: Number((centerY + sin * inner).toFixed(2)),
      x2: Number((500 + cos * outer).toFixed(2)),
      y2: Number((centerY + sin * outer).toFixed(2)),
      delay: Number(((i % 6) * 0.032).toFixed(3)),
      alpha: Number((0.28 + random() * 0.48).toFixed(2)),
    });
  }
  return streaks;
}

export function orbitViewAngles(view = defaultView) {
  const depth = view?.[2] || defaultView[2];
  const az = Math.round(Math.atan2(depth.x, depth.z) * 180 / Math.PI);
  const el = Math.round(Math.asin(Math.max(-1, Math.min(1, -depth.y))) * 180 / Math.PI);
  return {azimuth: Object.is(az, -0) ? 0 : az, elevation: Object.is(el, -0) ? 0 : el};
}

function normalizeVec(v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return {x: v.x / len, y: v.y / len, z: v.z / len};
}

function crossVec(a, b) {
  return {x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x};
}

export function interpolateOrbitView(fromView, toView, t) {
  const clamped = Math.max(0, Math.min(1, t));
  const lerpVec = (a, b) => ({
    x: a.x + (b.x - a.x) * clamped,
    y: a.y + (b.y - a.y) * clamped,
    z: a.z + (b.z - a.z) * clamped,
  });
  const right = normalizeVec(lerpVec(fromView[0], toView[0]));
  const rawDown = lerpVec(fromView[1], toView[1]);
  const dot = right.x * rawDown.x + right.y * rawDown.y + right.z * rawDown.z;
  const down = normalizeVec({
    x: rawDown.x - right.x * dot,
    y: rawDown.y - right.y * dot,
    z: rawDown.z - right.z * dot,
  });
  const depth = normalizeVec(crossVec(right, down));
  return [right, down, depth];
}

export function orbitWakePath(projected, radius, phase, direction = 1, span = 0.72, segments = 12) {
  const dir = direction < 0 ? -1 : 1;
  const points = [];
  for (let i = segments; i >= 0; i--) {
    const p = phase - dir * span * (i / segments);
    const pt = projectOrbit(projected, radius, p);
    points.push({x: Number(pt.x.toFixed(2)), y: Number(pt.y.toFixed(2))});
  }
  const d = points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
  return {d, tail: points[0], head: points.at(-1)};
}

function viewOrbit({u, v}, [right, down, depth]) {
  const project = ({x, y, z}) => ({
    x: right.x * x + down.x * y + depth.x * z,
    y: right.y * x + down.y * y + depth.y * z,
    z: right.z * x + down.z * y + depth.z * z,
  });
  return {u: project(u), v: project(v)};
}

function orbitLine({u, v}, radius) {
  const points = [u, v, {x: -u.x, y: -u.y}, {x: -v.x, y: -v.y}];
  const pair = (a, b, offset) => [radius * (a.x + b.x * offset), radius * (a.y + b.y * offset)].join(' ');
  let path = 'M ' + pair(u, u, 0);
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    path += ' C ' + pair(a, b, quarterCircle) + ' ' + pair(b, a, quarterCircle) + ' ' + pair(b, b, 0);
  }
  return path + ' Z';
}

function equatorTicksPath(projected, innerR, outerR, count = 24) {
  let d = '';
  for (let i = 0; i < count; i++) {
    const theta = (i / count) * fullTurn;
    const p1 = projectOrbit(projected, innerR, theta);
    const p2 = projectOrbit(projected, outerR, theta);
    d += `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} L ${p2.x.toFixed(1)} ${p2.y.toFixed(1)} `;
  }
  return d.trim();
}

export function reverseRandomSatellite(satellites, random = Math.random) {
  if (!satellites.length || random() >= .01) return null;
  const satellite = satellites[Math.floor(random() * satellites.length)];
  satellite.angularSpeed *= -1;
  return satellite;
}

function planetArtwork(radius, {seed, color, form, angle}) {
  const body = svgElement('g', {class: 'graph-orbit-body', transform: `scale(${radius})`, 'aria-hidden': 'true'});
  const random = seededRandom(seed);
  const ring = form === 'ringed' && svgElement('g', {transform: `rotate(${angle})`, fill: 'none',
    stroke: '#e6d4b6', 'stroke-width': .13});
  if (ring) {
    ring.append(svgElement('path', {d: 'M -1.7 0 A 1.7 .48 0 0 1 1.7 0', opacity: .55}));
    body.append(ring);
  }
  body.append(svgElement('circle', {class: 'graph-orbit-sphere', r: 1, fill: color}));
  const texture = svgElement('g', {'clip-path': 'url(#graph-orbit-disc)'});
  const surface = svgElement('g', {});
  if (form === 'mottled') {
    for (let i = 0; i < 26; i++) {
      const x = 2 * random() - 1, y = 2 * random() - 1;
      const width = .03 + random() * .22;
      surface.append(svgElement('path', {
        d: `M ${x} ${y} q ${width * .7} ${-width} ${width} ${-width * .25}`,
        fill: 'none', stroke: i % 3 ? '#fff3ae' : '#bc593d',
        'stroke-width': .045 + random() * .06, 'stroke-linecap': 'round', opacity: .38,
      }));
    }
  } else if (form === 'banded' || form === 'ringed') {
    const bands = svgElement('g', {transform: `rotate(${angle})`, fill: 'none'});
    for (const [y, stroke, width, opacity] of [
      [-.65,'#fff7dc',.12,.55],[-.39,'#fff7dc',.21,.29],[-.16,'#432331',.10,.25],
      [.12,'#fff7dc',.15,.46],[.37,'#432331',.24,.21],[.65,'#fff7dc',.14,.37],
    ]) {
      bands.append(svgElement('path', {d: `M -1.2 ${y} Q -.21 ${y + .38} 1.2 ${y - .17}`,
        stroke, 'stroke-width': width, opacity}));
    }
    surface.append(bands);
  } else {
    for (const [cx, cy, rx, ry] of [[-.49,-.29,.24,.13],[.17,-.5,.16,.1],[.39,.2,.27,.17],
      [-.34,.39,.15,.12],[.08,.65,.11,.067],[-.68,.13,.105,.07]]) {
      surface.append(svgElement('ellipse', {cx, cy, rx: rx * (.8 + .4 * random()), ry, fill:'#552c40', opacity: .32,
        stroke:'#fff0d3', 'stroke-opacity': .6, 'stroke-width': .035}));
    }
  }
  const light = svgElement('circle', {r: 1, fill: 'url(#graph-orbit-light)'});
  texture.append(surface);
  body.append(texture, light, svgElement('circle', {class: 'graph-orbit-rim', r: 1, fill:'none', stroke: '#e0f4ff',
    'stroke-opacity': .42, 'stroke-width': .04}));
  if (ring) {
    const front = ring.cloneNode();
    front.append(svgElement('path', {d: 'M -1.7 0 A 1.7 .48 0 0 0 1.7 0', opacity: .9}));
    body.append(front);
  }
  return {body, light, surface};
}

function reticleMarkup(r) {
  const g = svgElement('g', {class: 'graph-orbit-reticle', 'aria-hidden': 'true'});
  const c = (r * 0.42).toFixed(2);
  const rv = r.toFixed(2);
  for (const d of [
    `M ${-rv} ${-c} A ${rv} ${rv} 0 0 1 ${-c} ${-rv}`,
    `M ${c} ${-rv} A ${rv} ${rv} 0 0 1 ${rv} ${-c}`,
    `M ${rv} ${c} A ${rv} ${rv} 0 0 1 ${c} ${rv}`,
    `M ${-c} ${rv} A ${rv} ${rv} 0 0 1 ${-rv} ${c}`,
  ]) {
    g.append(svgElement('path', {d}));
  }
  return g;
}

export function rankOrbitPapers(center, papers, {orbitRings, clusterBasis, similarityThreshold}) {
  const nearest = researchNeighbors(papers, center.id, {
    clusterBasis, similarityThreshold, limit: orbitRings,
  });
  const tags = normalizedTagSet(center);
  return nearest.map(paper => {
    let count = 0;
    for (const tag of normalizedTagSet(paper)) if (tags.has(tag)) count++;
    return {paper, count};
  });
}

export class GraphOrbit {
  constructor(svg, {onSelect, onCenter, onMenu, onHover, onClose}) {
    this.svg = svg;
    const wrap = svg.parentElement;
    this.toolbar = wrap?.querySelector('.graph-orbit-toolbar');
    this.eyebrow = this.toolbar?.querySelector('[data-orbit-eyebrow]');
    this.styleButton = this.toolbar?.querySelector('[data-orbit-style]');
    this.motionButton = this.toolbar?.querySelector('[data-orbit-motion]');
    this.hud = wrap?.querySelector('.graph-orbit-hud');
    this.visible = true;
    this.paused = false;
    this.view = defaultView;
    this.parallax = {x: 0, y: 0};
    this.orbitStyle = 'cosmos';
    try { this.orbitStyle = normalizeOrbitStyle(globalThis.localStorage?.getItem(orbitStyleKey)); } catch {}
    this.motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
    this.motionPreference.addEventListener('change', () => this.syncMotion());
    document.addEventListener('visibilitychange', () => this.syncMotion());
    this.orbitTime = 0;
    this.nextReversalCheck = reversalInterval;
    this.entryFrame = undefined;
    this.entryTimer = 0;
    this.entryFlight = null;
    this.singularity = null;
    this.flare = null;
    this.activeFlareMult = 1;
    this.emptyClicks = [];
    this.centerHoldTimer = 0;
    this.suppressCenterClick = false;
    this.reducedSingularityTimer = 0;
    this.animate = this.animate.bind(this);
    this.toolbar?.querySelector('[data-orbit-close]')?.addEventListener('click', onClose);
    this.motionButton?.addEventListener('click', () => {
      this.paused = !this.paused;
      this.syncMotion();
    });
    this.styleButton?.addEventListener('click', () => {
      this.orbitStyle = this.orbitStyle === 'armillary' ? 'cosmos' : 'armillary';
      try { globalThis.localStorage?.setItem(orbitStyleKey, this.orbitStyle); } catch {}
      this.syncStyle();
    });
    this.hud?.addEventListener('click', event => {
      if (event.target.closest('[data-orbit-reset]')) this.resetView();
    });
    Object.assign(this, {onSelect, onCenter, onMenu, onHover});
    this.bindRotation();
    this.bindOrbitInteractions();
  }

  stopEntryTransition() {
    cancelAnimationFrame(this.entryFrame);
    this.entryFrame = undefined;
    clearTimeout(this.entryTimer);
    this.entryTimer = 0;
    this.entryFlight = null;
    this.layer?.querySelector('.graph-orbit-warp-streaks')?.remove();
    this.layer?.querySelector('.graph-orbit-lock-iris')?.remove();
    this.toolbar?.classList.remove('is-entering');
    this.hud?.classList.remove('is-entering');
  }

  clearOrbitEasterEggs() {
    clearTimeout(this.centerHoldTimer);
    clearTimeout(this.reducedSingularityTimer);
    this.centerHoldTimer = 0;
    this.reducedSingularityTimer = 0;
    this.suppressCenterClick = false;
    this.emptyClicks = [];
    this.singularity?.group?.remove();
    this.singularity = null;
    this.flare = null;
    this.activeFlareMult = 1;
    this.centerPlanet?.node.classList.remove('is-flaring');
    for (const wave of this.layer?.querySelectorAll('.graph-orbit-flare-wave') || []) wave.remove();
  }

  svgPoint(event) {
    const matrix = this.svg.getScreenCTM?.();
    return matrix
      ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
      : {x: 500, y: this.centerY || 310};
  }

  bindOrbitInteractions() {
    this.svg.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !this.layer || !this.visible) return;
      if (event.target.closest('[data-orbit-paper-id], button')) return;
      this.orbitDownPoint = this.svgPoint(event);
    });
    this.svg.addEventListener('pointerup', event => {
      if (event.button !== 0 || !this.layer || !this.visible || this.rotationDrag?.moved) {
        this.orbitDownPoint = null;
        return;
      }
      if (event.target.closest('[data-orbit-paper-id], button')) {
        this.orbitDownPoint = null;
        return;
      }
      const pt = this.svgPoint(event);
      if (this.orbitDownPoint && Math.hypot(pt.x - this.orbitDownPoint.x, pt.y - this.orbitDownPoint.y) > 8) {
        this.orbitDownPoint = null;
        return;
      }
      this.orbitDownPoint = null;
      const now = performance.now();
      this.emptyClicks = this.emptyClicks.filter(c => now - c.time <= 520 && Math.hypot(c.x - pt.x, c.y - pt.y) < 42);
      this.emptyClicks.push({time: now, x: pt.x, y: pt.y});
      if (this.emptyClicks.length >= 3) {
        this.emptyClicks = [];
        this.summonSingularity(pt);
      }
    });
  }

  summonSingularity(pt) {
    if (!this.layer) return;
    clearTimeout(this.reducedSingularityTimer);
    this.singularity?.group?.remove();
    const group = createBlackHoleSvg(document, {scale: 0.72, idPrefix: 'orbit-bh'});
    group.setAttribute('transform', `translate(${pt.x.toFixed(2)} ${pt.y.toFixed(2)})`);
    const satGroup = this.layer.querySelector('.graph-orbit-satellites');
    this.layer.insertBefore(group, satGroup || null);

    this.singularity = {
      x: pt.x,
      y: pt.y,
      horizon: 16,
      radius: 260,
      strength: this.motionPreference.matches ? 0.5 : 0,
      peakStrength: 1,
      reboundFactor: 1,
      phase: 'pull',
      evaporating: false,
      startTime: performance.now(),
      holdDuration: 2350,
      reboundDuration: 600,
      evapStart: 0,
      group,
    };
    reportAchievement('blackHoleSummons', 1, 'add');

    if (this.motionPreference.matches) {
      this.placeSatellites();
      this.reducedSingularityTimer = setTimeout(() => {
        this.singularity?.group?.remove();
        this.singularity = null;
        this.placeSatellites();
      }, 1100);
      return;
    }
    this.syncMotion();
  }

  triggerSolarFlare() {
    if (!this.layer || !this.centerPlanet) return;
    this.flare = {startTime: performance.now(), duration: 2600, peak: 4.8};
    this.centerPlanet.node.classList.add('is-flaring');
    reportAchievement('solarFlares', 1, 'add');

    if (!this.motionPreference.matches) {
      const satGroup = this.layer.querySelector('.graph-orbit-satellites');
      for (const extraClass of ['', 'is-secondary']) {
        const wave = svgElement('circle', {
          class: `graph-orbit-flare-wave ${extraClass}`.trim(),
          cx: '500',
          cy: String(this.centerY),
          r: String(centerRadius),
          'aria-hidden': 'true',
        });
        this.layer.insertBefore(wave, satGroup || null);
        setTimeout(() => wave.remove(), 980);
      }
      this.syncMotion();
    } else {
      setTimeout(() => this.centerPlanet?.node.classList.remove('is-flaring'), 650);
    }
  }

  clear() {
    this.stopEntryTransition();
    this.clearOrbitEasterEggs();
    this.releaseRotation();
    this.stopInertia();
    this.stopReset();
    this.stopMotion();
    this.layer?.remove();
    this.layer = null;
    this.key = null;
    this.centerId = null;
    this.centerPlanet = null;
    this.transition = null;
    this.satellites = [];
    this.wakeGradients = [];
    this.equatorRing = null;
    this.equatorTicks = null;
    this.beam = null;
    this.starsFar = null;
    this.starsNear = null;
    this.orbitTime = 0;
    this.nextReversalCheck = reversalInterval;
    this.paused = false;
    this.view = defaultView;
    this.parallax = {x: 0, y: 0};
    this.hoveredSatellite = null;
    this.hoveredMeta = null;
    delete this.svg.dataset.orbitFocus;
    delete this.svg.dataset.orbitStyle;
    delete this.svg.dataset.orbitPaused;
    if (this.toolbar) this.toolbar.hidden = true;
    if (this.hud) { this.hud.hidden = true; this.hud.innerHTML = ''; }
  }

  stopMotion() {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.lastFrame = undefined;
  }

  stopInertia() {
    if (this.inertiaFrame !== undefined) cancelAnimationFrame(this.inertiaFrame);
    this.inertiaFrame = undefined;
  }

  stopReset() {
    if (this.resetFrame !== undefined) cancelAnimationFrame(this.resetFrame);
    this.resetFrame = undefined;
  }

  setVisible(visible) {
    this.visible = visible;
    if (!visible) {
      this.releaseRotation();
      this.stopInertia();
      this.stopReset();
      this.hoveredSatellite = null;
      this.hoveredMeta = null;
    }
    this.syncMotion();
  }

  syncStyle() {
    if (this.svg.dataset.orbitFocus) this.svg.dataset.orbitStyle = this.orbitStyle;
    if (this.layer) this.layer.dataset.orbitStyle = this.orbitStyle;
    if (this.styleButton) {
      this.styleButton.textContent = this.orbitStyle === 'armillary' ? t('星野') : t('浑天仪');
    }
  }

  bindRotation() {
    const {svg} = this;
    svg.addEventListener('pointerdown', event => {
      if (event.button !== 2 || !this.layer || !this.visible || this.rotationDrag) return;
      this.stopInertia();
      this.stopReset();
      const {width, height} = svg.getBoundingClientRect();
      this.rotationDrag = {
        pointer: event.pointerId, x: event.clientX, y: event.clientY,
        lastTime: performance.now(), velYaw: 0, velPitch: 0,
        planet: event.target.closest('[data-orbit-paper-id]'),
        sensitivity: Math.PI / Math.max(260, Math.min(width, height)),
      };
      event.preventDefault();
      svg.setPointerCapture(event.pointerId);
    });
    svg.addEventListener('pointermove', event => {
      const drag = this.rotationDrag;
      if (drag?.pointer !== event.pointerId) return;
      if (!(event.buttons & 2)) {
        this.releaseRotation();
        this.syncMotion();
        return;
      }
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      const now = performance.now();
      const dt = Math.max(8, now - drag.lastTime);
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < 4) return;
        drag.moved = true;
        this.hoveredSatellite = null;
        this.hoveredMeta = null;
        this.syncHoverVisuals();
        this.onHover(null);
        if (this.satellites.length) svg.classList.add('graph-orbit-rotating');
        if (this.transition) {
          for (const animation of this.layer.getAnimations({subtree: true})) animation.finish();
        }
        this.syncMotion();
      }
      const dYaw = dx * drag.sensitivity;
      const dPitch = -dy * drag.sensitivity;
      const norm = 16 / dt;
      drag.velYaw = drag.velYaw * 0.45 + (dYaw * norm) * 0.55;
      drag.velPitch = drag.velPitch * 0.45 + (dPitch * norm) * 0.55;
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.lastTime = now;
      this.parallax.x = Math.max(-42, Math.min(42, this.parallax.x - dx * 0.28));
      this.parallax.y = Math.max(-32, Math.min(32, this.parallax.y - dy * 0.28));
      this.view = rotateOrbitView(this.view, dYaw, dPitch);
      this.projectTracks();
      this.updateHud();
    });
    const finish = event => {
      if (this.rotationDrag?.pointer !== event.pointerId) return;
      const drag = this.releaseRotation();
      if (event.type === 'pointerup' && drag.moved && !this.motionPreference.matches) {
        const speed = Math.hypot(drag.velYaw || 0, drag.velPitch || 0);
        if (speed > 0.0005) this.startInertia(drag.velYaw, drag.velPitch);
      }
      this.syncMotion();
      if (event.type === 'pointerup' && !drag.moved && this.layer?.contains(drag.planet)) {
        this.onMenu(drag.planet.dataset.orbitPaperId, event, drag.planet);
      }
    };
    svg.addEventListener('pointerup', finish);
    svg.addEventListener('pointercancel', finish);
    svg.addEventListener('lostpointercapture', finish);
    svg.addEventListener('contextmenu', event => {
      if (!this.layer) return;
      event.preventDefault();
      const planet = event.target.closest('[data-orbit-paper-id]');
      if (planet && event.button !== 2 && !this.rotationDrag) this.onMenu(planet.dataset.orbitPaperId, event, planet);
    });
  }

  startInertia(velYaw, velPitch) {
    this.stopInertia();
    let vy = velYaw, vp = velPitch, last = performance.now();
    const tick = now => {
      if (!this.layer || !this.visible || this.rotationDrag) { this.inertiaFrame = undefined; return; }
      const dt = Math.min(48, Math.max(4, now - last));
      last = now;
      const factor = dt / 16;
      this.view = rotateOrbitView(this.view, vy * factor, vp * factor);
      const decay = Math.pow(0.91, factor);
      vy *= decay;
      vp *= decay;
      this.projectTracks();
      this.updateHud();
      if (Math.hypot(vy, vp) > 0.00025) {
        this.inertiaFrame = requestAnimationFrame(tick);
      } else {
        this.inertiaFrame = undefined;
      }
    };
    this.inertiaFrame = requestAnimationFrame(tick);
  }

  resetView() {
    if (!this.layer) return;
    this.stopInertia();
    this.stopReset();
    const startView = this.view;
    const startParallax = {...this.parallax};
    if (this.motionPreference.matches) {
      this.view = defaultView;
      this.parallax = {x: 0, y: 0};
      this.projectTracks();
      this.updateHud();
      return;
    }
    const startTime = performance.now();
    const duration = 420;
    const tick = now => {
      if (!this.layer || !this.visible) { this.resetFrame = undefined; return; }
      const p = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      this.view = p >= 1 ? defaultView : interpolateOrbitView(startView, defaultView, eased);
      this.parallax.x = startParallax.x * (1 - eased);
      this.parallax.y = startParallax.y * (1 - eased);
      this.projectTracks();
      this.updateHud();
      if (p < 1) {
        this.resetFrame = requestAnimationFrame(tick);
      } else {
        this.resetFrame = undefined;
      }
    };
    this.resetFrame = requestAnimationFrame(tick);
  }

  releaseRotation() {
    const drag = this.rotationDrag;
    if (!drag) return null;
    this.rotationDrag = null;
    this.svg.classList.remove('graph-orbit-rotating');
    if (this.svg.hasPointerCapture(drag.pointer)) this.svg.releasePointerCapture(drag.pointer);
    return drag;
  }

  syncMotion() {
    const canAnimate = Boolean(this.satellites?.length) && !this.motionPreference.matches;
    const hasActiveFx = Boolean(this.singularity || this.flare) && !this.motionPreference.matches;
    if (this.motionButton) {
      this.motionButton.hidden = !canAnimate;
      const label = this.paused ? t('继续环绕') : t('暂停环绕');
      if (this.motionButton.textContent !== label) this.motionButton.textContent = label;
    }
    if (this.svg.dataset.orbitFocus) this.svg.dataset.orbitPaused = String(this.paused);
    const pauseBlocked = !hasActiveFx && (this.paused || !canAnimate || this.hoveredSatellite);
    if (pauseBlocked || this.rotationDrag?.moved || this.transition || this.entryFlight || !this.visible || document.hidden) {
      this.stopMotion();
    } else if (this.frame === undefined) {
      this.frame = requestAnimationFrame(this.animate);
    }
  }

  animate(now) {
    const elapsed = this.lastFrame === undefined ? 0 : Math.min(now - this.lastFrame, 48);
    this.orbitTime += elapsed;
    this.lastFrame = now;

    if (this.singularity) {
      const s = this.singularity;
      const age = now - s.startTime;
      if (!s.evaporating) {
        const ramp = Math.min(1, age / 300);
        s.strength = 1 - Math.pow(1 - ramp, 3);
        if (age >= s.holdDuration) {
          s.evaporating = true;
          s.phase = 'evaporating';
          s.peakStrength = s.strength;
          s.evapStart = now;
          s.group?.classList.add('is-evaporating');
        }
      } else {
        const p = Math.min(1, (now - s.evapStart) / s.reboundDuration);
        s.reboundFactor = hawkingReboundFactor(p);
        if (p >= 1) {
          s.group?.remove();
          this.singularity = null;
          if (this.starsNear) {
            this.starsNear.setAttribute('transform', `translate(${(this.parallax.x * 0.34).toFixed(2)} ${(this.parallax.y * 0.34).toFixed(2)})`);
          }
        }
      }
    }

    let flareMult = 1;
    if (this.flare) {
      const flareElapsed = now - this.flare.startTime;
      if (flareElapsed >= this.flare.duration) {
        this.flare = null;
        this.centerPlanet?.node.classList.remove('is-flaring');
      } else {
        flareMult = solarFlareSpeedMultiplier(flareElapsed, this.flare.duration, this.flare.peak);
      }
    }
    this.activeFlareMult = flareMult;

    if (!this.paused || flareMult > 1.001) {
      for (const satellite of this.satellites) {
        const pertBoost = satellite.singularityBoost || 0;
        satellite.phase = (satellite.phase + elapsed * satellite.angularSpeed * flareMult * (1 + pertBoost)) % fullTurn;
        satellite.spin = (satellite.spin + elapsed * .022 * flareMult) % 360;
      }
    }
    if (!this.paused && this.orbitTime >= this.nextReversalCheck) {
      this.nextReversalCheck += reversalInterval;
      const reversed = document.querySelector('dialog:modal') ? null : reverseRandomSatellite(this.satellites);
      if (reversed) {
        reversed.reversalUntil = this.orbitTime + 1800;
        reportAchievement('orbitReversals', 1, 'add');
      }
    }
    this.placeSatellites();
    if (!this.singularity && !this.flare && (this.paused || !this.satellites.length || this.hoveredSatellite)) {
      this.stopMotion();
      return;
    }
    this.frame = requestAnimationFrame(this.animate);
  }

  projectTracks() {
    for (const satellite of this.satellites) {
      satellite.projected = viewOrbit(satellite.plane, this.view);
      satellite.line.setAttribute('d', orbitLine(satellite.projected, satellite.orbitRadius));
    }
    if (this.equatorRing && this.equatorTicks) {
      const eq = viewOrbit(equatorPlane, this.view);
      this.equatorRing.setAttribute('d', orbitLine(eq, centerRadius * 2.15));
      this.equatorTicks.setAttribute('d', equatorTicksPath(eq, centerRadius * 2.02, centerRadius * 2.26, 24));
    }
    if (this.starsFar) {
      this.starsFar.setAttribute('transform', `translate(${(this.parallax.x * 0.14).toFixed(2)} ${(this.parallax.y * 0.14).toFixed(2)})`);
    }
    if (this.starsNear) {
      this.starsNear.setAttribute('transform', `translate(${(this.parallax.x * 0.34).toFixed(2)} ${(this.parallax.y * 0.34).toFixed(2)})`);
    }
    this.placeSatellites();
  }

  placeSatellites() {
    const flight = this.entryFlight;
    const eased = flight?.eased ?? 1;
    if (flight && this.centerPlanet) {
      const cx = flight.centerStart.x + (500 - flight.centerStart.x) * eased;
      const cy = flight.centerStart.y + (this.centerY - flight.centerStart.y) * eased;
      const cs = flight.centerStart.scale + (1 - flight.centerStart.scale) * eased;
      this.centerPlanet.node.setAttribute('transform', `translate(${cx.toFixed(2)} ${cy.toFixed(2)}) scale(${cs.toFixed(3)})`);
      this.centerPlanet.node.style.opacity = String(Math.min(1, 0.35 + 0.65 * eased));
    } else if (this.centerPlanet && this.layer?.classList.contains('is-new')) {
      this.centerPlanet.node.setAttribute('transform', `translate(500 ${this.centerY})`);
      this.centerPlanet.node.style.opacity = '';
    }
    if (this.starsNear && this.singularity) {
      const s = this.singularity;
      const factor = s.phase === 'evaporating' ? s.reboundFactor : s.strength;
      const pullX = ((s.x - 500) * 0.045) * factor;
      const pullY = ((s.y - this.centerY) * 0.045) * factor;
      this.starsNear.setAttribute('transform', `translate(${(this.parallax.x * 0.34 + pullX).toFixed(2)} ${(this.parallax.y * 0.34 + pullY).toFixed(2)})`);
    }
    for (let i = 0; i < this.satellites.length; i++) {
      const satellite = this.satellites[i];
      const {node, track, line, wake, light, surface, orbitRadius, projected, phase, spin, angularSpeed} = satellite;
      const {x: dx, y: dy, z} = projectOrbit(projected, orbitRadius, phase);
      const depth = z / orbitRadius;
      const orbitX = 500 + dx;
      const orbitY = this.centerY + dy;
      const orbitScale = 1 + .15 * depth;
      const start = flight?.satStarts?.get(satellite.paperId);
      const px = flight
        ? (start ? start.x + (orbitX - start.x) * eased : 500 + dx * (0.25 + 0.75 * eased))
        : orbitX;
      const py = flight
        ? (start ? start.y + (orbitY - start.y) * eased : this.centerY + dy * (0.25 + 0.75 * eased))
        : orbitY;
      const ps = flight
        ? (start ? start.scale + (orbitScale - start.scale) * eased : orbitScale * (0.35 + 0.65 * eased))
        : orbitScale;
      const pert = !flight && this.singularity
        ? computeOrbitSingularityPerturbation({x: px, y: py}, this.singularity)
        : null;
      satellite.singularityBoost = pert?.speedBoost || 0;
      const finalX = px + (pert?.dx || 0);
      const finalY = py + (pert?.dy || 0);
      satellite.x = finalX;
      satellite.y = finalY;
      satellite.scale = ps;
      node.setAttribute('transform', `translate(${finalX} ${finalY}) scale(${ps})`);
      node.style.opacity = flight ? (.25 + .64 * eased) + .11 * depth * eased : .89 + .11 * depth;
      light.setAttribute('transform', `rotate(${Math.atan2(-dy, -dx) * 180 / Math.PI})`);
      surface.setAttribute('transform', `rotate(${spin})`);
      const behind = z < 0;
      track.classList.toggle('is-behind', behind);
      const reversing = satellite.reversalUntil > this.orbitTime;
      node.classList.toggle('is-reversing', reversing);

      if (wake) {
        const wakeSpan = 0.72 + Math.min(0.75, Math.max(0, ((this.activeFlareMult || 1) - 1) * 0.22));
        const wakeGeom = orbitWakePath(projected, orbitRadius, phase, angularSpeed >= 0 ? 1 : -1, wakeSpan);
        wake.setAttribute('d', wakeGeom.d);
        wake.classList.toggle('is-behind', behind);
        wake.classList.toggle('is-reversing', reversing);
        wake.classList.toggle('is-flare-boost', (this.activeFlareMult || 1) > 1.25);
        const grad = this.wakeGradients[i];
        if (grad) {
          grad.setAttribute('x1', String(wakeGeom.tail.x));
          grad.setAttribute('y1', String(wakeGeom.tail.y));
          grad.setAttribute('x2', String(wakeGeom.head.x));
          grad.setAttribute('y2', String(wakeGeom.head.y));
        }
      }
      if (this.hoveredMeta?.paper?.id === satellite.paperId && this.beam) {
        this.beam.setAttribute('x2', String(satellite.x));
        this.beam.setAttribute('y2', String(satellite.y));
      }
      line.classList.toggle('is-focused', this.hoveredMeta?.paper?.id === satellite.paperId);
      wake?.classList.toggle('is-focused', this.hoveredMeta?.paper?.id === satellite.paperId);
    }
  }

  syncHoverVisuals() {
    if (!this.layer) return;
    if (this.hoveredMeta && !this.hoveredMeta.isCenter) {
      this.layer.dataset.hoveredRing = String(this.hoveredMeta.ringIndex);
      if (this.beam) {
        this.beam.setAttribute('x1', '500');
        this.beam.setAttribute('y1', String(this.centerY));
        this.beam.classList.add('is-visible');
      }
    } else {
      delete this.layer.dataset.hoveredRing;
      if (this.beam) this.beam.classList.remove('is-visible');
    }
    this.placeSatellites();
  }

  updateHud() {
    if (!this.hud) return;
    if (!this.layer) { this.hud.hidden = true; return; }
    this.hud.hidden = false;
    const {azimuth, elevation} = orbitViewAngles(this.view);
    const rotated = azimuth !== 0 || elevation !== 0;

    let leftText = `AZ ${String(azimuth).padStart(2, '0')}° · EL ${elevation >= 0 ? '+' : ''}${elevation}° · ${t('右键拖拽旋转 3D · 点击卫星跃迁')}`;
    if (this.hoveredMeta && !this.hoveredMeta.isCenter) {
      const {paper, count, ringIndex} = this.hoveredMeta;
      const meta = [
        `ORBIT ${String(ringIndex).padStart(2, '0')}`,
        msg`${count} 个共同标签`,
        paper.year || '',
        paper.title,
        t('点击跃迁为中心'),
      ].filter(Boolean);
      leftText = meta.join(' · ');
    }

    let info = this.hud.querySelector('.graph-orbit-hud-info');
    let resetBtn = this.hud.querySelector('[data-orbit-reset]');
    if (!info || !resetBtn) {
      this.hud.replaceChildren();
      info = document.createElement('span');
      info.className = 'graph-orbit-hud-info';
      resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'outline-button';
      resetBtn.dataset.orbitReset = '';
      resetBtn.textContent = t('重置视角');
      this.hud.append(info, resetBtn);
    }
    info.textContent = leftText;
    resetBtn.disabled = !rotated;
    resetBtn.textContent = t('重置视角');
  }

  snapshotPlanets() {
    const planets = this.centerPlanet ? [this.centerPlanet, ...this.satellites] : [];
    return new Map(planets.map(planet => {
      const style = getComputedStyle(planet.node);
      const matrix = new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform);
      return [planet.node.dataset.orbitPaperId, {...planet, x: matrix.e, y: matrix.f,
        scale: matrix.a, opacity: style.opacity, lightFacing: planet.light.getAttribute('transform')}];
    }));
  }

  animateScene(previous) {
    const options = {duration: 480, easing: 'cubic-bezier(.22, .75, .28, 1)'};
    const animations = [];
    const departing = svgElement('g', {class: 'graph-orbit-departing', 'aria-hidden': 'true'});
    this.layer.insertBefore(departing, this.centerPlanet.node);
    for (const planet of [...this.satellites, this.centerPlanet]) {
      const id = planet.node.dataset.orbitPaperId;
      const source = previous.get(id);
      const opacity = planet.node.style.opacity || 1;
      const keyframes = source ? [
        {transform: `translate(${source.x}px, ${source.y}px) scale(${source.scale * source.radius / planet.radius})`, opacity: source.opacity},
        {transform: `translate(${planet.x}px, ${planet.y}px) scale(${planet.scale})`, opacity},
      ] : [{opacity: 0}, {opacity}];
      animations.push(planet.node.animate(keyframes, options));
      if (source && planet !== this.centerPlanet) {
        const from = Number(source.lightFacing?.slice(7, -1)) || 0;
        const to = Number(planet.light.getAttribute('transform').slice(7, -1));
        const change = ((to - from + 540) % 360) - 180;
        if (change) animations.push(planet.light.animate([
          {transform: 'rotate(' + from + 'deg)'},
          {transform: 'rotate(' + (from + change) + 'deg)'},
        ], options));
      }
      previous.delete(id);
    }
    for (const source of previous.values()) {
      const node = source.node.cloneNode(true);
      node.setAttribute('tabindex', -1);
      node.dataset.departingPaperId = node.dataset.orbitPaperId;
      delete node.dataset.orbitPaperId;
      node.classList.remove('graph-orbit-center');
      node.setAttribute('transform', `translate(${source.x} ${source.y}) scale(${source.scale})`);
      departing.append(node);
      animations.push(node.animate([{opacity: source.opacity}, {opacity: 0}], {...options, fill: 'forwards'}));
    }
    const layer = this.layer;
    const transition = this.transition = Promise.allSettled(animations.map(animation => animation.finished));
    layer.classList.add('is-transitioning');
    transition.then(() => {
      if (this.transition !== transition) return;
      this.transition = null;
      departing.remove();
      layer.classList.remove('is-transitioning');
      this.syncMotion();
    });
  }

  select(id) {
    for (const node of this.layer?.querySelectorAll('[data-orbit-paper-id]') || []) {
      node.setAttribute('aria-pressed', String(node.dataset.orbitPaperId === id));
    }
  }

  startEntryFlight(center, rings, origin) {
    const startView = orbitEntryView();
    const satStarts = new Map();
    for (const {paper} of rings) {
      const src = origin?.nodes?.get(paper.id);
      if (src) {
        const sat = this.satellites.find(s => s.paperId === paper.id);
        const targetR = sat?.radius || 11;
        satStarts.set(paper.id, {
          x: src.x,
          y: src.y,
          scale: Math.max(0.28, Math.min(1.6, src.radius / targetR)),
        });
      }
    }
    const cSrc = origin?.center;
    const centerStart = cSrc ? {
      x: cSrc.x,
      y: cSrc.y,
      scale: Math.max(0.18, Math.min(1.2, cSrc.radius / centerRadius)),
    } : {x: 500, y: this.centerY, scale: 0.42};

    this.view = startView;
    this.entryFlight = {eased: 0, centerStart, satStarts};
    const startTime = performance.now();
    const duration = 620;
    const step = now => {
      if (!this.layer || !this.entryFlight) { this.entryFrame = undefined; return; }
      const p = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      this.entryFlight.eased = eased;
      this.view = p >= 1 ? defaultView : interpolateOrbitView(startView, defaultView, eased);
      this.projectTracks();
      this.updateHud();
      if (p < 1) {
        this.entryFrame = requestAnimationFrame(step);
      } else {
        this.entryFrame = undefined;
        this.entryFlight = null;
        this.view = defaultView;
        this.projectTracks();
        this.syncMotion();
      }
    };
    this.entryFrame = requestAnimationFrame(step);
    this.entryTimer = setTimeout(() => {
      this.layer?.querySelector('.graph-orbit-warp-streaks')?.remove();
      this.layer?.querySelector('.graph-orbit-lock-iris')?.remove();
      this.toolbar?.classList.remove('is-entering');
      this.hud?.classList.remove('is-entering');
    }, 760);
  }

  render(center, papers, preferences, height, selected, origin = null) {
    const rings = rankOrbitPapers(center, papers, preferences);
    const key = JSON.stringify([height, getLocale(), center.id, center.title,
      rings.map(({paper, count}) => [paper.id, paper.title, count])]);
    this.papers = new Map(papers.map(paper => [paper.id, paper]));
    if (this.key === key && this.layer?.parentNode === this.svg) {
      this.select(selected);
      this.syncMotion();
      this.syncStyle();
      this.updateHud();
      return;
    }

    const previousFocus = this.layer?.contains(document.activeElement) ? document.activeElement.dataset.orbitPaperId : '';
    const previous = this.snapshotPlanets();
    const sameCenter = this.centerId === center.id;
    const recentering = !sameCenter && previous.has(center.id);
    const animate = (recentering || this.transition) && !this.motionPreference.matches;
    const enteringFromMap = !previous.size && !this.motionPreference.matches;
    this.centerId = center.id;
    this.transition = null;
    this.stopEntryTransition();
    this.clearOrbitEasterEggs();
    this.stopMotion();
    this.stopInertia();
    this.stopReset();
    if (this.layer) this.onHover(null);
    this.hoveredSatellite = null;
    this.hoveredMeta = null;
    this.layer?.remove();
    this.key = key;

    const layer = this.layer = svgElement('g', {class: 'graph-orbit-scene'});
    const centerY = this.centerY = height / 2;
    layer.classList.toggle('is-new', !previous.size);
    const wakeStyles = rings.map(({paper}) => orbitPlanetStyle(paper.id).color);
    const defs = orbitDefinitions(centerY, wakeStyles);
    this.wakeGradients = [...defs.querySelectorAll('[id^="graph-orbit-wake-"]')];
    const starfield = orbitStarfield(height);
    this.starsFar = starfield.querySelector('.graph-orbit-stars-far');
    this.starsNear = starfield.querySelector('.graph-orbit-stars-near');
    layer.append(defs, starfield);

    const orbits = svgElement('g', {class: 'graph-orbit-rings',
      transform: `translate(500 ${centerY})`, 'aria-hidden': 'true'});
    const wakes = svgElement('g', {class: 'graph-orbit-wakes',
      transform: `translate(500 ${centerY})`, 'aria-hidden': 'true'});
    const equator = svgElement('g', {class: 'graph-orbit-equator',
      transform: `translate(500 ${centerY})`, 'aria-hidden': 'true'});
    this.equatorRing = svgElement('path', {class: 'graph-orbit-equator-ring'});
    this.equatorTicks = svgElement('path', {class: 'graph-orbit-equator-ticks'});
    equator.append(this.equatorRing, this.equatorTicks);

    this.beam = svgElement('line', {
      class: 'graph-orbit-beam',
      x1: '500', y1: String(centerY), x2: '500', y2: String(centerY),
      'aria-hidden': 'true',
    });

    const satellites = svgElement('g', {class: 'graph-orbit-satellites'});
    this.satellites = [];
    const orbitSize = Math.min(410, height * .44);
    rings.forEach(({paper, count}, index) => {
      const orbitRadius = rings.length === 1 ? Math.max(146, orbitSize * .72)
        : 146 + (orbitSize - 146) * index / (rings.length - 1);
      const plane = orbitPlane(center.id, paper.id);
      const line = svgElement('path', {class: 'graph-orbit-line', pathLength: '1'});
      line.style.setProperty('--orbit-i', String(index));
      const alpha = Math.max(0.24, 0.56 - index * 0.045);
      line.style.setProperty('--ring-alpha', alpha.toFixed(2));
      orbits.append(line);

      const wake = svgElement('path', {
        class: 'graph-orbit-wake',
        stroke: `url(#graph-orbit-wake-${index})`,
      });
      wakes.append(wake);

      const planet = this.planet(paper, 10 + (index % 3) * 1.7, count, index + 1);
      planet.node.dataset.orbitRing = index + 1;
      const track = svgElement('g', {class: 'graph-orbit-track'});
      track.append(planet.node);
      satellites.append(track);
      const old = previous.get(paper.id);
      this.satellites.push({...planet, paperId: paper.id, ringIndex: index + 1, count,
        track, line, wake, orbitRadius, plane,
        phase: sameCenter ? old?.phase ?? plane.phase : plane.phase,
        spin: old?.spin ?? 0,
        angularSpeed: (sameCenter ? old?.angularSpeed : undefined)
          ?? Math.sign(old?.angularSpeed ?? 1) * fullTurn / (26000 + index * 5700),
        reversalUntil: old?.reversalUntil ?? 0,
      });
    });

    const priorCenter = previous.get(center.id);
    const planet = this.centerPlanet = {...this.planet(center, centerRadius),
      x: 500, y: centerY, scale: 1, spin: priorCenter?.spin ?? 0};
    planet.node.setAttribute('transform', `translate(500 ${centerY})`);
    if (priorCenter?.lightFacing) planet.light.setAttribute('transform', priorCenter.lightFacing);
    planet.surface.setAttribute('transform', `rotate(${planet.spin})`);

    const shockwave = svgElement('circle', {
      class: 'graph-orbit-shockwave',
      cx: '500', cy: String(centerY), r: String(centerRadius),
      'aria-hidden': 'true',
    });

    layer.append(orbits, wakes, equator, this.beam, planet.node, shockwave, satellites);
    if (enteringFromMap) {
      const streaksGroup = svgElement('g', {class: 'graph-orbit-warp-streaks', 'aria-hidden': 'true'});
      for (const s of orbitWarpStreaks(centerY, 24)) {
        const ray = svgElement('line', {
          class: 'graph-orbit-warp-streak',
          x1: String(s.x1), y1: String(s.y1), x2: String(s.x2), y2: String(s.y2),
          pathLength: '1', opacity: String(s.alpha),
        });
        ray.style.setProperty('--streak-delay', `${s.delay}s`);
        streaksGroup.append(ray);
      }
      const iris = svgElement('g', {
        class: 'graph-orbit-lock-iris',
        transform: `translate(500 ${centerY})`,
        'aria-hidden': 'true',
      });
      iris.append(
        svgElement('circle', {class: 'graph-orbit-iris-ring', r: '78'}),
        svgElement('path', {
          class: 'graph-orbit-iris-ticks',
          d: 'M 0 -92 V -74 M 0 74 V 92 M -92 0 H -74 M 74 0 H 92',
        })
      );
      const shockwave2 = svgElement('circle', {
        class: 'graph-orbit-shockwave is-secondary',
        cx: '500', cy: String(centerY), r: String(centerRadius),
        'aria-hidden': 'true',
      });
      layer.insertBefore(streaksGroup, orbits);
      layer.append(shockwave2, iris);
      this.startEntryFlight(center, rings, origin);
      this.toolbar?.classList.add('is-entering');
      this.hud?.classList.add('is-entering');
    }
    this.projectTracks();
    this.svg.append(layer);
    if (animate && planet.node.animate) this.animateScene(previous);
    this.svg.dataset.orbitFocus = 'true';
    this.syncStyle();
    this.select(selected);
    if (this.toolbar) {
      this.toolbar.hidden = false;
      if (this.eyebrow) {
        this.eyebrow.textContent = rings.length
          ? `${t('ORBITAL VIEW')} // ${String(rings.length).padStart(2, '0')} RINGS`
          : t('ORBITAL VIEW');
      }
      this.toolbar.querySelector('strong').textContent = center.title;
      this.toolbar.querySelector('small').textContent = rings.length
        ? msg`${rings.length} 篇相关文献 · ${rings.length} 圈`
        : t('当前范围内没有达到最低相似度的文献');
    }
    this.updateHud();
    if (previousFocus) {
      const target = [...layer.querySelectorAll('[data-orbit-paper-id]')].find(node => node.dataset.orbitPaperId === previousFocus);
      (target || planet.node).focus({preventScroll: true});
    }
    this.syncMotion();
  }

  planet(paper, radius, count, ringIndex = 0) {
    const isCenter = count === undefined;
    const name = isCenter ? paper.title : msg`${paper.title} · ${count} 个共同标签`;
    const group = svgElement('g', {
      class: `graph-orbit-planet ${isCenter ? 'graph-orbit-center' : ''}`,
      'data-orbit-paper-id': paper.id, tabindex: 0, role: 'button', 'aria-label': name,
    });
    const style = orbitPlanetStyle(paper.id);
    const {body, light, surface} = planetArtwork(radius, style);
    if (isCenter) {
      group.append(
        svgElement('circle', {r: radius * 3.1, fill: 'url(#graph-orbit-corona)',
          class: 'graph-orbit-corona-pulse', 'aria-hidden': 'true'}),
        svgElement('circle', {r: radius * 2.65, fill: 'url(#graph-orbit-halo)',
          class: 'graph-orbit-halo', 'aria-hidden': 'true'})
      );
    }
    group.append(svgElement('title', {}, name), body,
      svgElement('circle', {r: Math.max(radius + 5, !isCenter && style.form === 'ringed' ? radius * 1.7 : 0),
        class: 'graph-orbit-target'}));
    const activate = () => isCenter ? this.onSelect(paper.id) : this.onCenter(paper.id);
    if (!isCenter) {
      group.append(
        reticleMarkup(radius + 7),
        svgElement('circle', {r: radius + 8, class: 'graph-orbit-reversal', 'aria-hidden': 'true'})
      );
    }
    group.addEventListener('click', () => {
      if (isCenter && this.suppressCenterClick) {
        this.suppressCenterClick = false;
        return;
      }
      activate();
    });
    if (isCenter) {
      group.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        clearTimeout(this.centerHoldTimer);
        this.suppressCenterClick = false;
        this.centerHoldTimer = setTimeout(() => {
          this.suppressCenterClick = true;
          this.triggerSolarFlare();
        }, 350);
      });
      const cancelCenterHold = () => clearTimeout(this.centerHoldTimer);
      group.addEventListener('pointerup', cancelCenterHold);
      group.addEventListener('pointerleave', cancelCenterHold);
      group.addEventListener('pointercancel', cancelCenterHold);
      group.addEventListener('dblclick', event => {
        event.stopPropagation();
        clearTimeout(this.centerHoldTimer);
        this.suppressCenterClick = false;
        this.triggerSolarFlare();
      });
    }
    const enter = event => {
      if (!isCenter && event?.pointerType !== 'touch') {
        this.hoveredSatellite = group;
        this.hoveredMeta = {isCenter, paper, count, ringIndex};
        this.syncHoverVisuals();
        this.syncMotion();
        this.updateHud();
      }
      this.onHover(this.papers.get(paper.id), event);
    };
    const leave = () => {
      if (this.hoveredSatellite === group) {
        this.hoveredSatellite = null;
        this.hoveredMeta = null;
        this.syncHoverVisuals();
        this.syncMotion();
        this.updateHud();
      }
      this.onHover(null);
    };
    group.addEventListener('pointerenter', enter);
    group.addEventListener('pointerleave', leave);
    group.addEventListener('pointercancel', leave);
    group.addEventListener('focus', () => {
      if (!isCenter) {
        this.hoveredMeta = {isCenter, paper, count, ringIndex};
        this.syncHoverVisuals();
        this.updateHud();
      }
    });
    group.addEventListener('blur', () => {
      if (!isCenter && this.hoveredMeta?.paper?.id === paper.id && !this.hoveredSatellite) {
        this.hoveredMeta = null;
        this.syncHoverVisuals();
        this.updateHud();
      }
    });
    group.addEventListener('keydown', event => {
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
        event.preventDefault();
        const {left, top, width, height} = group.getBoundingClientRect();
        this.onMenu(paper.id, {clientX: left + width / 2, clientY: top + height / 2}, group);
        return;
      }
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      activate();
    });
    return {node: group, radius, light, surface};
  }
}
