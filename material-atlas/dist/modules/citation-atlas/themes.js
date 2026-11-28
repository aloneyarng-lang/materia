export const DEFAULT_CITATION_THEME = 'classic';

export const CITATION_THEMES = [
  {
    id: 'classic',
    name: '经典原版',
    summary: '保留当前圆点与曲线样式，高引节点仅按被引放大',
    legendHasHighCited: false,
  },
  {
    id: 'baroque',
    name: '皇家浑天仪',
    summary: '巴洛克古星图、双股描金弧线，高引文献化作密钉金珠立体浑天仪',
    legendHasHighCited: true,
  },
  {
    id: 'constellation',
    name: '星象星芒',
    summary: '星图弧线，高引文献化作四角/八角星芒与轨道光环',
    legendHasHighCited: true,
  },
  {
    id: 'crystal',
    name: '晶格工程',
    summary: '六边晶格与 45° 工程折线，高引文献带双层晶核与准星框',
    legendHasHighCited: true,
  },
  {
    id: 'editorial',
    name: '期刊手稿',
    summary: '高对比印刷线条与开放箭头，高引文献带双环星标冠冕',
    legendHasHighCited: true,
  },
  {
    id: 'circuit',
    name: '霓虹光轨',
    summary: '流光丝带与尖矛箭头，高引文献带十字光刃与雷达光弧',
    legendHasHighCited: true,
  },
];

const THEME_MAP = new Map(CITATION_THEMES.map(theme => [theme.id, theme]));

/**
 * Normalize any theme identifier to a supported citation theme ID.
 */
export function normalizeCitationTheme(id) {
  return typeof id === 'string' && THEME_MAP.has(id) ? id : DEFAULT_CITATION_THEME;
}

/**
 * Resolve a citation theme metadata object by ID, defaulting to classic.
 */
export function getCitationTheme(id) {
  return THEME_MAP.get(normalizeCitationTheme(id)) || CITATION_THEMES[0];
}

/**
 * Format citation counts concisely for landmark badges and cartouches.
 */
