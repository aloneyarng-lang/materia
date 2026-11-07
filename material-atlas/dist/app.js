import {t as tr,html,msg} from './i18n.js';
import {LANGUAGES,getLocale,setLocale,initializeLocale,bindStaticDOM,onLocaleChange} from './i18n.js';
import {readingStatusOf} from './reading-status.js';
import {createReadingStatusController,readingStatusBadge,readingStatusHeading} from './reading-status-ui.js';
import {createGroupActions} from './group-actions.js';
import {activityHTML} from './import-activity.js';
import {createResearchCanvas} from './research-canvas.js';
import {createMaterialList} from './material-list.js';
import {createWorkspaceModules} from './workspace-modules.js';
import {createWorkspaceChrome} from './workspace-chrome.js';
import { paperMaterials, paperMeasurements, normalizePaperMaterials } from './materials.js';
import { relatedPaperGroups, relatedPaperSections } from './related-papers.js';
import {icon,hydrateIcons} from './icons.js';
import {actionMenu,initActionMenus} from './action-menus.js';
import { createPDFReader } from './reader.js';
import { getPapers, putPaper, putPapers, deletePaper, deletePapers, restorePapers, bulkEdit, getSetting, setSetting, normalizeTags, bytesLabel, createBackup, readBackup, mergeBackup, getImportActivity, setReadingStatus } from './storage.js';
import { PALETTE } from './palette.js';
import { createBatchImporter } from './batch-import.js';
import { createComparison } from './comparison.js';
import { createPerformanceEditor } from './performance-editor.js';
import { markdownTemplate } from './markdown.js';
import { mergeImportNotes } from './import-plan.js';
import { isOldExample, removeOldExampleNotes } from './example-migration.js';
import { StarMap, countLinks, tagGroups } from './graph.js';
import { eligibleTags } from './tags.js';
import { createBulkEditor } from './bulk-edit.js';
import { createPaperActions } from './paper-actions.js';
import { createParameterFinder, parameterInventory, parameterResults, parameterNameKey, parameterRecordPreview } from './parameter-index.js';
import {getGraphThemeOptions} from './graph-appearance.js';
import { GRAPH_DEFAULTS, cleanGraphSettings } from './graph-settings.js';
import {similarityLocalPapers} from './paper-similarity.js';
import { createAssociationController, cleanAssociations, associationLocalPapers, associationMatches } from './associations.js';
import { createThemeController } from './themes.js';
import { createAgentController } from './ai-agent.js';
import {createVocabularyController} from './vocabulary-ui.js';
import {readStudy} from './study-client.js';
import { BUNDLED_METRICS, JOURNAL_DATA_CHECKED, seedJournalMetrics } from './journal-data.js';
import { createNotesController } from './notes.js';
import { normalizeAuthors, authorsText, numericImpact, impactOf, filterCatalog, parseMetrics, mergeMetrics, matchMetadata } from './catalog.js';
bindStaticDOM(document.body);
await initializeLocale();
const native = globalThis.materiaDesktop;

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const displayTitle = value => escape(String(value ?? '').replace(/<\/?(?:sub|sup)\b[^>]*>/gi, ''));
const uid = prefix => `${prefix}-${crypto.randomUUID()}`;
const emptyFilters = () => ({ tags: [], excludeTags: [], parameterName: '', parameterUnit: '*', tagMode: 'all', journal: '', author: '', institution: '', yearFrom: '', yearTo: '', minIF: '', maxIF: '', impactYear: '', hasNotes: false, onlyFavorites: false, onlyRelated: false });
const state = { papers: [], collections: [], notes: {}, compareIds: new Set(), hiddenIds: new Set(), hiddenTagNodes: new Set(), focusGraph: true, leftPanelOpen: false, detailOpen: true, graphPreferences: {...GRAPH_DEFAULTS}, associations: [], journalMetrics: [], desktopInfo: null, searchScope: 'all', readingStatus: '', filters: emptyFilters(), showEdges: true, showLabels: true, mode: 'own', nav: 'all', collection: '', query: '', tag: '', year: '', sort: 'newest', view: 'graph', selected: '', listLimit: 100, ready: false, pendingFiles: [], storageError: false };
let modalContext = '';
let agentController, researchCanvas, vocabularyController, workspaceModules, workspaceChrome;
let batch, comparison, materialList, performanceEditor, bulkEditor, paperActions, parameterFinder, associationController, themeController, reader;
let layoutTimer, graphPreferenceTimer, switchingLibrary = false;
let pendingRemovalIds = [], removalBusy = false, lastRemoval = null;
let activeObjectURLs = new Set();
let groupActions,settingsActivity,readingStatusController;
let searchTimer;

initActionMenus();
function papers() { return state.papers; }
function collections() { return state.collections; }
function selectedPaper() { return papers().find(p => p.id === state.selected); }
function visiblePapers() {
  return filterCatalog(papers(), state, state.notes, state.journalMetrics);
}

