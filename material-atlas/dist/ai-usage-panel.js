import { animateNumber, syncSlidingPill } from './ui-motion.js';

const SCOPES = [
  { id: 'all', label: '全部汇总' },
  { id: 'codex', label: 'Codex' },
  { id: 'antigravity', label: 'Antigravity' },
  { id: 'gemini', label: 'Gemini' },
];

const RANGES = [
  { id: '24h', label: '24h', eyebrow: '24H TOTAL TOKENS' },
  { id: '7d', label: '7d', eyebrow: '7D TOTAL TOKENS' },
  { id: '30d', label: '30d', eyebrow: '30D TOTAL TOKENS' },
];

export function formatTokenCount(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return String(Math.round(n));
}

export function formatCountdown(resetAt, now = Date.now()) {
  if (!resetAt) return '—';
  const diff = resetAt - now;
  if (diff <= 0) return '已重置';
  const totalMinutes = Math.ceil(diff / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours < 24) return mins ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days}d ${remHours}h` : `${days}d`;
}

export function createAiUsagePanel(host, { native, tr, escape, onBack }) {
  let disposed = false;
  let loading = true;
  let errorMessage = '';
  let snapshot = null;
  let scope = 'all';
  let range = '7d';
  let hoveredIndex = null;
  let controller = null;
  let shellMounted = false;
  let activeNumberStops = [];
  let lastNumbers = {
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    avgPerDay: 0,
  };

  function cancelNumberAnimations() {
    for (const stop of activeNumberStops) stop();
    activeNumberStops = [];
  }

  async function refresh() {
    controller?.abort();
    controller = new AbortController();
    const current = controller;
    const hadSnapshot = Boolean(snapshot);
    loading = true;
    errorMessage = '';
    if (hadSnapshot) {
      updateShellControls();
    } else {
      renderInitialState();
    }
    try {
      let data;
      if (native?.aiUsageQuery) {
        data = await native.aiUsageQuery();
      } else {
        const res = await fetch('/api/ai-usage', {
          headers: { 'X-Materia-Usage': '1' },
          signal: current.signal,
        });
        data = await res.json();
        if (!res.ok) throw new Error(data?.error || tr('无法读取 AI 用量遥测。'));
      }
      if (disposed || current !== controller) return;
      snapshot = data;
      hoveredIndex = null;
      loading = false;
      if (!shellMounted) {
        mountShell();
      } else {
        updateShellControls();
      }
      updateView({ animateNumbers: true, animateBars: true });
    } catch (error) {
      if (disposed || current.signal.aborted) return;
      loading = false;
      errorMessage = error?.message || tr('无法读取 AI 用量遥测。');
      if (!snapshot) {
        renderInitialState();
      } else {
        updateShellControls();
      }
    }
  }

  function renderInitialState() {
    if (disposed) return;
    shellMounted = false;
    if (loading) {
      host.innerHTML = `<div class="ai-usage-hud">
        <div class="ai-usage-skeleton">${escape(tr('正在汇总 Codex、Antigravity 与 Gemini 用量遥测…'))}</div>
        <div class="ai-usage-footer">
          <button type="button" class="outline-button" data-usage-action="back">${escape(tr('返回设置'))}</button>
          <button type="button" class="outline-button" disabled>${escape(tr('刷新遥测'))}</button>
        </div>
      </div>`;
    } else {
      host.innerHTML = `<div class="ai-usage-hud">
        <div class="ai-usage-skeleton">${escape(errorMessage)}</div>
        <div class="ai-usage-footer">
          <button type="button" class="outline-button" data-usage-action="back">${escape(tr('返回设置'))}</button>
          <button type="button" class="primary" data-usage-action="refresh">${escape(tr('重试'))}</button>
        </div>
      </div>`;
    }
    host.querySelector('[data-usage-action="back"]')?.addEventListener('click', () => onBack?.());
    host.querySelector('[data-usage-action="refresh"]')?.addEventListener('click', () => refresh());
  }

  function renderChartHeader(view) {
    const series = view?.series || [];
    const idx = hoveredIndex !== null && series[hoveredIndex] ? hoveredIndex : series.length - 1;
    const item = series[idx];
    if (!item) return `<span>${escape(tr('暂无时间序列'))}</span><span></span>`;
    return `<span>${escape(item.label)} · ${formatTokenCount(item.totalTokens)}</span><span>In ${formatTokenCount(item.inputTokens)} / Out ${formatTokenCount(item.outputTokens)}</span>`;
  }

  function renderQuotaCell(row) {
    if (typeof row.remaining !== 'number') {
      return `<span class="muted">${escape(row.windowLabel || '—')}</span>`;
    }
    const pct = Math.round(row.remaining * 100);
    const tone = pct <= 15 ? 'low' : pct <= 35 ? 'warn' : '';
    return `<div class="ai-usage-quota-cell" title="${escape(row.windowLabel || '')}">
      <div class="ai-usage-quota-track"><div class="ai-usage-quota-fill ${tone}" style="width:${pct}%"></div></div>
      <span class="ai-usage-quota-pct ${tone}">${pct}%</span>
    </div>`;
  }

  function mountShell() {
    const engines = snapshot?.engines || {};
    const activeCount = snapshot?.activeEngines ?? 0;

    const scopeButtons = SCOPES.map(item => {
      const online = item.id === 'all' ? activeCount > 0 : Boolean(engines[item.id]?.online);
      return `<button type="button" class="ai-usage-pill ${scope === item.id ? 'active' : ''}" data-usage-scope="${item.id}" aria-pressed="${scope === item.id}">
        <span class="engine-dot ${online ? 'online' : ''}" aria-hidden="true"></span>${escape(tr(item.label))}
      </button>`;
    }).join('');

    const rangeButtons = RANGES.map(item =>
      `<button type="button" class="ai-usage-pill ${range === item.id ? 'active' : ''}" data-usage-range="${item.id}" aria-pressed="${range === item.id}">${item.label}</button>`
    ).join('');

    host.innerHTML = `<div class="ai-usage-hud">
      <div class="ai-usage-controls">
        <div class="ai-usage-pills" data-usage-group="scope" role="group" aria-label="${escape(tr('AI 引擎筛选'))}">${scopeButtons}</div>
        <div class="ai-usage-pills" data-usage-group="range" role="group" aria-label="${escape(tr('统计周期'))}">${rangeButtons}</div>
      </div>

      <section class="ai-usage-hero">
        <div class="ai-usage-hero-left">
          <div>
            <div class="ai-usage-eyebrow">
              <span data-usage-field="eyebrow">7D TOTAL TOKENS</span>
              <span class="ai-usage-live-badge" data-usage-field="live">LIVE</span>
            </div>
            <div class="ai-usage-big-metric">
              <strong data-usage-metric="totalTokens">0</strong>
              <span>tokens</span>
            </div>
          </div>
          <div class="ai-usage-kv-grid">
            <div class="ai-usage-kv"><span>Input</span><strong data-usage-metric="inputTokens">0</strong></div>
            <div class="ai-usage-kv"><span>Output</span><strong data-usage-metric="outputTokens">0</strong></div>
            <div class="ai-usage-kv"><span>Cached</span><strong data-usage-metric="cachedTokens">0</strong></div>
            <div class="ai-usage-kv"><span>Avg/Day</span><strong data-usage-metric="avgPerDay">0</strong></div>
            <div class="ai-usage-kv"><span>Active</span><strong data-usage-field="active">0/3</strong></div>
            <div class="ai-usage-kv"><span>Sync</span><strong data-usage-field="sync">0ms</strong></div>
          </div>
        </div>
        <div class="ai-usage-hero-right">
          <div class="ai-usage-chart-header" id="ai-usage-chart-readout"></div>
          <div class="ai-usage-chart-bars" data-usage-field="bars"></div>
          <div class="ai-usage-chart-axis" data-usage-field="axis"></div>
        </div>
      </section>

      <div class="ai-usage-table-wrap">
        <table class="ai-usage-table">
          <thead>
            <tr>
              <th>${escape(tr('模型 / 引擎'))}</th>
              <th>${escape(tr('剩余配额'))}</th>
              <th class="num">${escape(tr('重置倒计时'))}</th>
              <th class="num">${escape(tr('Token 消耗'))}</th>
            </tr>
          </thead>
          <tbody data-usage-field="rows"></tbody>
        </table>
      </div>

      <div class="ai-usage-sources" data-usage-field="sources"></div>

      <div class="ai-usage-footer">
        <button type="button" class="outline-button" data-usage-action="back">${escape(tr('返回设置'))}</button>
        <button type="button" class="outline-button" data-usage-action="refresh">${escape(tr('刷新遥测'))}</button>
      </div>
    </div>`;

    shellMounted = true;
    bindShellEvents();
    syncPills(true);
  }

  function syncPills(immediate = false) {
    const scopeGroup = host.querySelector('[data-usage-group="scope"]');
    const rangeGroup = host.querySelector('[data-usage-group="range"]');
    syncSlidingPill(scopeGroup, '.ai-usage-pill.active', { immediate });
    syncSlidingPill(rangeGroup, '.ai-usage-pill.active', { immediate });
  }

  function updateShellControls() {
    if (!shellMounted) return;
    const engines = snapshot?.engines || {};
    const activeCount = snapshot?.activeEngines ?? 0;

    for (const btn of host.querySelectorAll('[data-usage-scope]')) {
      const id = btn.dataset.usageScope;
      const isActive = scope === id;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
      const dot = btn.querySelector('.engine-dot');
      if (dot) {
        const online = id === 'all' ? activeCount > 0 : Boolean(engines[id]?.online);
        dot.classList.toggle('online', online);
      }
    }

    for (const btn of host.querySelectorAll('[data-usage-range]')) {
      const isActive = range === btn.dataset.usageRange;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    }

    const liveBadge = host.querySelector('[data-usage-field="live"]');
    if (liveBadge) liveBadge.textContent = loading ? 'SYNC' : 'LIVE';

    const refreshBtn = host.querySelector('[data-usage-action="refresh"]');
    if (refreshBtn) {
      refreshBtn.disabled = loading;
      refreshBtn.textContent = tr(loading ? '正在刷新…' : '刷新遥测');
    }

    syncPills(false);
  }

  function updateView({ animateNumbers = true, animateBars = true } = {}) {
    if (disposed || !shellMounted) return;

    const view = snapshot?.views?.[scope]?.[range] || {
      totalTokens: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, avgPerDay: 0, series: [], models: [],
    };
    const rangeMeta = RANGES.find(r => r.id === range) || RANGES[1];
    const series = view.series || [];
    const maxBar = Math.max(1, ...series.map(b => b.totalTokens));
    const engines = snapshot?.engines || {};
    const activeCount = snapshot?.activeEngines ?? 0;

    const eyebrowEl = host.querySelector('[data-usage-field="eyebrow"]');
    if (eyebrowEl) eyebrowEl.textContent = rangeMeta.eyebrow;

    const activeEl = host.querySelector('[data-usage-field="active"]');
    if (activeEl) activeEl.textContent = `${activeCount}/3`;

    const syncEl = host.querySelector('[data-usage-field="sync"]');
    if (syncEl) syncEl.textContent = `${snapshot?.syncMs ?? 0}ms`;

    cancelNumberAnimations();
    const metricKeys = ['totalTokens', 'inputTokens', 'outputTokens', 'cachedTokens', 'avgPerDay'];
    for (const key of metricKeys) {
      const el = host.querySelector(`[data-usage-metric="${key}"]`);
      if (!el) continue;
      const from = animateNumbers ? lastNumbers[key] : view[key];
      const to = Number(view[key] || 0);
      activeNumberStops.push(animateNumber(el, from, to, formatTokenCount, { duration: animateNumbers ? 260 : 0 }));
      lastNumbers[key] = to;
    }

    const readoutEl = host.querySelector('#ai-usage-chart-readout');
    if (readoutEl) readoutEl.innerHTML = renderChartHeader(view);

    const barsEl = host.querySelector('[data-usage-field="bars"]');
    if (barsEl) {
      barsEl.innerHTML = series.map((bucket, idx) => {
        const pct = bucket.totalTokens > 0 ? Math.max(6, Math.round((bucket.totalTokens / maxBar) * 100)) : 4;
        const cls = [
          'ai-usage-bar',
          bucket.totalTokens === 0 ? 'empty' : '',
          bucket.isCurrent ? 'current' : '',
          animateBars ? 'animate-rise' : '',
        ].filter(Boolean).join(' ');
        const selected = hoveredIndex === idx ? 'selected' : '';
        return `<button type="button" class="ai-usage-bar-col ${selected}" data-bar-index="${idx}" aria-label="${escape(`${bucket.label}: ${formatTokenCount(bucket.totalTokens)} tokens`)}">
          <span class="${cls}" style="height:${pct}%;--bar-i:${idx}"></span>
        </button>`;
      }).join('');

      for (const col of barsEl.querySelectorAll('[data-bar-index]')) {
        const idx = Number(col.dataset.barIndex);
        const show = () => {
          hoveredIndex = idx;
          if (readoutEl) readoutEl.innerHTML = renderChartHeader(view);
        };
        col.addEventListener('mouseenter', show);
        col.addEventListener('focus', show);
      }
    }

    const axisEl = host.querySelector('[data-usage-field="axis"]');
    if (axisEl) {
      axisEl.innerHTML = `<span>${escape(series[0]?.label || '')}</span><span>${escape(series[Math.floor(series.length / 2)]?.label || '')}</span><span>${escape(series.at(-1)?.label || '')}</span>`;
    }

    const rowsEl = host.querySelector('[data-usage-field="rows"]');
    if (rowsEl) {
      rowsEl.innerHTML = view.models.length
        ? view.models.map(row => `<tr>
            <td>
              <div class="ai-usage-model-cell">
                <span class="ai-usage-engine-tag">${escape(row.engineLabel)}</span>
                <span class="ai-usage-model-name" title="${escape(row.model)}">${escape(row.displayName || row.model)}</span>
              </div>
            </td>
            <td>${renderQuotaCell(row)}</td>
            <td class="num">${escape(formatCountdown(row.resetAt, snapshot?.syncedAt || Date.now()))}</td>
            <td class="num">${formatTokenCount(row.totalTokens)}</td>
          </tr>`).join('')
        : `<tr><td colspan="4" class="ai-usage-empty-row">${escape(tr('当前筛选范围内暂无 Token 记录'))}</td></tr>`;
    }

    const sourcesEl = host.querySelector('[data-usage-field="sources"]');
    if (sourcesEl) {
      sourcesEl.innerHTML = ['codex', 'antigravity', 'gemini'].map(id => {
        const e = engines[id] || { label: id, online: false, sourceLabel: '—' };
        return `<span><i class="dot ${e.online ? 'online' : ''}" aria-hidden="true"></i>${escape(e.label)}：${escape(e.sourceLabel || '')}</span>`;
      }).join('');
    }
  }

  function bindShellEvents() {
    host.querySelector('[data-usage-action="back"]')?.addEventListener('click', () => onBack?.());
    host.querySelector('[data-usage-action="refresh"]')?.addEventListener('click', () => refresh());

    for (const btn of host.querySelectorAll('[data-usage-scope]')) {
      btn.addEventListener('click', () => {
        const next = btn.dataset.usageScope || 'all';
        if (next === scope) return;
        scope = next;
        hoveredIndex = null;
        updateShellControls();
        updateView({ animateNumbers: true, animateBars: true });
      });
    }

    for (const btn of host.querySelectorAll('[data-usage-range]')) {
      btn.addEventListener('click', () => {
        const next = btn.dataset.usageRange || '7d';
        if (next === range) return;
        range = next;
        hoveredIndex = null;
        updateShellControls();
        updateView({ animateNumbers: true, animateBars: true });
      });
    }
  }

  refresh();
  return {
    dispose() {
      disposed = true;
      cancelNumberAnimations();
      controller?.abort();
    },
  };
}
