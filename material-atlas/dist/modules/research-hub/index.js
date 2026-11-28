import { html, msg, t } from '../../i18n.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[ch]));

const ATELIER_SCHEMATICS = {
  'literature-workbench': `
    <svg viewBox="0 0 120 84" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <rect x="10" y="10" width="44" height="64" rx="6" opacity=".32"/>
      <line x1="18" y1="22" x2="46" y2="22" opacity=".6"/>
      <line x1="18" y1="31" x2="42" y2="31" opacity=".4"/>
      <rect x="18" y="40" width="28" height="22" rx="4" stroke-dasharray="3 2" opacity=".8"/>
      <rect x="64" y="10" width="46" height="40" rx="6" fill="currentColor" fill-opacity=".08"/>
      <path d="M72 41 L82 28 L91 36 L98 25 L104 41" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="64" y="56" width="46" height="18" rx="5" opacity=".5"/>
      <line x1="71" y1="65" x2="101" y2="65" stroke-linecap="round" opacity=".85"/>
    </svg>`,
  'takeaway-card': `
    <svg viewBox="0 0 120 84" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <rect x="12" y="12" width="44" height="27" rx="6" fill="currentColor" fill-opacity=".08"/>
      <rect x="64" y="12" width="44" height="27" rx="6" opacity=".48"/>
      <rect x="12" y="45" width="44" height="27" rx="6" opacity=".48"/>
      <rect x="64" y="45" width="44" height="27" rx="6" fill="currentColor" fill-opacity=".08"/>
      <circle cx="21" cy="21" r="2.2" fill="currentColor"/>
      <line x1="28" y1="21" x2="48" y2="21" stroke-linecap="round"/>
      <line x1="73" y1="56" x2="99" y2="56" stroke-linecap="round" opacity=".8"/>
      <line x1="20" y1="56" x2="46" y2="56" stroke-linecap="round" opacity=".65"/>
    </svg>`,
  'paper-canvas': `
    <svg viewBox="0 0 120 84" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <rect x="10" y="30" width="32" height="24" rx="12" fill="currentColor" fill-opacity=".1"/>
      <path d="M42 42 C56 42 56 20 72 20" opacity=".7"/>
      <path d="M42 42 C56 42 56 64 72 64" opacity=".7"/>
      <rect x="72" y="10" width="38" height="20" rx="6" opacity=".78"/>
      <rect x="72" y="34" width="38" height="16" rx="6" opacity=".45" stroke-dasharray="3 2"/>
      <rect x="72" y="54" width="38" height="20" rx="6" opacity=".78"/>
      <circle cx="26" cy="42" r="3" fill="currentColor"/>
    </svg>`,
  'combined-timeline': `
    <svg viewBox="0 0 120 84" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <line x1="28" y1="12" x2="28" y2="72" opacity=".45"/>
      <circle cx="28" cy="22" r="4" fill="currentColor"/>
      <circle cx="28" cy="44" r="4" stroke-width="2" fill="var(--surface, #fff)"/>
      <circle cx="28" cy="64" r="3.5" fill="currentColor" opacity=".65"/>
      <rect x="42" y="14" width="66" height="16" rx="5" fill="currentColor" fill-opacity=".08"/>
      <rect x="42" y="36" width="58" height="16" rx="5" opacity=".55"/>
      <rect x="42" y="57" width="66" height="16" rx="5" opacity=".38"/>
    </svg>`,
  'citation-atlas': `
    <svg viewBox="0 0 120 84" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <circle cx="30" cy="26" r="7" fill="currentColor" fill-opacity=".16"/>
      <circle cx="30" cy="58" r="7" fill="currentColor" fill-opacity=".16"/>
      <circle cx="84" cy="42" r="9.5" stroke-dasharray="3 2"/>
      <circle cx="62" cy="18" r="4.5" opacity=".7"/>
      <path d="M36 29 L75 40 M36 55 L75 44 M35 23 L58 19 M66 20 L80 34" opacity=".65"/>
      <circle cx="84" cy="42" r="3.5" fill="currentColor"/>
    </svg>`,
};

const CHILD_META = {
  'literature-workbench': {
    kicker: 'FIGURE-BY-FIGURE STUDIO',
    badge: 'PDF 精析',
    layoutClass: 'is-hero',
    desc: '按图逐页拆解实验证据，自动构建研究速览、交互式结构导图并展开报告追问。',
  },
  'takeaway-card': {
    kicker: '30S BRIEFING CARD',
    badge: '四维凝练',
    layoutClass: 'is-feature',
    desc: '在每篇文献的核心处凝练痛点、手段、最硬核证据与边界局限，一键导出卡片。',
  },
  'paper-canvas': {
    kicker: 'VISUAL MINDMAP',
    badge: '图谱建模',
    layoutClass: '',
    desc: '基于 AI 解析论文论证链条，自动编排矢量思维导图并实时同步至研究画布库。',
  },
  'combined-timeline': {
    kicker: 'CHRONOLOGY ARCHIVE',
    badge: '演进脉络',
    layoutClass: '',
    desc: '跨越年份梳理全库文献的创新突破与实验局限，支持研究方向归类与 Markdown 汇出。',
  },
  'citation-atlas': {
    kicker: 'CITATION CROSS-RADAR',
    badge: '引文雷达',
    layoutClass: '',
    desc: '以种子文献群扫描 OpenAlex 与本地 PDF 参考文献交集，定位高频共引与未读盲区。',
  },
};