const map = new StarMap($('#star-map'), {
  onNaturalLayoutState:({busy,progress,canUndo,count})=>{
    for(const button of document.querySelectorAll('[data-action="graph-arrange"],[data-action="graph-relayout"],[data-action="graph-arrange-all"]'))button.disabled=(busy&&button.id!=='graph-arrange')||!count;
    for(const button of document.querySelectorAll('[data-action="graph-arrange-undo"]'))button.disabled=busy||!canUndo;
    const button=$('#graph-arrange');if(button){button.setAttribute('aria-busy',String(busy));button.title=busy?tr('点击取消整理'):tr('自然整理星图（右键查看更多）');}
    const status=$('#graph-arrange-status');if(status)status.textContent=busy?(progress?msg`正在整理 ${progress.completed} / ${progress.total} · 点击取消`:tr('正在自然整理星图')):'';
  },
  onRelation: id => associationController.inspect(id), onRemoveAssociation: id => associationController.remove(id).catch(error=>toast(error.message,true)),
  onHide: id => { state.hiddenIds.add(id); render(); },
  onPaperMenu:(id,event,node)=>paperActions?.open(id,event.clientX,event.clientY,node),

  onStats: stats => { $('#network-stats').textContent = msg`${stats.papers} 篇文献 · ${stats.tags} 个关联节点 · ${stats.edges} 条连线${stats.omittedTags ? msg` · 另有 ${stats.omittedTags} 个标签未展示` : ''}`; },
  onLayout: positions => { clearTimeout(layoutTimer); if (!state.ready || switchingLibrary) return; layoutTimer = setTimeout(() => { if (!switchingLibrary) setSetting('graphLayout', positions).catch(error => toast(msg`布局未保存：${error.message}`, true)); }, 400); },
  onSelect: id => selectPaper(id, true),
  onZoom: value => { $('#zoom-level').textContent = `${value}%`; },
  onHover: (paper, event) => {
    const tip = $('#graph-tooltip');
    if (!paper || map.drag) { tip.hidden = true; return; }
    tip.replaceChildren();
    const title = document.createElement('div'); title.textContent = paper.title;
    const meta = document.createElement('small'); meta.textContent = [paper.journal, paper.year].filter(Boolean).join(' · ') || tr('点击查看文献');
    tip.append(title, meta); tip.hidden = false;
    const bounds = $('#graph-wrap').getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(bounds.width - tip.offsetWidth - 8, event.clientX - bounds.left + 16))}px`;
    tip.style.top = `${Math.max(45, Math.min(bounds.height - tip.offsetHeight - 50, event.clientY - bounds.top + 16))}px`;
  },
});

const notes = createNotesController({
  escape, showModal, toast, getPapers: papers, getNotes: () => state.notes, openReader:(id,noteId)=>reader.open(id,noteId),
  canEdit: () => state.mode === 'own' && !state.storageError,
  persist: async value => { await setSetting('notes', value); state.notes = value; render(); },
  jumpPaper: id => { closeModal(); state.nav = 'all'; resetFilters(false); state.selected = id; render(); selectPaper(id, true); },
  graphTag: tag => { if (!eligibleTags(papers()).has(tag)) { toast(tr('标签关联至少 3 篇文献后，才能在星图中筛选。')); return; } closeModal(); state.nav = 'all'; resetFilters(false); state.tag = tag; state.view = 'graph'; map.fit(); render(); },
});

function render() {
  paperActions?.close();
  const standaloneView=!workspaceModules?.current()?.libraryView;
  document.body.classList.toggle('module-full-width',standaloneView);
  document.body.classList.toggle('map-focus', state.focusGraph);
  document.body.classList.toggle('sidebar-collapsed',!state.leftPanelOpen);document.body.classList.toggle('detail-collapsed',!state.detailOpen);
  $('#toggle-sidebar').setAttribute('aria-expanded',String(state.leftPanelOpen));$('#workspace-details').setAttribute('aria-expanded',String(state.detailOpen));$('#toggle-local').classList.toggle('active',state.graphPreferences.localMode);$('#local-scope-label').hidden=!state.graphPreferences.localMode;
  $('#graph-focus').hidden = false;
  $('#graph-focus').title=state.focusGraph?tr('展开统计概览'):tr('收起统计概览');$('#graph-focus').setAttribute('aria-label',$('#graph-focus').title);
  const all = papers(), folders = collections(), eligible = eligibleTags(all);
  if (state.tag && !eligible.has(state.tag)) state.tag = '';
  state.filters.tags = state.filters.tags.filter(tag => eligible.has(tag));
  state.filters.excludeTags = state.filters.excludeTags.filter(tag => eligible.has(tag));
  const filtered = visiblePapers();
  if (!filtered.some(p => p.id === state.selected)) state.selected = filtered[0]?.id || '';
  const groups = tagGroups(all);
  $('#metric-total').innerHTML = html`${all.length}<small>篇</small>`;
  $('#metric-tags').innerHTML = html`${eligible.size}<small>个</small>`;
  $('#metric-tags').title = tr('至少关联 3 篇文献的标签');
  $('#metric-links').innerHTML = html`${countLinks(all, eligible)}<small>条</small>`;
  $('#metric-collections').innerHTML = html`${folders.length}<small>个</small>`;
  $('#all-count').textContent = all.length;
  $('#favorite-count').textContent = all.filter(p => p.favorite).length;
  $('#storage-usage').textContent = bytesLabel(state.papers.reduce((sum, p) => sum + (p.file?.size || p.size || 0), 0));
  $('.local-indicator').innerHTML = `<i></i>${state.storageError ? tr('存储不可用') : tr('已在本地保存')}`;
  if (native) { $('.storage-info > span:nth-child(2)').textContent = tr('文件夹文献库'); $('.storage-info').title = state.desktopInfo?.path || ''; }
  const navTitle = state.collection ? folders.find(c => c.id === state.collection)?.name || tr('分组') : ({ all: tr('文献星图'), library: tr('全部文献'), favorites: tr('星标文献'), recent: tr('最近添加') }[state.nav]);
  $('#breadcrumb-current').textContent = navTitle;
  $('#page-title').textContent = navTitle;
  $('#page-description').textContent = state.collection ? tr('把同一个研究主题，收进有序的坐标。') : ({ all: tr('让独立的阅读，在这里彼此连接。'), library: tr('每一篇文献，都有迹可循。'), favorites: tr('留住那些让你停下思考的阅读。'), recent: tr('新的阅读，新的研究坐标。') }[state.nav]);
  document.querySelectorAll('[data-nav]').forEach(button => { button.classList.toggle('active', !state.collection && (button.dataset.nav === state.nav||(button.dataset.nav==='library'&&state.nav==='all'))); button.setAttribute('aria-current', !state.collection && (button.dataset.nav === state.nav||(button.dataset.nav==='library'&&state.nav==='all')) ? 'page' : 'false'); });
  $('#collection-list').innerHTML = folders.length ? folders.map(c => `<button class="collection-item ${state.collection === c.id ? 'active' : ''}" data-collection="${escape(c.id)}"><span>${escape(c.name)}</span><small>${all.filter(p => p.collection === c.id).length}</small></button>`).join('') : tr('<p class="empty-folders">暂无文献分组</p>');
  $('#library-location').title = state.desktopInfo?.path || tr('本地文献库');
  $('.network-header-controls [data-action="associations"]').hidden=state.view!=='graph';$('#toggle-local').hidden=state.view!=='graph';
  $('#graph-caption').textContent = state.view==='graph'?(state.tag?`# ${state.tag}`:state.collection?navTitle:tr('研究星图')):workspaceModules.title();
  $('#visible-count').textContent = msg`${filtered.length} 篇文献${state.view === 'graph' && filtered.length > 350 ? tr(' · 展示前 350 篇') : ''}`;
  const years = [...new Set(all.map(p => p.year).filter(Boolean))].sort().reverse();
  $('#year-filter').innerHTML = tr('<option value="">全部年份</option>',false) + years.map(year => `<option value="${escape(year)}">${escape(year)}</option>`).join('');
  $('#year-filter').value = state.year;
  $('#sort-order').value = state.sort;
  renderFilterOptions();
  renderParameterSummary(filtered);
  const noteView=state.view==='notes';
  const predictionView=state.view==='prediction', predictionEntry=$('#material-prediction-toggle');
  predictionEntry.hidden=!(state.view==='materials'||predictionView)||!workspaceModules.available('prediction');
  predictionEntry.disabled=!state.ready||state.storageError;
  predictionEntry.setAttribute('aria-controls',predictionView?'material-list':'prediction-workspace');
  predictionEntry.querySelector('[data-icon]').dataset.icon=predictionView?'chevron-left':'chart';
  predictionEntry.querySelector('.material-prediction-label').textContent=tr(predictionView?'返回材料':'性能预测');
  $('.surface-toolbar .search-box').hidden = standaloneView;
  $('#sort-order').hidden = standaloneView;
  $('#sort-order option[value="newest"]').textContent=noteView?tr('笔记最近更新'):tr('最近添加');
  const graphView = state.view === 'graph';
  const paperView = graphView || state.view === 'list';
  if (!paperView) $('#parameter-filter-summary').hidden = true;
  $('#network-stats').hidden = !graphView;
  $('#graph-mode').hidden = !graphView;
  $('#graph-view-controls').hidden = !graphView;
  $('#filter-button').hidden = !paperView;
  const filterLabel = tr(graphView ? '星图设置与筛选' : '文献筛选');
  $('#filter-button-label').textContent = tr('筛选');
  $('#filter-button').title = filterLabel;
  $('#filter-button').setAttribute('aria-label', filterLabel);
  $('#filter-dialog-title').textContent = filterLabel;
  $('#advanced-filter-dialog').classList.toggle('paper-filters-only', !graphView);
  $('.map-footer').hidden = standaloneView||noteView||state.view==='list';
  const filterCount = Number(Boolean(state.tag)) + Number(Boolean(state.year)) + Number(Boolean(state.readingStatus)) + Number(Boolean(state.filters.parameterName)) + state.filters.tags.length + state.filters.excludeTags.length + Object.entries(state.filters).filter(([key, value]) => !['tags', 'excludeTags', 'tagMode', 'parameterName', 'parameterUnit'].includes(key) && Boolean(value)).length;
  $('#active-filter-count').textContent = filterCount;
  $('#active-filter-count').hidden = !filterCount;
  $('#advanced-result-count').textContent = msg`当前匹配 ${filtered.length} 篇文献`;
  $('#restore-hidden').hidden = !state.hiddenIds.size && !state.hiddenTagNodes.size;
  $('#restore-hidden').innerHTML=icon('eye')+tr('<span>恢复隐藏文献</span>',false);$('#restore-hidden').title=msg`恢复隐藏的 ${state.hiddenIds.size} 篇文献`;
  $('#hide-node').disabled = !state.selected;
  $('#legend').innerHTML = groups.slice(0, 6).map(g => html`<button data-tag="${escape(g.name)}" class="${state.tag === g.name ? 'active' : ''}" title="按 ${escape(g.name)} 筛选"><i style="background:${g.color}"></i>${escape(g.name)}</button>`).join('') + (state.tag ? tr('<button data-action="clear-tag" class="tag-filter-clear">清除筛选 ×</button>') : '');
  map.options = { showEdges: state.showEdges, showLabels: state.showLabels };
  const tagMode=state.graphPreferences.mode==='tags';
  const scoped=tagMode?filtered.filter(paper=>state.associations.some(rule=>associationMatches(paper,rule))):filtered;
  const graphPapers=state.graphPreferences.localMode?(tagMode?associationLocalPapers(scoped,state.associations,state.selected,state.graphPreferences.localDepth):similarityLocalPapers(scoped,state.selected,state.graphPreferences.localDepth,{neighbors:state.graphPreferences.neighbors})):scoped;
  $('#graph-mode').value=state.graphPreferences.mode;
  $('#graph-neighbors-control').hidden=tagMode;
  $('#graph-mode-help').textContent=tagMode?tr('选择标签，展示匹配任一标签的文献及关联。'):tr('按标签、标题与摘要、作者和机构计算相似度；关系越近，连接越短。');
  document.querySelector('[data-action="associations"]').hidden=!tagMode;
  map.configure(state.graphPreferences,collections(),state.associations);map.setData(graphPapers,state.selected,groups);
  if(state.view==='graph')$('#visible-count').textContent=msg`${graphPapers.length} 篇文献`;
  if(state.graphPreferences.localMode&&state.view==='graph')$('#visible-count').textContent=msg`局部 ${graphPapers.length} / 筛选 ${filtered.length} 篇`;
  renderGraphPreferences();$('#ribbon-import').disabled=!state.ready||state.storageError;
  const empty = $('#graph-empty'); empty.hidden = graphPapers.length > 0;
  if (!graphPapers.length) {
    if(tagMode&&!state.associations.length)empty.innerHTML=html`<span data-icon="orbit"></span><h2>选择要探索的标签</h2><p>可选择多个标签，查看它们与文献之间的关联。</p><button class="primary" data-action="associations">选择标签</button>`;
    else if (all.length > 0) empty.innerHTML = html`<span data-icon="search"></span><h2>还没有找到这颗星</h2><p>尝试其他关键词，或清除筛选条件。</p><button class="outline-button" data-action="reset-filters">清除筛选</button>`;
    else empty.innerHTML = html`<span data-icon="orbit"></span><h2>从第一篇文献开始</h2><p>导入 PDF，添加你的研究标签，<br>让文献在星图中找到位置。</p><button class="primary" data-action="import"><span data-icon="plus"></span>导入文献</button><button class="text-button" data-action="download-md-template">下载 Markdown 规范模板</button>`;
  }
  workspaceModules?.render();
  renderDetail();
  hydrateIcons();
  comparison?.refreshBar();
  if(standaloneView)$('#comparison-bar').hidden=true;
  readingStatusController?.render();
  $('#removal-undo').hidden = !lastRemoval?.count;
  $('#removal-undo-count').textContent = lastRemoval?.count || 0;
  $('#quick-undo').hidden = !lastRemoval?.count || state.view !== 'graph' || !state.focusGraph;
  workspaceChrome?.sync();
}

async function applyParameterFilter(name, unit = '*') {
  if (!ensureStorage()) return;
  const fromFilters = $('#advanced-filter-dialog').open;
  closeModal(); $('#advanced-filter-dialog').close();
  if (!fromFilters) resetFilters(false);
  state.nav='library';state.view='list';state.filters.parameterName=parameterNameKey(name);state.filters.parameterUnit=unit;state.selected='';const matchingIds=new Set(parameterResults(papers(),name,unit).map(p=>p.id));await comparison.selectIds([...state.compareIds].filter(id=>matchingIds.has(id)));render();
}
async function plotActiveParameter(){const key=state.filters.parameterName;if(!key)return false;const rows=parameterResults(papers(),key,state.filters.parameterUnit).filter(p=>state.compareIds.has(p.id));if(!rows.length){toast(tr('请先勾选相关文献，或点击全选匹配结果。'));return true;}await comparison.selectIds(rows.map(p=>p.id));comparison.open('chart',{name:key,unit:state.filters.parameterUnit},'paper');return true;}
function renderParameterSummary(filtered) {
  const key=state.filters.parameterName, host=$('#parameter-filter-summary');host.hidden=!key;
  const primary=$('#selection-primary');if(!key){delete primary.dataset.action;primary.dataset.comparisonAction='open';primary.innerHTML=icon('chart')+tr('<span>对比与作图</span>',false);primary.disabled=false;host.innerHTML='';$('#quick-parameter-label').textContent=tr('性能参数');return;}
  const item=parameterInventory(papers()).find(item=>item.key===key),unit=state.filters.parameterUnit;
  const all=parameterResults(papers(),key,unit),selectedCount=all.filter(p=>state.compareIds.has(p.id)).length,recordCount=all.reduce((count,p)=>count+(paperMeasurements(p)).filter(m=>parameterNameKey(m.name)===key&&(unit==='*'||String(m.unit||'').normalize('NFKC').trim()===unit)).length,0);
  $('#quick-parameter-label').textContent=item?.name || key;delete primary.dataset.comparisonAction;primary.dataset.action='plot-parameter-results';primary.innerHTML=icon('chart')+tr('<span>用所选 ',false)+selectedCount+tr(' 篇作图</span>',false);primary.disabled=!selectedCount;
  host.innerHTML=html`<div><span>性能参数筛选</span><strong>${escape(item?.name||key)}${unit==='*'?tr(' · 全部单位'):' · '+escape(unit||tr('单位未填'))}</strong><p>全库 ${all.length} 篇 · ${recordCount} 条记录 · 当前匹配 ${filtered.length} 篇</p></div><button class="outline-button" data-material-parameter="${escape(key)}" data-material-parameter-unit="${escape(unit)}">直接选材料</button><button class="outline-button" data-action="select-parameter-results" ${filtered.length?'':'disabled'}>全选匹配 ${filtered.length} 篇</button><button class="icon-button" data-action="clear-parameter" title="清除性能参数筛选" aria-label="清除性能参数筛选">${icon('close')}</button>`;
}

function firstAuthor(p){return normalizeAuthors(p.authorDetails||[])[0]?.name||String(p.authors||'').split(/[,;，；]|\s+and\s+/i)[0].trim();}
function documentArt() { return '<div class="document-art" aria-hidden="true"><i></i><i></i><i></i><i></i><span>PDF</span></div>'; }
function renderList(filtered) {
  $('#paper-list').innerHTML = filtered.length ? html`<div class="list-selection-toolbar" ${state.filters.parameterName?'hidden':''}><button class="text-button" data-action="select-filtered">全选当前结果（${filtered.length} 篇）</button><span>Shift＋点击多选</span></div>` + filtered.slice(0,state.listLimit).map((p,index)=>{
    const groupHeading=state.sort==='reading-status'&&!state.readingStatus&&(index===0||readingStatusOf(filtered[index-1])!==readingStatusOf(p))?readingStatusHeading(p,filtered.filter(row=>readingStatusOf(row)===readingStatusOf(p)).length):'';
    return html`${groupHeading}<article class="paper-row ${p.id===state.selected?'selected':''}" data-select="${escape(p.id)}" tabindex="0" role="button" aria-label="查看 ${displayTitle(p.title)}"><div class="paper-row-content"><h3>${displayTitle(p.title)}</h3><p class="paper-row-citation">${escape([p.journal,p.year,firstAuthor(p)].filter(Boolean).join(' · ') || p.filename)}</p>${state.filters.parameterName?parameterRecordPreview(p,state.filters.parameterName,state.filters.parameterUnit,escape):''}</div><button class="icon-button paper-row-menu" data-paper-menu aria-label="文献快捷操作" title="文献快捷操作（也可右键）">${icon('more')}</button></article>`;
  }).join('') + (filtered.length>state.listLimit?html`<button class="outline-button list-load-more" data-action="more-list">显示更多（剩余 ${filtered.length-state.listLimit} 篇）</button>`:'') : papers().length ? tr('<div class="list-empty"><strong>没有匹配的文献</strong><p>可清除标题搜索、调整条件，或切换性能参数。</p><button class="outline-button" data-action="parameter-index">切换性能参数</button></div>') : tr('<div class="list-empty"><strong>从第一批文献开始</strong><button class="outline-button" data-action="import">批量导入 PDF + Markdown</button></div>');
}

