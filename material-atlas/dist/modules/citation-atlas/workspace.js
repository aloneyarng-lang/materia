import { html, msg, t } from '../../i18n.js';
import { READING_STATUSES } from '../../reading-status.js';
import { createCitationCanvas } from './graph-canvas.js';
import {
  DEFAULT_CITATION_THEME,
  CITATION_THEMES,
  normalizeCitationTheme,
  themePreviewSvg,
  themeLegendIconSvg,
} from './themes.js';
import {
  buildCrossGraph,
  filterCrossGraph,
  reduceCitationEdges,
  formatBibtex,
  formatUnseenMarkdown,
  normalizeDoi,
  rebindLibrary,
  statusBadgeMeta,
} from './model.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[ch]));

const PRESETS = [
  ['cocited-unseen', '共同引用 · 我没看'],
  ['cocited-all', '全部共同引用'],
  ['unseen-all', '全部未看'],
  ['in-library', '库内交集'],
  ['all', '全部引用'],
];

export function createCitationCrossWorkspace(context) {
  const {
    host,
    on,
    signal,
    getPapers,
    getCollections,
    getSelectedIds,
    openReader,
    openPaper,
    setReadingStatus,
    readPaperBytes,
    openExternal,
    services,
    setCount,
    toast,
    saveText,
    isReady,
  } = context;

  let generation = 0;
  let libraryKey = null;
  let saveQueue = Promise.resolve();
  let queryController = null;
  let canvasController = null;

  let seedIds = [];
  let preset = 'cocited-unseen';
  let minCoCite = 2;
  let sort = 'cocite';
  let layout = 'force';
  let yearFrom = null;
  let yearTo = null;
  let listSearch = '';
  let selectedNodeId = null;
  let pickerOpen = false;
  let pickerQuery = '';
  let pickerFolder = '';
  let busy = false;
  let statusMessage = '';
  let errorMessage = '';
  let graph = null;
  let reduceEdges = true;
  let horizontalStretch = 1;
  let verticalStretch = 1;
  let graphTheme = DEFAULT_CITATION_THEME;

  function persistState() {
    if (!libraryKey) return;
    const key = libraryKey;
    const snapshot = {
      seedIds: [...seedIds],
      horizontalStretch,
      verticalStretch,
      preset,
      minCoCite,
      sort,
      layout,
      graphTheme,
    };
    saveQueue = saveQueue
      .then(() => services.save({ libraryKey: key, state: snapshot }))
      .catch(() => {});
  }

  async function requestCitationBackend(payload, abortSignal) {
    if (globalThis.materiaDesktop?.citationQuery) {
      return globalThis.materiaDesktop.citationQuery(payload);
    }
    const response = await fetch('/api/citation-atlas/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-materia-citation': '1',
      },
      body: JSON.stringify(payload),
      signal: abortSignal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.detail || '引文交叉查询失败，请重试。');
    return data;
  }

  function currentSeedPapers(allPapers) {
    const byId = new Map(allPapers.map(p => [p.id, p]));
    return seedIds.map(id => byId.get(id)).filter(Boolean);
  }

  async function runAnalysis() {
    if (busy) {
      queryController?.abort();
      queryController = null;
      busy = false;
      statusMessage = t('已取消分析。');
      renderShell();
      return;
    }
    const allPapers = getPapers();
    const seeds = currentSeedPapers(allPapers);
    if (!seeds.length) {
      toast(t('请先至少选择一篇库内文献。'), true);
      pickerOpen = true;
      renderShell();
      return;
    }

    const version = generation;
    const controller = new AbortController();
    queryController = controller;
    const combinedSignal = AbortSignal.any([signal, controller.signal]);
    busy = true;
    errorMessage = '';
    statusMessage = msg`正在查询 ${seeds.length} 篇所选文献的 OpenAlex 引文…`;
    pickerOpen = false;
    renderShell();

    try {
      const seedPayload = seeds.map(p => ({
        id: p.id,
        doi: p.doi || '',
        title: p.title || '',
        year: p.year || '',
      }));
      let result = await requestCitationBackend({ seeds: seedPayload, maxReferences: 200 }, combinedSignal);
      if (combinedSignal.aborted || version !== generation) return;

      const fallbackSeeds = (result.seedMatches || [])
        .filter(item => item.needsPdfFallback)
        .map(item => seeds.find(s => s.id === item.seedId))
        .filter(p => p && typeof readPaperBytes === 'function')
        .slice(0, 25);

      if (fallbackSeeds.length) {
        statusMessage = msg`正在扫描 ${fallbackSeeds.length} 篇新文献的本地 PDF 参考文献…`;
        renderStatusOnly();
        const { readBibliography } = await import('../../citation-pdf.js');
        const extraCitations = [];
        for (const seedPaper of fallbackSeeds) {
          if (combinedSignal.aborted || version !== generation) return;
          try {
            const bytes = await readPaperBytes(seedPaper.id);
            const refs = await readBibliography(bytes, combinedSignal);
            for (const block of refs) {
              for (const rawDoi of block.dois || []) {
                const doi = normalizeDoi(rawDoi);
                if (doi) extraCitations.push({ seedId: seedPaper.id, doi, page: block.page });
              }
            }
          } catch {
            // Skip unreadable PDFs silently and keep OpenAlex results.
          }
        }
        if (combinedSignal.aborted || version !== generation) return;
        if (extraCitations.length) {
          statusMessage = msg`已从本地 PDF 识别 ${extraCitations.length} 条引文，正在与 OpenAlex 交叉合并…`;
          renderStatusOnly();
          result = await requestCitationBackend({
            seeds: seedPayload,
            extraCitations: extraCitations.slice(0, 600),
            maxReferences: 200,
          }, combinedSignal);
          if (combinedSignal.aborted || version !== generation) return;
        }
      }

      graph = buildCrossGraph({ seedPapers: seeds, libraryPapers: getPapers(), queryResult: result });
      preset = 'all';
      minCoCite = 1;
      listSearch = '';
      host.querySelector('.cc-list-search').value = '';
      yearFrom = null;
      yearTo = null;

      const firstView = filterCrossGraph(graph, { preset, minCoCite, yearFrom, yearTo, search: listSearch, sort });
      selectedNodeId = firstView.listItems[0]?.id || firstView.seedNodes[0]?.id || null;
      statusMessage = msg`已交叉分析 ${seeds.length} 篇所选文献：共 ${graph.counts.totalCited} 篇去重参考文献，其中共同引用且未看 ${graph.counts.cocitedUnseen} 篇（未入库 ${graph.counts.cocitedMissing} 篇 · 库内未读 ${graph.counts.cocitedUnread} 篇）。`;
      persistState();
    } catch (error) {
      if (!combinedSignal.aborted && version === generation) {
        errorMessage = error.message || t('引文交叉分析失败，请稍后重试。');
        statusMessage = '';
      }
    } finally {
      if (queryController === controller && version === generation && !signal.aborted) {
        queryController = null;
        busy = false;
        renderShell({ relayout: true });
      }
    }
  }

  function renderStatusOnly() {
    const el = host.querySelector('.cc-status-text');
    if (el) el.textContent = statusMessage;
  }

  function mountShell() {
    if (host.querySelector('.cc-root')) return;
    host.innerHTML = html`
      <div class="cc-root">
        <div class="cc-toolbar">
          <div class="cc-toolbar-title">
            <span class="cc-eyebrow">CITATION CROSS-ATLAS // 引文交叉图谱</span>
            <p class="cc-status-text" role="status"></p>
          </div>
          <div class="cc-toolbar-main">
            <span class="cc-seed-pill" data-cc-seed-count></span>
            <button type="button" class="outline-button" data-cc-action="toggle-picker">选择种子文献…</button>
            <button type="button" class="outline-button" data-cc-action="sync-selection">同步当前勾选</button>
            <button type="button" class="primary" data-cc-action="analyze"></button>
            <button type="button" class="outline-button" data-cc-action="clear-analysis">清空分析</button>
          </div>
        </div>

        <div class="cc-picker" hidden>
          <div class="cc-picker-head">
            <input type="search" class="cc-picker-search" aria-label="筛选库内文献" placeholder="按标题、作者、标签或 DOI 筛选…">
            <button type="button" class="outline-button" data-cc-action="picker-select-filtered">全选当前筛选</button>
            <button type="button" class="outline-button" data-cc-action="picker-clear">清空勾选</button>
            <button type="button" class="primary" data-cc-action="picker-done">完成并关闭</button>
          </div>
          <div class="cc-picker-folders" aria-label="按文件夹分组一键勾选"></div>
          <div class="cc-picker-list"></div>
        </div>

        <div class="cc-notice" role="alert" hidden></div>

<div id="cc-graph-filters" popover="auto" aria-label="图谱筛选">
          <h3>图谱筛选</h3>
          <div class="cc-presets" role="group" aria-label="交叉视角"></div>
                      <div class="cc-list-search-wrap">
              <input type="search" class="cc-list-search" aria-label="筛选被引文献" placeholder="筛选被引标题、作者或 DOI…">
            </div>
          <div class="cc-filter-controls">
            <label>列表排序 <select data-cc-control="sort" aria-label="排序方式">
                <option value="cocite">共引篇数优先</option>
                <option value="citations">全局被引优先</option>
                <option value="year">最新发表优先</option>
              </select></label>
            <label>最少共引
              <select data-cc-control="min-cocite" aria-label="最少共引篇数"></select>
            </label>
            <label>年份
              <input type="number" data-cc-control="year-from" aria-label="起始年份" placeholder="起">
              <span>–</span>
              <input type="number" data-cc-control="year-to" aria-label="结束年份" placeholder="止">
            </label>
            <label>整理横向间距
              <input type="range" data-cc-control="stretch" min="1" max="6" step="0.25" value="1">
              <output data-cc-stretch-value>1×</output>
            </label>
            <label>整理纵向间距
              <input type="range" data-cc-control="vertical-stretch" min="0.5" max="6" step="0.25" value="1">
              <output data-cc-vertical-value>1×</output>
            </label>
            <label class="cc-reduce"><input type="checkbox" data-cc-control="reduce-edges" checked>传递规约 · 隐藏跨代直连线</label>
            <button type="button" class="outline-button" data-cc-action="export-md">导出未看清单</button>
          </div>
          <section class="cc-theme-section" aria-label="图谱主题">
            <h4>图谱主题</h4>
            <div class="cc-theme-grid" role="group" aria-label="图谱主题"></div>
          </section>
        </div>
        <div class="cc-workbench">
          <aside class="cc-list-pane">
            <div class="cc-pane-head">
              <h2>被引雷达 <small data-cc-list-count>0</small></h2>

            </div>

            <div class="cc-list-scroll"></div>
          </aside>

          <section class="cc-canvas-pane">
            <div class="cc-pane-head">
              <h2>引文交叉图谱</h2>
              <div class="cc-layout-switch" role="group" aria-label="图谱布局">
                <button type="button" class="outline-button" popovertarget="cc-graph-filters">☷ 图谱筛选</button>
                <button type="button" class="outline-button" data-cc-layout="force">力导向</button>
                <button type="button" class="outline-button" data-cc-layout="timeline">时间轴</button>
              </div>
            </div>
            <div class="cc-canvas-stage">
              <div class="cc-canvas-host"></div>
              <div class="cc-tooltip" hidden></div>
              <div class="cc-empty-overlay" hidden></div>
              <div class="cc-legend">
                <span><i class="dot-seed"></i>所选种子</span>
                <span><i class="dot-missing"></i>未入库（漏读）</span>
                <span><i class="dot-unread"></i>库内未读</span>
                <span><i class="dot-read"></i>库内已读</span>
              </div>
              <div class="cc-canvas-tools">
                <button type="button" class="outline-button" data-cc-action="organize" aria-pressed="false" title="保留时间轴并智能重排节点，减少连线交叉">整理</button>
                <button type="button" class="outline-button" data-cc-action="zoom-in" aria-label="放大">＋</button>
                <button type="button" class="outline-button" data-cc-action="zoom-out" aria-label="缩小">－</button>
                <button type="button" class="outline-button" data-cc-action="fit" aria-label="适应视图">居中</button>
                <button type="button" class="outline-button" data-cc-action="export-png">导出 PNG</button>
              </div>
            </div>
            <footer class="cc-canvas-foot"></footer>
          </section>

          <aside class="cc-detail-pane">
            <div class="cc-pane-head">
              <h2>交叉详情</h2>
            </div>
            <div class="cc-detail-scroll"></div>
          </aside>
        </div>
      </div>
    `;

    canvasController = createCitationCanvas({
      container: host.querySelector('.cc-canvas-host'),
      tooltipEl: host.querySelector('.cc-tooltip'),
      onSelect: id => {
        selectedNodeId = id;
        canvasController?.setSelection(selectedNodeId);
        renderDetail();
        renderListSelection();
      },
      onZoomChange: scale => {
        const foot = host.querySelector('.cc-canvas-foot');
        if (foot?.dataset.summary) {
          foot.textContent = `${foot.dataset.summary} · ${Math.round(scale * 100)}%`;
        }
      },
    });
  }

  function renderPicker(allPapers) {
    const picker = host.querySelector('.cc-picker');
    picker.hidden = !pickerOpen;
    if (!pickerOpen) return;

    const collections = getCollections ? getCollections() : [];
    const selectedSet = new Set(seedIds);
    const foldersHost = picker.querySelector('.cc-picker-folders');
    foldersHost.innerHTML = [
      `<button type="button" class="outline-button" data-cc-folder="" aria-pressed="${pickerFolder === ''}">${escape(t('全部文件夹'))}</button>`,
      ...collections.map(col => {
        const groupPapers = allPapers.filter(p => p.collection === col.id);
        const pickedInGroup = groupPapers.filter(p => selectedSet.has(p.id)).length;
        return `<button type="button" class="outline-button" data-cc-folder="${escape(col.id)}" aria-pressed="${pickerFolder === col.id}">${escape(col.name)} <span>(${pickedInGroup}/${groupPapers.length})</span></button>`;
      }),
    ].join('');

    const q = pickerQuery.trim().toLowerCase();
    const filtered = allPapers.filter(p => {
      if (pickerFolder && p.collection !== pickerFolder) return false;
      if (!q) return true;
      const hay = [p.title, p.authors, p.journal, p.doi, ...(p.tags || [])].join(' ').toLowerCase();
      return hay.includes(q);
    });

    const listHost = picker.querySelector('.cc-picker-list');
    listHost.innerHTML = filtered.length
      ? filtered.slice(0, 200).map(p => {
          const checked = selectedSet.has(p.id);
          const status = READING_STATUSES.find(s => s.id === (p.readingStatus || 'unread')) || READING_STATUSES[0];
          return `
            <label class="cc-picker-item">
              <input type="checkbox" data-cc-seed-id="${escape(p.id)}" ${checked ? 'checked' : ''}>
              <span class="cc-picker-title">${escape(p.title)}</span>
              <small>${escape(p.year || '—')} · ${status.symbol} ${escape(t(status.name))} · ${p.doi ? 'DOI' : escape(t('无 DOI'))}</small>
            </label>
          `;
        }).join('')
      : `<p class="cc-muted">${escape(t('当前筛选没有匹配的文献。'))}</p>`;
  }

  function renderListSelection() {
    host.querySelectorAll('.cc-list-item').forEach(btn => {
      btn.setAttribute('aria-pressed', btn.dataset.ccNodeId === selectedNodeId ? 'true' : 'false');
    });
  }

  function renderThemePicker() {
    const grid = host.querySelector('.cc-theme-grid');
    if (!grid) return;
    grid.innerHTML = CITATION_THEMES.map(theme => `
      <button type="button" class="cc-theme-card" data-cc-theme="${escape(theme.id)}" aria-pressed="${graphTheme === theme.id}">
        <span class="cc-theme-preview">${themePreviewSvg(theme.id)}</span>
        <span class="cc-theme-meta">
          <strong>${escape(t(theme.name))}</strong>
          <small>${escape(t(theme.summary))}</small>
        </span>
      </button>
    `).join('');
  }

  function renderLegend() {
    const legend = host.querySelector('.cc-legend');
    if (!legend) return;
    if (graphTheme === 'classic') {
      legend.innerHTML = `
        <span><i class="dot-seed"></i>${escape(t('所选种子'))}</span>
        <span><i class="dot-missing"></i>${escape(t('未入库（漏读）'))}</span>
        <span><i class="dot-unread"></i>${escape(t('库内未读'))}</span>
        <span><i class="dot-read"></i>${escape(t('库内已读'))}</span>
      `;
      return;
    }
    const items = [
      ['seed', '所选种子'],
      ['missing', '未入库（漏读）'],
      ['unread', '库内未读'],
      ['read', '库内已读'],
      ['high', '高引文献'],
    ];
    legend.innerHTML = items.map(([kind, label]) => `
      <span><i class="cc-legend-icon">${themeLegendIconSvg(graphTheme, kind)}</i>${escape(t(label))}</span>
    `).join('');
  }

  function renderDetail() {
    const detail = host.querySelector('.cc-detail-scroll');
    if (!detail) return;
    if (!graph) {
      detail.innerHTML = `<p class="cc-muted">${escape(t('先在上方选择多篇已录入文献，再点击「开始交叉分析」，即可查看共同引用及尚未阅读的文献。'))}</p>`;
      return;
    }
    const node = graph.nodes.find(n => n.id === selectedNodeId);
    if (!node) {
      detail.innerHTML = `<p class="cc-muted">${escape(t('点击左侧列表或图谱节点，查看引用交叉来源与阅读状态。'))}</p>`;
      return;
    }

    const badge = statusBadgeMeta(node);
    const seedByPaperId = new Map(graph.nodes.filter(n => n.role === 'seed').map(n => [n.paperId, n]));
    const nodeById = new Map(graph.nodes.map(n => [n.id, n]));
    const collections = new Map((getCollections ? getCollections() : []).map(c => [c.id, c]));

    const citingSeedsHtml = node.citedBySeedIds.length
      ? node.citedBySeedIds.map(sid => {
          const seedNode = seedByPaperId.get(sid);
          const page = node.seedPages[sid];
          const provenance = node.seedSources[sid] === 'pdf' ? 'PDF' : 'OpenAlex';
          return `
            <div class="cc-citing-seed">
              <button type="button" class="text-button" data-cc-focus-node="${escape(`seed:${sid}`)}">${escape(seedNode?.title || sid)}</button>
              <div class="cc-citing-seed-meta">
                <span>${escape(provenance)}</span>
                ${page ? `<button type="button" class="text-button" data-cc-open-reader="${escape(sid)}" data-cc-reader-page="${page}">${escape(msg`打开出处 · 第 ${page} 页`)}</button>` : ''}
              </div>
            </div>
          `;
        }).join('')
      : `<p class="cc-muted">${escape(t(node.role === 'seed' ? '这是你选中的种子文献。' : '暂无直接种子引用记录。'))}</p>`;

    const outgoingEdges = graph.edges.filter(e => e.source === node.id && e.target !== node.id);
    const incomingEdges = graph.edges.filter(e => e.target === node.id && e.kind === 'ref_ref');

    let libraryActionsHtml = '';
    if (node.libraryPaper) {
      const lp = node.libraryPaper;
      const folderName = collections.get(lp.collection)?.name || '';
      const statusButtons = READING_STATUSES.map(st => `
        <button type="button" class="outline-button cc-status-btn" data-cc-set-status="${escape(st.id)}" data-cc-paper-id="${escape(lp.id)}" aria-pressed="${node.readingStatus === st.id}">
          ${st.symbol} ${escape(t(st.name))}
        </button>
      `).join('');

      libraryActionsHtml = `
        <section class="cc-detail-section">
          <h3>${escape(t('库内阅读状态'))}</h3>
          <div class="cc-status-group">${statusButtons}</div>
          <div class="cc-detail-actions">
            ${(lp.file || lp.pdfPath) ? `<button type="button" class="primary" data-cc-open-reader="${escape(lp.id)}">${escape(t('阅读 PDF'))}</button>` : ''}
            <button type="button" class="outline-button" data-cc-open-paper="${escape(lp.id)}">${escape(t('打开文献详情'))}</button>
            ${node.doi ? `<button type="button" class="outline-button" data-cc-open-url="https://doi.org/${escape(node.doi)}">${escape(t('打开 DOI'))}</button>` : ''}
          </div>
          ${folderName ? `<p class="cc-meta-line">${escape(t('分组'))}：${escape(folderName)}</p>` : ''}
          ${(lp.innovations?.length) ? `<div class="cc-notes-block"><strong>${escape(t('已录入创新点'))}</strong><ul>${lp.innovations.slice(0, 3).map(item => `<li>${escape(item)}</li>`).join('')}</ul></div>` : ''}
        </section>
      `;
    } else {
      libraryActionsHtml = `
        <section class="cc-detail-section">
          <h3>${escape(t('尚未入库 · 快速获取'))}</h3>
          <div class="cc-detail-actions">
            ${(node.doi || node.url) ? `<button type="button" class="primary" data-cc-open-url="${escape(node.doi ? `https://doi.org/${node.doi}` : node.url)}">${escape(t('打开原文'))}</button>` : ''}
            ${node.doi ? `<button type="button" class="outline-button" data-cc-copy-text="${escape(node.doi)}">${escape(t('复制 DOI'))}</button>` : ''}
            <button type="button" class="outline-button" data-cc-copy-bib="${escape(node.id)}">${escape(t('复制 BibTeX'))}</button>
          </div>
          <p class="cc-muted">${escape(t('下载 PDF 放入「文献库/papers」后，切回本页会自动识别为已入库。'))}</p>
        </section>
      `;
    }

    detail.innerHTML = `
      <div class="cc-detail-badges">
        <span class="cc-badge tone-${escape(badge.tone)}">${escape(t(badge.label))}</span>
        ${node.role === 'cited' ? `<span class="cc-badge tone-cocite">${escape(msg`共引 ${node.coCiteCount} / ${graph.seedIds.length} 篇`)}</span>` : ''}
      </div>
      <h3 class="cc-detail-title">${escape(node.title)}</h3>
      <p class="cc-detail-authors">${escape((node.authors || []).join(' · ') || t('作者未收录'))}</p>
      <div class="cc-detail-metrics">
        <div><span>${escape(t('发表年份'))}</span><b>${escape(node.year ?? '—')}</b></div>
        <div><span>${escape(t('全局被引'))}</span><b>${escape(node.citationCount?.toLocaleString() ?? '—')}</b></div>
      </div>
      ${node.venue ? `<p class="cc-meta-line">${escape(node.venue)}</p>` : ''}
      ${node.doi ? `<p class="cc-meta-line">DOI: ${escape(node.doi)}</p>` : ''}

      ${libraryActionsHtml}

      <section class="cc-detail-section">
        <h3>${escape(t(node.role === 'seed' ? '库内互引来源' : '引用它的所选文献'))} (${node.citedBySeedIds.length})</h3>
        ${citingSeedsHtml}
      </section>

      ${(outgoingEdges.length || incomingEdges.length) ? `
        <section class="cc-detail-section">
          <h3>${escape(t('图内关联'))} (${outgoingEdges.length + incomingEdges.length})</h3>
          <div class="cc-related-links">
            ${outgoingEdges.slice(0, 8).map(e => `<button type="button" class="text-button" data-cc-focus-node="${escape(e.target)}">${escape(t('引用'))} → ${escape(nodeById.get(e.target)?.title || e.target)}</button>`).join('')}
            ${incomingEdges.slice(0, 8).map(e => `<button type="button" class="text-button" data-cc-focus-node="${escape(e.source)}">${escape(t('被引'))} ← ${escape(nodeById.get(e.source)?.title || e.source)}</button>`).join('')}
          </div>
        </section>
      ` : ''}

      <section class="cc-detail-section">
        <h3>${escape(t('摘要'))}</h3>
        <p class="cc-abstract">${escape(node.abstract || t('数据源暂未收录该篇摘要。'))}</p>
      </section>
    `;
  }

  function renderShell({ relayout = false } = {}) {
    mountShell();
    const allPapers = getPapers();
    const validSeeds = currentSeedPapers(allPapers);
    if (validSeeds.length !== seedIds.length) {
      seedIds = validSeeds.map(p => p.id);
    }

    const syncedSelectionCount = getSelectedIds ? getSelectedIds().size : 0;
    const syncBtn = host.querySelector('[data-cc-action="sync-selection"]');
    if (syncBtn) {
      syncBtn.textContent = syncedSelectionCount
        ? msg`同步当前勾选 (${syncedSelectionCount})`
        : t('同步当前勾选');
      syncBtn.disabled = busy || syncedSelectionCount === 0;
    }

    const seedCountEl = host.querySelector('[data-cc-seed-count]');
    if (seedCountEl) {
      seedCountEl.textContent = validSeeds.length
        ? msg`已选 ${validSeeds.length} 篇种子文献`
        : t('尚未选择种子文献');
    }

    const analyzeBtn = host.querySelector('[data-cc-action="analyze"]');
    if (analyzeBtn) {
      analyzeBtn.textContent = busy ? t('取消分析') : t('开始交叉分析');
      analyzeBtn.disabled = !busy && validSeeds.length === 0;
    }

    renderStatusOnly();

    const noticeEl = host.querySelector('.cc-notice');
    const warningsText = errorMessage || (graph?.warnings?.length ? graph.warnings.join(' ') : '');
    noticeEl.hidden = !warningsText;
    noticeEl.textContent = warningsText;

    renderPicker(allPapers);

    const view = filterCrossGraph(graph, {
      preset,
      minCoCite,
      yearFrom,
      yearTo,
      search: listSearch,
      sort,
    });

    // Presets bar
    const presetsHost = host.querySelector('.cc-presets');
    const counts = graph?.counts || { cocitedUnseen: 0, cocitedAll: 0, unseenAll: 0, inLibrary: 0, all: 0 };
    const countMap = {
      'cocited-unseen': counts.cocitedUnseen,
      'cocited-all': counts.cocitedAll,
      'unseen-all': counts.unseenAll,
      'in-library': counts.inLibrary,
      all: counts.all,
    };
    presetsHost.innerHTML = PRESETS.map(([id, label]) => `
      <button type="button" class="outline-button" data-cc-preset="${id}" aria-pressed="${preset === id}">
        ${escape(t(label))} <span>${countMap[id] ?? 0}</span>
      </button>
    `).join('');

    const minSelect = host.querySelector('[data-cc-control="min-cocite"]');
    const maxChoices = Math.max(2, validSeeds.length, 5);
    minSelect.innerHTML = Array.from({ length: maxChoices }, (_, i) => i + 1)
      .filter(n => n >= 2 || !preset.startsWith('cocited-'))
      .map(n => `<option value="${n}" ${minCoCite === n ? 'selected' : ''}>≥ ${n} 篇</option>`)
      .join('');

    const exportBtn = host.querySelector('[data-cc-action="export-md"]');
    exportBtn.disabled = !graph || view.listItems.length === 0;

    // Left list
    host.querySelector('[data-cc-list-count]').textContent = String(view.listItems.length);
    const listScroll = host.querySelector('.cc-list-scroll');
    if (!graph) {
      listScroll.innerHTML = `<p class="cc-muted">${escape(t('选择多篇库内文献并点击「开始交叉分析」，这里会优先列出共同引用且你还没看的论文。'))}</p>`;
    } else if (!view.listItems.length) {
      listScroll.innerHTML = `<p class="cc-muted">${escape(t('当前筛选条件下没有匹配的被引文献，可尝试切换到「全部引用」或降低最少共引篇数。'))}</p>`;
    } else {
      listScroll.innerHTML = view.listItems.map(node => {
        const badge = statusBadgeMeta(node);
        return `
          <button type="button" class="cc-list-item" data-cc-node-id="${escape(node.id)}" aria-pressed="${selectedNodeId === node.id}">
            <div class="cc-list-item-top">
              <span class="cc-badge tone-${escape(badge.tone)}">${escape(t(badge.label))}</span>
              <span class="cc-cocite-tag">${escape(msg`共引 ${node.coCiteCount}/${graph.seedIds.length}`)}</span>
            </div>
            <strong>${escape(node.title)}</strong>
            <small>${escape(node.year ?? '—')} · ${escape(node.venue || t('期刊未知'))} · ${escape(msg`被引 ${node.citationCount?.toLocaleString() ?? '—'}`)}</small>
          </button>
        `;
      }).join('');
    }

    // Center layout toggle & canvas
    host.querySelectorAll('[data-cc-layout]').forEach(btn => {
      btn.setAttribute('aria-pressed', btn.dataset.ccLayout === layout ? 'true' : 'false');
    });

    const emptyOverlay = host.querySelector('.cc-empty-overlay');
    const previewGraph = !graph && validSeeds.length
      ? buildCrossGraph({ seedPapers: validSeeds, libraryPapers: validSeeds })
      : null;
    const canvasView = previewGraph ? filterCrossGraph(previewGraph, { preset: 'all' }) : view;
    emptyOverlay.hidden = canvasView.nodes.length > 0;
    if (!emptyOverlay.hidden) {
      emptyOverlay.innerHTML = '<div>' + escape(t('选择库内文献，即可在图上预览；开始分析后显示引用连线。')) + '</div>';
    }

    const visibleEdges = reduceEdges ? reduceCitationEdges(canvasView.edges) : canvasView.edges;
    host.querySelector('[data-cc-control="vertical-stretch"]').value = verticalStretch;
    host.querySelector('[data-cc-vertical-value]').textContent = verticalStretch + '×';
    host.querySelector('[data-cc-control="stretch"]').value = horizontalStretch;
    host.querySelector('[data-cc-stretch-value]').textContent = horizontalStretch + '×';
    renderThemePicker();
    renderLegend();
    host.querySelector('.cc-canvas-stage')?.setAttribute('data-cc-theme', graphTheme);
    canvasController?.setTheme(graphTheme);
    canvasController?.setStretch(horizontalStretch, verticalStretch);
    canvasController?.setData({
      nodes: canvasView.nodes,
      edges: visibleEdges,
      layout,
      years: canvasView.years,
      relayout,
    });
    canvasController?.setSelection(selectedNodeId);

    const foot = host.querySelector('.cc-canvas-foot');
    if (graph) {
      const visibleCitedCount = view.nodes.filter(n => n.role === 'cited').length;
      const summary = msg`种子 ${view.seedNodes.length} 篇 · 显示被引 ${visibleCitedCount} 篇 · 关系 ${visibleEdges.length} 条`;
      foot.dataset.summary = summary;
      foot.textContent = summary;
    } else {
      foot.dataset.summary = '';
      foot.textContent = validSeeds.length ? t('已显示所选文献，开始分析后显示引用连线。') : t('就绪');
    }

    renderDetail();
    setCount(graph ? msg`${graph.counts.cocitedUnseen} 篇共引未看` : '');
  }

  on(host, 'click', async event => {
    const target = event.target.closest('button');
    if (!target) return;

    const {
      ccAction,
      ccFolder,
      ccPreset,
      ccLayout,
      ccTheme,
      ccNodeId,
      ccFocusNode,
      ccOpenReader,
      ccReaderPage,
      ccOpenPaper,
      ccOpenUrl,
      ccCopyText,
      ccCopyBib,
      ccSetStatus,
      ccPaperId,
    } = target.dataset;

    if (ccAction === 'toggle-picker') {
      pickerOpen = !pickerOpen;
      renderShell();
      return;
    }
    if (ccAction === 'picker-done') {
      pickerOpen = false;
      renderShell();
      return;
    }
    if (ccAction === 'sync-selection') {
      const ids = [...(getSelectedIds ? getSelectedIds() : [])];
      if (!ids.length) {
        toast(t('当前文献列表没有已勾选的文献。'), true);
        return;
      }
      seedIds = ids.slice(0, 80);
      if (seedIds.length >= 2) minCoCite = 2;
      persistState();
      renderShell();
      return;
    }
    if (ccAction === 'clear-analysis') {
      queryController?.abort();
      queryController = null;
      busy = false;
      seedIds = [];
      graph = null;
      selectedNodeId = null;
      statusMessage = t('已清空本次分析。');
      errorMessage = '';
      pickerOpen = false;
      pickerQuery = pickerFolder = listSearch = '';
      yearFrom = yearTo = null;
      preset = 'all';
      minCoCite = 1;
      for (const input of host.querySelectorAll('.cc-picker-search, .cc-list-search, [data-cc-control^="year-"]')) {
        input.value = '';
      }
      persistState();
      renderShell({ relayout: true });
      return;
    }
    if (ccAction === 'picker-clear') {
      seedIds = [];
      persistState();
      renderShell();
      return;
    }
    if (ccAction === 'picker-select-filtered') {
      const allPapers = getPapers();
      const q = pickerQuery.trim().toLowerCase();
      const next = new Set(seedIds);
      for (const p of allPapers) {
        if (pickerFolder && p.collection !== pickerFolder) continue;
        if (q) {
          const hay = [p.title, p.authors, p.journal, p.doi, ...(p.tags || [])].join(' ').toLowerCase();
          if (!hay.includes(q)) continue;
        }
        if (next.size >= 80) break;
        next.add(p.id);
      }
      seedIds = [...next];
      persistState();
      renderShell();
      return;
    }
    if (ccAction === 'analyze') {
      void runAnalysis();
      return;
    }
    if (ccAction === 'organize') {
      const enabled = target.getAttribute('aria-pressed') !== 'true';
      target.setAttribute('aria-pressed', String(enabled));
      target.textContent = t(enabled ? '恢复原布局' : '整理');
      canvasController?.setOrganized(enabled);
      return;
    }
    if (ccAction === 'zoom-in') {
      canvasController?.zoomBy(1.2);
      return;
    }
    if (ccAction === 'zoom-out') {
      canvasController?.zoomBy(1 / 1.2);
      return;
    }
    if (ccAction === 'fit') {
      canvasController?.fit();
      return;
    }
    if (ccAction === 'export-png') {
      const uri = canvasController?.exportPng();
      if (!uri) return;
      const a = document.createElement('a');
      a.download = 'citation-cross-atlas.png';
      a.href = uri;
      a.click();
      return;
    }
    if (ccAction === 'export-md') {
      if (!graph) return;
      const view = filterCrossGraph(graph, { preset, minCoCite, yearFrom, yearTo, search: listSearch, sort });
      const md = formatUnseenMarkdown({
        seedPapers: currentSeedPapers(getPapers()),
        listItems: view.listItems,
        counts: graph.counts,
      });
      await saveText(md, '引文交叉漏读清单.md', 'md');
      return;
    }
    if (ccFolder !== undefined) {
      if (ccFolder && pickerFolder === ccFolder) {
        // Clicking an already-active folder toggles selecting all papers in that folder.
        const groupIds = getPapers().filter(p => p.collection === ccFolder).map(p => p.id);
        const set = new Set(seedIds);
        const allSelected = groupIds.length > 0 && groupIds.every(id => set.has(id));
        if (allSelected) groupIds.forEach(id => set.delete(id));
        else groupIds.forEach(id => { if (set.size < 80) set.add(id); });
        seedIds = [...set];
        persistState();
      } else {
        pickerFolder = ccFolder;
      }
      renderShell();
      return;
    }
    if (ccPreset) {
      preset = ccPreset;
      minCoCite = preset.startsWith('cocited-') ? 2 : 1;
      persistState();
      renderShell({ relayout: true });
      return;
    }
    if (ccLayout) {
      layout = ccLayout;
      persistState();
      renderShell({ relayout: true });
      return;
    }
    if (ccTheme) {
      graphTheme = normalizeCitationTheme(ccTheme);
      persistState();
      host.querySelector('.cc-canvas-stage')?.setAttribute('data-cc-theme', graphTheme);
      canvasController?.setTheme(graphTheme);
      renderThemePicker();
      renderLegend();
      return;
    }
    if (ccNodeId) {
      selectedNodeId = ccNodeId;
      canvasController?.setSelection(selectedNodeId);
      canvasController?.focusNode(selectedNodeId);
      renderListSelection();
      renderDetail();
      return;
    }
    if (ccFocusNode) {
      selectedNodeId = ccFocusNode;
      canvasController?.setSelection(selectedNodeId);
      canvasController?.focusNode(selectedNodeId);
      renderListSelection();
      renderDetail();
      return;
    }
    if (ccOpenReader) {
      await openReader(ccOpenReader, ccReaderPage ? Number(ccReaderPage) : undefined);
      return;
    }
    if (ccOpenPaper) {
      openPaper(ccOpenPaper);
      return;
    }
    if (ccOpenUrl) {
      openExternal?.(ccOpenUrl);
      return;
    }
    if (ccCopyText) {
      await navigator.clipboard?.writeText(ccCopyText).catch(() => {});
      toast(t('已复制到剪贴板。'));
      return;
    }
    if (ccCopyBib) {
      const node = graph?.nodes.find(n => n.id === ccCopyBib);
      if (node) {
        await navigator.clipboard?.writeText(formatBibtex(node)).catch(() => {});
        toast(t('已复制 BibTeX。'));
      }
      return;
    }
    if (ccSetStatus && ccPaperId) {
      try {
        await setReadingStatus([ccPaperId], ccSetStatus);
        if (graph) {
          graph = rebindLibrary(graph, getPapers());
        }
        renderShell();
        toast(t('阅读状态已更新。'));
      } catch (error) {
        toast(error.message, true);
      }
    }
  });

  on(host, 'change', event => {
    const target = event.target;
    if (target.dataset.ccSeedId) {
      const id = target.dataset.ccSeedId;
      const next = new Set(seedIds);
      if (target.checked) {
        if (next.size >= 80) {
          target.checked = false;
          toast(t('单次最多选择 80 篇种子文献。'), true);
          return;
        }
        next.add(id);
      } else {
        next.delete(id);
      }
      seedIds = [...next];
      persistState();
      renderShell();
      return;
    }
    if (['stretch', 'vertical-stretch'].includes(target.dataset.ccControl)) {
      persistState();
      return;
    }
    if (target.dataset.ccControl === 'reduce-edges') {
      reduceEdges = target.checked;
      renderShell();
      return;
    }
    if (target.dataset.ccControl === 'min-cocite') {
      minCoCite = Number(target.value) || 1;
      persistState();
      renderShell({ relayout: true });
      return;
    }
    if (target.dataset.ccControl === 'sort') {
      sort = target.value;
      persistState();
      renderShell();
      return;
    }
    if (target.dataset.ccControl === 'year-from') {
      yearFrom = /^\d{4}$/.test(target.value.trim()) ? Number(target.value.trim()) : null;
      renderShell({ relayout: true });
      return;
    }
    if (target.dataset.ccControl === 'year-to') {
      yearTo = /^\d{4}$/.test(target.value.trim()) ? Number(target.value.trim()) : null;
      renderShell({ relayout: true });
    }
  });

  on(host, 'input', event => {
    const target = event.target;
    if (['stretch', 'vertical-stretch'].includes(target.dataset.ccControl)) {
      const vertical = target.dataset.ccControl === 'vertical-stretch';
      const value = Number(target.value);
      if (vertical) verticalStretch = value;
      else horizontalStretch = value;
      host.querySelector(vertical ? '[data-cc-vertical-value]' : '[data-cc-stretch-value]').textContent = value + '×';
      canvasController?.setStretch(horizontalStretch, verticalStretch);
      return;
    }
    if (target.classList.contains('cc-picker-search')) {
      pickerQuery = target.value;
      renderPicker(getPapers());
      return;
    }
    if (target.classList.contains('cc-list-search')) {
      listSearch = target.value;
      renderShell();
    }
  });

  let loaded = false;
  async function render() {
    if (!isReady()) return;
    if (!loaded) {
      const version = generation;
      const payload = await services.load();
      if (version !== generation || signal.aborted) return;
      libraryKey = payload.libraryKey;
      const saved = payload.state && typeof payload.state === 'object' ? payload.state : null;
      const allIds = new Set(getPapers().map(p => p.id));
      if (Array.isArray(saved?.seedIds)) {
        seedIds = saved.seedIds.filter(id => allIds.has(id));
      }
      if (!Array.isArray(saved?.seedIds) && getSelectedIds) {
        seedIds = [...getSelectedIds()].filter(id => allIds.has(id)).slice(0, 80);
      }
      if (saved?.preset) preset = saved.preset;
      if (Number.isInteger(saved?.minCoCite)) minCoCite = saved.minCoCite;
      if (saved?.sort) sort = saved.sort;
      verticalStretch = Number.isFinite(saved?.verticalStretch) ? Math.max(0.5, Math.min(6, saved.verticalStretch)) : 1;
      horizontalStretch = Number.isFinite(saved?.horizontalStretch) ? Math.max(1, Math.min(6, saved.horizontalStretch)) : 1;
      if (saved?.layout) layout = saved.layout;
      graphTheme = normalizeCitationTheme(saved?.graphTheme);
      loaded = true;
    } else if (graph) {
      graph = rebindLibrary(graph, getPapers());
    }
    renderShell();
  }

  return {
    render,
    flush: () => saveQueue,
    reset() {
      generation++;
      queryController?.abort();
      queryController = null;
      busy = false;
      loaded = false;
      reduceEdges = true;
      graphTheme = DEFAULT_CITATION_THEME;
      libraryKey = null;
      graph = null;
      seedIds = [];
      selectedNodeId = null;
      statusMessage = '';
      errorMessage = '';
      pickerOpen = false;
      canvasController?.dispose();
      canvasController = null;
      host.replaceChildren();
    },
    dispose() {
      queryController?.abort();
      queryController = null;
      canvasController?.dispose();
      canvasController = null;
    },
  };
}
