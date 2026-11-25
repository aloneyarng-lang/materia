// Literature Workbench -> Translucent Liquid-Glass 30-Second Takeaway Card
// Mounts a compact translucent glass pill ("✦ 速记卡") inside .result-bar right after selecting a study.
// Auto-extracts 4 fixed slots (核心痛点 / 关键手段 / 最硬核证据 / 一句话局限) from the active report,
// supports click-to-edit persistence per paper, one-click Markdown copy, and crisp SVG slide-card export.

const STORAGE_PREFIX = 'materia.workbench.takeaway.v1:';

const SLOTS = [
  { key: 'problem', icon: '①', label: '核心痛点', placeholder: '这篇论文在解决什么关键问题或性能瓶颈？' },
  { key: 'method', icon: '②', label: '关键手段', placeholder: '采用了什么新成分、工艺、表征或理论方法？' },
  { key: 'evidence', icon: '③', label: '最硬核证据', placeholder: '最核心的一张图号与定量结果（如 Fig. 3 · Bs 提升至 1.92 T）' },
  { key: 'limitation', icon: '④', label: '一句话局限', placeholder: '主要局限、适用边界或待进一步验证的环节' },
];

function escXml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function loadSaved(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSlots(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

function pickSentence(text, patterns, fallback = '') {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return fallback;
  const sentences = clean.split(/(?<=[。！？.!?;；])\s*/).map(s => s.trim()).filter(s => s.length >= 10);
  for (const re of patterns) {
    const hit = sentences.find(s => re.test(s));
    if (hit) return hit.slice(0, 140);
  }
  return fallback;
}

function extractFromDom() {
  const combined = document.getElementById('work').dataset.sourceText || '';
  const firstFigLabel = '';
  const evidenceBase = combined;
  const evidenceHit = pickSentence(evidenceBase, [/Fig\.?\s*\d+|图\s*\d+|\d+(\.\d+)?\s*(%|T|Oe|MPa|GPa|K|nm|μm|℃)/i]);

  return {
    problem: pickSentence(combined, [/痛点|瓶颈|挑战|问题|难[以题]|传统|限制|challenge|problem|bottleneck/i]),
    method: pickSentence(combined, [/提出|采用|通过|设计|制备|方法|策略|机制|propose|method|strategy|fabricat/i]),
    evidence: firstFigLabel && evidenceHit && !evidenceHit.includes(firstFigLabel)
      ? `${firstFigLabel}：${evidenceHit}`
      : evidenceHit,
    limitation: pickSentence(combined, [/局限|不足|尚未|未来|仍需|边界|条件|limitation|future|however|remain/i]),
  };
}

function toMarkdown(title, data) {
  return [
    `> **30 秒速记卡 · ${title || '当前文献'}**`,
    ...SLOTS.map(s => `> - **${s.label}**：${(data[s.key] || '（待补充）').replace(/\n+/g, ' ')}`),
  ].join('\n');
}

async function copyMarkdown(text, panel) {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }
  const previous = document.activeElement;
  const field = document.createElement('textarea');
  field.value = text;
  field.readOnly = true;
  field.style.cssText = 'position:fixed;left:-10000px;top:0';
  panel.append(field);
  field.select();
  try {
    return document.execCommand('copy');
  } finally {
    field.remove();
    previous?.focus();
  }
}

function wrapLines(text, maxChars = 26, maxLines = 4) {
  const str = String(text || '（待补充）').replace(/\s+/g, ' ').trim();
  const lines = [];
  let cur = '';
  for (const ch of str) {
    cur += ch;
    if (cur.length >= maxChars) {
      lines.push(cur);
      cur = '';
      if (lines.length >= maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines;
}

function buildCardSvg(title, data) {
  const W = 840, H = 460;
  const cardCoords = [
    [36, 98], [430, 98],
    [36, 272], [430, 272],
  ];
  const boxes = SLOTS.map((slot, idx) => {
    const [x, y] = cardCoords[idx];
    const lines = wrapLines(data[slot.key], 24, 4);
    const tspans = lines.map((line, li) =>
      `<tspan x="${x + 18}" dy="${li === 0 ? 0 : 22}">${escXml(line)}</tspan>`
    ).join('');
    return `
      <rect x="${x}" y="${y}" width="374" height="154" rx="16" fill="#ffffff" fill-opacity="0.86" stroke="#d9dfe6" stroke-width="1"/>
      <text x="${x + 18}" y="${y + 30}" font-size="13" font-weight="600" fill="#2563eb">${escXml(slot.icon + ' ' + slot.label)}</text>
      <text x="${x + 18}" y="${y + 58}" font-size="13.5" fill="#1f2328">${tspans}</text>
    `;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="font-family:'PingFang SC','Microsoft YaHei',sans-serif">
  <rect x="0" y="0" width="${W}" height="${H}" rx="20" fill="#f4f6f9"/>
  <text x="36" y="44" font-size="12" font-weight="600" fill="#2563eb" letter-spacing="1.2">MATERIA · 30 秒速记卡</text>
  <text x="36" y="72" font-size="18" font-weight="600" fill="#111827">${escXml((title || '论文速记').slice(0, 44))}</text>
  ${boxes}
</svg>`;
}

export function initTakeawayCard() {
  const resultBar = document.getElementById('tool-content');
  const work = document.getElementById('work');
  if (location.pathname !== '/takeaway-card' || !resultBar || !work) return;

  const panel = document.createElement('section');
  panel.id = 'takeaway-glass-panel';
  panel.className = 'takeaway-glass-panel';
  panel.setAttribute('aria-label', '30 秒一页速记卡');
  panel.hidden = true;
  panel.innerHTML = `
    <div class="takeaway-head">
      <div class="takeaway-head-title">
        <strong>30 秒速记卡</strong>
        <small>自动提炼自当前文献正文，点击任意格子可直接修改</small>
      </div>
      <div class="takeaway-head-actions">
        <button type="button" class="takeaway-mini-btn" data-tk="extract" title="从当前文献重新提炼">重新提炼</button>
        <button type="button" class="takeaway-mini-btn" data-tk="copy">复制 Markdown</button>
        <button type="button" class="takeaway-mini-btn" data-tk="export">导出卡片 SVG</button>
      </div>
    </div>
    <div class="takeaway-grid">
      ${SLOTS.map(s => `
        <div class="takeaway-slot">
          <label class="takeaway-slot-label" for="tk-${s.key}"><span>${s.icon}</span><span>${s.label}</span></label>
          <textarea id="tk-${s.key}" class="takeaway-slot-input" data-slot="${s.key}" placeholder="${s.placeholder}"></textarea>
        </div>
      `).join('')}
    </div>
  `;
  resultBar.insertAdjacentElement('afterend', panel);

  const inputs = Object.fromEntries(SLOTS.map(s => [s.key, panel.querySelector(`[data-slot="${s.key}"]`)]));

  function readCurrent() {
    return Object.fromEntries(SLOTS.map(s => [s.key, inputs[s.key].value.trim()]));
  }

  const paperKey = () => STORAGE_PREFIX + work.dataset.paperId;

  function populate(forceExtract = false) {
    const key = paperKey();
    const saved = !forceExtract ? loadSaved(key) : null;
    const extracted = extractFromDom();
    const merged = Object.fromEntries(SLOTS.map(s => [s.key, (saved?.[s.key] ?? extracted[s.key]) || '']));
    for (const s of SLOTS) inputs[s.key].value = merged[s.key];
    if (forceExtract) saveSlots(key, merged);
  }

  panel.addEventListener('input', () => {
    saveSlots(paperKey(), readCurrent());
  });

  panel.addEventListener('click', async e => {
    const btn = e.target.closest('[data-tk]');
    if (!btn) return;
    const action = btn.dataset.tk;
    const title = document.getElementById('paper-title')?.textContent?.trim() || '论文速记';
    if (action === 'extract') {
      populate(true);
      btn.textContent = '已重新提炼';
      setTimeout(() => { btn.textContent = '重新提炼'; }, 1400);
    } else if (action === 'copy') {
      const md = toMarkdown(title, readCurrent());
      try {
        btn.textContent = await copyMarkdown(md, panel) ? '已复制 ✓' : '复制失败';
      } catch {
        btn.textContent = '复制失败';
      }
      setTimeout(() => { btn.textContent = '复制 Markdown'; }, 1500);
    } else if (action === 'export') {
      const svg = buildCardSvg(title, readCurrent());
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.slice(0, 32).replace(/[\\/:*?"<>|]/g, '_')}-速记卡.svg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  });

  let activePaper;
  const sync = () => {
    const id = work.dataset.paperId;
    const ready = Boolean(id && !work.hidden);
    if (ready && (activePaper !== id || panel.hidden)) populate();
    else if (ready && !loadSaved(paperKey()) && !panel.contains(document.activeElement)) populate();
    activePaper = id;
    if (panel.hidden === ready) panel.hidden = !ready;
  };
  const observer = new MutationObserver(sync);
  observer.observe(work, {attributes: true, attributeFilter: ['hidden', 'data-paper-id', 'data-source-text'], childList: true, subtree: true, characterData: true});
  sync();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTakeawayCard, { once: true });
  } else {
    initTakeawayCard();
  }
}
