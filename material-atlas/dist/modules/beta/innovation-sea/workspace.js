import {getLocale,html,msg,t} from '../../../i18n.js';
import {readPdfPages} from '../../../pdf-text.js';
import {DIRECTIONS,innovationPageTextLimit,innovationRevision,paperEvidence,samplePages} from './model.js';

const pageSize = 20;
const yearOf = paper => /^\d{4}$/.test(paper.year) ? String(paper.year) : '';
const titleOf = paper => paper.title || paper.filename || t('未命名文献');
const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);

function loadRecords(state) {
  return new Map(Object.entries(state?.papers || {}).filter(([,record]) =>
    typeof record?.fingerprint === 'string' && Array.isArray(record.points) &&
    record.points.length <= 3 && record.points.every(point =>
      point && Object.hasOwn(DIRECTIONS,point.direction) && typeof point.summary === 'string' &&
      typeof point.quote === 'string' && Number.isSafeInteger(point.page) && point.page > 0)));
}

export async function createInnovationSea(context) {
  const {host,on,services,getPapers,innovationAI,readPaperPdf,readLargePaperText,openPdfPage,openAISettings,toast,setCount} = context;
  let payload = await services.load();
  let records = loadRecords(payload.state);
  let errors = new Map(), run = null, limit = pageSize, papersById = new Map(), pending = [];

  host.innerHTML = html`
    <header class="innovation-header">
      <p>从每篇 PDF 提取 1–3 个有原文依据的创新点，沿发表年份查看研究从哪里找创新。</p>
      <button type="button" class="outline-button" data-sea-action="settings">AI 服务设置</button>
    </header>
    <div class="innovation-controls">
      <label>搜索文献<input type="search" data-sea-search placeholder="标题、作者或 DOI"></label>
      <label>发表年份<select data-sea-year></select></label>
      <label>提取状态<select data-sea-status></select></label>
      <button type="button" class="primary" data-sea-action="batch"></button>
      <button type="button" class="outline-button" data-sea-action="stop" hidden>停止提取</button>
    </div>
    <p class="innovation-hint">开始提取后，应用会将 PDF 文字发送给当前配置的 AI 服务。长文会抽样，扫描件需先 OCR。</p>
    <p class="innovation-status" role="status"></p>
    <section class="innovation-overview" aria-labelledby="innovation-directions">
      <h3 id="innovation-directions">创新方向</h3>
      <p class="innovation-coverage"></p>
      <div class="innovation-directions"></div>
    </section>
    <section class="innovation-timeline" aria-labelledby="innovation-years">
      <div class="innovation-timeline-header">
        <h3 id="innovation-years">年份时间线</h3>
        <label>创新方向<select data-sea-direction></select></label>
        <label>排序<select data-sea-order></select></label>
      </div>
      <div class="innovation-results"></div>
      <button type="button" class="outline-button" data-sea-action="more" hidden>显示更多文献</button>
    </section>`;

  const $ = selector => host.querySelector(selector);
  const search = $('[data-sea-search]'), year = $('[data-sea-year]'), status = $('[data-sea-status]');
  const direction = $('[data-sea-direction]'), order = $('[data-sea-order]');
  const feedback = $('.innovation-status');
  const action = name => $('[data-sea-action="' + name + '"]');

  function options(select, rows) {
    if (select.options.length === rows.length && rows.every(([id,label],i) =>
      select.options[i].value === id && select.options[i].text === label)) return;
    const value = select.value;
    select.replaceChildren(...rows.map(([id,label]) => new Option(label,id)));
    if (rows.some(([id]) => id === value)) select.value = value;
  }

  function savedFor(paper) {
    const record = records.get(paper.id);
    return record?.fingerprint === (paper.fingerprint || '') ? record : undefined;
  }
  function resultFor(paper) {
    const record = savedFor(paper);
    return record?.revision === innovationRevision ? record : undefined;
  }

  function paperCard(paper) {
    const result = resultFor(paper);
    const legacy = Boolean(savedFor(paper) && !result);
    const points = result?.points.filter(point => !direction.value || point.direction === direction.value) || [];
    const error = errors.get(paper.id);
    const working = run?.paperId === paper.id;
    const label = working ? t('正在提取…') : error || t(!paper.file ? '缺少 PDF' :
      result ? '原文证据不足' : legacy ? '旧版结果待重新核验' : '待提取');
    return `<article class="innovation-paper" data-paper-id="${escape(paper.id)}">
      <header><div><h4>${escape(titleOf(paper))}</h4>
      <p>${escape([paper.journal,paper.doi].filter(Boolean).join(' · '))}</p></div>
      ${paper.file ? `<button type="button" class="outline-button" data-sea-action="extract" ${run ? 'disabled' : ''}>${t(result || legacy ? '重新提取' : '提取创新点')}</button>` : ''}
      </header>
      ${!points.length || error || working ? `<p class="innovation-paper-status">${escape(label)}</p>` : ''}
      ${points.length ? `<ol class="innovation-points">${points.map(point => `
        <li><span class="innovation-tag">${escape(t(DIRECTIONS[point.direction]))}</span><p>${escape(point.summary)}</p>
        <blockquote>${escape(point.quote)}</blockquote>
        <button type="button" class="text-button innovation-source" data-sea-action="source" data-page="${point.page}">${escape(msg`查看 PDF 第 ${point.page} 页`)}</button></li>`).join('')}</ol>` : ''}
    </article>`;
  }

  function render() {
    const papers = [...papersById.values()];
    const years = [...new Set(papers.map(yearOf).filter(Boolean))].sort().reverse();
    options(year,[['',t('全部年份')],...years.map(value => [value,value]),['unknown',t('年份未知')]]);
    options(status,[['',t('全部状态')],['pending',t('待提取')],['done',t('已分析')],['failed',t('提取失败')]]);
    options(direction,[['',t('全部方向')],...Object.entries(DIRECTIONS).map(([id,label]) => [id,t(label)])]);
    options(order,[['desc',t('由近到远')],['asc',t('由远到近')]]);
    const query = search.value.trim().toLocaleLowerCase();
    const matching = papers.filter(paper =>
      (!query || [titleOf(paper),paper.authors,paper.doi].join(' ').toLocaleLowerCase().includes(query)) &&
      (!year.value || year.value === (yearOf(paper) || 'unknown')));
    const analyzed = matching.filter(resultFor);
    const counts = new Map();
    for (const paper of analyzed) {
      for (const {direction:id} of resultFor(paper).points) counts.set(id,(counts.get(id) || 0) + 1);
    }
    const ranked = [...counts].sort((a,b) => b[1] - a[1]);
    const total = ranked.reduce((sum,[,count]) => sum + count,0);
    $('.innovation-coverage').textContent = msg`已分析 ${analyzed.length} / ${matching.length} 篇 · ${total} 项创新点`;
    $('.innovation-directions').innerHTML = ranked.map(([id,count]) => `
      <button type="button" data-sea-direction-filter="${id}" aria-pressed="${direction.value === id}">
        <span>${escape(t(DIRECTIONS[id]))}</span><strong>${count}</strong>
        <span class="innovation-bar" aria-hidden="true"><i style="width:${100 * count / ranked[0][1]}%"></i></span>
      </button>`).join('');
    const visible = matching.filter(paper => {
      const result = resultFor(paper);
      return (!status.value || (status.value === 'failed' ? errors.has(paper.id) : status.value === 'done' ? result : !result)) &&
        (!direction.value || result?.points.some(point => point.direction === direction.value));
    }).sort((a,b) => {
      const first = yearOf(a), second = yearOf(b);
      if (!first || !second) return Number(!first) - Number(!second) || titleOf(a).localeCompare(titleOf(b));
      return (order.value === 'asc' ? first.localeCompare(second) : second.localeCompare(first)) ||
        titleOf(a).localeCompare(titleOf(b));
    });
    pending = visible.filter(paper => paper.file && (status.value === 'failed' || !resultFor(paper)));
    action('batch').textContent = msg`提取待处理文献（${pending.length} 篇）`;
    action('batch').disabled = Boolean(run) || !pending.length;
    action('stop').hidden = !run;
    action('more').hidden = visible.length <= limit;
    const groups = new Map();
    for (const paper of visible.slice(0,limit)) {
      const key = yearOf(paper);
      if (!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(paper);
    }
    $('.innovation-results').innerHTML = [...groups].map(([key,list]) => `
      <section class="innovation-year"><h4>${escape(key || t('年份未知'))}</h4><div>${list.map(paperCard).join('')}</div></section>`).join('') ||
      `<p class="innovation-hint">${t(papers.length ? '没有符合当前筛选的文献。' : '导入 PDF 后即可提取创新点。')}</p>`;
    setCount(msg`${visible.length} 篇文献`);
  }

  async function extract(papers, task) {
    const {signal} = task.controller;
    let done = 0, failed = 0, empty = 0, consecutiveAIError = 0;
    try {
      const service = await innovationAI.status();
      signal.throwIfAborted();
      if (!service.ready) throw Error(service.message);
      for (const [index,paper] of papers.entries()) {
        signal.throwIfAborted();
        task.paperId = paper.id;
        errors.delete(paper.id);
        feedback.textContent = msg`正在提取 ${index + 1} / ${papers.length} · ${titleOf(paper)}`;
        render();
        let points, calledAI = false;
        try {
          const pdfSignal = AbortSignal.any([signal,AbortSignal.timeout(45000)]);
          let sampled;
          try {
            sampled = await readPdfPages(readPaperPdf(paper),pdfSignal,samplePages,{maxPageChars:innovationPageTextLimit});
          } catch (error) {
            if (error.code !== 'PDF_READ_BUDGET' || !readLargePaperText) throw error;
            sampled = await readLargePaperText(paper,pdfSignal);
          }
          const pages = paperEvidence(sampled);
          if (!pages.length) throw Error('PDF 没有可提取的文字，请先进行 OCR。');
          calledAI = true;
          points = await innovationAI.extract({title:titleOf(paper).slice(0,2000),pages,locale:getLocale()},{signal});
          signal.throwIfAborted();
          consecutiveAIError = 0;
        } catch (error) {
          signal.throwIfAborted();
          errors.set(paper.id,error.name === 'TimeoutError' ? t('PDF 文本读取超时，可单独重试。') :
            error.message.replace(/^Error invoking remote method '[^']+': Error: /,''));
          failed++;
          if (calledAI && ++consecutiveAIError >= 3) {
            feedback.textContent = msg`AI 连续提取失败，批量处理已暂停 · 已保存 ${done + empty} 篇`;
            return;
          }
          continue;
        }
        const next = new Map(records).set(paper.id,{fingerprint:paper.fingerprint || '',revision:innovationRevision,points});
        await services.save({libraryKey:payload.libraryKey,state:{version:1,papers:Object.fromEntries(next)}});
        records = next;
        if (points.length) done++;
        else empty++;
      }
      feedback.textContent = msg`已提取 ${done} 篇 · 证据不足 ${empty} 篇 · 失败 ${failed} 篇`;
    } catch (error) {
      feedback.textContent = signal.aborted ? msg`已停止 · 已保存 ${done + empty} 篇` : error.message;
    } finally {
      run = null;
      render();
    }
  }

  function start(papers) {
    if (run || !papers.length) return;
    const task = {controller:new AbortController(),paperId:''};
    run = task;
    task.promise = extract(papers,task);
    render();
  }

  function refresh() {
    limit = pageSize;
    render();
  }

  on(search,'input',refresh);
  on(window,'materia-ai-service-changed',() => run?.controller.abort());
  for (const select of [year,status,direction,order]) on(select,'change',refresh);
  on(host,'click',async event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.seaDirectionFilter) {
      const id = button.dataset.seaDirectionFilter;
      direction.value = direction.value === id ? '' : id;
      refresh();
      return;
    }
    const paperId = button.closest('[data-paper-id]')?.dataset.paperId;
    const paper = papersById.get(paperId);
    switch (button.dataset.seaAction) {
      case 'settings': openAISettings(); break;
      case 'batch': start(pending); break;
      case 'extract': if (paper?.file) start([paper]); break;
      case 'stop': run?.controller.abort(); break;
      case 'more': limit += pageSize; render(); break;
      case 'source':
        try { await openPdfPage({paperId,page:Number(button.dataset.page)}); }
        catch (error) { toast(error.message,true); }
        break;
    }
  });

  async function flush() {
    const current = run;
    current?.controller.abort();
    await current?.promise;
  }

  return {
    render() {
      papersById = new Map(getPapers().map(paper => [paper.id,paper]));
      render();
    },
    flush,
    async reset() {
      payload = await services.load();
      records = loadRecords(payload.state);
      errors.clear();
      feedback.textContent = search.value = year.value = status.value = direction.value = '';
      limit = pageSize;
    },
  };
}
