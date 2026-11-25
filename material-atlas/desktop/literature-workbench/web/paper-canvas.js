// Literature Workbench -> One-Click AI Research Canvas Mindmap Bridge
// Adds a translucent liquid-glass pill ("◈ 研究画布") to .result-bar.
// - Calls POST /paper-canvas (reusing Materia's configured AI service) to generate strict mcanvas DSL
// - Automatically saves into research-canvases.json under standardized name "研读 · <年份> · <文献精简标题>"
// - Renders an interactive pan & wheel-zoom SVG mindmap directly inside the 研读 workspace

const SVG_NS = 'http://www.w3.org/2000/svg';

const COLOR_MAP = {
  accent: { fill: '#e8f1ff', stroke: '#2563eb', text: '#1e3a8a' },
  blue: { fill: '#e8f4fd', stroke: '#0284c7', text: '#0c4a6e' },
  purple: { fill: '#f3ebff', stroke: '#7c3aed', text: '#4c1d95' },
  gold: { fill: '#fef5e2', stroke: '#d97706', text: '#78350f' },
  green: { fill: '#e7f8ef', stroke: '#059669', text: '#064e3b' },
  red: { fill: '#fdecec', stroke: '#dc2626', text: '#7f1d1d' },
  gray: { fill: '#f1f3f5', stroke: '#64748b', text: '#1e293b' },
};

function workbenchToken() {
  return document.querySelector('meta[name="workbench"]')?.content || '';
}

function svgEl(tag, attrs = {}, text) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = String(text);
  return el;
}

function currentPaperContext() {
  const titleEl = document.getElementById('paper-title');
  const paperTitle = titleEl?.textContent?.trim() || '';
  const {paperId, paperYear: year} = document.getElementById('work').dataset;
  const outlineText = document.getElementById('work').dataset.sourceText || '';
  const figuresText = '';
  return { paperId, paperTitle, year, outlineText, figuresText };
}