function renderDetail() {
  const panel = $('#detail-panel'), p = selectedPaper();
  if (!p) { panel.classList.add('detail-empty'); panel.innerHTML = tr('<span data-icon="orbit"></span><h3>等待一颗新的坐标</h3><p>点击星图中的文献<br>查看详细信息与阅读笔记。</p>'); return; }
  panel.classList.remove('detail-empty');
  const folder = collections().find(c => c.id === p.collection);
  const authors = normalizeAuthors(p.authorDetails || []), metric = impactOf(p, state.journalMetrics, state.filters.impactYear);
  const related = relatedPaperGroups(papers(),p);
  panel.innerHTML = html`
    <div class="detail-top"><span>文献详情</span><div class="detail-actions"><button class="icon-button ${p.favorite ? 'favorite-on' : ''}" data-action="favorite" aria-label="${p.favorite ? tr('取消星标') : tr('加入星标我的收藏')}" title="星标我的收藏，与主题分组独立"><span data-icon="star"></span></button>${actionMenu('detail-paper-menu',tr('文献操作'),'<button type="button" data-action="edit">'+icon('edit')+tr('编辑文献信息 / 标签</button><button type="button" data-action="toggle-compare">',false)+icon('chart')+(state.compareIds.has(p.id)?tr('从对比选择中移除'):tr('加入性能对比'))+'</button><hr><button type="button" data-action="download-pdf">'+icon('download')+tr('另存 PDF</button><button type="button" class="danger" data-action="delete">',false)+icon('trash')+tr('移除文献…</button>',false),{iconOnly:true,className:'icon-button'})}<button class="icon-button detail-close-button" data-action="toggle-detail" aria-label="收起文献详情" title="收起文献详情"><span data-icon="close"></span></button></div></div>
    ${documentArt()}
    <div class="paper-journal"><i class="journal-mark"></i><button data-journal="${escape(p.journal)}" title="按期刊筛选">${escape(p.journal || tr('未填写期刊'))}</button><span>·</span>${escape(p.year || tr('年份待补充'))}</div>
    ${metric?`<div class="impact-badge" title="${escape(metric.source||'')}">IF ${metric.value} <span>· ${escape(metric.year||'')}</span></div>`:''}
    <h2 class="paper-title"><button data-action="paper-notes" title="打开这篇文献的全部笔记">${displayTitle(p.title)}</button></h2>
    <p class="paper-authors">${escape(firstAuthor(p)||tr('作者待补充'))}</p>
    <details class="author-details"><summary>全部作者与机构 <span>${authors.length ? authors.length + tr(' 位作者',false) : tr('待补全')}</span></summary>${authors.length ? `<ol>${authors.map(a => `<li><button data-author="${escape(a.name)}">${escape(a.name)}</button>${a.affiliations.length ? a.affiliations.map(institution => `<button class="affiliation" data-institution="${escape(institution)}">${escape(institution)}</button>`).join('') : tr('<small>机构待补充</small>')}</li>`).join('')}</ol>` : tr('<p>编辑信息或导入元数据，可逐位记录作者与所属机构。</p>')}</details>
    ${p.doi ? `<p class="doi-label">DOI ${escape(p.doi)}</p>` : ''}

    <details class="detail-disclosure"><summary>标签与分组</summary><div class="detail-label"><span>研究标签</span></div>
    <div class="tags">${p.tags.length ? p.tags.map(tag => `<button class="tag" data-link-tag="${escape(tag)}">${escape(tag)}</button>`).join('') : tr('<span class="help-inline">暂无标签</span>')}</div>
    <p class="detail-label">文献分组</p><button class="collection-value collection-value-button" data-action="paper-collection" title="更改分组"><span data-icon="folder"></span>${escape(folder?.name || tr('未分组'))}<span aria-hidden="true">⌄</span></button>
    </details><details class="detail-disclosure"><summary>材料与性能 · ${paperMaterials(p).length} 个</summary><div class="detail-label"><span>材料 · ${paperMaterials(p).length} 个</span><button class="text-button" data-action="performance-editor">编辑</button></div>
    <div class="material-preview-list">${paperMaterials(p).map(material=>html`<section class="material-preview"><h3>${escape(material.name)}</h3>${material.composition?`<p class="material-composition">${escape(material.composition)}</p>`:''}${material.description?`<p class="material-description-text">${escape(material.description)}</p>`:''}<small>${material.measurements.length} 条性能参数</small><div class="performance-preview">${material.measurements.slice(0,4).map(m=>html`<div><button class="performance-parameter-link" data-parameter-name="${escape(parameterNameKey(m.name))}" data-parameter-unit="*" title="查找全库录入此参数的文献">${escape(m.name)} ↗</button><strong>${escape(m.qualifier)}${escape(m.value)} <small>${escape(m.unit)}</small></strong><small>${escape([m.sample,m.conditions].filter(Boolean).join(' · '))}</small></div>`).join('')||tr('<p class="help-inline">尚未录入性能参数。</p>')}</div>${material.measurements.length>4?tr('<p class="help-inline">管理材料可查看全部参数。</p>'):''}</section>`).join('')||''}</div>
    </details><details class="detail-disclosure"><summary>文献笔记 · ${notes.count('paper',p.id)} 条</summary><div class="detail-label"><span>文献笔记 · ${notes.count('paper', p.id)} 条</span><button class="text-button" data-action="paper-notes">添加</button></div>
    ${notes.preview('paper', p.id) || ''}
    </details><details class="detail-disclosure"><summary>相关文献</summary>${relatedPaperSections(related,escape)}</details>
    <div class="detail-bottom"><p class="detail-file-note">${bytesLabel(p.file?.size || p.size || 0)} · ${escape(p.filename || tr('PDF 文献'))}</p><div class="detail-reading-links"><button type="button" class="detail-read-link" data-action="open-pdf"><span data-icon="external"></span>阅读 PDF</button><div class="detail-reading-status">${readingStatusBadge(p,escape)}</div></div></div>`;
}

function selectPaper(id, showMobile = false) {
  if (!papers().some(p => p.id === id)) return;
  state.selected = id;state.detailOpen=true;document.body.classList.remove('detail-collapsed');if(state.graphPreferences.localMode){render();return;} map.select(id); renderDetail();
  if (state.view === 'list') { document.querySelectorAll('.paper-row').forEach(row => row.classList.toggle('selected', row.dataset.select === id)); }
  if (showMobile && matchMedia('(max-width: 850px)').matches) $('#detail-panel').classList.add('mobile-open');
  hydrateIcons($('#detail-panel'));
  workspaceChrome?.sync();
}

function toast(message, error = false) {
  const node = document.createElement('div'); node.className = `toast${error ? ' error' : ''}`;
  node.innerHTML = `<span data-icon="${error ? 'info' : 'check'}"></span><span>${escape(message)}</span>`;
  $('#toast-region').append(node); hydrateIcons(node);
  setTimeout(() => node.remove(), error ? 7000 : 4000);
}
function showModal(title, description, body, context = '') {
  comparison?.dispose();
  modalContext = context;
  $('#modal-content').innerHTML = html`<div class="modal-heading"><div><h2>${title}</h2>${description?`<p>${description}</p>`:''}</div><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗"><span data-icon="close"></span></button></div><div class="modal-body">${body}</div>`;
  hydrateIcons($('#modal')); if (!$('#modal').open) $('#modal').showModal();
  $('#graph-tooltip').hidden = true;
}
function closeModal() { if (batch?.isBusy() || bulkEditor?.isBusy() || paperActions?.isBusy() || performanceEditor?.isBusy() || themeController?.isBusy() || groupActions?.isBusy() || removalBusy) { toast(tr('正在保存更改，请稍候。')); return; } comparison?.dispose(); $('#modal').close(); modalContext = ''; state.pendingFiles = []; pendingRemovalIds = []; }
function ensureStorage() { if (!state.storageError && state.ready) return true; if(!state.storageError){toast(tr('正在打开文献库，请稍候…'));return false;} toast(native ? tr('本地文献库不可用，请检查文件夹权限。') : tr('浏览器存储不可用，请使用普通浏览窗口重试。'), true); return false; }
function folderOptions(selected = '') { return tr('<option value="">未归入分组</option>',false) + state.collections.map(c => `<option value="${escape(c.id)}" ${selected === c.id ? 'selected' : ''}>${escape(c.name)}</option>`).join(''); }
function formValues(form) {
  const data = new FormData(form), authorDetails = normalizeAuthors(data.get('authorDetails'));
  const impactFactor = numericImpact(data.get('impactFactor')), impactYear = String(data.get('impactYear') || '').trim();
  if (impactFactor !== null && !/^\d{4}$/.test(impactYear)) throw new Error(tr('填写影响因子时，请同时填写四位指标年份。'));
  return { title: String(data.get('title') || '').trim(), authorDetails, authors: authorDetails.map(a => a.name).join(', '), journal: String(data.get('journal') || '').trim(), year: String(data.get('year') || '').trim(), doi: String(data.get('doi') || '').trim(), impactFactor, impactYear, tags: normalizeTags(data.get('tags')), collection: String(data.get('collection') || '') };
}
function bibliographyFields(p = {}) {
  return html`<label class="form-field">作者与机构（每行一位作者）<textarea name="authorDetails" maxlength="200000" placeholder="张三 | 清华大学材料学院；某研究所\nJane Smith | Department of Materials, Example University">${escape(p.authorDetails?.length ? authorsText(p.authorDetails) : p.authors || '')}</textarea><small>格式：姓名 | 机构一；机构二。支持全部作者、多机构，也可通过元数据 JSON 批量导入。</small></label><div class="form-row"><label class="form-field">期刊 / 刊物标签<input name="journal" maxlength="300" value="${escape(p.journal || '')}" placeholder="例如 Advanced Materials"></label><label class="form-field">发表年份<input name="year" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" value="${escape(p.year || '')}" placeholder="选填"></label></div><div class="form-row"><label class="form-field">影响因子 IF<input name="impactFactor" type="number" min="0" max="1000" step="any" value="${p.impactFactor ?? ''}" placeholder="未填写时使用导入的期刊指标"></label><label class="form-field">指标年份<input name="impactYear" pattern="[0-9]{4}" inputmode="numeric" maxlength="4" value="${escape(p.impactYear || '')}" placeholder="例如 2025"></label></div><label class="form-field">DOI<input name="doi" maxlength="1000" value="${escape(p.doi || '')}" placeholder="选填"></label>`;
}

function importModal(files = []) { if (ensureStorage()) batch.open(files); }
async function addFiles(files) { if (ensureStorage()) await batch.addFiles(files); }

function editModal() {
  const p = selectedPaper(); if (!p) return;
  if (!ensureStorage()) return;
  showModal(tr('编辑文献信息'), tr('完整记录作者、机构与期刊指标。'), html`<form id="edit-form" data-id="${escape(p.id)}"><label class="form-field">文献标题<input name="title" required maxlength="1000" value="${displayTitle(p.title)}"></label>${bibliographyFields(p)}<label class="form-field">研究标签<input name="tags" maxlength="2500" value="${escape(p.tags.join('，'))}" placeholder="用逗号分隔标签"><small>标签关联至少 3 篇文献后参与常规筛选与颜色分组。星图只连接手动加入的关联节点，原始标签及笔记始终保留。</small></label><label class="form-field">分组<select name="collection">${folderOptions(p.collection)}</select></label><div class="modal-footer"><button type="button" class="text-button" data-action="close-modal">取消</button><button type="submit" class="primary">保存修改</button></div></form>`, 'edit');
}

