import {html, msg, t} from '../../i18n.js';

const directions = [
  ['成分与材料体系', /成分|组分|配方|掺杂|\b(?:doping|composition|formulation)\b/i],
  ['微结构与界面', /微结构|界面|晶界|表面改性|\b(?:microstructure|interface|interfaces|grain boundaries)\b/i],
  ['制备与工艺', /制备|工艺|烧结|沉积|合成|\b(?:fabrication|synthesis|sintering|deposition)\b/i],
  ['机理与理论', /机理|机制|理论|\b(?:mechanism|theory|theoretical model)\b/i],
  ['表征与研究方法', /表征|原位|测量方法|\b(?:characterization|characterisation|in situ)\b/i],
  ['性能与应用', /性能|应用|效率|导电|强度|\b(?:performance|application|efficiency|conductivity|strength)\b/i],
];
const knownDirections = new Set(directions.map(([label]) => label));
const directionLabel = value => knownDirections.has(value) ? t(value) : value;
const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));

let directionWrites = Promise.resolve();

export function createInnovationTimeline({host, on, getTimelinePapers, openPaper, services, setCount, toast, saveText, isReady, signal, fields, label}) {
  const directionTitle = '研究方向';
  const emptyMessage = '尚未录入创新点或局限性。';
  const listId = host.id + '-directions';
  let saved;
  let libraryKey;
  let pending;
  let loading;
  let activeDirection = null;
  let activeField = 'all';
  let searchQuery = '';
  let generation = 0;
  let rows = [];
  let byYear = new Map();

  function renderContent({resetScroll = false} = {}) {
    const previousScroll = resetScroll ? 0 : host.querySelector('.timeline-years')?.scrollTop ?? 0;
    const papers = getTimelinePapers();
    rows = papers.flatMap(paper => {
      const year = String(paper.year ?? '').trim();
      return fields.flatMap(field => (paper[field] || []).map(text => {
        const key = JSON.stringify(field === 'innovations' ? [paper.id, text] : [paper.id, field, text]);
        return {paper, text, field, key, year: /^\d{4}$/.test(year) ? year : '', direction: saved[key] || ''};
      }));
    }).sort((a,b) => (Number(a.year || Infinity) - Number(b.year || Infinity)) || a.paper.title.localeCompare(b.paper.title));

    const counts = new Map();
    let classifiedCount = 0;
    for (const {direction} of rows) {
      counts.set(direction, (counts.get(direction) || 0) + 1);
      if (direction) classifiedCount += 1;
    }
    if (!counts.has(activeDirection)) activeDirection = null;
    const needle = searchQuery.trim().toLowerCase();
    const visible = rows
      .map((row,index) => ({...row,index}))
      .filter(row =>
        (activeDirection === null || row.direction === activeDirection)
        && (activeField === 'all' || row.field === activeField)
        && (!needle || [row.text, row.paper.title, row.paper.journal, row.direction, row.year].join(' ').toLowerCase().includes(needle)));

    byYear = Map.groupBy(visible, row => row.year);
    const labels = [...new Set([...knownDirections, ...counts.keys()].filter(Boolean))].sort((a,b) =>
      directionLabel(a).localeCompare(directionLabel(b)));
    const filter = (labelText, count, value) => `<button type="button" class="outline-button" data-timeline-filter="${escape(value)}" aria-pressed="${activeDirection === value}">${escape(labelText)} <span>${count}</span></button>`;
    const innovationCount = rows.filter(row => row.field === 'innovations').length;
    const limitationCount = rows.length - innovationCount;
    setCount(msg`${visible.length} 条演进记录`);

    host.innerHTML = html`
      <div class="tl-atelier">
        <header class="tl-hero">
          <div class="tl-hero-copy">
            <span class="tl-eyebrow">CHRONOLOGY ARCHIVE // 创新与局限时间线</span>
            <h2>研究演进脉络</h2>
            <p>${escape(msg`当前匹配 ${papers.length} 篇文献`)} · 按年份回溯每篇论文的创新突破与实验边界</p>
          </div>
          <div class="tl-kpis" aria-label="时间线统计">
            <div class="tl-kpi"><span>MATCHED</span><strong>${papers.length}</strong><small>文献</small></div>
            <div class="tl-kpi is-innovation"><span>INNOVATIONS</span><strong>${innovationCount}</strong><small>创新点</small></div>
            <div class="tl-kpi is-limitation"><span>LIMITATIONS</span><strong>${limitationCount}</strong><small>局限性</small></div>
            <div class="tl-kpi"><span>TAGGED</span><strong>${classifiedCount}</strong><small>已归类</small></div>
          </div>
          <div class="tl-hero-actions timeline-toolbar">
            <button type="button" class="outline-button" data-action="filters" aria-haspopup="dialog">${escape(t('筛选文献'))}</button>
            <button type="button" class="outline-button" data-timeline-classify ${!counts.has('') || pending ? 'disabled' : ''}>自动归类</button>
            <button type="button" class="primary" data-timeline-export ${!visible.length || pending ? 'disabled' : ''}>导出 Markdown</button>
          </div>
        </header>
        <div class="tl-controls">
          <div class="tl-kind-tabs" role="group" aria-label="条目类型">
            <button type="button" data-timeline-kind="all" aria-pressed="${activeField === 'all'}">全部 <span>${rows.length}</span></button>
            <button type="button" data-timeline-kind="innovations" aria-pressed="${activeField === 'innovations'}">创新点 <span>${innovationCount}</span></button>
            <button type="button" data-timeline-kind="limitations" aria-pressed="${activeField === 'limitations'}">局限性 <span>${limitationCount}</span></button>
          </div>
          <label class="tl-search-wrap">
            <input type="search" class="tl-search" data-timeline-search value="${escape(searchQuery)}" placeholder="搜索创新点、局限性、文献标题或年份…" aria-label="搜索时间线条目">
          </label>
        </div>
        ${rows.length ? `<div class="timeline-filters" role="group" aria-label="${escape(t(directionTitle))}">
          <button type="button" class="outline-button" data-timeline-all aria-pressed="${activeDirection === null}">${escape(t('全部方向'))} <span>${rows.length}</span></button>
          ${labels.filter(l => counts.has(l)).map(l => filter(directionLabel(l),counts.get(l),l)).join('')}
          ${counts.has('') ? filter(t('未归类'),counts.get(''),'') : ''}
        </div>` : `<div class="tl-empty-card"><p class="timeline-empty">${escape(papers.length ? t(emptyMessage) : msg`当前匹配 ${0} 篇文献`)}</p></div>`}
        <datalist id="${escape(listId)}">${labels.map(l => `<option value="${escape(directionLabel(l))}"></option>`).join('')}</datalist>
        ${visible.length ? html`<div class="timeline-years" role="region" aria-label="${escape(t(label))}" tabindex="0">${[...byYear].map(([year,points]) => `
          <section class="timeline-year">
            <div class="timeline-year-rail">
              <h2>${escape(year || t('年份待补充'))}</h2>
              <span class="timeline-year-count">${points.length} 条</span>
            </div>
            <ol>${points.map(({paper,text,field,direction,index}) => `<li data-kind="${escape(field)}">
              <div class="timeline-item-head">
                <small class="timeline-kind-badge is-${escape(field)}">${escape(t(field === 'limitations' ? '局限性' : '创新点'))}</small>
                <label class="timeline-direction">${escape(t(directionTitle))}
                  <input type="text" list="${escape(listId)}" maxlength="60" data-timeline-direction="${index}" value="${escape(directionLabel(direction))}" placeholder="${escape(t('未归类'))}" ${pending ? 'disabled' : ''}>
                </label>
              </div>
              <p class="timeline-point">${escape(text)}</p>
              <div class="timeline-source">
                <button type="button" class="text-button" data-timeline-paper="${escape(paper.id)}">${escape(paper.title)}</button>
                ${paper.journal ? `<span class="timeline-journal">${escape(paper.journal)}</span>` : ''}
              </div>
            </li>`).join('')}</ol>
          </section>`).join('')}</div>`
        : (rows.length ? `<div class="tl-empty-card"><p class="timeline-empty">当前筛选条件下暂无匹配的条目。</p></div>` : '')}
      </div>
    `;
    const timeline = host.querySelector('.timeline-years');
    if (timeline) timeline.scrollTop = previousScroll;
  }

  async function render() {
    if (!isReady()) return;
    if (!pending) {
      const version = generation;
      loading ||= directionWrites.then(() => services.load());
      let result;
      try { result = await loading; }
      finally { if (generation === version) loading = null; }
      if (generation !== version || signal.aborted) return;
      saved = result.state && typeof result.state === 'object' ? result.state : {};
      libraryKey = result.libraryKey;
    }
    renderContent();
  }

  async function save(next) {
    if (pending) return;
    const version = generation;
    const key = libraryKey;
    pending = directionWrites.then(async () => {
      const latest = await services.load();
      if (latest.libraryKey !== key) throw Error(t('文献库已切换'));
      const nextState = {...latest.state};
      for (const [entry, value] of next) {
        if (value) nextState[entry] = value;
        else delete nextState[entry];
      }
      await services.save({libraryKey: key, state: nextState});
      if (generation === version) saved = nextState;
    });
    directionWrites = pending.catch(() => {});
    try { await pending; }
    catch (error) { toast(error.message, true); }
    finally { pending = null; if (!signal.aborted && generation === version) renderContent(); }
  }

  on(host, 'input', event => {
    if (!event.target.matches('[data-timeline-search]')) return;
    const caret = event.target.selectionStart ?? searchQuery.length;
    searchQuery = event.target.value;
    renderContent({resetScroll:true});
    const nextSearch = host.querySelector('[data-timeline-search]');
    if (nextSearch) {
      nextSearch.focus({preventScroll:true});
      try { nextSearch.setSelectionRange(caret, caret); } catch {}
    }
  });

  on(host, 'change', event => {
    const index = event.target.dataset.timelineDirection;
    const row = index === undefined ? null : rows[Number(index)];
    if (!row || pending) return;
    const value = event.target.value.trim();
    const direction = directions.find(([dirLabel]) => t(dirLabel) === value)?.[0] || value;
    if (direction === row.direction) return;
    save(new Map([[row.key, direction]]));
  });

  async function exportTimeline() {
    const plain = value => String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/[\\`*_\[\]<>]/g, '\\$&').trim();
    const lines = ['# ' + t(label)];
    for (const [year, entries] of byYear) {
      lines.push('', '## ' + (year || t('年份待补充')), '');
      for (const {paper, text, field, direction} of entries) {
        const kind = '**' + t(field === 'limitations' ? '局限性' : '创新点') + '** · ';
        lines.push('- ' + kind + plain(text));
        lines.push('  - ' + [paper.title, paper.journal, paper.doi].filter(Boolean).map(plain).join(' · '));
        lines.push('  - ' + t(directionTitle) + ' · ' + plain(direction ? directionLabel(direction) : t('未归类')));
      }
    }
    try { await saveText(lines.join('\n') + '\n', t(label) + '.md', 'md'); }
    catch (error) { toast(error.message, true); }
  }

  on(host, 'click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    const {timelineFilter, timelineAll, timelineKind, timelinePaper, timelineClassify, timelineExport} = button.dataset;
    if (timelineKind !== undefined) {
      activeField = timelineKind;
      renderContent({resetScroll:true});
      host.querySelector(`[data-timeline-kind="${CSS.escape(activeField)}"]`)?.focus();
    } else if (timelineFilter !== undefined || timelineAll !== undefined) {
      activeDirection = timelineFilter ?? null;
      renderContent({resetScroll:true});
      host.querySelector('.timeline-filters [aria-pressed="true"]')?.focus();
    } else if (timelineExport !== undefined && byYear.size && !pending) {
      exportTimeline();
    } else if (timelinePaper !== undefined) {
      event.stopPropagation();
      openPaper(timelinePaper);
    } else if (timelineClassify !== undefined && !pending) {
      const next = new Map();
      for (const row of rows) {
        if (row.direction) continue;
        const matches = directions.filter(([,pattern]) => pattern.test(row.text));
        if (matches.length !== 1) continue;
        next.set(row.key, matches[0][0]);
      }
      if (next.size) save(next);
      else toast(t('没有可自动归类的条目。'));
    }
  });

  return {
    render,
    flush: () => pending,
    reset() {
      generation++;
      loading = null;
      saved = undefined;
      libraryKey = undefined;
      activeDirection = null;
      activeField = 'all';
      searchQuery = '';
      rows = [];
      byYear = new Map();
      host.replaceChildren();
    },
  };
}