export function formatCompactCitations(count) {
  const value = Number(count);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value < 1000) return String(Math.round(value));
  if (value < 10000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${Math.round(value / 1000)}k`;
}

/**
 * Classify cited papers into 'normal', 'high', or 'landmark' tiers based on
 * global citation counts, co-citation overlap, and in-graph citation hub degree.
 */
export function classifyCitationTiers(nodes = [], edges = []) {
  const inDegree = new Map();
  for (const edge of edges) {
    if (!edge || edge.source === edge.target) continue;
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }

  const seedCount = nodes.filter(node => node?.role === 'seed').length;
  const citedNodes = nodes.filter(node => node?.role === 'cited');
  const citedCounts = citedNodes
    .map(node => Math.max(0, Number(node.citationCount) || 0))
    .filter(count => count > 0)
    .sort((a, b) => b - a);

  const maxCite = citedCounts[0] || 0;
  let p85 = Infinity;
  let p94 = Infinity;
  if (citedCounts.length >= 4) {
    p85 = citedCounts[Math.min(citedCounts.length - 1, Math.floor(citedCounts.length * 0.15))];
    p94 = citedCounts[Math.min(citedCounts.length - 1, Math.floor(citedCounts.length * 0.06))];
  }

  const result = new Map();
  for (const node of nodes) {
    if (!node) continue;
    const c = Math.max(0, Number(node.citationCount) || 0);
    const co = node.coCiteCount || 0;
    const deg = inDegree.get(node.id) || 0;
    if (node.role !== 'cited') {
      result.set(node.id, { tier: 'normal', inDegree: deg, citationCount: c, coCiteCount: co });
      continue;
    }

    const isLandmark = c >= 500
      || (citedCounts.length >= 4 && maxCite >= 100 && c >= Math.max(120, p94))
      || (seedCount >= 3 && co >= Math.max(3, Math.ceil(seedCount * 0.6)))
      || deg >= 7;

    const isHigh = !isLandmark && (
      c >= 200
      || (citedCounts.length >= 4 && maxCite >= 30 && c >= Math.max(30, p85))
      || (citedCounts.length > 0 && citedCounts.length < 4 && c >= 100)
      || co >= 3
      || deg >= 4
    );

    const tier = isLandmark ? 'landmark' : isHigh ? 'high' : 'normal';
    result.set(node.id, { tier, inDegree: deg, citationCount: c, coCiteCount: co });
  }
  return result;
}

/**
 * Extra radial clearance for special high-citation node morphologies.
 * Classic theme keeps 0 extra radius to preserve original geometry verbatim.
 */
export function highCitedExtraRadius(themeId, tier) {
  const id = normalizeCitationTheme(themeId);
  if (id === 'classic' || tier === 'normal' || !tier) {
    return 0;
  }
  if (id === 'baroque') {
    return tier === 'landmark' ? 14.5 : 8.5;
  }
  return tier === 'landmark' ? 9.5 : 5.5;
}

function starPoints(cx, cy, outerR, innerR, points, rotation = -Math.PI / 2) {
  const coords = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = rotation + (i * Math.PI) / points;
    coords.push(`${(cx + Math.cos(angle) * r).toFixed(2)},${(cy + Math.sin(angle) * r).toFixed(2)}`);
  }
  return coords.join(' ');
}

function polygonPoints(cx, cy, r, sides, rotation = 0) {
  const coords = [];
  for (let i = 0; i < sides; i++) {
    const angle = rotation + (i * Math.PI * 2) / sides;
    coords.push(`${(cx + Math.cos(angle) * r).toFixed(2)},${(cy + Math.sin(angle) * r).toFixed(2)}`);
  }
  return coords.join(' ');
}

function sunburstPoints(cx, cy, outerR, innerR, rays = 12) {
  return starPoints(cx, cy, outerR, innerR, rays, -Math.PI / 2);
}

/**
 * Render an inline SVG thumbnail illustrating node, link, and high-cited morphology for a theme.
 */
export function themePreviewSvg(themeId) {
  const id = normalizeCitationTheme(themeId);
  if (id === 'baroque') {
    const pearls = Array.from({ length: 14 }, (_, i) => {
      const a = (i * Math.PI * 2) / 14;
      return `<circle cx="${(56 + Math.cos(a) * 11.2).toFixed(1)}" cy="${(20 + Math.sin(a) * 11.2).toFixed(1)}" r="1.05" fill="#fce8b2"/>`;
    }).join('');
    return `<svg viewBox="0 0 112 44" class="cc-theme-swatch-svg" aria-hidden="true">
      <rect x="0.5" y="0.5" width="111" height="43" rx="6" fill="#091122" stroke="#b98d3c" stroke-width="0.9"/>
      <rect x="2.5" y="2.5" width="107" height="39" rx="4.5" fill="none" stroke="#dfba69" stroke-opacity="0.35" stroke-width="0.6"/>
      <path d="M5 10 V5 H10 M102 5 H107 V10 M5 34 V39 H10 M102 39 H107 V34" fill="none" stroke="#dfba69" stroke-width="0.9"/>
      <path d="M90 22 C76 8, 66 10, 56 18" fill="none" stroke="#dfba69" stroke-width="1.25"/>
      <path d="M90 24.5 C76 11, 66 13, 56 20.5" fill="none" stroke="#fce8b2" stroke-width="0.7" stroke-dasharray="1.4 2.2"/>
      <path d="M56 21 Q38 33 21 26" fill="none" stroke="#b98d3c" stroke-width="1" stroke-opacity="0.75"/>
      <polygon points="73,13.2 75.2,15.4 73,17.6 70.8,15.4" fill="#fce8b2"/>
      <circle cx="20" cy="26" r="4.5" fill="#20458c" stroke="#dfba69" stroke-width="1.1"/>
      <path d="M20 22 V30 M16 26 H24" stroke="#fce8b2" stroke-width="0.6" stroke-opacity="0.7"/>
      <polygon points="${starPoints(33, 14, 5.2, 1.8, 8)}" fill="#dfba69" stroke="#6e501f" stroke-width="0.4"/>
      <circle cx="56" cy="20" r="9.4" fill="#0e1c3a" stroke="#b98d3c" stroke-width="0.9"/>
      ${pearls}
      <polygon points="${starPoints(56, 20, 7.6, 2.5, 8)}" fill="#dfba69"/>
      <ellipse cx="56" cy="20" rx="10.8" ry="3.2" transform="rotate(-32 56 20)" fill="none" stroke="#fce8b2" stroke-width="1.45"/>
      <circle cx="56" cy="20" r="1.8" fill="#f6fbff"/>
      <polygon points="${sunburstPoints(92, 22, 10.5, 4.8, 12)}" fill="#dfba69" stroke="#6e501f" stroke-width="0.4"/>
      <circle cx="92" cy="22" r="4.4" fill="#f6fbff" stroke="#fce8b2" stroke-width="0.9"/>
    </svg>`;
  }

  if (id === 'constellation') {
    return `<svg viewBox="0 0 112 44" class="cc-theme-swatch-svg" aria-hidden="true">
      <path d="M20 26 Q54 10 86 22" fill="none" stroke="var(--teal)" stroke-width="1.35" stroke-opacity="0.75"/>
      <path d="M20 26 Q38 34 56 28" fill="none" stroke="var(--muted)" stroke-width="1" stroke-dasharray="2 2.5" stroke-opacity="0.65"/>
      <circle cx="20" cy="26" r="4.8" fill="var(--surface)" stroke="var(--warning, #d97706)" stroke-width="1.5"/>
      <polygon points="${polygonPoints(56, 28, 5, 4, 0)}" fill="var(--surface)" stroke="var(--teal)" stroke-width="1.4"/>
      <circle cx="56" cy="13" r="8.5" fill="none" stroke="var(--warning, #d97706)" stroke-width="1" stroke-dasharray="2 2"/>
      <polygon points="${starPoints(56, 13, 7.4, 3.2, 4)}" fill="var(--surface)" stroke="var(--warning, #d97706)" stroke-width="1.4"/>
      <circle cx="90" cy="22" r="8.2" fill="none" stroke="var(--teal)" stroke-width="1" stroke-dasharray="2.5 2"/>
      <circle cx="90" cy="22" r="5.2" fill="var(--teal)"/>
      <circle cx="90" cy="22" r="1.7" fill="#ffffff"/>
    </svg>`;
  }

  if (id === 'crystal') {
    return `<svg viewBox="0 0 112 44" class="cc-theme-swatch-svg" aria-hidden="true">
      <path d="M22 25 L38 25 L48 14 L84 14" fill="none" stroke="var(--teal)" stroke-width="1.35" stroke-opacity="0.75"/>
      <path d="M22 25 L40 31 L84 31" fill="none" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3.5 2" stroke-opacity="0.65"/>
      <polygon points="${polygonPoints(20, 25, 5.2, 4, 0)}" fill="var(--surface)" stroke="var(--warning, #d97706)" stroke-width="1.5"/>
      <polygon points="${polygonPoints(56, 14, 9, 6, -Math.PI / 6)}" fill="none" stroke="var(--warning, #d97706)" stroke-width="1.2"/>
      <polygon points="${polygonPoints(56, 14, 5.4, 6, -Math.PI / 6)}" fill="var(--surface)" stroke="var(--warning, #d97706)" stroke-width="1.4"/>
      <rect x="51.5" y="26.5" width="9" height="9" rx="2" fill="var(--surface)" stroke="var(--teal)" stroke-width="1.4"/>
      <polygon points="${polygonPoints(90, 22, 8.6, 6, -Math.PI / 6)}" fill="none" stroke="var(--teal)" stroke-width="1.1"/>
      <polygon points="${polygonPoints(90, 22, 5.4, 6, -Math.PI / 6)}" fill="var(--teal)"/>
    </svg>`;
  }

  if (id === 'editorial') {
    return `<svg viewBox="0 0 112 44" class="cc-theme-swatch-svg" aria-hidden="true">
      <path d="M20 27 Q56 16 86 22" fill="none" stroke="var(--ink)" stroke-width="1.35" stroke-opacity="0.7"/>
      <path d="M20 27 Q38 34 56 29" fill="none" stroke="var(--muted)" stroke-width="1" stroke-dasharray="2 2.5" stroke-opacity="0.65"/>
      <circle cx="20" cy="27" r="4.8" fill="var(--surface)" stroke="var(--warning, #d97706)" stroke-width="1.6"/>
      <circle cx="56" cy="29" r="4.8" fill="var(--surface)" stroke="var(--teal)" stroke-width="1.6"/>
      <circle cx="56" cy="29" r="1.7" fill="var(--teal)"/>
      <circle cx="56" cy="14" r="8.4" fill="none" stroke="var(--warning, #d97706)" stroke-width="1.2"/>
      <circle cx="56" cy="14" r="5.4" fill="var(--surface)" stroke="var(--warning, #d97706)" stroke-width="1.6"/>
      <polygon points="${starPoints(56, 5.6, 3.1, 1.3, 5)}" fill="var(--warning, #d97706)"/>
      <circle cx="90" cy="22" r="8" fill="none" stroke="var(--teal)" stroke-width="1.1"/>
      <circle cx="90" cy="22" r="5.3" fill="var(--teal)"/>
    </svg>`;
  }

  if (id === 'circuit') {
    return `<svg viewBox="0 0 112 44" class="cc-theme-swatch-svg" aria-hidden="true">
      <path d="M20 26 Q54 9 86 22" fill="none" stroke="var(--teal)" stroke-width="3.6" stroke-opacity="0.22"/>
      <path d="M20 26 Q54 9 86 22" fill="none" stroke="var(--teal)" stroke-width="1.4"/>
      <path d="M20 26 Q38 34 56 29" fill="none" stroke="var(--muted)" stroke-width="1" stroke-dasharray="4.5 2.5" stroke-opacity="0.65"/>
      <circle cx="20" cy="26" r="4.8" fill="var(--surface)" stroke="var(--warning, #d97706)" stroke-width="1.5"/>
      <polygon points="${polygonPoints(56, 29, 5, 4, 0)}" fill="var(--surface)" stroke="var(--teal)" stroke-width="1.45"/>
      <path d="M46 13 A10 10 0 0 1 66 13" fill="none" stroke="var(--warning, #d97706)" stroke-width="1.35"/>
      <path d="M46 13 A10 10 0 0 0 66 13" fill="none" stroke="var(--teal)" stroke-width="1.2" stroke-dasharray="5 3"/>
      <line x1="56" y1="4.5" x2="56" y2="21.5" stroke="var(--warning, #d97706)" stroke-width="1.2"/>
      <line x1="47.5" y1="13" x2="64.5" y2="13" stroke="var(--warning, #d97706)" stroke-width="1.2"/>
      <circle cx="56" cy="13" r="5" fill="var(--surface)" stroke="var(--warning, #d97706)" stroke-width="1.6"/>
      <circle cx="90" cy="22" r="8.2" fill="none" stroke="var(--teal)" stroke-width="1.3" stroke-opacity="0.5"/>
      <circle cx="90" cy="22" r="5.3" fill="var(--teal)"/>
      <circle cx="90" cy="22" r="1.8" fill="#ffffff"/>
    </svg>`;
  }

  return `<svg viewBox="0 0 112 44" class="cc-theme-swatch-svg" aria-hidden="true">
    <path d="M20 26 C42 13 62 31 86 22" fill="none" stroke="var(--teal)" stroke-width="1.3" stroke-opacity="0.62"/>
    <path d="M20 26 C34 31 44 31 56 28" fill="none" stroke="var(--muted)" stroke-width="1" stroke-opacity="0.55"/>
    <circle cx="20" cy="26" r="4.8" fill="var(--surface)" stroke="var(--warning, #d97706)" stroke-width="1.5"/>
    <circle cx="56" cy="14" r="7.2" fill="var(--surface)" stroke="var(--warning, #d97706)" stroke-width="1.65"/>
    <circle cx="56" cy="28" r="4.5" fill="var(--surface)" stroke="var(--teal)" stroke-width="1.4"/>
    <circle cx="90" cy="22" r="8" fill="none" stroke="var(--teal)" stroke-width="1.2" stroke-opacity="0.45"/>
    <circle cx="90" cy="22" r="5.4" fill="var(--teal)"/>
    <circle cx="90" cy="22" r="1.7" fill="#ffffff"/>
  </svg>`;
}

/**
 * Render an inline SVG legend icon matching a specific theme and node category.
 */
export function themeLegendIconSvg(themeId, kind) {
  const id = normalizeCitationTheme(themeId);
  if (id === 'baroque') {
    if (kind === 'seed') {
      return `<svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true">
        <polygon points="${sunburstPoints(9, 9, 8.2, 4.2, 12)}" fill="#dfba69"/>
        <circle cx="9" cy="9" r="3.2" fill="#f6fbff" stroke="#b98d3c" stroke-width="0.8"/>
      </svg>`;
    }
    if (kind === 'missing') {
      return `<svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true">
        <circle cx="9" cy="9" r="6.8" fill="none" stroke="#dfba69" stroke-width="0.8" stroke-dasharray="1.3 1.7"/>
        <polygon points="${starPoints(9, 9, 6.2, 2.2, 8)}" fill="#f5b96b" stroke="#6e501f" stroke-width="0.4"/>
        <circle cx="9" cy="9" r="1.2" fill="#ffffff"/>
      </svg>`;
    }
    if (kind === 'unread') {
      return `<svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true">
        <circle cx="9" cy="9" r="5.4" fill="#20458c" stroke="#dfba69" stroke-width="1.3"/>
        <path d="M9 4.5 V13.5 M4.5 9 H13.5" stroke="#fce8b2" stroke-width="0.7" stroke-opacity="0.8"/>
        <circle cx="9" cy="9" r="1.1" fill="#f6fbff"/>
      </svg>`;
    }
    if (kind === 'high') {
      const pearls = Array.from({ length: 10 }, (_, i) => {
        const a = (i * Math.PI * 2) / 10;
        return `<circle cx="${(9 + Math.cos(a) * 6.8).toFixed(1)}" cy="${(9 + Math.sin(a) * 6.8).toFixed(1)}" r="0.8" fill="#fce8b2"/>`;
      }).join('');
      return `<svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true">
        <circle cx="9" cy="9" r="5.5" fill="#0e1c3a" stroke="#b98d3c" stroke-width="0.8"/>
        ${pearls}
        <polygon points="${starPoints(9, 9, 4.6, 1.6, 8)}" fill="#dfba69"/>
        <ellipse cx="9" cy="9" rx="6.6" ry="2.1" transform="rotate(-32 9 9)" fill="none" stroke="#fce8b2" stroke-width="1.1"/>
      </svg>`;
    }
    return `<svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true">
      <polygon points="${starPoints(9, 9, 4.6, 1.8, 4)}" fill="#b98d3c" fill-opacity="0.85"/>
      <circle cx="9" cy="9" r="1.1" fill="#fce8b2"/>
    </svg>`;
  }

  const strokeColor = kind === 'missing'
    ? 'var(--warning, #d97706)'
    : kind === 'read'
      ? 'var(--muted)'
      : kind === 'high'
        ? 'var(--warning, #d97706)'
        : 'var(--teal)';

  if (kind === 'high') {
    if (id === 'constellation') {
      return `<svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true">
        <circle cx="9" cy="9" r="7" fill="none" stroke="${strokeColor}" stroke-width="1" stroke-dasharray="2 2"/>
        <polygon points="${starPoints(9, 9, 7, 3.1, 4)}" fill="var(--surface)" stroke="${strokeColor}" stroke-width="1.4"/>
      </svg>`;
    }
    if (id === 'crystal') {
      return `<svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true">
        <polygon points="${polygonPoints(9, 9, 7.2, 6, -Math.PI / 6)}" fill="none" stroke="${strokeColor}" stroke-width="1.15"/>
        <polygon points="${polygonPoints(9, 9, 4.4, 6, -Math.PI / 6)}" fill="var(--surface)" stroke="${strokeColor}" stroke-width="1.35"/>
      </svg>`;
    }
    if (id === 'editorial') {
      return `<svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true">
        <circle cx="9" cy="9.5" r="6.6" fill="none" stroke="${strokeColor}" stroke-width="1.1"/>
        <circle cx="9" cy="9.5" r="4.4" fill="var(--surface)" stroke="${strokeColor}" stroke-width="1.5"/>
        <polygon points="${starPoints(9, 3, 2.5, 1.1, 5)}" fill="${strokeColor}"/>
      </svg>`;
    }
    if (id === 'circuit') {
      return `<svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true">
        <path d="M3 9 A6 6 0 0 1 15 9" fill="none" stroke="${strokeColor}" stroke-width="1.3"/>
        <path d="M3 9 A6 6 0 0 0 15 9" fill="none" stroke="var(--teal)" stroke-width="1.1" stroke-dasharray="4 2"/>
        <line x1="9" y1="2" x2="9" y2="16" stroke="${strokeColor}" stroke-width="1.1"/>
        <line x1="2" y1="9" x2="16" y2="9" stroke="${strokeColor}" stroke-width="1.1"/>
        <circle cx="9" cy="9" r="3.8" fill="var(--surface)" stroke="${strokeColor}" stroke-width="1.5"/>
      </svg>`;
    }
  }

  if (id === 'crystal') {
    if (kind === 'seed') {
      return `<svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true">
        <polygon points="${polygonPoints(9, 9, 7.2, 6, -Math.PI / 6)}" fill="none" stroke="var(--teal)" stroke-width="1.2"/>
        <polygon points="${polygonPoints(9, 9, 4.8, 6, -Math.PI / 6)}" fill="var(--teal)"/>
      </svg>`;
    }
    if (kind === 'missing') {
      return `<svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true">
        <polygon points="${polygonPoints(9, 9, 6.8, 4, 0)}" fill="none" stroke="${strokeColor}" stroke-width="1" stroke-dasharray="2 2"/>
        <polygon points="${polygonPoints(9, 9, 4.4, 4, 0)}" fill="var(--surface)" stroke="${strokeColor}" stroke-width="1.5"/>
      </svg>`;
    }
    if (kind === 'unread') {
      return `<svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true">
        <rect x="4" y="4" width="10" height="10" rx="2" fill="var(--surface)" stroke="${strokeColor}" stroke-width="1.6"/>
      </svg>`;
    }
    return `<svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true">
      <polygon points="${polygonPoints(9, 9, 5, 6, -Math.PI / 6)}" fill="var(--panel)" stroke="${strokeColor}" stroke-width="1.4"/>
    </svg>`;
  }

  if (id === 'constellation' || id === 'circuit') {
    if (kind === 'seed') {
      return `<svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true">
        <circle cx="9" cy="9" r="7" fill="none" stroke="var(--teal)" stroke-width="1.1" stroke-dasharray="${id === 'constellation' ? '2 2' : '5 2'}"/>
        <circle cx="9" cy="9" r="4.5" fill="var(--teal)"/>
        <circle cx="9" cy="9" r="1.4" fill="#ffffff"/>
      </svg>`;
    }
    if (kind === 'unread') {
      return `<svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true">
        <polygon points="${polygonPoints(9, 9, 5.2, 4, 0)}" fill="var(--surface)" stroke="var(--teal)" stroke-width="1.6"/>
        <circle cx="9" cy="9" r="1.4" fill="var(--teal)"/>
      </svg>`;
    }
    if (kind === 'missing') {
      return `<svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true">
        <circle cx="9" cy="9" r="6.8" fill="none" stroke="${strokeColor}" stroke-width="1" stroke-dasharray="2 2"/>
        <circle cx="9" cy="9" r="4.4" fill="var(--surface)" stroke="${strokeColor}" stroke-width="1.6"/>
      </svg>`;
    }
    return `<svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true">
      <circle cx="9" cy="9" r="4.5" fill="var(--panel)" stroke="var(--muted)" stroke-width="1.4"/>
    </svg>`;
  }

  if (id === 'editorial') {
    if (kind === 'seed') {
      return `<svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true">
        <circle cx="9" cy="9" r="7" fill="none" stroke="var(--teal)" stroke-width="1"/>
        <circle cx="9" cy="9" r="4.8" fill="var(--teal)"/>
        <circle cx="9" cy="9" r="2.2" fill="none" stroke="#ffffff" stroke-width="1"/>
      </svg>`;
    }
    if (kind === 'unread') {
      return `<svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true">
        <circle cx="9" cy="9" r="5" fill="var(--surface)" stroke="var(--teal)" stroke-width="1.7"/>
        <circle cx="9" cy="9" r="1.9" fill="var(--teal)"/>
      </svg>`;
    }
    if (kind === 'missing') {
      return `<svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true">
        <circle cx="9" cy="9" r="6.8" fill="none" stroke="${strokeColor}" stroke-width="1" stroke-dasharray="2.5 2"/>
        <circle cx="9" cy="9" r="4.5" fill="var(--surface)" stroke="${strokeColor}" stroke-width="1.7"/>
      </svg>`;
    }
    return `<svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true">
      <circle cx="9" cy="9" r="4.5" fill="var(--surface)" stroke="var(--muted)" stroke-width="1.4"/>
    </svg>`;
  }

  if (kind === 'seed') {
    return `<svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true"><circle cx="9" cy="9" r="6.5" fill="none" stroke="var(--teal)" stroke-width="1.2"/><circle cx="9" cy="9" r="4.5" fill="var(--teal)"/></svg>`;
  }
  return `<svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true"><circle cx="9" cy="9" r="4.8" fill="var(--surface)" stroke="${strokeColor}" stroke-width="1.6"/></svg>`;
}