async function submitEdit(form) {
  const paper = state.papers.find(p => p.id === form.dataset.id); if (!paper) return;
  const values = formValues(form); if (!values.title) { toast(tr('请填写文献标题。'), true); return; }
  const updated = { ...paper, ...values }; await putPaper(updated);
  state.papers = state.papers.map(p => p.id === updated.id ? updated : p); if (native) state.notes = await getSetting('notes') || {}; closeModal(); render(); toast(tr('文献信息已保存。'));
}

async function favorite(id = state.selected) {
  const paper = papers().find(p => p.id === id); if (!paper) return;
  if (!ensureStorage()) return;
  const updated = { ...paper, favorite: !paper.favorite }; await putPaper(updated);
  state.papers = state.papers.map(p => p.id === id ? updated : p); render(); toast(updated.favorite ? tr('已加入星标「我的收藏」。') : tr('已取消星标。'));
}

function newCollectionModal() {
  if (!ensureStorage()) return;
  if(state.compareIds.size)return paperActions.create([...state.compareIds]);
  showModal(tr('建立一个研究主题'), tr('用分组，为你的阅读建立清晰的秩序。'), html`<form id="collection-form"><label class="form-field">分组名称<input name="name" required maxlength="80" placeholder="例如：我的二维材料研究" autofocus></label><label class="form-field">主题颜色</label><div class="collection-colors">${PALETTE.map((color, i) => html`<button type="button" class="color-choice ${i === 0 ? 'active' : ''}" style="background:${color}" data-color="${color}" aria-label="颜色 ${i + 1}" aria-pressed="${i === 0}"></button>`).join('')}</div><input type="hidden" name="color" value="${PALETTE[0]}"><div class="modal-footer"><button type="button" class="text-button" data-action="close-modal">取消</button><button class="primary" type="submit">创建分组</button></div></form>`, 'collection');
}

async function submitCollection(form) {
  const data = new FormData(form), name = String(data.get('name') || '').trim(); if (!name) return;
  if (state.collections.some(c => c.name === name)) { toast(tr('已经有同名分组了。'), true); return; }
  const collection = { id: uid('folder'), name, color: String(data.get('color')) };
  const next = [...state.collections, collection]; await setSetting('collections', next);
  state.collections = next; state.mode = 'own'; state.collection = collection.id; state.nav = 'all'; state.query = ''; state.tag = ''; state.year = ''; $('#search').value = ''; await setSetting('mode', 'own');
  closeModal(); render(); toast(msg`已创建「${name}」。`);
}

async function openPDF(download = false) {
  const p = selectedPaper(); if (!p) return;
  if (!download) return reader.open(p.id);
  if (native) { if (download) await native.savePdf(p.id); else await native.openPdf(p.id); return; }
  if (!p.file) { toast(tr('这条文献尚未附上 PDF 文件。'), true); return; }
  const url = URL.createObjectURL(p.file); activeObjectURLs.add(url);
  if (download) triggerDownload(url, p.filename || `${p.title}.pdf`);
  else { const win = window.open(url, '_blank'); if (!win) { URL.revokeObjectURL(url); activeObjectURLs.delete(url); toast(tr('浏览器阻止了新窗口，请允许此网站打开 PDF。'), true); return; } win.opener = null; }
  setTimeout(() => { URL.revokeObjectURL(url); activeObjectURLs.delete(url); }, 60000);
}
function triggerDownload(url, filename) { const a = document.createElement('a'); a.href = url; a.download = filename; ($('#modal').open ? $('#modal') : document.body).append(a); a.click(); a.remove(); }

function deleteModal(ids = [state.selected]) {
  if (!ensureStorage()) return;
  const selected = new Set(ids), removed = papers().filter(p => selected.has(p.id));
  if (!removed.length) { toast(tr('请先在文献列表中勾选要移除的文献。')); return; }
  pendingRemovalIds = removed.map(p => p.id);
  const visible = new Set(visiblePapers().map(p => p.id)), hidden = removed.filter(p => !visible.has(p.id)).length;
  showModal(msg`移除选中的 ${removed.length} 篇文献？`, tr('确认下面的标题后移除，完成后可撤销上次移除。'), html`<div class="removal-summary"><strong>${removed.length}</strong><span>篇选中文献${hidden ? msg` · 其中 ${hidden} 篇不在当前筛选结果中` : ''}</span></div><div class="removal-preview">${removed.map(p => `<div><strong>${displayTitle(p.title)}</strong><small>${escape([p.journal,p.year,p.filename].filter(Boolean).join(' · '))}</small></div>`).join('')}</div><p class="help-inline">${native ? tr('原始 PDF 保留在本地文件夹，文献信息、性能参数与文献笔记会一同保存到恢复记录。') : tr('文献信息、PDF、性能参数与文献笔记会一同保存到本地恢复记录。')} 标签笔记和其他文献不受影响。</p><div class="modal-footer"><button class="text-button" data-action="close-modal">取消</button><button class="danger-button" data-action="confirm-removal">确认移除 ${removed.length} 篇</button></div>`, 'delete');
}

async function confirmRemoval() {
  if (modalContext !== 'delete' || !pendingRemovalIds.length || removalBusy) return;
  const ids = [...pendingRemovalIds], button = $('[data-action="confirm-removal"]');
  removalBusy = true; button.disabled = true; button.textContent = tr('正在移除…');
  try {
    const receipt = await deletePapers(ids);
    await reloadLibrary();
    removalBusy = false; closeModal(); render();
    toast(msg`已移除 ${receipt.count} 篇文献，可点击「撤销上次移除」恢复。`);
  } finally { removalBusy = false; if (button.isConnected) { button.disabled = false; button.textContent = msg`确认移除 ${ids.length} 篇`; } }
}

async function undoRemoval() {
  if (!lastRemoval?.id || removalBusy) return;
  removalBusy = true;
  const button = $('[data-action="undo-removal"]'); button.disabled = true;
  try {
    const result = await restorePapers(lastRemoval.id);
    await reloadLibrary(); render();
    toast(msg`已恢复 ${result.count} 篇文献及其笔记、性能参数。`);
  } finally { removalBusy = false; button.disabled = false; }
}

async function settingsModal() {
  const size=state.papers.reduce((sum,p)=>sum+(p.file?.size||p.size||0),0);settingsActivity=await getImportActivity();
  showModal(tr('设置'),'',html`
    <div class="settings-card language-settings"><div><strong>界面语言</strong><p>切换后立即生效，自动记住本机选择。</p></div><select id="interface-language" aria-label="界面语言">${LANGUAGES.map(language=>`<option value="${language.id}" ${language.id===getLocale()?'selected':''}>${language.name}</option>`).join('')}</select></div>
    <div class="settings-card"><div><strong>功能管理</strong><p>选择工作区中需要的页面</p></div><button class="outline-button" data-action="module-settings">管理…</button></div>
    <div class="settings-card"><div><strong>主题与字体</strong><p>配色、明暗外观与字号</p></div><button id="ribbon-theme" class="outline-button" data-action="themes">外观…</button></div>
    ${native?html`<div class="settings-card folder-card"><div><strong>文献库</strong><p class="folder-path">${escape(state.desktopInfo?.path||'')}</p><small>${state.papers.length} 篇 · ${bytesLabel(size)}</small></div><div class="settings-inline-actions"><button class="outline-button" data-action="open-folder">打开</button>${actionMenu('storage-options',tr('文献库选项'),tr('<button data-action="choose-folder">切换文献库…</button><button data-action="sync-folders">立即同步文件夹</button>'),{iconOnly:true,className:'icon-button'})}</div></div>`:tr('<div class="info-box">网页预览 · 数据保存在当前浏览器</div>')}
    <div class="settings-card"><div><strong>文献信息</strong><p>补充信息与期刊指标</p></div>${actionMenu('metadata-options',tr('管理'),tr('<button data-action="import-metadata">导入文献信息…</button><button data-action="journal-catalog">期刊影响因子…</button>'),{iconName:'folder'})}</div>
    <div class="settings-card"><div><strong>备份与恢复</strong><p>PDF、笔记、分组与导入记录</p></div>${actionMenu('backup-options',tr('备份'),tr('<button data-action="export">导出完整备份…</button><button data-action="restore">从备份恢复…</button>'),{iconName:'download'})}</div>
    <p class="muted" id="settings-app-version">Materia ${escape(state.desktopInfo?.appVersion||tr('网页预览'))}</p><section id="settings-import-activity" class="settings-activity" aria-label="每日导入记录">${activityHTML(settingsActivity)}</section><div class="modal-footer"><button class="primary" data-action="close-modal">完成</button></div>`,'settings');
}

function journalCatalogModal() {
  const rows = [...state.journalMetrics].sort((a,b)=>Number(b.year)-Number(a.year)||a.journal.localeCompare(b.journal));
  showModal(tr('期刊影响因子数据'), msg`已收录 ${rows.length} 条年度指标 · 内置数据核验日期 ${JOURNAL_DATA_CHECKED}`, html`<p class="help-inline">已载入 ${BUNDLED_METRICS.length} 本期刊的 2025 年两年期 JIF。未覆盖的期刊可继续导入 CSV / JSON；你已有的同刊同年指标优先保留。</p><div class="journal-catalog">${rows.map(row=>html`<article><strong>${escape(row.journal)}</strong><b>IF ${row.impactFactor} <small>· ${escape(row.year)}</small></b><input readonly aria-label="${escape(row.journal)} 指标来源" value="${escape(row.source || tr('未填写来源'))}" title="选择并复制来源"></article>`).join('')}</div><div class="modal-footer"><button class="text-button" data-action="import-metrics">继续导入指标</button><button class="outline-button" data-action="export-metrics">导出指标 CSV</button><button class="primary" data-action="close-modal">完成</button></div>`, 'journal-catalog');
}

function exportMetrics() {
  const quote = value => `"${String(value ?? '').replaceAll('"','""')}"`;
  return saveText('\uFEFFjournal,impactFactor,year,source\r\n'+state.journalMetrics.map(row=>[row.journal,row.impactFactor,row.year,row.source].map(quote).join(',')).join('\r\n'), 'materia-journal-metrics.csv', 'csv');
}

async function exportLibrary() {
  if (!ensureStorage()) return;
  if (!state.papers.length && !state.collections.length && !state.journalMetrics.length && !Object.keys(state.notes).length) { toast(tr('你的文献库还是空的，导入 PDF 后即可导出完整备份。')); return; }
  toast(tr('正在打包 PDF 和文献信息，请稍候…'));
  await comparison.flushSelection();
  const backup = await createBackup(state.papers, state.collections, state.notes, state.journalMetrics, await readStudy(), comparison.getMaterialSelection().groups || [],await getImportActivity());
  if (native) { const saved = await native.saveBackup(JSON.stringify(backup)); if (!saved.canceled) toast(msg`完整备份已保存到：${saved.path}`); return; }
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  triggerDownload(url, `materia-backup-${date}.json`); setTimeout(() => URL.revokeObjectURL(url), 30000);
  toast(msg`完整备份已导出，包含 ${state.papers.length} 篇文献。`);
}

