import {html, msg, t} from '../i18n.js';
import {parseDelimited, readPredictionFile} from '../prediction-import.js';
import {browserCatalog, browserPlot, browserSample} from './browser.js';
import {exportPNG, svgImage} from './export.js';
import {defaults, emptyWorkspace, mapColumns, maxCells, maxColumns, maxRows, normalizeTable, preparePlot, readDraft, readWorkspace} from './model.js';
import {createMontage,montageHTML} from './montage.js';
import {plotMarkdownExample,readPlotMarkdown} from './markdown-plot.js';
import {sanitizeSVG} from './svg.js';
import {resolveFigureTheme} from './schemes/figure-themes.js';
import {escape, mappingHTML, parameterHTML, tableHTML, workspaceHTML} from './view.js';

const pageSize = 40;
const sampleName = 'example.csv';
const filename = name => (name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').slice(0, 100) || 'materia-figure');

export async function createFiguraController(context, native) {
  const host = context.host, find = key => host.querySelector('[data-fig="' + key + '"]');
  const button = action => host.querySelector('[data-fig-action="' + action + '"]');
  const draft = () => state.draft;
  const scheme = () => schemes.find(item => !item.error && item.id === draft()?.schemeId && item.version === draft()?.schemeVersion);
  const call = async (action, payload) => {
    try {
      return await native.figureCall(action, payload, libraryKey);
    } catch (error) {
      throw Error(error.message.replace(/^Error invoking remote method 'figura:call': (?:Error: )?/, ''));
    }
  };
  const catalog = () => native ? call('catalog') : browserCatalog();
  const sample = (item, name) => native ? call('sample', {id:item.id, version:item.version, name}) : browserSample(item, name);
  let state, libraryKey, schemes = [], disposed = false, tab = 'preview', page = 0, selectedProject = '';
  let revision = 0, savedRevision = 0, plotRevision = 0, saveTimer, plotTimer, saveQueue = Promise.resolve();
  let plot = null, activePlot, activeAction, undo = null, imported = null, confirmation = null;

  function status(message, error = false) {
    const notice = host.querySelector('dialog[open] [data-fig-dialog-status]') || find('notice');
    notice.textContent = message;
    notice.classList.toggle('is-error', error);
  }

  function showDialog(key) {
    const dialog = find(key);
    dialog.querySelector('[data-fig-dialog-status]').textContent = '';
    if (!dialog.open) dialog.showModal();
  }

  function plotStatus(message, error = false) {
    find('plot-status').textContent = message;
    find('plot-status').classList.toggle('is-error', error);
    find('data-error').textContent = error ? message : '';
  }

  function persist() {
    clearTimeout(saveTimer);
    if (revision === savedRevision) return saveQueue;
    const nextRevision = revision, snapshot = structuredClone(state), key = libraryKey;
    const operation = saveQueue.catch(() => {}).then(async () => {
      if (disposed || libraryKey !== key || nextRevision <= savedRevision) return;
      await context.services.save({libraryKey:key, state:snapshot});
      savedRevision = nextRevision;
      if (revision === savedRevision) find('save-status').textContent = t('草稿已自动保存');
    });
    saveQueue = operation;
    operation.catch(error => {
      find('save-status').textContent = t('草稿尚未保存');
      status(msg`绘图工作区未保存：${error.message}`, true);
    });
    return operation;
  }

  function changed(affectsPlot = true, edited = true) {
    if (edited && draft()) draft().touched = true;
    revision++;
    find('save-status').textContent = t('正在保存草稿…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persist().catch(() => {}), 450);
    if (affectsPlot) schedulePlot();
  }

  function schedulePlot() {
    plotRevision++;
    clearTimeout(plotTimer);
    if (!scheme()) return;
    find('stage').classList.toggle('is-stale', Boolean(plot));
    plotStatus(t('等待更新预览'));
    plotTimer = setTimeout(() => preview().catch(() => {}), 450);
  }

  async function renderPlot(item, snapshot) {
    if (!item) throw Error(t('项目所需方案或版本未安装。原数据可从「项目」备份。'));
    const {params:{width,height}} = preparePlot(item,snapshot), size = {width,height};
    const source = native ? await call('render',snapshot) : await browserPlot(item,snapshot);
    return {svg:sanitizeSVG(source,size),size};
  }

  async function preview() {
    clearTimeout(plotTimer);
    const item = scheme(), wanted = plotRevision;
    if (!item) return null;
    while (activePlot) await activePlot.catch(() => {});
    if (disposed || wanted !== plotRevision) return null;
    if (plot?.revision === wanted) return plot;
    const snapshot = structuredClone(draft());
    const operation = (async () => {
      plotStatus(t('正在绘图…'));
      try {
        const {svg,size} = await renderPlot(item,snapshot);
        if (disposed || wanted !== plotRevision) return null;
        const image = find('image');
        image.src = svgImage(svg);
        image.hidden = false;
        find('placeholder').hidden = true;
        find('stage').classList.remove('is-stale');
        plotStatus(msg`${size.width} × ${size.height} px · 预览已更新`);
        return plot = {svg, size, revision:wanted};
      } catch (error) {
        if (!disposed && wanted === plotRevision) {
          plotStatus((plot ? t('预览待更新：', false) : '') + error.message, true);
        }
        throw error;
      }
    })();
    activePlot = operation;
    try {
      return await operation;
    } finally {
      if (activePlot === operation) activePlot = null;
    }
  }

  function gallery() {
    const query = find('query').value.trim().normalize('NFKC').toLowerCase(), category = find('category').value;
    find('schemes').innerHTML = schemes.filter(item => {
      const info = state.metadata[item.id] || item;
      return (!category || item.category === category) && [info.name, info.description, item.category, item.id].join(' ').normalize('NFKC').toLowerCase().includes(query);
    }).map(item => {
      const info = state.metadata[item.id] || item, active = item === scheme();
      return html`<button type="button" class="figura-scheme" data-fig-action="select-scheme" data-id="${escape(item.id)}" aria-pressed="${active}" ${item.error ? 'disabled' : ''} title="${escape(item.error || info.description || info.name)}">
        ${item.error ? '' : `<img src="${escape(info.cover?.startsWith('data:') ? info.cover : item.coverURL)}" alt="" loading="lazy">`}
        <span><strong>${escape(info.name)}</strong><small>${escape(item.error || item.category)}${item.user ? ' · ' + t('自定义') : ''}</small></span></button>`;
    }).join('') || html`<p class="figura-help">没有匹配的方案。</p>`;
    context.setCount(msg`${schemes.filter(item => !item.error).length} 个方案`);
  }

  function updateCatalog() {
    const select = find('category'), current = select.value;
    const categories = [...new Set(schemes.map(item => item.category).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'zh'));
    select.innerHTML = html`<option value="">全部分类</option>` + categories.map(category => `<option>${escape(category)}</option>`).join('');
    if (categories.includes(current)) select.value = current;
    gallery();
  }

  function updateProjects() {
    find('projects-list').innerHTML = html`<option value="">选择项目</option>` + state.projects.map((project, index) =>
      `<option value="${index}">${escape(project.name || t('未命名绘图'))}</option>`).join('');
    find('projects-list').value = selectedProject;
    for (const action of ['open-project', 'delete-project']) button(action).disabled = !find('projects-list').value;
    for (const action of ['save-copy', 'backup-project']) button(action).disabled = !draft();
  }

  function chooseTab(next) {
    tab = next;
    find('preview-page').hidden = tab !== 'preview';
    find('data-page').hidden = tab !== 'data';
    button('preview-tab').setAttribute('aria-pressed', String(tab === 'preview'));
    button('data-tab').setAttribute('aria-pressed', String(tab === 'data'));
  }

  function updateTable() {
    if (!scheme()) return;
    const rows = draft().rows, last = Math.max(0, Math.ceil((rows.length - 1) / pageSize) - 1);
    page = Math.max(0, Math.min(last, page));
    const start = page * pageSize + 1, end = Math.min(rows.length, start + pageSize);
    find('table').innerHTML = tableHTML(rows, start, end);
    find('mapping').innerHTML = mappingHTML(scheme(), draft());
    find('range').textContent = rows.length > 1 ? `${start}–${end - 1} / ${rows.length - 1}` : '0';
    find('dataset').textContent = msg`${rows.length - 1} 行 · ${rows[0].length} 列`;
    button('prev-page').disabled = !page;
    button('next-page').disabled = page >= last;
    button('undo-data').hidden = !undo;
    button('add-row').disabled = rows.length > maxRows || (rows.length + 1) * rows[0].length > maxCells;
    button('add-column').disabled = rows[0].length >= maxColumns || (rows[0].length + 1) * rows.length > maxCells;
  }

  function clearPlot() {
    plot = null;
    find('image').hidden = true;
    find('image').removeAttribute('src');
    find('placeholder').hidden = false;
    find('stage').classList.remove('is-stale');
    plotStatus('');
  }

  function renderTheme() {
    const item=scheme(), theme=item && resolveFigureTheme(draft().themeId), swatches=find('theme-swatches');
    const select=find('theme');
    select.value=theme?.id || '';
    select.disabled=!item;
    swatches.hidden=!theme;
    swatches.innerHTML=theme ? theme.series.slice(0,4).map(color=>`<i style="background:${color}"></i>`).join('') : '';
    find('theme-note').hidden=!theme;
  }

  function renderDraft() {
    const item = scheme(), value = draft();
    for (const action of ['data-tab', 'parameters', 'export', 'refresh']) button(action).disabled = !item;
    button('save').disabled = !value;
    find('name').disabled = !value;
    find('name').value = value?.name || '';
    find('requirements').textContent = item?.dataDescription || '';
    button('style-sample').hidden = !item?.samples.includes('style-example.csv');
    find('sheets').hidden = !imported;
    find('metadata-panel').hidden = !item;
    if (item) {
      value.params = {...defaults(item), ...value.params};
      find('controls').innerHTML = parameterHTML(item, value);
      updateTable();
    } else {
      chooseTab('preview');
      if (value) status(t('项目所需方案或版本未安装。原数据可从「项目」备份。'), true);
    }
    updateProjects();
    renderTheme();
    gallery();
  }

  function activate(value) {
    state.draft = value;
    undo = null;
    imported = null;
    page = 0;
    clearPlot();
    chooseTab('preview');
    renderDraft();
    changed(true, false);
  }

  async function saveProject(copy = false) {
    if (!draft()) return;
    const project = structuredClone(draft());
    project.name = project.name.trim() || t('未命名绘图');
    if (copy) project.name = msg`${project.name.slice(0, 230)} 副本`;
    if (copy || !project.projectId) project.projectId = crypto.randomUUID();
    const index = state.projects.findIndex(item => item.projectId === project.projectId);
    if (index < 0 && state.projects.length >= 200) throw Error(t('项目已达 200 个，请备份后整理。'));
    delete project.touched;
    state.draft = structuredClone(project);
    state.projects[index < 0 ? state.projects.length : index] = project;
    selectedProject = String(index < 0 ? state.projects.length - 1 : index);
    find('name').value = project.name;
    changed(false, false);
    await persist();
    updateProjects();
    status(t('项目已保存'));
  }

  function confirm(message, work, canSave = false) {
    confirmation = work;
    find('confirm-text').textContent = message;
    button('confirm-save').hidden = !canSave;
    showDialog('confirm');
  }

  async function replaceDraft(work) {
    if (draft()?.touched) confirm(t('当前草稿有未存入项目的修改。切换前可以先保存。'), work, true);
    else await work();
  }

  async function selectScheme(id) {
    const item = schemes.find(candidate => candidate.id === id && !candidate.error);
    if (!item || item === scheme()) return;
    const rows = normalizeTable(parseDelimited(await sample(item, sampleName)));
    await replaceDraft(async () => {
      activate({schemeId:item.id, schemeVersion:item.version, name:t('未命名绘图'), rows, mapping:mapColumns(item, rows[0]), params:defaults(item), themeId:draft()?.themeId});
      status(t('已载入合成示例。可在「数据」中导入自己的表格。'));
      void preview().catch(() => {});
    });
  }

  function replaceData(rows) {
    const normalized = normalizeTable(rows);
    undo = {rows:draft().rows, mapping:draft().mapping};
    draft().rows = normalized;
    draft().mapping = mapColumns(scheme(), normalized[0], draft().mapping);
    page = 0;
    updateTable();
    changed();
  }

  async function importData(file) {
    const data = await readPredictionFile(file);
    const sheet = find('sheet');
    if (data.sheets.length === 1) {
      const {rows, formulaCount} = data.sheets[0];
      replaceData(rows);
      imported = null;
      find('sheets').hidden = true;
      status(formulaCount ? t('已导入表格。公式使用 Excel 保存的结果。') : t('已导入表格，请核对字段映射。'));
      return;
    }
    imported = data;
    sheet.innerHTML = data.sheets.map((item, index) => `<option value="${index}">${escape(item.name)}</option>`).join('');
    find('sheets').hidden = false;
    status(t('请选择工作表并应用。'));
  }

  async function importProject(file) {
    if (file.size > 64 * 1024 * 1024) throw Error(t('备份文件超过 64 MB。'));
    const value = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
    if (!Object.hasOwn(value ?? {}, 'schemaVersion')) {
      const project = {...readDraft(value), touched:true};
      delete project.projectId;
      await replaceDraft(async () => {
        find('projects').close();
        activate(project);
        await persist();
      });
      return;
    }
    const incoming = readWorkspace(value);
    if (state.projects.length + incoming.projects.length > 200) throw Error(t('项目已达 200 个，请备份后整理。'));
    const apply = async () => {
      find('projects').close();
      const projects = incoming.projects.map(item => ({...item, projectId:crypto.randomUUID()}));
      state.projects.push(...projects);
      state.metadata = {...incoming.metadata, ...state.metadata};
      if (incoming.montage) state.montage=incoming.montage;
      const working = incoming.draft ? {...incoming.draft, touched:true} : null;
      if (working) delete working.projectId;
      if (working) activate(working);
      else {
        renderDraft();
        changed(false, false);
      }
      await persist();
      status(msg`已导入 ${projects.length} 个已保存项目`);
    };
    if (incoming.montage && state.montage?.panels.length) {
      confirm(t('导入会替换当前拼版草稿。当前图稿可先保存。'),apply,Boolean(draft()?.touched));
    } else await replaceDraft(apply);
  }

  function openMarkdownImport() {
    const projectOptions=state.projects.filter(project=>project.projectId).map(project=>
      `<option value="project:${escape(project.projectId)}">${escape(project.name || t('未命名绘图'))} · ${escape(project.projectId.slice(0,8))}</option>`).join('');
    const schemeOptions=schemes.filter(item=>!item.error).map(item=>
      `<option value="scheme:${escape(item.id)}">${escape(item.name)} · ${escape(item.id)}</option>`).join('');
    const select=find('markdown-template');
    select.innerHTML=html`<optgroup label="绘图方案">${schemeOptions}</optgroup>`+
      (projectOptions?html`<optgroup label="已保存项目">${projectOptions}</optgroup>`:'');
    const preferred=scheme()?.id||'grouped-line';
    if([...select.options].some(option=>option.value==='scheme:'+preferred))select.value='scheme:'+preferred;
    button('markdown-template').disabled=!select.value;
    showDialog('markdown-import');
  }

  function markdownSource(config) {
    const project=config.project&&state.projects.find(item=>item.projectId===config.project);
    if(config.project&&!project)throw Error(t('找不到该编号的绘图项目。'));
    const item=schemes.find(item=>!item.error&&item.id===(project?.schemeId||config.scheme)&&(!project||item.version===project.schemeVersion));
    if(!item)throw Error(t('找不到该编号对应的绘图方案或版本。'));
    return {project,item};
  }

  async function downloadMarkdown() {
    const selection=find('markdown-template').value, separator=selection.indexOf(':');
    const type=selection.slice(0,separator), id=selection.slice(separator+1);
    const {project,item}=markdownSource({[type]:id});
    const styleExample=project?.params.figureStyle&&project.params.figureStyle!=='Figura 默认'&&item.samples.includes('style-example.csv');
    const csv=await sample(item,styleExample?'style-example.csv':sampleName);
    await context.saveText(plotMarkdownExample({scheme:item.id,project:project?.projectId,name:project?.name||item.name,csv}),
      'Materia-'+filename(project?.name||item.id)+'-绘图参考.md','md');
  }

  async function importMarkdown(file) {
    if(file.size>20*1024*1024)throw Error(t('Markdown 文件最多 20 MB。'));
    const input=readPlotMarkdown(await file.text()), {project,item}=markdownSource(input);
    const value={
      schemeId:item.id,schemeVersion:item.version,name:input.name||file.name.replace(/\.m(?:d|arkdown)$/i,'').slice(0,250),
      rows:input.rows,mapping:mapColumns(item,input.rows[0],project?.mapping),
      params:{...defaults(item),...project?.params},themeId:project?.themeId,touched:true,
    };
    preparePlot(item,value);
    await replaceDraft(async()=>{
      find('markdown-import').close();
      activate(value);
      await preview();
      await persist();
      status(t('Markdown 已导入并生成预览。'));
    });
  }

  function updateExportSize() {
    const {width, height} = draft().params, dpi = Number(find('dpi').value);
    find('export-size').textContent = Number(width) > 0 && Number(height) > 0
      ? `PNG · ${Math.round(width*dpi/96)} × ${Math.round(height*dpi/96)} px  /  ${dpi} DPI` : '';
  }

  function download(blob, name) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 3000);
  }

  async function exportFigure(type) {
    const latest = await preview();
    if (!latest) throw Error(t('数据已变化，请重新导出。'));
    await saveFigure(latest,type,draft().name,Number(find('dpi').value));
  }

  async function saveFigure(latest,type,label,dpi,automatic=false) {
    const name = filename(label) + '.' + type;
    let result;
    if (type === 'svg') result = native ? await call('saveFigure',{filename:name,type,svg:latest.svg,automatic}) : await context.saveText(latest.svg,name,'svg');
    if (type === 'png') {
      const {blob} = await exportPNG(latest.svg, latest.size, dpi);
      if (native) result = await call('saveFigure',{filename:name,type,bytes:new Uint8Array(await blob.arrayBuffer()),automatic});
      else download(blob, name);
    }
    if (type === 'pdf') {
      const bytes = await call('pdf',{svg:latest.svg,...latest.size,montage:latest.montage===true});
      result = await call('saveFigure',{filename:name,type,bytes,automatic});
    }
    status(result?.canceled ? t('已取消导出') : msg`${type.toUpperCase()} 已导出`);
    return result;
  }

  async function rescan() {
    const active = scheme();
    schemes = await catalog();
    updateCatalog();
    if (Boolean(active) !== Boolean(scheme())) {
      clearPlot();
      renderDraft();
      schedulePlot();
    }
  }

  async function saveMetadata(reset = false) {
    const item = scheme();
    if (!item) return;
    if (reset) delete state.metadata[item.id];
    else {
      const file = find('cover').files[0];
      let cover = state.metadata[item.id]?.cover;
      if (file) {
        if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 3 * 1024 * 1024) throw Error(t('封面须为 3 MB 以内的 PNG 或 JPEG。'));
        cover = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
      }
      state.metadata[item.id] = {name:find('scheme-name').value.trim() || item.name, description:find('description').value, ...(cover ? {cover} : {})};
    }
    changed(false, false);
    await persist();
    gallery();
    showMetadata();
    status(t('方案资料已保存'));
  }

  function showMetadata() {
    const item = scheme();
    find('metadata-panel').hidden = !item;
    if (!item) return;
    const info = state.metadata[item.id] || item;
    find('scheme-name').value = info.name;
    find('description').value = info.description || '';
    find('cover').value = '';
  }

  function editTable(action, index) {
    const value = draft();
    const rows = value.rows, cols = rows[0].length;
    undo = {rows:structuredClone(rows), mapping:{...value.mapping}};
    if (action === 'add-row') {
      rows.push(Array(cols).fill(''));
      page = Math.floor((rows.length - 2) / pageSize);
    }
    if (action === 'add-column') {
      let suffix = cols + 1;
      while (rows[0].includes(t('列') + suffix)) suffix++;
      rows[0].push(t('列') + suffix);
      for (const row of rows.slice(1)) row.push('');
    }
    if (action === 'delete-row') rows.splice(index, 1);
    if (action === 'delete-column') {
      const header = rows[0][index];
      for (const row of rows) row.splice(index, 1);
      for (const field of Object.keys(value.mapping)) if (value.mapping[field] === header) value.mapping[field] = '';
    }
    updateTable();
    changed();
    const target = action === 'add-row' ? '[data-fig-row="'+(rows.length-1)+'"][data-fig-column="0"]'
      : action === 'add-column' ? '[data-fig-row="0"][data-fig-column="'+cols+'"]' : '[data-fig="table"]';
    host.querySelector(target)?.focus();
  }

  function run(work) {
    if (activeAction) {
      status(t('请等待当前操作完成。'));
      return;
    }
    const operation = Promise.resolve().then(work);
    activeAction = operation;
    operation.catch(error => status(error.message, true)).finally(() => {
      if (activeAction === operation) activeAction = null;
    });
  }

  const actions = {
    'select-scheme': control => selectScheme(control.dataset.id),
    'preview-tab': () => chooseTab('preview'),
    'data-tab': () => chooseTab('data'),
    refresh: () => preview(),
    parameters: () => showDialog('parameters'),
    'reset-params': () => {
      draft().params = defaults(scheme());
      find('controls').innerHTML = parameterHTML(scheme(), draft());
      changed();
    },
    export: () => { updateExportSize(); showDialog('export-dialog'); },
    montage: () => montage.show(),
    svg: () => exportFigure('svg'),
    png: () => exportFigure('png'),
    pdf: () => exportFigure('pdf'),
    projects: () => { updateProjects(); showDialog('projects'); },
    'quick-import':openMarkdownImport,
    'choose-markdown':()=>find('markdown-file').click(),
    'markdown-template':downloadMarkdown,
    save: () => saveProject(),
    'save-copy': () => saveProject(true),
    'open-project': () => {
      const project = state.projects[Number(selectedProject)];
      if (!project) return;
      return replaceDraft(() => {
        find('projects').close();
        activate(structuredClone(project));
      });
    },
    'delete-project': () => {
      const project = state.projects[Number(selectedProject)];
      if (!project) return;
      confirm(msg`删除已保存项目「${project.name}」？`, async () => {
        state.projects = state.projects.filter(item => item !== project);
        if (draft()?.projectId === project.projectId) delete draft().projectId;
        selectedProject = '';
        changed(false, false);
        await persist();
        updateProjects();
        status(t('已删除项目'));
      });
    },
    'import-project': () => find('project-file').click(),
    'backup-project': () => context.saveText(JSON.stringify(draft(), null, 2), filename(draft().name)+'.figura.json', 'json'),
    'backup-workspace': () => context.saveText(JSON.stringify(state, null, 2), 'materia-figura-workspace.json', 'json'),
    'choose-data': () => find('file').click(),
    'apply-sheet': () => {
      const {rows, formulaCount} = imported.sheets[Number(find('sheet').value)];
      replaceData(rows);
      status(formulaCount ? t('已导入表格。公式使用 Excel 保存的结果。') : t('已导入表格，请核对字段映射。'));
    },
    sample: async () => replaceData(parseDelimited(await sample(scheme(), sampleName))),
    'style-sample': async () => replaceData(parseDelimited(await sample(scheme(), 'style-example.csv'))),
    'undo-data': () => {
      Object.assign(draft(), undo);
      undo = null;
      updateTable();
      changed();
    },
    'prev-page': () => { page--; updateTable(); },
    'next-page': () => { page++; updateTable(); },
    schemes: () => { showMetadata(); showDialog('schemes-dialog'); },
    scan: async () => { await rescan(); status(t('方案目录已刷新')); },
    install: async () => {
      const result = await call('install');
      if (!result) return;
      await rescan();
      status(msg`已安装「${result.name}」`);
    },
    folder: () => call('openFolder'),
    metadata: () => saveMetadata(),
    'reset-metadata': () => saveMetadata(true),
    async 'confirm-save'() { await saveProject(); await actions.confirm(); },
    async confirm() {
      const work = confirmation;
      confirmation = null;
      find('confirm').close();
      await work?.();
    },
    done: control => control.closest('dialog').close(),
  };
  for (const action of ['add-row', 'add-column', 'delete-row', 'delete-column']) actions[action] = control => editTable(action, Number(control.dataset.index));

  async function load() {
    if (native && !native.figureCall) throw Error(t('请重新启动 Materia。'));
    const payload = await context.services.load();
    libraryKey = payload.libraryKey;
    state = payload.state ? readWorkspace(payload.state) : emptyWorkspace();
    schemes = await catalog();
  }

  await load();
  host.innerHTML = workspaceHTML(Boolean(native)) + montageHTML(Boolean(native));
  const montage = createMontage({
    dialog:find('montage'),on:context.on,read:()=>state.montage,
    write:value=>{state.montage=value;changed(false,false);},
    getDraft:()=>scheme()?draft():null,getProjects:()=>state.projects,
    plot:project=>renderPlot(schemes.find(item=>!item.error&&item.id===project.schemeId&&item.version===project.schemeVersion),project),
    save:saveFigure,run,images:native?call:null,
  });
  updateCatalog();
  renderDraft();
  schedulePlot();

  context.on(host, 'input', ({target}) => {
    const {fig, figParam, figMap, figRow, figColumn} = target.dataset;
    if (fig === 'query' || fig === 'category') gallery();
    if (fig === 'name') { draft().name = target.value; changed(false); }
    if (fig === 'theme') {
      if (target.value) draft().themeId=target.value;
      else delete draft().themeId;
      renderTheme();
      find('controls').innerHTML=parameterHTML(scheme(),draft());
      changed();
    }
    if (fig === 'dpi') updateExportSize();
    if (figParam) { draft().params[figParam] = target.value; changed(); }
    if (figMap) { draft().mapping[figMap] = target.value; changed(); }
    if (figRow === undefined) return;
    const row = Number(figRow), column = Number(figColumn), values = draft().rows[row], previous = values[column];
    values[column] = target.value;
    if (!row) {
      for (const field of Object.keys(draft().mapping)) if (previous && draft().mapping[field] === previous) draft().mapping[field] = target.value;
      find('mapping').innerHTML = mappingHTML(scheme(), draft());
    }
    undo = null;
    button('undo-data').hidden = true;
    changed();
  });

  context.on(host, 'change', ({target}) => {
    if (target === find('projects-list')) {
      selectedProject = target.value;
      for (const action of ['open-project', 'delete-project']) button(action).disabled = !selectedProject;
    }
    if (![find('file'),find('project-file'),find('markdown-file')].includes(target)) return;
    const [file] = target.files;
    target.value = '';
    if (file) run(() => target===find('file')?importData(file):target===find('markdown-file')?importMarkdown(file):importProject(file));
  });

  context.on(host, 'paste', event => {
    const {figRow, figColumn} = event.target.dataset;
    const clipboard = event.clipboardData?.getData('text/plain');
    if (figRow === undefined || !clipboard?.includes('\t')) return;
    event.preventDefault();
    run(() => {
      const paste = clipboard.replace(/\r?\n$/, '').split(/\r?\n/).map(row => row.split('\t'));
      const row = Number(figRow), column = Number(figColumn), rows = structuredClone(draft().rows);
      const height = Math.max(rows.length, row + paste.length);
      const width = Math.max(rows[0].length, ...paste.map(line => column + line.length));
      if (height > maxRows + 1 || width > maxColumns || height * width > maxCells) throw Error(t('粘贴区域超过表格上限。'));
      while (rows.length < height) rows.push([]);
      for (let index = rows[0].length; index < width; index++) rows[0][index] = t('列') + (index + 1);
      paste.forEach((values, offset) => values.forEach((value, pos) => { rows[row + offset][column + pos] = value; }));
      const originalPage = page;
      replaceData(rows);
      page = originalPage;
      updateTable();
      host.querySelector(`[data-fig-row="${row}"][data-fig-column="${column}"]`)?.focus();
    });
  });

  context.on(host, 'click', event => {
    const control = event.target.closest('[data-fig-action]'), action = control?.dataset.figAction;
    if (!action || !Object.hasOwn(actions, action) || control.disabled) return;
    if (action === 'done' || action === 'choose-data' || action === 'import-project' || action === 'choose-markdown') actions[action](control);
    else run(() => actions[action](control));
  });

  for (const type of ['dragenter', 'dragover', 'drop']) context.on(host, type, event => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    event.stopPropagation();
    if (type !== 'drop') return;
    const [file] = event.dataTransfer.files;
    if (!file) return;
    if (/\.m(?:d|arkdown)$/i.test(file.name)) run(() => importMarkdown(file));
    else if (/\.json$/i.test(file.name)) run(() => importProject(file));
    else if (!scheme()) status(t('请先选择绘图方案。'), true);
    else run(async () => {
      chooseTab('data');
      await importData(file);
    });
  });

  context.on(host, 'keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && draft()) {
      event.preventDefault();
      run(() => saveProject());
    }
    if (event.target.closest('dialog')) event.stopPropagation();
  });

  return {
    render() { context.setCount(msg`${schemes.filter(item => !item.error).length} 个方案`); },
    async flush() {
      await activeAction?.catch(() => {});
      await persist();
    },
    async reset() {
      plotRevision++;
      clearTimeout(plotTimer);
      clearTimeout(saveTimer);
      for (const dialog of host.querySelectorAll('dialog[open]')) dialog.close();
      await load();
      revision = savedRevision = 0;
      saveQueue = Promise.resolve();
      selectedProject = '';
      undo = imported = confirmation = null;
      page = 0;
      status('');
      find('save-status').textContent = '';
      clearPlot();
      chooseTab('preview');
      updateCatalog();
      renderDraft();
      schedulePlot();
    },
    dispose() {
      disposed = true;
      clearTimeout(plotTimer);
      clearTimeout(saveTimer);
    },
  };
}
