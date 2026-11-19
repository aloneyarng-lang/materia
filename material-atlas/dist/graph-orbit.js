import {getLocale, msg, t} from './i18n.js';
import {normalizedTagSet} from './shared-tag-links.js';

const NS = 'http://www.w3.org/2000/svg';
const ellipseTilt = -14;
const tilt = ellipseTilt * Math.PI / 180;

function svgElement(tag, attributes, content) {
  const element = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  if (content !== undefined) element.textContent = content;
  return element;
}

export function groupOrbitPapers(center, papers, ringLimit) {
  const tags = normalizedTagSet(center);
  const byCount = new Map();
  for (const paper of papers) {
    if (paper.id === center.id) continue;
    let count = 0;
    for (const tag of normalizedTagSet(paper)) if (tags.has(tag)) count++;
    if (!count) continue;
    if (!byCount.has(count)) byCount.set(count, []);
    byCount.get(count).push({paper, count});
  }

  const counts = [...byCount.keys()].sort((a, b) => b - a);
  const ringCount = Math.min(ringLimit, counts.length);
  const rings = Array.from({length: ringCount}, () => []);
  counts.forEach((count, index) => {
    const ring = rings[Math.floor(index * ringCount / counts.length)];
    for (const entry of byCount.get(count)) ring.push(entry);
  });
  return rings;
}

export class GraphOrbit {
  constructor(svg, {onSelect, onCenter, onMenu, onHover, onClose}) {
    this.svg = svg;
    this.toolbar = svg.parentElement?.querySelector('.graph-orbit-toolbar');
    this.toolbar?.querySelector('button').addEventListener('click', onClose);
    Object.assign(this, {onSelect, onCenter, onMenu, onHover});
  }

  clear() {
    clearTimeout(this.clickTimer);
    this.layer?.remove();
    this.layer = null;
    this.key = null;
    delete this.svg.dataset.orbitFocus;
    if (this.toolbar) this.toolbar.hidden = true;
  }

  select(id) {
    for (const node of this.layer?.querySelectorAll('[data-orbit-paper-id]') || []) {
      node.setAttribute('aria-pressed', String(node.dataset.orbitPaperId === id));
    }
  }

  render(center, papers, ringLimit, height, selected) {
    const rings = groupOrbitPapers(center, papers, ringLimit);
    const key = JSON.stringify([height, getLocale(), center.id, center.title,
      rings.map(ring => ring.map(({paper, count}) => [paper.id, paper.title, count]))]);
    this.papers = new Map(papers.map(paper => [paper.id, paper]));
    if (this.key === key && this.layer?.parentNode === this.svg) {
      this.select(selected);
      return;
    }

    const previousFocus = this.layer?.contains(document.activeElement) ? document.activeElement.dataset.orbitPaperId : '';
    this.layer?.remove();
    this.key = key;
    const layer = this.layer = svgElement('g', {class: 'graph-orbit-scene'});
    const defs = svgElement('defs', {});
    const shade = svgElement('radialGradient', {id: 'graph-orbit-shade', cx: '31%', cy: '25%', r: '79%'});
    for (const [offset, color, opacity] of [[0,'#fff',.92],[.32,'#fff',.26],[.53,'#08142f',0],[.87,'#08142f',.65],[1,'#020715',.9]]) {
      shade.append(svgElement('stop', {offset, 'stop-color': color, 'stop-opacity': opacity}));
    }
    defs.append(shade);
    layer.append(defs);

    const centerY = height / 2;
    const orbits = svgElement('g', {transform: `translate(500 ${centerY}) rotate(${ellipseTilt})`, 'aria-hidden': true});
    const rear = svgElement('g', {class: 'graph-orbit-rear'});
    const front = svgElement('g', {class: 'graph-orbit-front'});
    const farSatellites = svgElement('g', {});
    const nearSatellites = svgElement('g', {});
    orbits.append(rear, front);
    const orbitSize = Math.min(406, height * .81);
    rings.forEach((ring, index) => {
      const rx = rings.length === 1 ? orbitSize * .64 : 92 + (orbitSize - 92) * index / (rings.length - 1);
      const ry = rx * .46;
      rear.append(svgElement('path', {d: `M ${-rx} 0 A ${rx} ${ry} 0 0 1 ${rx} 0`}));
      front.append(svgElement('path', {d: `M ${-rx} 0 A ${rx} ${ry} 0 0 0 ${rx} 0`}));
      ring.forEach(({paper, count}, position) => {
        const angle = (position + .23) * 2 * Math.PI / ring.length + index * 1.37;
        const depth = Math.sin(angle);
        const x = rx * Math.cos(angle);
        const y = ry * depth;
        const radius = Math.max(1.5, Math.min(9, 2 * Math.PI * ry / ring.length * .35)) * (1 + .27 * depth);
        const satellite = this.planet(paper, radius, count);
        satellite.dataset.orbitRing = index + 1;
        satellite.setAttribute('transform', `translate(${500 + x * Math.cos(tilt) - y * Math.sin(tilt)} ${centerY + x * Math.sin(tilt) + y * Math.cos(tilt)})`);
        satellite.style.opacity = depth < 0 ? .77 + depth * .15 : 1;
        (depth < 0 ? farSatellites : nearSatellites).append(satellite);
      });
    });

    const planet = this.planet(center, 32);
    planet.setAttribute('transform', `translate(500 ${centerY})`);
    layer.append(orbits, farSatellites, planet, nearSatellites);
    this.svg.append(layer);
    this.svg.dataset.orbitFocus = 'true';
    this.select(selected);
    if (this.toolbar) {
      this.toolbar.hidden = false;
      this.toolbar.querySelector('strong').textContent = center.title;
      this.toolbar.querySelector('small').textContent = rings.length
        ? msg`${rings.reduce((sum, ring) => sum + ring.length, 0)} 篇相关文献 · ${rings.length} 圈`
        : t('当前范围内没有共同标签文献');
    }
    if (previousFocus) {
      const target = [...layer.querySelectorAll('[data-orbit-paper-id]')].find(node => node.dataset.orbitPaperId === previousFocus);
      (target || planet).focus({preventScroll: true});
    }
  }

  planet(paper, radius, count) {
    const isCenter = count === undefined;
    const name = isCenter ? paper.title : msg`${paper.title} · ${count} 个共同标签`;
    const group = svgElement('g', {
      class: `graph-orbit-planet ${isCenter ? 'graph-orbit-center' : ''}`,
      'data-orbit-paper-id': paper.id, tabindex: 0, role: 'button', 'aria-label': name,
    });
    group.append(
      svgElement('title', {}, name),
      svgElement('circle', {r: radius + 2, class: 'graph-orbit-target'}),
      svgElement('circle', {r: radius, class: 'graph-orbit-sphere'}),
      svgElement('circle', {r: radius, fill: 'url(#graph-orbit-shade)', 'pointer-events': 'none'}),
    );
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
    return group;
  }
}