async function restoreFile(file) {
  if (!ensureStorage() || !file) return;
  if (file.size > 512 * 1024 * 1024) { toast(tr('备份超过 512 MB，请拆分后恢复。'), true); return; }
  let backup;
  try { backup = readBackup(JSON.parse(await file.text())); }
  catch (error) { toast(error instanceof SyntaxError ? tr('文件不是有效的 JSON 备份。') : error.message, true); return; }
  showModal(tr('恢复这份文献备份？'), tr('备份将合并进我的文献库。'), html`<p class="confirm-copy">包含 ${backup.papers.length} 篇文献、${backup.collections.length} 个分组。<br>同一 ID 的记录将被备份内容覆盖，其余文献保留。</p><div class="modal-footer"><button class="text-button" data-action="close-modal">取消</button><button class="primary" id="confirm-restore">确认恢复</button></div>`, 'restore-confirm');
  $('#confirm-restore').addEventListener('click', async event => {
    const confirmButton = event.currentTarget;
    confirmButton.disabled = true;
    try {
      await comparison.flushSelection();
      await mergeBackup(backup);
      if(backup.materialGroups)comparison.loadSelectionPreferences(await getSetting('comparisonState'));
      state.papers = await getPapers(); state.collections = (await getSetting('collections')) || []; state.notes = (await getSetting('notes')) || {}; state.journalMetrics = (await getSetting('journalMetrics')) || []; state.mode = 'own'; state.nav = 'all'; resetFilters(false);
      closeModal(); render(); toast(msg`已恢复 ${backup.papers.length} 篇文献。`);
    } catch (error) { confirmButton.disabled = false; toast(msg`恢复失败：${error.message || tr('本地空间不足。')}`, true); }
  });
}



function resetFilters(shouldRender = true) { state.readingStatus='';state.query = ''; state.tag = ''; state.year = ''; state.collection = ''; state.sort = 'newest'; state.filters = emptyFilters(); state.hiddenIds.clear(); state.listLimit = 100; $('#search').value = ''; if (shouldRender) render(); }

function helpModal() {
  showModal(tr('从阅读，到连接'), tr('一个安静、专注的材料文献研究空间。'), html`<div class="guide-step"><span>1</span><div><strong>收录原始 PDF</strong><p>选择或拖入多份 PDF；相同文件自动去重。桌面版将文件保存至本地文献库文件夹，可在设置里更换位置。</p></div></div><div class="guide-step"><span>2</span><div><strong>补充完整信息</strong><p>编辑标题、全部作者与机构、期刊和标签，或导入其他 AI 整理的 JSON。年度影响因子可通过 CSV / JSON 导入。</p></div></div><div class="guide-step"><span>3</span><div><strong>让思考彼此连接</strong><p>点击标题或标签，分别添加多条笔记。使用 [[完整标题]] 和 [[#标签]] 互相跳转，目标处会显示反向链接。</p></div></div><div class="guide-step"><span>4</span><div><strong>搜索与探索</strong><p>搜索标题、标签、作者、机构和笔记。过滤支持多标签、期刊、年份与 IF 范围，星图和列表同步更新，IF 支持升降序排列。</p></div></div><div class="guide-step"><span>译</span><div><strong>对照翻译与生词复习</strong><p>在 PDF 中选中文字后，点击弹窗「翻译」才会发送请求；译文出现后点击「添加批注」贴到原文附近。也可在右侧「译文」主动翻译当前页或整篇。短词可保存到生词本，记录原句与页码，左侧字典图标可搜索、复习与导出。</p></div></div><div class="guide-step"><span>5</span><div><strong>把积累带走</strong><p>导出完整备份，包含 PDF、笔记、作者机构、期刊指标、生词本和译文；可在其他设备恢复。桌面版也可直接复制整个文献库文件夹。</p></div></div><div class="info-box">所有文献信息由你填写或导入，PDF 文件留在本地。主动翻译时会把选文或页面文字发给已配置的 AI 服务；程序不自动生成标签或影响因子。</div><div class="modal-footer"><button class="primary" data-action="close-modal">开始探索</button></div>`, 'help');
}
function shortcutsModal() {
  showModal(tr('留一点时间给思考'), tr('让常用操作更快一步。'), tr('<div class="shortcut-row"><span>快速操作</span><kbd>Ctrl / ⌘ K</kbd></div><div class="shortcut-row"><span>切换主要视图</span><kbd>Ctrl / ⌘ 1–5</kbd></div><div class="shortcut-row"><span>搜索文献</span><kbd>/</kbd></div><div class="shortcut-row"><span>导入文献</span><kbd>N</kbd></div><div class="shortcut-row"><span>切换星图 / 列表</span><kbd>V</kbd></div><div class="shortcut-row"><span>适应全部可见节点</span><kbd>0</kbd></div><div class="shortcut-row"><span>关闭弹窗 / 详情</span><kbd>Esc</kbd></div><div class="shortcut-row"><span>快捷键说明</span><kbd>?</kbd></div><div class="modal-footer"><button class="primary" data-action="close-modal">记住了</button></div>'), 'shortcuts');
}

function renderGraphPreferences(){const select=document.querySelector('[data-graph-setting="appearance"]');if(select){const options=[['theme',tr('跟随主题包')],['classic',tr('经典圆点')],['orbital',tr('轨道圆环')],['crystal',tr('晶格节点')],['cosmos',tr('宇宙星野')],...getGraphThemeOptions().map(t=>[t.id,tr('主题形态 · ',false)+t.name])];if(!options.some(([id])=>id===state.graphPreferences.appearance))options.push([state.graphPreferences.appearance,tr('原主题已移除 · 暂时跟随当前主题')]);select.replaceChildren(...options.map(([id,name])=>new Option(name,id)));}document.querySelectorAll('[data-graph-setting]').forEach(input=>{const value=state.graphPreferences[input.dataset.graphSetting];if(input.type==='checkbox')input.checked=Boolean(value);else input.value=String(value);});document.querySelectorAll('[data-graph-output]').forEach(output=>{output.textContent=state.graphPreferences[output.dataset.graphOutput];});}
function saveGraphPreferences(){clearTimeout(graphPreferenceTimer);graphPreferenceTimer=setTimeout(()=>setSetting('graphPreferences',state.graphPreferences).catch(error=>toast(error.message,true)),400);}
document.addEventListener('input',event=>{const key=event.target.dataset.graphSetting;if(!key)return;if(key==='appearance'){state.graphPreferences=cleanGraphSettings({...state.graphPreferences,appearance:event.target.value});map.configure(state.graphPreferences,collections(),state.associations);map.applyAppearance();saveGraphPreferences();return;}state.graphPreferences=cleanGraphSettings({...state.graphPreferences,[key]:event.target.type==='checkbox'?event.target.checked:event.target.type==='range'?Number(event.target.value):event.target.value});render();saveGraphPreferences();});
document.addEventListener('change',event=>{if(event.target.matches('select[data-graph-setting]')){const key=event.target.dataset.graphSetting;if(key==='appearance')return;state.graphPreferences=cleanGraphSettings({...state.graphPreferences,[key]:key==='localDepth'?Number(event.target.value):event.target.value});render();saveGraphPreferences();}});

function openAdvancedFilters() { if (!$('#advanced-filter-dialog').open) $('#advanced-filter-dialog').showModal(); $('#filter-button').setAttribute('aria-expanded','true'); }
$('#advanced-filter-dialog').addEventListener('close',()=>$('#filter-button').setAttribute('aria-expanded','false'));

const actions = {
  'ai-agent': () => agentController.open(),
  'vocabulary': () => vocabularyController.open(),
  import: () => importModal(), 'choose-pdf': () => $('#pdf-input').click(),
  'download-md-template': () => saveText(markdownTemplate(), 'materia-metadata-template.md', 'md'),
  'performance-editor': () => performanceEditor.open(state.selected),
  'toggle-compare': async () => { await comparison.toggle(state.selected); comparison.refreshBar(); renderDetail(); hydrateIcons($('#detail-panel')); },
  'close-modal': closeModal, 'new-collection': newCollectionModal, edit: editModal, favorite: () => favorite(),
  'open-pdf': () => openPDF(), 'download-pdf': () => openPDF(true), delete: () => deleteModal(),
  'select-filtered': () => comparison.selectFiltered(),
  'batch-remove': () => deleteModal([...state.compareIds]), 'bulk-edit': () => bulkEditor.open(),
  'paper-collection': () => paperActions.picker([state.selected]), 'batch-collection': () => paperActions.picker([...state.compareIds]),
  'detach-collection': () => paperActions.detach([state.selected]),
  'confirm-removal': confirmRemoval, 'undo-removal': undoRemoval,
  'research-canvas': () => researchCanvas.open(),
  themes: () => themeController.open(), settings: settingsModal, 'storage-info': settingsModal, export: exportLibrary, restore: () => $('#backup-input').click(),
  help: helpModal, shortcuts: shortcutsModal,
  'zoom-in': () => map.zoom(1.2), 'zoom-out': () => map.zoom(1 / 1.2), fit: () => map.fit(),
  'clear-tag': () => { state.tag = ''; render(); }, 'restore-hidden': () => { state.hiddenIds.clear(); state.hiddenTagNodes.clear(); render(); }, 'hide-node': () => { if (state.selected) { state.hiddenIds.add(state.selected); render(); } }, 'graph-motion': () => { $('#graph-motion').textContent = map.toggleMotion() ? tr('暂停布局') : tr('继续布局'); }, 'graph-relayout': () => map.arrangeNaturalLayout(), 'graph-arrange':()=>map.naturalTask?map.cancelNaturalLayout():map.arrangeNaturalLayout(), 'graph-arrange-all':()=>map.arrangeNaturalLayout({releasePins:true}), 'graph-arrange-undo':()=>map.undoNaturalLayout(), 'graph-release-pins': () => { map.releasePins(); },
  'reset-filters': () => resetFilters(),
  'toggle-sidebar': () => {state.leftPanelOpen=!state.leftPanelOpen;render();},'toggle-detail': () => {state.detailOpen=!state.detailOpen;render();},'toggle-local': () => {state.graphPreferences.localMode=!state.graphPreferences.localMode;render();saveGraphPreferences();},'associations':()=>associationController.open(),'reset-graph-settings':()=>{state.graphPreferences={...GRAPH_DEFAULTS};render();saveGraphPreferences();},
  'graph-focus': () => { state.focusGraph = !state.focusGraph; render(); window.scrollTo({top:0}); },
  'close-detail': () => $('#detail-panel').classList.remove('mobile-open'),
  'more-list': () => { state.listLimit += 100; renderList(visiblePapers()); hydrateIcons($('#paper-list')); },
  filters: openAdvancedFilters, 'close-filters': () => $('#advanced-filter-dialog').close(),
  'toggle-prediction': () => {
    if(!workspaceModules.available('prediction')||!['materials','prediction'].includes(state.view))return;
    state.view=state.view==='materials'?'prediction':'materials';render();
  },
  menu: () => $('#sidebar').classList.toggle('mobile-open'),
  'parameter-index': () => parameterFinder.open(), 'clear-parameter': () => { state.filters.parameterName='';state.filters.parameterUnit='*';render(); }, 'plot-parameter-results': plotActiveParameter, 'select-parameter-results': async()=>{await comparison.selectIds(visiblePapers().map(p=>p.id));renderParameterSummary(visiblePapers());},
  'tag-index': () => notes.openIndex(),
  'module-settings':()=>showModal(tr('功能管理'),'',workspaceModules.settingsHTML()+html`<div class="modal-footer"><button class="primary" data-action="close-modal">完成</button></div>`,'modules'),
  'paper-notes': () => { if (state.selected) notes.open('paper', state.selected); },
  'open-folder': () => native?.openFolder(),
  'sync-folders':async()=>{await native?.syncFolders();await reloadLibrary();render();await settingsModal();},
  'choose-folder': async () => {
    await comparison.flushSelection();await workspaceModules.flush();await researchCanvas.flush();
    switchingLibrary = true; clearTimeout(layoutTimer);
    let info;
    try { info = await native?.chooseFolder(); } finally { switchingLibrary = false; }
    if (!info) return;
    researchCanvas.reset();
    await workspaceModules.reset();
    workspaceChrome.restore(info.path);
    await workspaceModules.loadPreferences(await getSetting('workspaceModules'));
    await agentController.changeLibrary();
    themeController.load(await getSetting('themePreferences'));
    map.setLayout(await getSetting('graphLayout') || {});
    state.graphPreferences=cleanGraphSettings(await getSetting('graphPreferences')||{});state.associations=cleanAssociations(await getSetting('graphAssociations')||[]);
    lastRemoval = await getSetting('lastRemoval') || null; state.desktopInfo = info; state.papers = await getPapers(); state.collections = await getSetting('collections') || []; state.notes = await getSetting('notes') || {}; state.journalMetrics = await getSetting('journalMetrics') || []; state.compareIds = new Set((await getSetting('comparisonSelection') || []).filter(id=>state.papers.some(p=>p.id===id))); comparison.loadPreferences(await getSetting('chartPreferences')||{});comparison.loadSelectionPreferences(await getSetting('comparisonState'));materialList.reset();state.mode = 'own'; state.selected = ''; state.nav = 'all'; resetFilters(false); map.fit(); closeModal(); render(); toast(msg`已打开文献库：${info.path}`);
  },
  'import-metadata': () => dataImportModal('metadata'),
  'import-metrics': () => dataImportModal('metrics'),
  'journal-catalog': journalCatalogModal, 'export-metrics': exportMetrics,
  'data-file': () => $('#data-input').click(),
  'metadata-template': () => downloadTemplate('metadata'),
  'metrics-template': () => downloadTemplate('metrics'),
};

