import {getLocale, msg, t} from './i18n.js';
import {normalizedTagSet} from './shared-tag-links.js';
import {researchNeighbors} from './research-graph.js';

const NS = 'http://www.w3.org/2000/svg';
const ellipseTilt = -14;
const tilt = ellipseTilt * Math.PI / 180;
const cosTilt = Math.cos(tilt);
const sinTilt = Math.sin(tilt);
const fullTurn = 2 * Math.PI;
const planetColors = ['#70aebe', '#d7a071', '#a7abdf', '#659e86', '#b67b70'];

function svgElement(tag, attributes, content) {
  const element = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  if (content !== undefined) element.textContent = content;
  return element;
}

function orbitDefinitions() {
  const defs = svgElement('defs', {});
  for (const [id, cx, cy, r, stops] of [
    ['sun', '36%', '31%', '72%', [[0,'#fffbe0',1],[.32,'#ffe6a3',1],[.66,'#f9ae60',1],[.9,'#d66d47',1],[1,'#99443a',1]]],
    ['corona', '50%', '50%', '50%', [[.23,'#ffd297',.63],[.37,'#ffb666',.36],[.67,'#f99467',.11],[1,'#f99467',0]]],
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
  defs.append(clip);
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

function planetArtwork(radius, style) {
  const body = svgElement('g', {class: 'graph-orbit-body', transform: `scale(${radius})`, 'aria-hidden': 'true'});
  const isSun = style === undefined;
  if (isSun) body.append(svgElement('circle', {r: 3.25, fill: 'url(#graph-orbit-corona)'}));
  body.append(svgElement('circle', {r: 1, fill: isSun ? 'url(#graph-orbit-sun)' : planetColors[style]}));
  const texture = svgElement('g', {'clip-path': 'url(#graph-orbit-disc)'});
  if (isSun) {
    const random = seededRandom(8213);
    for (let i = 0; i < 76; i++) {
      const x = 2 * random() - 1, y = 2 * random() - 1;
      const width = .03 + random() * .22;
      texture.append(svgElement('path', {
        d: `M ${x} ${y} q ${width * .7} ${-width} ${width} ${-width * .25}`,
        fill: 'none', stroke: i % 3 ? '#fff3ae' : '#bc593d',
        'stroke-width': .018 + random() * .03, 'stroke-linecap': 'round', opacity: .22,
      }));
    }
  } else if (style % 2 === 0) {
    const bands = svgElement('g', {transform: `rotate(${14 - style * 10})`, fill: 'none'});
    for (const [y, stroke, width, opacity] of [
      [-.65,'#fff7dc',.12,.55],[-.39,'#fff7dc',.21,.29],[-.16,'#432331',.10,.25],
      [.12,'#fff7dc',.15,.46],[.37,'#432331',.24,.21],[.65,'#fff7dc',.14,.37],
    ]) {
      bands.append(svgElement('path', {d: `M -1.2 ${y} Q -.21 ${y + .38} 1.2 ${y - .17}`,
        stroke, 'stroke-width': width, opacity}));
    }
    texture.append(bands);
  } else {
    for (const [cx, cy, rx, ry] of [[-.49,-.29,.24,.13],[.17,-.5,.16,.1],[.39,.2,.27,.17],
      [-.34,.39,.15,.12],[.08,.65,.11,.067],[-.68,.13,.105,.07]]) {
      texture.append(svgElement('ellipse', {cx, cy, rx, ry, fill:'#552c40', opacity: .24,
        stroke:'#fff0d3', 'stroke-opacity': .52, 'stroke-width': .035}));
    }
  }
  const light = isSun ? null : svgElement('circle', {r: 1, fill: 'url(#graph-orbit-light)'});
  const surface = svgElement('g', {});
  surface.append(...texture.childNodes);
  texture.append(surface);
  body.append(texture);
  if (light) body.append(light);
  body.append(svgElement('circle', {r: 1, fill:'none', stroke: isSun ? '#ffdca6' : '#e0f4ff',
    'stroke-opacity': isSun ? .78 : .32, 'stroke-width': .04}));
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
    this.motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
    this.motionPreference.addEventListener('change', () => this.syncMotion());
    document.addEventListener('visibilitychange', () => this.syncMotion());
    this.orbitTime = 0;
    this.animate = this.animate.bind(this);
    this.toolbar?.querySelector('button').addEventListener('click', onClose);
    Object.assign(this, {onSelect, onCenter, onMenu, onHover});
  }

  clear() {
    clearTimeout(this.clickTimer);
    this.stopMotion();
    this.layer?.remove();
    this.layer = null;
    this.key = null;
    this.satellites = [];
    this.orbitTime = 0;
    delete this.svg.dataset.orbitFocus;
    if (this.toolbar) this.toolbar.hidden = true;
  }

  stopMotion() {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.lastFrame = undefined;
  }

  syncMotion() {
    if (!this.satellites?.length || this.motionPreference.matches || document.hidden) {
      this.stopMotion();
    } else if (this.frame === undefined) {
      this.frame = requestAnimationFrame(this.animate);
    }
  }

  animate(now) {
    this.orbitTime += this.lastFrame === undefined ? 0 : Math.min(now - this.lastFrame, 48);
    this.lastFrame = now;
    this.placeSatellites();
    this.frame = requestAnimationFrame(this.animate);
  }

  placeSatellites() {
    for (const {node, light, surface, rx, ry, phase, angularSpeed} of this.satellites) {
      const angle = phase + this.orbitTime * angularSpeed;
      const depth = Math.sin(angle);
      const x = rx * Math.cos(angle);
      const y = ry * depth;
      const dx = x * cosTilt - y * sinTilt;
      const dy = x * sinTilt + y * cosTilt;
      const scale = 1 + .15 * depth;
      node.setAttribute('transform', `translate(${500 + dx} ${this.centerY + dy}) scale(${scale})`);
      node.style.opacity = .89 + .11 * depth;
      light.setAttribute('transform', `rotate(${Math.atan2(-dy, -dx) * 180 / Math.PI})`);
      surface.setAttribute('transform', `rotate(${this.orbitTime * .022})`);
    }
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
    this.stopMotion();
    if (this.layer) this.onHover(null);
    this.layer?.remove();
    this.key = key;
    const layer = this.layer = svgElement('g', {class: 'graph-orbit-scene'});
    layer.append(orbitDefinitions(), orbitStarfield(height));
    const centerY = this.centerY = height / 2;
    const orbits = svgElement('g', {transform: `translate(500 ${centerY}) rotate(${ellipseTilt})`, 'aria-hidden': true});
    const rear = svgElement('g', {class: 'graph-orbit-rear'});
    const front = svgElement('g', {class: 'graph-orbit-front'});
    const satellites = svgElement('g', {});
    this.satellites = [];
    orbits.append(rear, front);
    const orbitSize = Math.min(410, height * .88);
    rings.forEach(({paper, count}, index) => {
      const rx = rings.length === 1 ? orbitSize * .64 : 116 + (orbitSize - 116) * index / (rings.length - 1);
      const ry = rx * .45;
      rear.append(svgElement('path', {d: `M ${-rx} 0 A ${rx} ${ry} 0 0 1 ${rx} 0`}));
      front.append(svgElement('path', {d: `M ${-rx} 0 A ${rx} ${ry} 0 0 0 ${rx} 0`}));
      const {node, light, surface} = this.planet(paper, 10 + (index % 3) * 1.7, count, index % planetColors.length);
      node.dataset.orbitRing = index + 1;
      satellites.append(node);
      this.satellites.push({node, light, surface, rx, ry,
        phase: .74 + index * 2.4,
        angularSpeed: fullTurn / (26000 + index * 5700),
      });
    });

    const {node: planet} = this.planet(center, 34);
    planet.setAttribute('transform', `translate(500 ${centerY})`);
    layer.append(orbits, planet, satellites);
    this.placeSatellites();
    this.svg.append(layer);
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
      (target || planet).focus({preventScroll: true});
    }
    this.syncMotion();
  }

  planet(paper, radius, count, style) {
    const isCenter = count === undefined;
    const name = isCenter ? paper.title : msg`${paper.title} · ${count} 个共同标签`;
    const group = svgElement('g', {
      class: `graph-orbit-planet ${isCenter ? 'graph-orbit-center' : ''}`,
      'data-orbit-paper-id': paper.id, tabindex: 0, role: 'button', 'aria-label': name,
    });
    const {body, light, surface} = planetArtwork(radius, style);
    group.append(svgElement('title', {}, name), body,
      svgElement('circle', {r: radius + 5, class: 'graph-orbit-target'}));
    group.addEventListener('click', event => {
      clearTimeout(this.clickTimer);
      if (event.detail <= 1) {
        this.clickTimer = setTimeout(() => {
          if (group.isConnected) this.onSelect(paper.id);
        }, 260);
      }
    });
    group.addEventListener('dblclick', () => {
      clearTimeout(this.clickTimer);
      this.onCenter(paper.id);
    });
    group.addEventListener('contextmenu', event => { event.preventDefault(); this.onMenu(paper.id, event, group); });
    group.addEventListener('pointerenter', event => this.onHover(this.papers.get(paper.id), event));
    group.addEventListener('pointerleave', () => this.onHover(null));
    group.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      if (event.shiftKey && event.key === 'Enter') this.onCenter(paper.id);
      else this.onSelect(paper.id);
    });
    return {node: group, light, surface};
  }
}
