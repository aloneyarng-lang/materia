import {getLocale, msg, t} from './i18n.js';
import {reportAchievement} from './flow-achievements.js';
import {normalizedTagSet} from './shared-tag-links.js';
import {researchNeighbors} from './research-graph.js';

const NS = 'http://www.w3.org/2000/svg';
const fullTurn = 2 * Math.PI;
const reversalInterval = 5000;
const centerRadius = 34;
const defaultView = [{x: 1, y: 0, z: 0}, {x: 0, y: 1, z: 0}, {x: 0, y: 0, z: 1}];
const quarterCircle = 4 * (Math.SQRT2 - 1) / 3;
const planetColors = ['#70aebe', '#d7a071', '#a7abdf', '#659e86', '#b67b70'];

function svgElement(tag, attributes, content) {
  const element = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  if (content !== undefined) element.textContent = content;
  return element;
}

function orbitDefinitions(centerY) {
  const defs = svgElement('defs', {});
  for (const [id, cx, cy, r, stops] of [
    ['halo', '50%', '50%', '50%', [[.28,'#c2d8ff',.35],[.5,'#a6b9f4',.14],[1,'#a6b9f4',0]]],
    ['light', '73%', '40%', '80%', [[0,'#fff4d3',.48],[.33,'#fff4d3',.12],[.54,'#121831',0],[.77,'#121831',.64],[1,'#111427',.93]]],
  ]) {
    const gradient = svgElement('radialGradient', {id: 'graph-orbit-' + id, cx, cy, r});
    for (const [offset, color, opacity] of stops) {
      gradient.append(svgElement('stop', {offset, 'stop-color': color, 'stop-opacity': opacity}));
    }
    defs.append(gradient);
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
  const random = seededRandom(6284);
  for (let i = 0; i < 75; i++) {
    sky.append(svgElement('circle', {
      cx: 12 + random() * 976, cy: height * (.03 + random() * .94),
      r: i % 17 === 0 ? 1.5 : .4 + random() * .58, opacity: .22 + random() * .48,
    }));
  }
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
  body.append(svgElement('circle', {r: 1, fill: color}));
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
  body.append(texture, light, svgElement('circle', {r: 1, fill:'none', stroke: '#e0f4ff',
    'stroke-opacity': .42, 'stroke-width': .04}));
  if (ring) {
    const front = ring.cloneNode();
    front.append(svgElement('path', {d: 'M -1.7 0 A 1.7 .48 0 0 0 1.7 0', opacity: .9}));
    body.append(front);
  }
  return {body, light, surface};
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
    this.toolbar = svg.parentElement?.querySelector('.graph-orbit-toolbar');
    this.motionButton = this.toolbar?.querySelector('[data-orbit-motion]');
    this.visible = true;
    this.paused = false;
    this.view = defaultView;
    this.motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
    this.motionPreference.addEventListener('change', () => this.syncMotion());
    document.addEventListener('visibilitychange', () => this.syncMotion());
    this.orbitTime = 0;
    this.nextReversalCheck = reversalInterval;
    this.animate = this.animate.bind(this);
    this.toolbar?.querySelector('[data-orbit-close]').addEventListener('click', onClose);
    this.motionButton?.addEventListener('click', () => {
      this.paused = !this.paused;
      this.syncMotion();
    });
    Object.assign(this, {onSelect, onCenter, onMenu, onHover});
    this.bindRotation();
  }

  clear() {
    this.releaseRotation();
    this.stopMotion();
    this.layer?.remove();
    this.layer = null;
    this.key = null;
    this.centerId = null;
    this.centerPlanet = null;
    this.transition = null;
    this.satellites = [];
    this.orbitTime = 0;
    this.nextReversalCheck = reversalInterval;
    this.paused = false;
    this.view = defaultView;
    this.hoveredSatellite = null;
    delete this.svg.dataset.orbitFocus;
    if (this.toolbar) this.toolbar.hidden = true;
  }

  stopMotion() {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.lastFrame = undefined;
  }

  setVisible(visible) {
    this.visible = visible;
    if (!visible) {
      this.releaseRotation();
      this.hoveredSatellite = null;
    }
    this.syncMotion();
  }

  bindRotation() {
    const {svg} = this;
    svg.addEventListener('pointerdown', event => {
      if (event.button !== 2 || !this.layer || !this.visible || this.rotationDrag) return;
      const {width, height} = svg.getBoundingClientRect();
      this.rotationDrag = {
        pointer: event.pointerId, x: event.clientX, y: event.clientY,
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
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < 4) return;
        drag.moved = true;
        this.hoveredSatellite = null;
        this.onHover(null);
        if (this.satellites.length) svg.classList.add('graph-orbit-rotating');
        if (this.transition) {
          for (const animation of this.layer.getAnimations({subtree: true})) animation.finish();
        }
        this.syncMotion();
      }
      drag.x = event.clientX;
      drag.y = event.clientY;
      this.view = rotateOrbitView(this.view, dx * drag.sensitivity, -dy * drag.sensitivity);
      this.projectTracks();
    });
    const finish = event => {
      if (this.rotationDrag?.pointer !== event.pointerId) return;
      const drag = this.releaseRotation();
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
    if (this.motionButton) {
      this.motionButton.hidden = !canAnimate;
      const label = this.paused ? t('继续环绕') : t('暂停环绕');
      if (this.motionButton.textContent !== label) this.motionButton.textContent = label;
    }
    if (!canAnimate || this.paused || this.hoveredSatellite || this.rotationDrag?.moved || this.transition || !this.visible || document.hidden) {
      this.stopMotion();
    } else if (this.frame === undefined) {
      this.frame = requestAnimationFrame(this.animate);
    }
  }

  animate(now) {
    const elapsed = this.lastFrame === undefined ? 0 : Math.min(now - this.lastFrame, 48);
    this.orbitTime += elapsed;
    this.lastFrame = now;
    for (const satellite of this.satellites) {
      satellite.phase = (satellite.phase + elapsed * satellite.angularSpeed) % fullTurn;
      satellite.spin = (satellite.spin + elapsed * .022) % 360;
    }
    if (this.orbitTime >= this.nextReversalCheck) {
      this.nextReversalCheck += reversalInterval;
      const reversed = document.querySelector('dialog:modal') ? null : reverseRandomSatellite(this.satellites);
      if (reversed) {
        reversed.reversalUntil = this.orbitTime + 1800;
        reportAchievement('orbitReversals', 1, 'add');
      }
    }
    this.placeSatellites();
    this.frame = requestAnimationFrame(this.animate);
  }

  projectTracks() {
    for (const satellite of this.satellites) {
      satellite.projected = viewOrbit(satellite.plane, this.view);
      satellite.line.setAttribute('d', orbitLine(satellite.projected, satellite.orbitRadius));
    }
    this.placeSatellites();
  }

  placeSatellites() {
    for (const satellite of this.satellites) {
      const {node, track, light, surface, orbitRadius, projected, phase, spin} = satellite;
      const {x: dx, y: dy, z} = projectOrbit(projected, orbitRadius, phase);
      const depth = z / orbitRadius;
      satellite.x = 500 + dx;
      satellite.y = this.centerY + dy;
      satellite.scale = 1 + .15 * depth;
      node.setAttribute('transform', `translate(${satellite.x} ${satellite.y}) scale(${satellite.scale})`);
      node.style.opacity = .89 + .11 * depth;
      light.setAttribute('transform', `rotate(${Math.atan2(-dy, -dx) * 180 / Math.PI})`);
      surface.setAttribute('transform', `rotate(${spin})`);
      track.classList.toggle('is-behind', z < 0);
      node.classList.toggle('is-reversing', satellite.reversalUntil > this.orbitTime);
    }
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

  render(center, papers, preferences, height, selected) {
    const rings = rankOrbitPapers(center, papers, preferences);
    const key = JSON.stringify([height, getLocale(), center.id, center.title,
      rings.map(({paper, count}) => [paper.id, paper.title, count])]);
    this.papers = new Map(papers.map(paper => [paper.id, paper]));
    if (this.key === key && this.layer?.parentNode === this.svg) {
      this.select(selected);
      this.syncMotion();
      return;
    }

    const previousFocus = this.layer?.contains(document.activeElement) ? document.activeElement.dataset.orbitPaperId : '';
    const previous = this.snapshotPlanets();
    const sameCenter = this.centerId === center.id;
    const recentering = !sameCenter && previous.has(center.id);
    const animate = (recentering || this.transition) && !this.motionPreference.matches;
    this.centerId = center.id;
    this.transition = null;
    this.stopMotion();
    if (this.layer) this.onHover(null);
    this.hoveredSatellite = null;
    this.layer?.remove();
    this.key = key;

    const layer = this.layer = svgElement('g', {class: 'graph-orbit-scene'});
    const centerY = this.centerY = height / 2;
    layer.classList.toggle('is-new', !previous.size);
    layer.append(orbitDefinitions(centerY), orbitStarfield(height));
    const orbits = svgElement('g', {class: 'graph-orbit-rings',
      transform: `translate(500 ${centerY})`, 'aria-hidden': 'true'});
    const satellites = svgElement('g', {class: 'graph-orbit-satellites'});
    this.satellites = [];
    const orbitSize = Math.min(410, height * .44);
    rings.forEach(({paper, count}, index) => {
      const orbitRadius = rings.length === 1 ? Math.max(146, orbitSize * .72)
        : 146 + (orbitSize - 146) * index / (rings.length - 1);
      const plane = orbitPlane(center.id, paper.id);
      const line = svgElement('path', {class: 'graph-orbit-line'});
      orbits.append(line);
      const planet = this.planet(paper, 10 + (index % 3) * 1.7, count);
      planet.node.dataset.orbitRing = index + 1;
      const track = svgElement('g', {class: 'graph-orbit-track'});
      track.append(planet.node);
      satellites.append(track);
      const old = previous.get(paper.id);
      this.satellites.push({...planet, track, line, orbitRadius, plane,
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
    layer.append(orbits, planet.node, satellites);
    this.projectTracks();
    this.svg.append(layer);
    if (animate && planet.node.animate) this.animateScene(previous);
    this.svg.dataset.orbitFocus = 'true';
    this.select(selected);
    if (this.toolbar) {
      this.toolbar.hidden = false;
      this.toolbar.querySelector('strong').textContent = center.title;
      this.toolbar.querySelector('small').textContent = rings.length
        ? msg`${rings.length} 篇相关文献 · ${rings.length} 圈`
        : t('当前范围内没有达到最低相似度的文献');
    }
    if (previousFocus) {
      const target = [...layer.querySelectorAll('[data-orbit-paper-id]')].find(node => node.dataset.orbitPaperId === previousFocus);
      (target || planet.node).focus({preventScroll: true});
    }
    this.syncMotion();
  }

  planet(paper, radius, count) {
    const isCenter = count === undefined;
    const name = isCenter ? paper.title : msg`${paper.title} · ${count} 个共同标签`;
    const group = svgElement('g', {
      class: `graph-orbit-planet ${isCenter ? 'graph-orbit-center' : ''}`,
      'data-orbit-paper-id': paper.id, tabindex: 0, role: 'button', 'aria-label': name,
    });
    const style = orbitPlanetStyle(paper.id);
    const {body, light, surface} = planetArtwork(radius, style);
    if (isCenter) group.append(svgElement('circle', {r: radius * 2.65, fill: 'url(#graph-orbit-halo)',
      class: 'graph-orbit-halo', 'aria-hidden': 'true'}));
    group.append(svgElement('title', {}, name), body,
      svgElement('circle', {r: Math.max(radius + 5, !isCenter && style.form === 'ringed' ? radius * 1.7 : 0),
        class: 'graph-orbit-target'}));
    const activate = () => isCenter ? this.onSelect(paper.id) : this.onCenter(paper.id);
    if (!isCenter) group.append(svgElement('circle', {r: radius + 8, class: 'graph-orbit-reversal',
      'aria-hidden': 'true'}));
    group.addEventListener('click', activate);
    group.addEventListener('pointerenter', event => {
      if (!isCenter && event.pointerType !== 'touch') {
        this.hoveredSatellite = group;
        this.syncMotion();
      }
      this.onHover(this.papers.get(paper.id), event);
    });
    const leave = () => {
      if (this.hoveredSatellite === group) {
        this.hoveredSatellite = null;
        this.syncMotion();
      }
      this.onHover(null);
    };
    group.addEventListener('pointerleave', leave);
    group.addEventListener('pointercancel', leave);
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
