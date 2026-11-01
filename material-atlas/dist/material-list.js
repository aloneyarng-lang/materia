import {t as tr,html,msg} from './i18n.js';
import {materialInventory, resolveMaterialSelection} from './material-selection.js';
import {materialListEntries, filterMaterialList, assignMaterialGroup, cleanMaterialGroups} from './material-list-model.js';
import {icon} from './icons.js';
import {actionMenu} from './action-menus.js';

export function createMaterialList(config) {
  const $ = selector => document.querySelector(selector), esc = config.escape;
  let query = '', group = '', onlySelected = false, limit = 100, queryTimer;
  const selection = () => config.comparison.getMaterialSelection();
  const groups = () => selection().groups || [];
  const entries = () => materialListEntries(materialInventory(config.getPapers()));
  const results = () => filterMaterialList(entries(), {query, group, onlySelected}, groups(), selection().keys);
  const resolved = () => resolveMaterialSelection(config.getPapers(), selection().keys);
  const selectedReferences = () => materialListEntries(resolved().selected).map(entry => entry.ref);

  function render() {
    const host = $('#material-list');
    host.innerHTML = html`<div class="material-library-tools"><label class="material-library-search">${icon('search')}<input id="material-list-query" type="search" maxlength="1000" placeholder="搜索材料、成分、性能参数或来源文献…" value="${esc(query)}" aria-label="搜索材料"></label><label class="material-library-only"><input id="material-list-only-selected" type="checkbox" ${onlySelected ? 'checked' : ''}>只看已选</label><button class="outline-button" data-material-list-action="create-group">${icon('plus')}新建分组</button></div>
      <div class="material-library-groups" role="group" aria-label="材料分组"></div>
      <div class="material-library-selection"><span id="material-list-selected-count" role="status"></span>${actionMenu('material-organize-menu',tr('整理'),tr('<button data-material-list-action="select-results">全选当前结果</button><button data-material-list-action="clear">清空选择</button><hr><button data-material-list-action="assign-group">归入 / 移出分组…</button><button data-material-list-action="table">参数对照</button>'),{iconName:'folder'})}<button class="primary" data-material-list-action="chart">${icon('chart')}对比与作图</button></div>
      <div class="material-library-status"><span data-material-save-status role="status"></span><button class="text-button" data-material-retry hidden>重试保存</button></div>
      <p id="material-list-result-count" class="material-library-count"></p><div id="material-list-rows"></div><button class="outline-button list-load-more" data-material-list-action="more" hidden>显示更多材料</button>`;
    refreshSelection();
  }

  function renderGroups(all) {
    const assigned = new Map(groups().flatMap(folder => folder.members.map(ref => [ref, folder.id])));
    const counts = new Map();
    for (const entry of all) { const id = assigned.get(entry.ref) || 'ungrouped'; counts.set(id, (counts.get(id) || 0) + 1); }
    if (group && group !== 'ungrouped' && !groups().some(folder => folder.id === group)) group = '';
    $('.material-library-groups').innerHTML = [{id: '', name: tr('全部材料'), count: all.length}, {id: 'ungrouped', name: tr('未分组'), count: counts.get('ungrouped') || 0}, ...groups().map(folder => ({...folder, count: counts.get(folder.id) || 0}))]
      .map(folder => `<button type="button" data-material-list-group="${esc(folder.id)}" aria-pressed="${group === folder.id}">${esc(folder.name)}<small>${folder.count}</small></button>`).join('') + (group && group !== 'ungrouped' ? tr('<button class="text-button material-group-settings" data-material-list-action="edit-group">分组设置</button>') : '');
  }

  function refreshSelection() {
    if (!config.isVisible() || !$('#material-list-rows')) return;
    const all = entries(); renderGroups(all);
    const rows = results(), selected = new Set(selection().keys), r = resolved(), shown = new Set(rows.flatMap(entry => entry.cohorts.map(row => row.key)));
    $('#material-list-selected-count').textContent = msg`已选 ${r.materials} 个材料 · ${r.selected.length} 组样品 / 条件 · ${r.papers} 篇来源${r.selected.some(row => !shown.has(row.key)) ? tr(' · 含筛选外选择') : ''}${r.missing.length ? msg` · ${r.missing.length} 项失效选择` : ''}`;
    const totalCohorts = all.reduce((count, entry) => count + entry.cohorts.length, 0);
    $('#material-list-result-count').textContent = msg`当前 ${rows.length} / 全库 ${all.length} 个材料 · 全库 ${totalCohorts} 组样品 / 条件${rows.length > limit ? msg` · 已显示前 ${limit} 个` : ''}`;
    config.onCount?.(rows.length, all.length);
    for (const action of ['assign-group', 'table', 'chart']) $(`[data-material-list-action="${action}"]`).disabled = !r.selected.length;
    $('[data-material-list-action="clear"]').disabled = !selection().keys.length;
    $('[data-material-list-action="select-results"]').disabled = !rows.length;
    $('[data-material-list-action="more"]').hidden = rows.length <= limit;
    const open = new Set([...$('#material-list-rows').querySelectorAll('details[open]')].map(node => node.dataset.materialListDetails));
    const focused = document.activeElement, focusChoice = focused?.dataset.materialListChoice, focusCohort = focused?.dataset.materialListCohort;
    const membership = new Map(groups().flatMap(folder => folder.members.map(ref => [ref, folder.name])));
    $('#material-list-rows').innerHTML = rows.slice(0, limit).map(entry => {
      const count = entry.cohorts.filter(row => selected.has(row.key)).length, measurements = entry.cohorts.flatMap(row => row.measurements);
      const parameters = [...new Set(measurements.map(m => `${m.name} · ${m.unit || tr('单位未填')}`))];
      return html`<article class="material-library-row ${count ? 'is-selected' : ''}" data-material-list-row="${esc(entry.ref)}"><label class="material-library-check"><input type="checkbox" data-material-list-choice="${esc(entry.ref)}" ${count === entry.cohorts.length ? 'checked' : ''} aria-label="选择材料 ${esc(entry.materialName)}，来源 ${esc(entry.paper.title)}"></label><div class="material-library-content"><h3>${esc(entry.materialName)}</h3><p class="material-library-composition">${esc(entry.composition || tr('成分未填写'))}</p>${entry.description ? `<p class="material-library-description">${esc(entry.description)}</p>` : ''}<div class="material-library-badges"><span>${entry.cohorts.length} 组样品 / 条件</span><span>${measurements.length} 条性能记录</span><span>${esc(membership.get(entry.ref) || tr('未分组'))}</span>${count && count < entry.cohorts.length ? html`<span>已选其中 ${count} 组</span>` : ''}</div><div class="material-library-source">来源文献：<button type="button" data-material-open-paper="${esc(entry.paperId)}">${esc(entry.paper.title)}</button><small>${esc([entry.paper.year, entry.paper.journal].filter(Boolean).join(' · '))}</small></div><div class="material-library-parameters">${parameters.slice(0, 5).map(name => `<span>${esc(name)}</span>`).join('') || tr('<span>尚无性能记录</span>')}${parameters.length > 5 ? html`<span>另有 ${parameters.length - 5} 个参数</span>` : ''}</div><details data-material-list-details="${esc(entry.ref)}" ${open.has(entry.ref) ? 'open' : ''}><summary>查看 / 细选样品与测试条件</summary>${entry.cohorts.map(row => html`<label class="material-library-cohort"><input type="checkbox" data-material-list-cohort="${esc(row.key)}" ${selected.has(row.key) ? 'checked' : ''}><span>样品：${esc(row.sample || tr('未填写'))} · 条件：${esc(row.conditions || tr('未填写'))}<small>${row.measurements.length ? row.measurements.slice(0, 4).map(m => `${esc(m.name)} ${m.value === '' || m.value == null ? tr('数值未填') : esc(m.qualifier || '') + esc(m.value)} ${esc(m.unit || tr('单位未填'))}`).join('；') : tr('尚无性能记录')}</small></span></label>`).join('')}</details></div></article>`;
    }).join('') || `<div class="list-empty"><strong>${all.length ? tr('没有匹配的材料') : tr('尚未录入材料')}</strong><p>${all.length ? tr('可调整搜索、切换分组，或关闭「只看已选」。') : tr('在文献详情的「管理材料 / 参数」中添加材料，或批量导入含材料的 Markdown。')}</p>${all.length ? tr('<button class="outline-button" data-material-list-action="reset-filters">清除材料筛选</button>') : ''}</div>`;
    for (const input of $('#material-list-rows').querySelectorAll('[data-material-list-choice]')) {
      const entry = rows.find(row => row.ref === input.dataset.materialListChoice);
      const count = entry.cohorts.filter(row => selected.has(row.key)).length;
      input.indeterminate = count > 0 && count < entry.cohorts.length;
      input.setAttribute('aria-checked', input.indeterminate ? 'mixed' : String(input.checked));
      if (focusChoice === input.dataset.materialListChoice) input.focus({preventScroll: true});
    }
    if (focusCohort) [...$('#material-list-rows').querySelectorAll('[data-material-list-cohort]')].find(input => input.dataset.materialListCohort === focusCohort)?.focus({preventScroll: true});
  }

  function groupDialog(edit = false) {
    const folder = edit && groups().find(item => item.id === group), count = selectedReferences().length;
    if (edit && !folder) return;
    config.showModal(edit ? tr('材料分组设置') : tr('新建材料分组'), tr('分组独立保存，可将同篇或跨文献的材料一起整理。'), html`<form id="material-group-form" data-group-id="${esc(folder?.id || '')}"><label class="field-label">分组名称<input name="name" required maxlength="80" value="${esc(folder?.name || '')}" placeholder="例如：高熵合金、热处理对比"></label>${!edit && count ? html`<label class="material-group-include"><input name="include" type="checkbox" checked>将当前选中的 ${count} 个材料归入新分组</label>` : ''}<div class="modal-footer">${edit ? tr('<button type="button" class="danger-button" data-material-list-action="delete-group">删除分组…</button>') : ''}<button type="button" class="text-button" data-action="close-modal">取消</button><button class="primary" type="submit">${edit ? tr('保存分组') : tr('创建分组')}</button></div></form>`, 'material-group');
    $('#material-group-form [name="name"]').focus();
  }

  function assignDialog() {
    const count = selectedReferences().length;
    if (!count) return;
    config.showModal(tr('整理所选材料'), msg`将当前勾选的 ${count} 个材料整批归组；同一材料的所有样品共用分组。`, html`<form id="material-group-assign-form"><label class="field-label">归入分组<select name="group"><option value="">移出分组（保留在全部材料）</option>${groups().map(folder => `<option value="${esc(folder.id)}" ${group === folder.id ? 'selected' : ''}>${esc(folder.name)}</option>`).join('')}</select></label><div class="modal-footer"><button type="button" class="text-button" data-material-list-action="create-group">新建分组并归入…</button><button type="button" class="text-button" data-action="close-modal">取消</button><button class="primary" type="submit">确认</button></div></form>`, 'material-group');
  }

  document.addEventListener('input', event => {
    if (event.target.id !== 'material-list-query') return;
    query = event.target.value; clearTimeout(queryTimer); queryTimer = setTimeout(() => {limit = 100; refreshSelection();}, 120);
  });
  document.addEventListener('change', async event => {
    const input = event.target;
    if (input.id === 'material-list-only-selected') {onlySelected = input.checked; limit = 100; refreshSelection(); return;}
    if (!input.matches('[data-material-list-choice],[data-material-list-cohort]')) return;
    try {
      const keys = new Set(selection().keys), chosen = input.dataset.materialListCohort ? [input.dataset.materialListCohort] : entries().find(entry => entry.ref === input.dataset.materialListChoice)?.cohorts.map(row => row.key) || [];
      for (const key of chosen) input.checked ? keys.add(key) : keys.delete(key);
      await config.comparison.selectMaterials([...keys]);
    } catch (error) {config.toast(error.message, true); refreshSelection();}
  });
  document.addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-material-list-group')) {group = button.dataset.materialListGroup; limit = 100; refreshSelection(); return;}
    const action = button.dataset.materialListAction; if (!action) return;
    try {
      if (action === 'create-group') groupDialog();
      if (action === 'edit-group') groupDialog(true);
      if (action === 'assign-group') assignDialog();
      if (action === 'clear') await config.comparison.selectMaterials([]);
      if (action === 'select-results') await config.comparison.selectMaterials([...new Set([...selection().keys, ...results().flatMap(entry => entry.cohorts.map(row => row.key))])]);
      if (action === 'table' || action === 'chart') {await config.comparison.flushSelection(); config.comparison.open(action === 'chart' ? 'chart' : 'table', null, 'material');}
      if (action === 'more') {limit += 100; refreshSelection();}
      if (action === 'reset-filters') {query = ''; group = ''; onlySelected = false; limit = 100; render();}
      if (action === 'delete-group') {
        const folder = groups().find(item => item.id === group); if (!folder) return;
        config.showModal(tr('删除材料分组？'), msg`删除「${esc(folder.name)}」后，其中材料将回到未分组，材料与性能数据保留。`, tr('<div class="modal-footer"><button class="text-button" data-action="close-modal">取消</button><button class="danger-button" data-material-list-action="confirm-delete-group">删除分组</button></div>'), 'material-group');
      }
      if (action === 'confirm-delete-group') {button.disabled = true; if (await config.comparison.setMaterialGroups(groups().filter(folder => folder.id !== group))) {group = ''; config.closeModal(); refreshSelection();}}
    } catch (error) {button.disabled = false; config.toast(error.message, true);}
  });
  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!['material-group-form', 'material-group-assign-form'].includes(form.id)) return;
    event.preventDefault(); const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
    try {
      const values = new FormData(form); let next, nextGroup = group;
      if (form.id === 'material-group-assign-form') next = assignMaterialGroup(groups(), selectedReferences(), String(values.get('group')));
      else {
        const id = form.dataset.groupId || `material-group-${crypto.randomUUID()}`, name = String(values.get('name')).trim();
        next = cleanMaterialGroups(form.dataset.groupId ? groups().map(folder => folder.id === id ? {...folder, name} : folder) : [...groups(), {id, name, members: []}]);
        if (values.get('include')) next = assignMaterialGroup(next, selectedReferences(), id);
        form.dataset.groupId = id;
        nextGroup = id;
      }
      if (await config.comparison.setMaterialGroups(next)) {group = nextGroup; limit = 100; config.closeModal(); refreshSelection(); config.toast(tr('材料分组已保存。'));}
    } catch (error) {config.toast(msg`分组未保存：${error.message}`, true);} finally {submit.disabled = false;}
  });
  return {render, refreshSelection, reset: () => {query = ''; group = ''; onlySelected = false; limit = 100; clearTimeout(queryTimer);}};
}