export const researchHubModule = {
  id: 'research',
  label: '研读',
  title: '研读工坊',
  icon: 'files',
  panelId: 'research-workspace',
  navigation: 'ribbon',
  styles: [new URL('./workspace.css', import.meta.url).href],
  create({ host, on, getPapers, getChildViews, setCount }) {
    const reducedMotion = typeof matchMedia === 'function'
      ? matchMedia('(prefers-reduced-motion: reduce)')
      : { matches: false };

    function computeTelemetry(papers) {
      let pdfCount = 0;
      let studiedCount = 0;
      let takeawayEntries = 0;
      let doiCount = 0;
      for (const paper of papers) {
        if (paper.file || paper.pdfPath) pdfCount += 1;
        if (paper.readingStatus === 'studied') studiedCount += 1;
        takeawayEntries += (paper.innovations?.length || 0) + (paper.limitations?.length || 0);
        if (paper.doi) doiCount += 1;
      }
      return { total: papers.length, pdfCount, studiedCount, takeawayEntries, doiCount };
    }

    function cardMetric(id, stats) {
      if (id === 'literature-workbench') return html`<strong>${stats.pdfCount}</strong> 篇本地 PDF 可逐图研读`;
      if (id === 'takeaway-card') return html`<strong>${stats.total}</strong> 篇文献支持四栏速记卡`;
      if (id === 'paper-canvas') return html`<strong>${stats.total}</strong> 篇可生成思维导图`;
      if (id === 'combined-timeline') return html`已沉淀 <strong>${stats.takeawayEntries}</strong> 条创新 / 局限`;
      if (id === 'citation-atlas') return html`<strong>${stats.doiCount}</strong> 篇含 DOI 可交叉雷达扫描`;
      return html`<strong>${stats.total}</strong> 篇库内文献`;
    }

    function render() {
      const papers = getPapers();
      const children = getChildViews();
      const stats = computeTelemetry(papers);
      setCount(msg`${children.length} 个子工坊`);

      const cardsHtml = children.map((child, index) => {
        const meta = CHILD_META[child.id] || {
          kicker: 'RESEARCH MODULE',
          badge: '子模块',
          layoutClass: '',
          desc: t(child.title || child.label),
        };
        const num = String(index + 1).padStart(2, '0');
        const schematic = ATELIER_SCHEMATICS[child.id] || ATELIER_SCHEMATICS['literature-workbench'];
        return html`
          <button type="button" class="rh-card ${meta.layoutClass}" data-view="${escape(child.id)}">
            <div class="rh-card-head">
              <span class="rh-card-index">${num}</span>
              <span class="rh-card-tag">${escape(t(meta.badge))}</span>
            </div>
            <div class="rh-card-main">
              <div class="rh-card-text">
                <small>${meta.kicker}</small>
                <h2>${escape(t(child.label))}</h2>
                <p>${escape(t(meta.desc))}</p>
              </div>
              <div class="rh-card-art">${schematic}</div>
            </div>
            <div class="rh-card-foot">
              <span class="rh-card-metric">${cardMetric(child.id, stats)}</span>
              <span class="rh-card-enter">${escape(t('进入工坊'))} <span class="rh-card-arrow" aria-hidden="true">→</span></span>
            </div>
          </button>
        `;
      }).join('');

      host.innerHTML = html`
        <div class="rh-atelier">
          <header class="rh-masthead">
            <div class="rh-masthead-copy">
              <span class="rh-eyebrow">RESEARCH ATELIER // 研读工坊</span>
              <h1 class="rh-title">研读工坊<span class="rh-title-dot">.</span></h1>
              <p class="rh-subtitle">从单篇文献的逐图证据深潜，到跨越年份与引文网络的宏观脉络推演。</p>
            </div>
            <div class="rh-telemetry" aria-label="文献库研读概览">
              <div class="rh-stat-pill">
                <span>TOTAL PAPERS</span>
                <strong>${stats.total}</strong>
              </div>
              <div class="rh-stat-pill is-accent">
                <span>STUDIED</span>
                <strong>${stats.studiedCount}</strong>
              </div>
              <div class="rh-stat-pill">
                <span>TIMELINE POINTS</span>
                <strong>${stats.takeawayEntries}</strong>
              </div>
              <div class="rh-stat-pill">
                <span>DOI INDEXED</span>
                <strong>${stats.doiCount}</strong>
              </div>
            </div>
          </header>
          <section class="rh-bento" aria-label="研读子模块入口">
            ${cardsHtml}
          </section>
        </div>
      `;
    }

    on(host, 'pointermove', event => {
      if (reducedMotion.matches) return;
      const card = event.target.closest('.rh-card');
      if (!card) return;
      const rect = card.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const mx = (((event.clientX - rect.left) / rect.width) * 100).toFixed(1) + '%';
      const my = (((event.clientY - rect.top) / rect.height) * 100).toFixed(1) + '%';
      card.style.setProperty('--mx', mx);
      card.style.setProperty('--my', my);
    });

    return { render };
  },
};
