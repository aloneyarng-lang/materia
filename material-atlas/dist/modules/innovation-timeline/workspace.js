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

export function createInnovationTimeline({host, on, getPapers, getSelectedIds, openPaper, services, setCount, toast, saveText, isReady, signal, fields = ['innovations'], label = '创新点时间线'}) {
  const combined = fields.length > 1;
  const limitationsOnly = fields[0] === 'limitations';
  const directionTitle = combined ? '研究方向' : limitationsOnly ? '局限方向' : '创新方向';
  const emptyMessage = combined ? '尚未录入创新点或局限性。' : limitationsOnly ? '尚未录入局限性。' : '尚未录入创新点。';
  const listId = host.id + '-directions';
  let saved;
  let libraryKey;
  let pending;
  let loading;
  let activeDirection = null;
  let generation = 0;
  let rows = [];
  let byYear = new Map();

  function renderContent({resetScroll = false} = {}) {
    const previousScroll = resetScroll ? 0 : host.querySelector('.timeline-years')?.scrollTop ?? 0;
    const selection = getSelectedIds();
    const papers = getPapers().filter(paper => !selection.size || selection.has(paper.id));
    rows = papers.flatMap(paper => {
      const year = String(paper.year ?? '').trim();
      return fields.flatMap(field => (paper[field] || []).map(text => {
        const key = JSON.stringify(field === 'innovations' ? [paper.id, text] : [paper.id, field, text]);
        return {paper, text, field, key, year: /^\d{4}$/.test(year) ? year : '', direction: saved[key] || ''};
      }));
    }).sort((a,b) => (Number(a.year || Infinity) - Number(b.year || Infinity)) || a.paper.title.localeCompare(b.paper.title));
    const counts = new Map();
    for (const {direction} of rows) counts.set(direction, (counts.get(direction) || 0) + 1);
    if (!counts.has(activeDirection)) activeDirection = null;
    const visible = rows.map((row,index) => ({...row,index})).filter(row => activeDirection === null || row.direction === activeDirection);
    byYear = Map.groupBy(visible, row => row.year);
    const labels = [...new Set([...knownDirections, ...counts.keys()].filter(Boolean))].sort((a,b) =>
      directionLabel(a).localeCompare(directionLabel(b)));
    const filter = (label, count, value) => `<button type="button" class="outline-button" data-timeline-filter="${escape(value)}" aria-pressed="${activeDirection === value}">${escape(label)} <span>${count}</span></button>`;
    const innovationCount = rows.filter(row => row.field === 'innovations').length;
    const limitationCount = rows.length - innovationCount;
    const totals = [
      ...(fields.includes('innovations') ? [msg`创新点 · ${innovationCount} 条`] : []),
      ...(fields.includes('limitations') ? [msg`局限性 · ${limitationCount} 条`] : []),
    ].join(' / ');
    setCount('');
    host.innerHTML = html`
      <div class="timeline-toolbar">
        <p>${escape(selection.size ? msg`已选 ${papers.length} 篇文献` : t('全部文献'))} · ${escape(totals)}</p>
        <button type="button" class="outline-button" data-action="select-timeline-papers">${escape(t(selection.size ? '调整文献选择' : '选择文献'))}</button>
        <button type="button" class="outline-button" data-timeline-classify ${!counts.has('') || pending ? 'disabled' : ''}>自动归类</button>
        <button type="button" class="outline-button" data-timeline-export ${!visible.length || pending ? 'disabled' : ''}>导出 Markdown</button>
      </div>
      ${rows.length ? `<div class="timeline-filters" role="group" aria-label="${escape(t(directionTitle))}">
        <button type="button" class="outline-button" data-timeline-all aria-pressed="${activeDirection === null}">${escape(t('全部方向'))} <span>${rows.length}</span></button>
        ${labels.filter(label => counts.has(label)).map(label => filter(directionLabel(label),counts.get(label),label)).join('')}
        ${counts.has('') ? filter(t('未归类'),counts.get(''),'') : ''}
      </div>` : `<p class="timeline-empty">${escape(t(emptyMessage))}</p>`}
      <datalist id="${escape(listId)}">${labels.map(label => `<option value="${escape(directionLabel(label))}"></option>`).join('')}</datalist>
      ${visible.length ? html`<div class="timeline-years" role="region" aria-label="${escape(t(label))}" tabindex="0">${[...byYear].map(([year,points]) => `
        <section class="timeline-year">
          <h2>${escape(year || t('年份待补充'))}</h2>
          <ol>${points.map(({paper,text,field,direction,index}) => `<li>
            ${combined ? `<small>${escape(t(field === 'limitations' ? '局限性' : '创新点'))}</small>` : ''}
            <p class="timeline-point">${escape(text)}</p>
            <div class="timeline-source">
              <button type="button" class="text-button" data-timeline-paper="${escape(paper.id)}">${escape(paper.title)}</button>
              ${paper.journal ? `<span>${escape(paper.journal)}</span>` : ''}
            </div>
            <label class="timeline-direction">${escape(t(directionTitle))}
              <input type="text" list="${escape(listId)}" maxlength="60" data-timeline-direction="${index}" value="${escape(directionLabel(direction))}" placeholder="${escape(t('未归类'))}" ${pending ? 'disabled' : ''}>
            </label>
          </li>`).join('')}</ol>
        </section>`).join('')}</div>` : ''}`;
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
      const state = {...latest.state};
      for (const [entry, value] of next) {
        if (value) state[entry] = value;
        else delete state[entry];
      }
      await services.save({libraryKey: key, state});
      if (generation === version) saved = state;
    });
    directionWrites = pending.catch(() => {});
    try { await pending; }
    catch (error) { toast(error.message, true); }
    finally { pending = null; if (!signal.aborted && generation === version) renderContent(); }
  }

  on(host, 'change', event => {
    const index = event.target.dataset.timelineDirection;
    const row = index === undefined ? null : rows[Number(index)];
    if (!row || pending) return;
    const value = event.target.value.trim();
    const direction = directions.find(([label]) => t(label) === value)?.[0] || value;
    if (direction === row.direction) return;
    save(new Map([[row.key, direction]]));
  });
  async function exportTimeline() {
    const plain = value => String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/[\\`*_\[\]<>]/g, '\\$&').trim();
    const lines = ['# ' + t(label)];
    for (const [year, entries] of byYear) {
      lines.push('', '## ' + (year || t('年份待补充')), '');
      for (const {paper, text, field, direction} of entries) {
        const kind = combined ? '**' + t(field === 'limitations' ? '局限性' : '创新点') + '** · ' : '';
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
    const {timelineFilter, timelineAll, timelinePaper, timelineClassify, timelineExport} = button.dataset;
    if (timelineFilter !== undefined || timelineAll !== undefined) {
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
      rows = [];
      byYear = new Map();
      host.replaceChildren();
    },
  };
}