function wrapText(text, maxChars = 14, maxLines = 4) {
  const str = String(text || '').replace(/\s+/g, ' ').trim();
  if (!str) return [''];
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

function shapeNode(shape, x, y, w, h, palette) {
  const attrs = { fill: palette.fill, stroke: palette.stroke, 'stroke-width': 1.5 };
  switch (shape) {
    case 'pill':
      return svgEl('rect', { ...attrs, x, y, width: w, height: h, rx: h / 2 });
    case 'rect':
      return svgEl('rect', { ...attrs, x, y, width: w, height: h, rx: 3 });
    case 'ellipse':
      return svgEl('ellipse', { ...attrs, cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 });
    case 'hexagon': {
      const dx = Math.min(18, w * 0.14);
      const pts = [
        [x + dx, y], [x + w - dx, y], [x + w, y + h / 2],
        [x + w - dx, y + h], [x + dx, y + h], [x, y + h / 2],
      ].map(p => p.join(',')).join(' ');
      return svgEl('polygon', { ...attrs, points: pts });
    }
    case 'octagon': {
      const c = 11;
      const pts = [
        [x + c, y], [x + w - c, y], [x + w, y + c], [x + w, y + h - c],
        [x + w - c, y + h], [x + c, y + h], [x, y + h - c], [x, y + c],
      ].map(p => p.join(',')).join(' ');
      return svgEl('polygon', { ...attrs, points: pts });
    }
    case 'document': {
      const fold = 12;
      const d = `M ${x} ${y + 6} Q ${x} ${y} ${x + 6} ${y} L ${x + w - fold} ${y} L ${x + w} ${y + fold} L ${x + w} ${y + h - 6} Q ${x + w} ${y + h} ${x + w - 6} ${y + h} L ${x + 6} ${y + h} Q ${x} ${y + h} ${x} ${y + h - 6} Z`;
      return svgEl('path', { ...attrs, d });
    }
    case 'roundrect':
    default:
      return svgEl('rect', { ...attrs, x, y, width: w, height: h, rx: 12 });
  }
}

function renderMindmapSvg(board, viewportEl) {
  const nodes = Array.isArray(board?.nodes) ? board.nodes : [];
  const edges = Array.isArray(board?.edges) ? board.edges : [];
  const byId = new Map(nodes.map(n => [n.id, n]));

  const sizes = new Map();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const lines = wrapText(n.text || n.label || n.id, 14, 4);
    const w = Math.max(120, Math.min(220, Math.max(...lines.map(l => l.length)) * 12 + 34));
    const h = Math.max(44, lines.length * 18 + 22);
    sizes.set(n.id, { w, h, lines });
    const nx = Number(n.x) || 0, ny = Number(n.y) || 0;
    minX = Math.min(minX, nx - w / 2);
    minY = Math.min(minY, ny - h / 2);
    maxX = Math.max(maxX, nx + w / 2);
    maxY = Math.max(maxY, ny + h / 2);
  }
  if (!nodes.length) { minX = -200; minY = -120; maxX = 200; maxY = 120; }
  const pad = 60;
  const vb = { x: minX - pad, y: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 };

  const svg = svgEl('svg', { viewBox: `${vb.x} ${vb.y} ${vb.w} ${vb.h}` });
  const rootG = svgEl('g');
  svg.append(rootG);

  // Subtle group hulls
  const groups = new Map();
  for (const n of nodes) {
    if (!n.group) continue;
    if (!groups.has(n.group)) groups.set(n.group, []);
    groups.get(n.group).push(n);
  }
  for (const [gName, members] of groups) {
    let gx1 = Infinity, gy1 = Infinity, gx2 = -Infinity, gy2 = -Infinity;
    for (const m of members) {
      const s = sizes.get(m.id);
      gx1 = Math.min(gx1, m.x - s.w / 2);
      gy1 = Math.min(gy1, m.y - s.h / 2);
      gx2 = Math.max(gx2, m.x + s.w / 2);
      gy2 = Math.max(gy2, m.y + s.h / 2);
    }
    rootG.append(svgEl('rect', {
      x: gx1 - 18, y: gy1 - 26, width: (gx2 - gx1) + 36, height: (gy2 - gy1) + 42,
      rx: 16, fill: '#2563eb', 'fill-opacity': 0.04, stroke: '#94a3b8', 'stroke-dasharray': '5 4', 'stroke-width': 1,
    }));
    rootG.append(svgEl('text', {
      x: gx1 - 8, y: gy1 - 10, fill: '#64748b', 'font-size': 11, 'font-weight': 600,
    }, gName));
  }

  // Edges
  for (const e of edges) {
    const a = byId.get(e.from || e.source);
    const b = byId.get(e.to || e.target);
    if (!a || !b) continue;
    const mx = (a.x + b.x) / 2;
    const d = `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
    rootG.append(svgEl('path', {
      d, fill: 'none', stroke: '#94a3b8', 'stroke-width': 1.6,
      ...(e.dashed ? { 'stroke-dasharray': '5 4' } : {}),
    }));
    if (e.label) {
      rootG.append(svgEl('text', {
        x: mx, y: (a.y + b.y) / 2 - 5, 'text-anchor': 'middle', fill: '#475569', 'font-size': 11,
      }, e.label));
    }
  }

  // Nodes
  for (const n of nodes) {
    const { w, h, lines } = sizes.get(n.id);
    const x = (Number(n.x) || 0) - w / 2;
    const y = (Number(n.y) || 0) - h / 2;
    const palette = COLOR_MAP[n.color] || (String(n.color || '').startsWith('#')
      ? { fill: '#ffffff', stroke: n.color, text: '#1f2328' }
      : COLOR_MAP.gray);
    const g = svgEl('g');
    if (n.note) g.append(svgEl('title', {}, `${n.text || n.id}\n\n${n.note}`));
    g.append(shapeNode(n.shape, x, y, w, h, palette));
    const startY = y + h / 2 - ((lines.length - 1) * 17) / 2 + 4;
    const txt = svgEl('text', {
      x: x + w / 2, y: startY, 'text-anchor': 'middle', fill: palette.text, 'font-size': 12.5, 'font-weight': 500,
    });
    lines.forEach((line, i) => {
      txt.append(svgEl('tspan', { x: x + w / 2, dy: i === 0 ? 0 : 17 }, line));
    });
    g.append(txt);
    rootG.append(g);
  }

  // Interactive pan & zoom state
  let scale = 1, panX = 0, panY = 0, drag = null;
  const applyTransform = () => rootG.setAttribute('transform', `translate(${panX} ${panY}) scale(${scale})`);

  viewportEl.onwheel = e => {
    e.preventDefault();
    scale = Math.max(0.35, Math.min(2.8, scale * (e.deltaY > 0 ? 0.9 : 1.1)));
    applyTransform();
  };
  viewportEl.onpointerdown = e => {
    if (e.button !== 0 || e.target.closest('button')) return;
    drag = { x: e.clientX, y: e.clientY, px: panX, py: panY };
    viewportEl.classList.add('dragging');
    viewportEl.setPointerCapture(e.pointerId);
  };
  viewportEl.onpointermove = e => {
    if (!drag) return;
    const rect = viewportEl.getBoundingClientRect();
    const k = vb.w / Math.max(1, rect.width);
    panX = drag.px + (e.clientX - drag.x) * k;
    panY = drag.py + (e.clientY - drag.y) * k;
    applyTransform();
  };
  const endDrag = () => { drag = null; viewportEl.classList.remove('dragging'); };
  viewportEl.onpointerup = endDrag;
  viewportEl.onpointercancel = endDrag;

  viewportEl.replaceChildren(svg);

  const controls = document.createElement('div');
  controls.className = 'paper-canvas-zoom';
  controls.innerHTML = '<button type="button" data-z="out">−</button><button type="button" data-z="fit">适应</button><button type="button" data-z="in">＋</button>';
  controls.addEventListener('click', e => {
    const z = e.target.closest('button')?.dataset.z;
    if (z === 'in') scale = Math.min(2.8, scale * 1.18);
    else if (z === 'out') scale = Math.max(0.35, scale / 1.18);
    else if (z === 'fit') { scale = 1; panX = 0; panY = 0; }
    applyTransform();
  });
  viewportEl.append(controls);
}

export function initPaperCanvasBridge() {
  const resultBar = document.getElementById('tool-content');
  if (location.pathname !== '/paper-canvas' || !resultBar) return;

  const panel = document.createElement('section');
  panel.id = 'paper-canvas-panel';
  panel.className = 'paper-canvas-panel';
  panel.setAttribute('aria-label', '研读联动研究画布');
  panel.hidden = false;
  panel.innerHTML = `
    <div class="paper-canvas-head">
      <div class="paper-canvas-title-wrap">
        <strong data-pc-name>研究画布思维导图</strong>
        <span class="paper-canvas-badge" data-pc-badge>未生成</span>
      </div>
      <div class="paper-canvas-actions">
        <button type="button" class="paper-canvas-btn primary" data-pc="generate">AI 一键生成</button>
        <button type="button" class="paper-canvas-btn" data-pc="toggle-view" hidden>查看规则代码</button>
        <button type="button" class="paper-canvas-btn" data-pc="copy" hidden>复制 mcanvas</button>
        <button type="button" class="paper-canvas-btn" data-pc="download" hidden>下载 .canvas.md</button>
      </div>
    </div>
    <div class="paper-canvas-empty" data-pc-empty>
      <span>点击「AI 一键生成」，将当前文献的研读内容自动转为标准命名的研究画布思维导图，并同步保存至左侧「研究画布」。</span>
    </div>
    <div class="paper-canvas-viewport" data-pc-viewport hidden></div>
    <pre class="paper-canvas-code" data-pc-code hidden></pre>
    <p class="paper-canvas-status" data-pc-status>就绪 · 将按「研读 · 年份 · 文献标题」自动命名并同步至 research-canvases.json</p>
  `;
  const panelAnchor = document.getElementById('takeaway-glass-panel') || resultBar;
  panelAnchor.insertAdjacentElement('afterend', panel);

  const nameEl = panel.querySelector('[data-pc-name]');
  const badgeEl = panel.querySelector('[data-pc-badge]');
  const emptyEl = panel.querySelector('[data-pc-empty]');
  const viewportEl = panel.querySelector('[data-pc-viewport]');
  const codeEl = panel.querySelector('[data-pc-code]');
  const statusEl = panel.querySelector('[data-pc-status]');
  const genBtn = panel.querySelector('[data-pc="generate"]');
  const toggleViewBtn = panel.querySelector('[data-pc="toggle-view"]');
  const copyBtn = panel.querySelector('[data-pc="copy"]');
  const dlBtn = panel.querySelector('[data-pc="download"]');

  let currentBoard = null;
  let currentRules = '';
  let showingCode = false;

  function showBoard({ board, rules, name }) {
    currentBoard = board;
    currentRules = rules || '';
    showingCode = false;
    nameEl.textContent = name || board?.name || '研究画布思维导图';
    badgeEl.textContent = '已同步至研究画布';
    genBtn.textContent = '重新生成';
    emptyEl.hidden = true;
    viewportEl.hidden = false;
    codeEl.hidden = true;
    codeEl.textContent = currentRules;
    toggleViewBtn.hidden = false;
    toggleViewBtn.textContent = '查看规则代码';
    copyBtn.hidden = false;
    dlBtn.hidden = false;
    renderMindmapSvg(board, viewportEl);
  }

  function resetEmpty() {
    currentBoard = null;
    currentRules = '';
    nameEl.textContent = '研究画布思维导图';
    badgeEl.textContent = '未生成';
    genBtn.textContent = 'AI 一键生成';
    emptyEl.hidden = false;
    viewportEl.hidden = true;
    codeEl.hidden = true;
    toggleViewBtn.hidden = true;
    copyBtn.hidden = true;
    dlBtn.hidden = true;
  }

  let revision = 0;
  async function loadSaved() {
    const ctx = currentPaperContext();
    const turn = ++revision;
    if (!ctx.paperId) return;
    try {
      const qs = new URLSearchParams({ paperId: ctx.paperId, title: ctx.paperTitle, year: ctx.year });
      const res = await fetch('/paper-canvas?' + qs.toString(), {
        headers: { 'X-Workbench': workbenchToken() },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (turn !== revision || currentPaperContext().paperId !== ctx.paperId) return;
      if (data?.board) {
        showBoard(data);
        statusEl.textContent = `已加载已保存的研究画布「${data.name}」（共 ${data.board.nodes?.length || 0} 个节点）`;
      } else {
        resetEmpty();
      }
    } catch {}
  }

  async function generateCanvas() {
    const ctx = currentPaperContext();
    if (!ctx.paperId || !(ctx.outlineText.trim() || ctx.figuresText.trim())) {
      statusEl.textContent = '请先选择有可提取正文的文献，等待读取完成。';
      return;
    }
    const turn = ++revision;
    genBtn.disabled = true;
    badgeEl.textContent = 'AI 生成中…';
    statusEl.textContent = '正在调用已配置的 AI 服务生成 mcanvas 思维导图并写入研究画布…';
    try {
      const res = await fetch('/paper-canvas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workbench': workbenchToken(),
        },
        body: JSON.stringify(ctx),
      });
      const data = await res.json();
      if (turn !== revision || currentPaperContext().paperId !== ctx.paperId) return;
      if (!res.ok) throw new Error(data?.error || '生成研究画布失败');
      showBoard(data);
      statusEl.textContent = `${data.created ? '已新建并保存' : '已更新保存'}至研究画布「${data.name}」（共 ${data.board.nodes?.length || 0} 个节点）`;
    } catch (err) {
      if (turn !== revision) return;
      badgeEl.textContent = '生成失败';
      statusEl.textContent = err.message || '生成研究画布失败，请检查 AI 服务配置。';
    } finally {
      genBtn.disabled = false;
    }
  }

  genBtn.addEventListener('click', generateCanvas);

  toggleViewBtn.addEventListener('click', () => {
    showingCode = !showingCode;
    viewportEl.hidden = showingCode;
    codeEl.hidden = !showingCode;
    toggleViewBtn.textContent = showingCode ? '返回思维导图' : '查看规则代码';
  });

  copyBtn.addEventListener('click', async () => {
    if (!currentRules) return;
    try {
      await navigator.clipboard.writeText(currentRules);
      copyBtn.textContent = '已复制 ✓';
    } catch {
      copyBtn.textContent = '复制失败';
    }
    setTimeout(() => { copyBtn.textContent = '复制 mcanvas'; }, 1400);
  });

  dlBtn.addEventListener('click', () => {
    if (!currentRules) return;
    const blob = new Blob([currentRules], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(currentBoard?.name || '研读导图').replace(/[\\/:*?"<>|]/g, '_')}.canvas.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  const titleEl = document.getElementById('paper-title');
  if (titleEl) {
    new MutationObserver(() => {
      ++revision; resetEmpty(); statusEl.textContent = '';
      if (!panel.hidden) loadSaved();
    }).observe(titleEl, { childList: true, characterData: true, subtree: true });
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPaperCanvasBridge, { once: true });
  } else {
    initPaperCanvasBridge();
  }
}