document.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (removalBusy || bulkEditor?.isBusy() || paperActions?.isBusy()) return;
  if(button?.matches('[data-paper-menu],[data-collection-command]'))return;
  if(event.target.closest('[data-reading-paper],[data-reading-selected],[data-reading-filter],[data-reading-set]'))return;
  try {
    if (button?.matches('[data-note-location],[data-reader-image],[data-theme-id],[data-theme-action],[data-theme-remove],[data-association-kind],[data-add-association],[data-remove-association],[data-association-clear],[data-parameter-name],[data-link-paper],[data-link-tag],[data-note-action],[data-note-edit],[data-note-delete],[data-note-owner-type],[data-comparison-action],[data-comparison-tab],[data-comparison-remove],[data-bulk-action],[data-batch-action],[data-batch-remove],[data-batch-md-remove],[data-performance-add],[data-performance-remove]') || event.target.closest('.compare-checkbox')) return;
    if (button?.dataset.action && actions[button.dataset.action]) { await actions[button.dataset.action](); return; }
    if (button?.dataset.favorite) { await favorite(button.dataset.favorite); return; }
    if (button?.dataset.nav) {
      state.filters = emptyFilters();
      state.nav = button.dataset.nav; state.collection = ''; state.selected = ''; state.view = state.nav === 'all' ? 'graph' : 'list'; state.tag = ''; state.year = ''; state.query = ''; state.sort = 'newest'; $('#search').value = ''; state.listLimit = 100;
      $('#sidebar').classList.remove('mobile-open'); render(); return;
    }
    if (button?.dataset.collection) { state.filters = emptyFilters(); state.collection = button.dataset.collection; state.selected = ''; state.query = ''; state.tag = ''; state.year = ''; $('#search').value = ''; $('#sidebar').classList.remove('mobile-open'); render(); return; }
    if (button?.dataset.view) { state.view = button.dataset.view; if(state.view==='materials'){state.nav='library';state.collection='';resetFilters(false);} render(); return; }
    if (button?.dataset.tag) { state.tag = state.tag === button.dataset.tag ? '' : button.dataset.tag; state.selected = ''; state.listLimit = 100; render(); return; }
    if (button?.dataset.journal) { state.filters.journal = button.dataset.journal; openAdvancedFilters(); render(); return; }
    if (button?.dataset.author) { state.filters.author = button.dataset.author; openAdvancedFilters(); render(); return; }
    if (button?.dataset.institution) { state.filters.institution = button.dataset.institution; openAdvancedFilters(); render(); return; }
    if (button?.dataset.removeExcludedTag) { state.filters.excludeTags = state.filters.excludeTags.filter(tag => tag !== button.dataset.removeExcludedTag); render(); return; }
    if (button?.dataset.removeFilterTag) { state.filters.tags = state.filters.tags.filter(t => t !== button.dataset.removeFilterTag); render(); return; }
    if (button?.dataset.related) { resetFilters(false); state.nav = 'all'; state.selected = button.dataset.related; render(); return; }
        if (button?.dataset.color) { $('#collection-form [name="color"]').value = button.dataset.color; document.querySelectorAll('.color-choice').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); }); return; }
    const row = event.target.closest('.paper-row[data-select]');
    if (row && event.shiftKey) {
      event.preventDefault();
      await comparison.toggle(row.dataset.select);
      renderParameterSummary(visiblePapers());
      return;
    }
    const selectedRow = event.target.closest('[data-select]'); if (selectedRow) { selectPaper(selectedRow.dataset.select, true); return; }
    if (matchMedia('(max-width: 650px)').matches && !event.target.closest('#sidebar')) $('#sidebar').classList.remove('mobile-open');
    if ($('#detail-panel').classList.contains('mobile-open') && !event.target.closest('#detail-panel')) $('#detail-panel').classList.remove('mobile-open');
  } catch (error) { toast(msg`操作未完成：${error.message || tr('请重试。')}`, true); if (button) button.disabled = false; }
});

document.addEventListener('submit', async event => {
  if (!['edit-form', 'collection-form', 'data-import-form'].includes(event.target.id)) return;
  event.preventDefault();
  try { if (event.target.id === 'edit-form') await submitEdit(event.target); else if (event.target.id === 'data-import-form') await previewDataImport(); else await submitCollection(event.target); }
  catch (error) { toast(msg`保存失败：${error.message || tr('请重试。')}`, true); }
});

$('#search').addEventListener('input', event => { state.query = event.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.listLimit = 100; render(); }, 140); });
$('#search-scope').addEventListener('change', event => { state.searchScope = event.target.value; state.listLimit = 100; render(); });
$('#year-filter').addEventListener('change', event => { state.year = event.target.value; state.listLimit = 100; render(); });
$('#sort-order').addEventListener('change', event => { state.sort = event.target.value; render(); });
$('#pdf-input').addEventListener('change', async event => { try { await addFiles([...event.target.files]); } catch (error) { toast(error.message, true); } event.target.value = ''; });
$('#backup-input').addEventListener('change', async event => { try { await restoreFile(event.target.files[0]); } catch (error) { toast(error.message, true); } event.target.value = ''; });
$('#modal').addEventListener('click', event => { if (event.target === $('#modal')) { const bounds = $('#modal').getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeModal(); } });
$('#modal').addEventListener('close', () => { comparison?.dispose(); modalContext = ''; state.pendingFiles = []; pendingRemovalIds = []; });
$('#modal').addEventListener('cancel', event => { if (batch?.isBusy() || bulkEditor?.isBusy() || paperActions?.isBusy() || performanceEditor?.isBusy() || themeController?.isBusy() || removalBusy) { event.preventDefault(); toast(tr('正在保存更改，请稍候。')); } });

let dragDepth = 0;
document.addEventListener('dragenter', event => { if (![...event.dataTransfer.types].includes('Files')) return; event.preventDefault(); dragDepth++; if (!$('#modal').open) $('#drop-overlay').hidden = false; else if (modalContext === 'import') $('.upload-zone')?.classList.add('dragging'); });
document.addEventListener('dragover', event => { if ([...event.dataTransfer.types].includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } });
document.addEventListener('dragleave', event => { if (!event.dataTransfer || ![...event.dataTransfer.types].includes('Files')) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) { $('#drop-overlay').hidden = true; $('.upload-zone')?.classList.remove('dragging'); } });
document.addEventListener('drop', async event => { if (!event.dataTransfer.files.length) return; event.preventDefault(); dragDepth = 0; $('#drop-overlay').hidden = true; $('.upload-zone')?.classList.remove('dragging'); if ($('#modal').open && modalContext !== 'import') { toast(tr('请先关闭当前弹窗，再拖入 PDF。')); return; } try { await addFiles([...event.dataTransfer.files]); } catch (error) { toast(error.message, true); } });

document.addEventListener('keydown', event => {
  if(event.defaultPrevented||event.target.closest('#workspace-command-dialog, #material-list-filter-dialog'))return;
  if (event.key === 'Escape') { $('#detail-panel').classList.remove('mobile-open'); $('#sidebar').classList.remove('mobile-open'); return; }
  if (event.target.closest('#vocabulary-dialog') || event.target.matches('input,textarea,select') || event.target.isContentEditable || event.metaKey || event.ctrlKey || event.altKey || $('#modal').open || reader?.isOpen() || researchCanvas?.isOpen()) return;
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-select]')) { event.preventDefault(); selectPaper(event.target.dataset.select, true); return; }
  if (event.key === '/') { event.preventDefault(); $('#search').focus(); }
  if (event.key.toLowerCase() === 'n') { event.preventDefault(); importModal(); }
  if (event.key.toLowerCase() === 'v') { state.view = state.view === 'graph' ? 'list' : 'graph'; render(); }
  if (event.key === '0') map.fit();
  if (event.key === '?') { event.preventDefault(); shortcutsModal(); }
});
window.addEventListener('pagehide', () => { for (const url of activeObjectURLs) URL.revokeObjectURL(url); });

function renderFilterOptions() {
  const all = papers(), select = (id, items, initial, current) => {
    $(id).innerHTML = `<option value="">${initial}</option>` + [...new Set(items.filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b))).map(value => `<option value="${escape(value)}">${escape(value)}</option>`).join('');
    $(id).value = current || '';
  };
  select('#tag-filter-add', [...eligibleTags(all)].filter(t => !state.filters.tags.includes(t)), tr('全部标签'), '');
  select('#graph-tag-hide', [...eligibleTags(all)].filter(tag => !state.hiddenTagNodes.has(tag)), tr('选择要隐藏的标签节点…'), '');
  select('#excluded-tag-add', [...eligibleTags(all)].filter(tag => !state.filters.excludeTags.includes(tag)), tr('隐藏包含此标签的文献…'), '');
  $('#excluded-filter-tags').innerHTML = state.filters.excludeTags.map(tag => html`<button class="tag excluded-tag" data-remove-excluded-tag="${escape(tag)}">排除 ${escape(tag)} ×</button>`).join('');
  select('#journal-filter', all.map(p => p.journal), tr('全部期刊'), state.filters.journal);
  select('#impact-year-filter', [...state.journalMetrics.map(m => m.year), ...all.map(p => p.impactYear)], tr('各刊最新 / 文献指定'), state.filters.impactYear);
  $('#folder-filter').innerHTML = tr('<option value="">全部分组</option>',false) + collections().map(c => `<option value="${escape(c.id)}">${escape(c.name)}</option>`).join('');
  $('#folder-filter').value = state.collection;
  $('#selected-filter-tags').innerHTML = state.filters.tags.map(t => `<button class="tag" data-remove-filter-tag="${escape(t)}">${escape(t)} ×</button>`).join('');
  document.querySelectorAll('[data-filter]').forEach(input => { if (input.type === 'checkbox') input.checked = Boolean(state.filters[input.dataset.filter]); else if (input.value !== String(state.filters[input.dataset.filter] ?? '')) input.value = state.filters[input.dataset.filter] ?? ''; });
  $('#show-edges').checked = state.showEdges; $('#show-labels').checked = state.showLabels;
  $('#filter-panel').classList.toggle('has-conflict', Boolean(state.filters.minIF !== '' && state.filters.maxIF !== '' && Number(state.filters.minIF) > Number(state.filters.maxIF)) || Boolean(state.filters.yearFrom && state.filters.yearTo && Number(state.filters.yearFrom) > Number(state.filters.yearTo)));
}
document.querySelectorAll('[data-filter]').forEach(input => input.addEventListener(input.tagName === 'INPUT' && input.type !== 'checkbox' ? 'input' : 'change', event => {
  state.filters[input.dataset.filter] = input.type === 'checkbox' ? input.checked : input.value;
  state.listLimit = 100;
  if (event.type === 'input') { clearTimeout(searchTimer); searchTimer = setTimeout(render, 160); } else render();
}));
$('#graph-tag-hide').addEventListener('change',event=>{if(event.target.value)state.hiddenTagNodes.add(event.target.value);render();});
$('#excluded-tag-add').addEventListener('change',event=>{if(event.target.value)state.filters.excludeTags.push(event.target.value);render();});
$('#tag-filter-add').addEventListener('change', event => { if (event.target.value) state.filters.tags.push(event.target.value); render(); });
$('#folder-filter').addEventListener('change', event => { state.collection = event.target.value; render(); });
$('#show-edges').addEventListener('change', event => { state.showEdges = event.target.checked; render(); });
$('#show-labels').addEventListener('change', event => { state.showLabels = event.target.checked; render(); });

let dataImportKind = 'metadata';
function dataImportModal(kind) {
  if (!ensureStorage()) return;
  if (kind === 'metadata') { batch.open(); return; }
  dataImportKind = kind;
  showModal(kind === 'metrics' ? tr('导入期刊影响因子') : tr('导入文献元数据'), kind === 'metrics' ? tr('CSV / JSON · 按期刊名称与指标年份匹配') : tr('粘贴其他 AI 整理的 JSON，匹配已有 PDF。'), html`<form id="data-import-form"><div class="data-import-actions"><button type="button" class="outline-button" data-action="data-file">选择 ${kind === 'metrics' ? 'CSV / JSON' : 'JSON'} 文件</button><button type="button" class="text-button" data-action="${kind === 'metrics' ? 'metrics-template' : 'metadata-template'}">下载格式模板</button></div><label class="form-field">${kind === 'metrics' ? tr('期刊指标数据') : tr('文献元数据 JSON')}<textarea id="data-import-text" spellcheck="false" placeholder="${kind === 'metrics' ? 'journal,impactFactor,year,source' : tr('粘贴 JSON 数组，或包含 papers 数组的对象')}" required></textarea></label><div class="info-box">${kind === 'metrics' ? tr('必填：journal（期刊）、impactFactor（数值）、year（指标年份）。可填 source（来源）。同名期刊、同年份的指标将更新，其他年份保留；默认使用各刊最新导入年份。') : tr('通过 id、filename、doi、title 依次匹配；存在重名歧义时跳过。authors 支持 [{name, affiliations: [...]}]，可完整保存全部作者及机构。未提供的字段保留原值。')}</div><div class="modal-footer"><button type="button" class="text-button" data-action="close-modal">取消</button><button class="primary" type="submit">预览导入</button></div></form>`, 'data-import');
}
$('#data-input').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  if (file.size > 30 * 1024 * 1024) { toast(tr('元数据文件超过 30 MB，请拆分后导入。'), true); return; }
  try { const text = await file.text(); if ($('#data-import-text')) $('#data-import-text').value = text; } catch (error) { toast(error.message, true); }
});
async function previewDataImport() {
  const kind = dataImportKind, text = $('#data-import-text').value;
  const incoming = kind === 'metrics' ? parseMetrics(text) : matchMetadata(text, state.papers);
  if (kind === 'metadata' && !incoming.updates.length) { toast(tr('没有唯一匹配的文献。请核对 PDF 文件名或文献标题。'), true); return; }
  const message = kind === 'metrics' ? msg`${incoming.length} 条期刊年度指标将导入。` : msg`${incoming.updates.length} 篇文献将更新；${incoming.unmatched.length} 条未匹配或存在歧义，将跳过。`;
  showModal(tr('确认导入这些信息'), message, html`<div class="import-preview-list">${kind === 'metrics' ? incoming.slice(0, 12).map(m => `<p><strong>${escape(m.journal)}</strong><span>IF ${m.impactFactor} · ${escape(m.year)}</span></p>`).join('') : incoming.updates.slice(0, 12).map(p => html`<p><strong>${displayTitle(p.title)}</strong><span>${p.authorDetails?.length || 0} 位作者 · ${p.tags.length} 个标签</span></p>`).join('')}${kind === 'metadata' && incoming.unmatched.length ? html`<small>未匹配：${escape(incoming.unmatched.slice(0, 8).join('；'))}</small>` : ''}</div><div class="modal-footer"><button class="text-button" data-action="close-modal">取消</button><button class="primary" id="confirm-data-import">确认导入</button></div>`, 'data-confirm');
  $('#confirm-data-import').addEventListener('click', async event => {
    const button = event.currentTarget; button.disabled = true;
    try {
      if (kind === 'metrics') { const merged = mergeMetrics(state.journalMetrics, incoming); await setSetting('journalMetrics', merged); state.journalMetrics = merged; }
      else { await putPapers(incoming.updates); state.papers = await getPapers(); state.notes = await getSetting('notes') || {}; }
      state.mode = 'own'; await setSetting('mode', 'own'); resetFilters(false); closeModal(); render(); toast(message);
    } catch (error) { button.disabled = false; toast(msg`导入失败：${error.message}`, true); }
  });
}
async function downloadTemplate(kind) {
  if (kind === 'metadata') { await saveText(markdownTemplate(state.papers.length ? state.papers.map(p=>p.filename) : undefined), 'materia-metadata-template.md', 'md'); return; }
  const title = state.papers[0]?.title || tr('请替换为实际论文标题');
  const content = kind === 'metrics' ? tr('\uFEFFjournal,impactFactor,year,source\r\n期刊完整名称,0.0,2025,请填写指标来源\r\n') : JSON.stringify({ papers: [{ filename: state.papers[0]?.filename || 'your-paper.pdf', title, authors: [{ name: tr('作者一'), affiliations: [tr('机构一'), tr('机构二')] }, { name: tr('作者二'), affiliations: [tr('机构二')] }], journal: tr('期刊完整名称'), year: '2025', tags: [tr('材料体系'), tr('工艺')], doi: '', impactFactor: null, impactYear: '' }] }, null, 2);
  const filename = kind === 'metrics' ? 'materia-journal-metrics-template.csv' : 'materia-metadata-template.json';
  if (native) { await native.saveText({ filename, content, type: kind === 'metrics' ? 'csv' : 'json' }); return; }
  const url = URL.createObjectURL(new Blob([content], { type: kind === 'metrics' ? 'text/csv;charset=utf-8' : 'application/json' })); triggerDownload(url, filename); setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function saveText(content,filename,type) {
  if (native) return native.saveText({content,filename,type});
  const url=URL.createObjectURL(new Blob([content],{type:type==='svg'?'image/svg+xml;charset=utf-8':type==='css'?'text/css;charset=utf-8':type==='md'?'text/markdown;charset=utf-8':'text/plain;charset=utf-8'}));triggerDownload(url,filename);setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function reloadLibrary() {
  state.papers=await getPapers();state.notes=await getSetting('notes') || {};state.collections=await getSetting('collections') || [];state.journalMetrics=await getSetting('journalMetrics') || [];
  state.compareIds=new Set((await getSetting('comparisonSelection') || []).filter(id=>state.papers.some(p=>p.id===id)));
  lastRemoval = await getSetting('lastRemoval') || null;
}
async function openStudySource(source){
  const paper=state.papers.find(row=>row.id===source.paperId);
  if(!paper)throw new Error(tr('原文献已不在当前文献库，词义和摘录仍保留在生词本。'));
  if(source.fingerprint&&paper.fingerprint&&source.fingerprint!==paper.fingerprint)throw new Error(tr('这篇文献的 PDF 已更换，原页码可能不同；可在文献列表打开新版。'));
  await reader.openAt(paper.id,source.page);
}
vocabularyController=createVocabularyController({escape,saveText,openSource:openStudySource});
reader=createPDFReader({escape,toast,saveText,openStudySource,translate:(...args)=>agentController.translate(...args),translationStatus:()=>agentController.serviceStatus(),configureTranslation:async()=>{if(await reader.close())await agentController.openSettings();},getPaper:id=>state.papers.find(p=>p.id===id),getNotes:()=>state.notes,renderText:body=>notes.renderText(body),beforeOpen:closeModal,openTag:tag=>notes.open('tag',tag),readPDF:async p=>native?native.readPdf(p.id):p.file?new Uint8Array(await p.file.arrayBuffer()):Promise.reject(new Error(tr('这条文献没有 PDF 文件'))),getPosition:()=>getSetting('readerState'),getDrafts:()=>getSetting('readerDrafts'),saveDrafts:value=>{if(native&&!state.desktopInfo?.readerDraftsVersion)return Promise.reject(new Error(tr('请重新启动 Materia 以启用本地草稿；内容仍保留在编辑区，也可先正式保存笔记。')));return setSetting('readerDrafts',value);},savePosition:value=>native&&!state.desktopInfo?.readerNotesVersion?Promise.resolve():setSetting('readerState',value),saveNote:async(id,note)=>{const key='paper:'+id,list=state.notes[key]||[],next={...state.notes,[key]:[...list.filter(n=>n.id!==note.id),note]};await setSetting('notes',next);state.notes=next;if(state.view==='notes')render();else renderDetail();hydrateIcons($('#detail-panel'));},deleteNote:async(id,noteId)=>{const key='paper:'+id,next={...state.notes,[key]:(state.notes[key]||[]).filter(n=>n.id!==noteId)};await setSetting('notes',next);state.notes=next;if(state.view==='notes')render();else renderDetail();hydrateIcons($('#detail-panel'));},openExternal:async p=>{if(native)return native.openPdf(p.id);if(!p.file)throw new Error(tr('没有 PDF 文件'));const url=URL.createObjectURL(p.file),win=window.open(url,'_blank');if(win)win.opener=null;setTimeout(()=>URL.revokeObjectURL(url),60000);}});
associationController=createAssociationController({escape,showModal,toast,getPapers:papers,getVisible:visiblePapers,getRules:()=>state.associations,save:async rules=>{const clean=cleanAssociations(rules);await setSetting('graphAssociations',clean);state.associations=clean;},changed:render});
themeController=createThemeController({escape,showModal,toast,saveText,persist:async value=>{if(native&&!(Number(state.desktopInfo?.themeSchemaVersion)>=2))throw new Error(tr('请重新启动 Materia 后再保存主题，当前桌面存储接口尚未支持完整主题包。'));if(native&&!(Number(state.desktopInfo?.graphThemeVersion)>=4))throw new Error(tr('请重新启动 Materia 后再保存主题，当前桌面存储接口尚未支持新版星图主题。'));await setSetting('themePreferences',value);},changed:()=>{renderGraphPreferences();map.applyAppearance();}});
parameterFinder=createParameterFinder({escape,showModal,toast,getPapers:papers,apply:applyParameterFilter});
comparison=createComparison({escape,showModal,toast,isMaterialList:()=>state.view==='materials',materialSelectionChanged:()=>materialList?.refreshSelection(),canSaveMaterialSelection:()=>!native||Number(state.desktopInfo?.materialSelectionVersion)>=1,canSaveMaterialGroups:()=>!native||Number(state.desktopInfo?.materialGroupsVersion)>=1,saveMaterialSelection:value=>setSetting('comparisonState',value),openSourcePaper:id=>{
  closeModal();
  if(!papers().some(p=>p.id===id)){toast(tr('来源文献已不在当前文献库。'));return;}
  if(state.view==='materials')state.view='list';
  state.nav='all';resetFilters(false);state.selected=id;state.detailOpen=true;render();selectPaper(id,true);
},getPapers:papers,getFiltered:visiblePapers,getMetrics:()=>state.journalMetrics,findParameter:applyParameterFilter,openParameterFinder:()=>parameterFinder.open(),plotActiveParameter,savePreferences:value=>setSetting('chartPreferences',value),getSelection:()=>state.compareIds,setSelection:async ids=>{const previous=state.compareIds;state.compareIds=ids;const refresh=()=>{comparison.refreshBar();renderDetail();hydrateIcons($('#detail-panel'));renderParameterSummary(visiblePapers());};refresh();try{await setSetting('comparisonSelection',[...ids]);}catch(error){if(state.compareIds===ids)state.compareIds=previous;refresh();throw error;}},pickList:()=>{closeModal();state.view='list';render();},saveText,saveDataURL:async(url,filename,type)=>{
  const comma=url.indexOf(','),head=url.slice(0,comma),body=url.slice(comma+1);
  if(type==='svg')return saveText(head.includes(';base64')?new TextDecoder().decode(Uint8Array.from(atob(body),c=>c.charCodeAt(0))):decodeURIComponent(body),filename,'svg');
  if(native){const bytes=Uint8Array.from(atob(body),c=>c.charCodeAt(0));return native.saveImage({filename,bytes,type});}
  const bytes=Uint8Array.from(atob(body),c=>c.charCodeAt(0)),blobUrl=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));triggerDownload(blobUrl,filename);setTimeout(()=>URL.revokeObjectURL(blobUrl),30000);
}});
materialList=createMaterialList({escape,showModal,closeModal,toast,comparison,getPapers:papers,isVisible:()=>state.view==='materials',onCount:(count,total)=>{$('#visible-count').textContent=msg`${count} / ${total} 个材料`;}});
batch=createBatchImporter({escape,showModal,toast,bytesLabel,normalizeTags,folderOptions,getPapers:papers,isOpen:()=>modalContext==='import',putPapers,saveText,persistNotes:async incoming=>{const next=mergeImportNotes(await getSetting('notes') || {},incoming);await setSetting('notes',next);},reload:reloadLibrary,onDone:id=>{closeModal();state.nav='all';state.mode='own';state.selected=id || '';resetFilters(false);map.fit();render();}});
bulkEditor=createBulkEditor({escape,showModal,toast,normalizeTags,getPapers:papers,getCollections:collections,getSelection:()=>state.compareIds,save:bulkEdit,reload:reloadLibrary,done:()=>{closeModal();render();}});
readingStatusController=createReadingStatusController({escape,toast,canEdit:ensureStorage,getPapers:papers,getSelection:()=>state.compareIds,getFilter:()=>state.readingStatus,isVisible:()=>Boolean(workspaceModules?.current()?.libraryView),getScopePapers:()=>filterCatalog(papers(),{...state,readingStatus:''},state.notes,state.journalMetrics),setFilter:value=>{state.readingStatus=value;state.listLimit=100;state.selected='';render();},persist:setReadingStatus,reload:async()=>{await reloadLibrary();render();}});
paperActions=createPaperActions({escape,showModal,closeModal,toast,setReadingStatus:(ids,status)=>readingStatusController.set(ids,status),locate:native?.openPaperFolder? id=>native.openPaperFolder(id):null,parameters:id=>{selectPaper(id);performanceEditor.open(id);},hide:id=>{state.hiddenIds.add(id);render();},canEdit:ensureStorage,getPapers:papers,getCollections:collections,getVisible:visiblePapers,getSelection:()=>state.compareIds,selectPaper,hasPDF:p=>Boolean(p.file||p.pdfPath),isReaderOpen:()=>reader.isOpen(),read:id=>reader.open(id),edit:ids=>{if(ids.length===1){selectPaper(ids[0]);editModal();}else bulkEditor.open(null,ids);},notes:id=>notes.open('paper',id),remove:deleteModal,selectComparison:ids=>comparison.selectIds(ids),assign:bulkEdit,reload:async()=>{await reloadLibrary();render();},star:async(ids,favorite)=>{await putPapers(papers().filter(p=>ids.includes(p.id)).map(p=>({...p,favorite})));},createEmpty:async name=>{if(collections().some(c=>c.name===name))throw new Error(tr('已有同名分组，请直接选择该分组。'));await setSetting('collections',[...collections(),{id:uid('folder'),name,color:PALETTE[0]}]);}});
groupActions=createGroupActions({escape,showModal,closeModal,toast,getGroups:collections,openFolder:native?.openGroupFolder?id=>native.openGroupFolder(id):null,save:groups=>setSetting('collections',groups),reload:async()=>{await reloadLibrary();render();}});
performanceEditor=createPerformanceEditor({escape,showModal,toast,getPapers:papers,close:closeModal,save:async(id,materials)=>{const p=state.papers.find(p=>p.id===id);if(!p)throw new Error(tr('找不到文献'));await putPaper(normalizePaperMaterials({...p,materials}));await reloadLibrary();render();}});

async function init() {
  hydrateIcons();
  try {
    themeController.load(await getSetting('themePreferences'));
    state.papers = await getPapers();
    state.collections = await getSetting('collections') || [];
    state.notes = await getSetting('notes') || {};
    state.journalMetrics = await getSetting('journalMetrics') || [];
    state.graphPreferences=cleanGraphSettings(await getSetting('graphPreferences')||{});state.associations=cleanAssociations(await getSetting('graphAssociations')||[]);
    const seededMetrics = seedJournalMetrics(state.journalMetrics);
    if (JSON.stringify(seededMetrics) !== JSON.stringify(state.journalMetrics)) { await setSetting('journalMetrics', seededMetrics); state.journalMetrics = seededMetrics; }
    map.setLayout(await getSetting('graphLayout') || {});
    if (native) state.desktopInfo = await native.info();
    if (location.protocol === 'file:' && !native) throw new Error(tr('桌面文件存储接口没有正常加载。'));
    let migrated = false;
    for (const p of state.papers) if (p.notes && !state.notes[`paper:${p.id}`]) { state.notes[`paper:${p.id}`] = [{ id: `legacy-${p.id}`, body: p.notes, createdAt: p.addedAt, updatedAt: p.addedAt }]; migrated = true; }
    if (migrated) await setSetting('notes', state.notes);
    state.mode = 'own';
    const oldExamples = state.papers.filter(isOldExample);
    for (const p of oldExamples) await deletePaper(p.id);
    if (oldExamples.length) { state.papers = state.papers.filter(p=>!isOldExample(p)); state.notes = removeOldExampleNotes(state.notes, new Set(oldExamples.map(p=>p.id))); await setSetting('notes',state.notes); }
    state.compareIds = new Set((await getSetting('comparisonSelection') || []).filter(id=>state.papers.some(p=>p.id===id)));
    lastRemoval = await getSetting('lastRemoval') || null;
    await setSetting('mode','own');
    comparison.loadPreferences(await getSetting('chartPreferences') || {});comparison.loadSelectionPreferences(await getSetting('comparisonState'));
    state.ready = true;
    workspaceChrome.restore(state.desktopInfo?.path||'browser');
    await workspaceModules.loadPreferences(await getSetting('workspaceModules'));
  } catch (error) {
    state.storageError = true;
    const banner = document.createElement('div'); banner.className = 'storage-error'; banner.textContent = msg`文献库无法读取，原数据已保留：${error.message}`; $('main').prepend(banner);
  }
  render();
  $('.import-main').disabled = !state.ready || state.storageError;
  requestAnimationFrame(()=>requestAnimationFrame(()=>native?.startupReady?.().catch(()=>{})));
}
workspaceModules=createWorkspaceModules({native,libraryKey:()=>state.desktopInfo?.path||'browser',getView:()=>state.view,setView:value=>{state.view=value;},isReady:()=>state.ready&&!state.storageError,getPapers:papers,toast,saveText,readSetting:getSetting,writeSetting:setSetting,persistPreferences:value=>setSetting('workspaceModules',value),changed:()=>render(),
 builtins:{graph:{render(){}},list:{render:()=>renderList(visiblePapers())},materials:{render:()=>materialList.render()},notes:{render:()=>{const filtered=visiblePapers(),count=notes.renderLibrary($('#notes-library'),filtered,{query:['all','notes'].includes(state.searchScope)?state.query:'',sort:state.sort});$('#visible-count').textContent=msg`${count} 条笔记 · ${filtered.length} 篇文献`;}}},

});
workspaceChrome=createWorkspaceChrome({$,getState:()=>state,getViews:()=>workspaceModules.views(),getPapers:papers,toast,canOpen:()=>state.ready&&!state.storageError&&!document.querySelector('dialog[open]')&&!reader?.isOpen()&&!researchCanvas?.isOpen(),runAction:id=>actions[id]?.(),
 clearSearch:()=>{clearTimeout(searchTimer);state.query='';state.listLimit=100;$('#search').value='';render();},
 selectPaper:id=>{resetFilters(false);state.nav='library';state.view='list';state.selected=id;state.detailOpen=true;render();selectPaper(id,true);}
});
researchCanvas=createResearchCanvas({flushBeforeExit:async()=>{await comparison.flushSelection();await workspaceModules.flush();},escape,toast,getPapers:papers,isReady:()=>state.ready&&!state.storageError,
 load:async()=>{if(native){if(typeof native.canvasGet!=='function')throw Error(tr('请重新启动 Materia，以启用研究画布的本地存储接口。'));return native.canvasGet();}return{libraryKey:'browser',state:await getSetting('researchCanvases')};},
 persist:async payload=>{if(native)return native.canvasSave(payload);await setSetting('researchCanvases',payload.state);},saveText,
 openPaper:id=>{if(!papers().some(p=>p.id===id)){toast(tr('关联文献已不在当前文献库。'));return;}state.nav='all';resetFilters(false);state.selected=id;render();selectPaper(id,true);},openTag:tag=>notes.open('tag',tag)
});
agentController = createAgentController({ getPapers: papers, getNotes: () => state.notes, getSelectedIds: () => state.compareIds.size ? [...state.compareIds] : (state.selected ? [state.selected] : []), getSetting, setSetting, isReady: () => state.ready && !state.storageError, openPaper: id => { if (!state.papers.some(p => p.id === id)) { toast(tr('这篇文献已不在当前文献库。')); return; } state.nav='all'; resetFilters(false); state.detailOpen=true; state.selected=id; render(); selectPaper(id,true); } });
onLocaleChange(async()=>{
  if(!state.ready)return;
  workspaceModules.refreshNavigation();render();agentController.refreshLanguage();
  if(modalContext==='settings'){
    await settingsModal();document.querySelector('#interface-language')?.focus();
  }
});
document.addEventListener('change',async event=>{
  if(event.target.id!=='interface-language')return;
  const select=event.target;select.disabled=true;
  try{await setLocale(select.value);}
  catch(error){select.value=getLocale();toast(msg`语言设置未保存：${error.message}`,true);}
  finally{select.disabled=false;}
});
init();


// Folder changes update the catalog without replacing open editors or reader drafts.
native?.onLibraryChanged?.(async info=>{if(switchingLibrary||info.path!==state.desktopInfo?.path)return;try{await reloadLibrary();render();}catch(error){toast(error.message,true);}});
document.addEventListener('change',event=>{if(!event.target.matches('[data-activity-year]'))return;document.querySelector('#settings-import-activity').innerHTML=activityHTML(settingsActivity,Number(event.target.value));});
document.addEventListener('click',event=>{const day=event.target.closest('[data-activity-date]');if(!day)return;const label=document.querySelector('[data-activity-detail]');if(label)label.textContent=day.title;});
