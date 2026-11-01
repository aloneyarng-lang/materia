import {t as tr,html,msg} from './i18n.js';
export function planBulkEdit(papers, collections, ids, options, newId) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 10000 || ids.some(id => typeof id !== 'string')) throw new Error(tr('请先勾选要修改的文献。'));
  const selected = new Set(ids), existing = new Set(papers.map(paper => paper.id));
  if ([...selected].some(id => !existing.has(id))) throw new Error(tr('部分选中文献已不存在，请刷新后重新选择。'));
  const tagMode = options.tagMode || 'keep', groupMode = options.groupMode || 'keep';
  if (!['keep', 'append', 'remove', 'replace'].includes(tagMode) || !['keep', 'set', 'new'].includes(groupMode)) throw new Error(tr('批量修改方式无效。'));
  if (!Array.isArray(options.tags || []) || (options.tags || []).some(tag => typeof tag !== 'string')) throw new Error(tr('标签格式不正确。'));
  const tags = [...new Set((options.tags || []).map(tag => tag.trim()).filter(Boolean))];
  if (tags.some(tag => tag.length > 80)) throw new Error(tr('每个标签最多 80 个字符。'));
  if (['append', 'remove'].includes(tagMode) && !tags.length) throw new Error(tr('请填写要添加或移除的标签。'));
  if (tagMode === 'keep' && groupMode === 'keep') throw new Error(tr('请选择标签或分组的修改方式。'));
  let collection = null, target = options.collection || '';
  if (groupMode === 'new') {
    const name = String(options.groupName || '').trim();
    if (!name || name.length > 80) throw new Error(tr('请填写 1–80 个字符的分组名称。'));
    collection = collections.find(item => item.name === name) || { id: newId, name, color: '#397d78' };
    target = collection.id;
  }
  if (groupMode === 'set' && target && !collections.some(item => item.id === target)) throw new Error(tr('目标分组已不存在。'));
  const updates = [];
  for (const paper of papers) if (selected.has(paper.id)) {
    const previousTags = paper.tags || [];
    const nextTags = tagMode === 'append' ? [...new Set([...previousTags, ...tags])] : tagMode === 'remove' ? previousTags.filter(tag => !tags.includes(tag)) : tagMode === 'replace' ? tags : previousTags;
    if (nextTags.length > 30) throw new Error(msg`「${paper.title}」修改后超过 30 个标签，请减少本次添加的标签。`);
    const nextCollection = groupMode === 'keep' ? paper.collection : target;
    if (JSON.stringify(nextTags) !== JSON.stringify(previousTags) || (nextCollection || '') !== (paper.collection || '')) updates.push({ ...paper, tags: [...nextTags], collection: nextCollection || '' });
  }
  return { updates, collection: collection && !collections.some(item => item.id === collection.id) && updates.length ? collection : null };
}

export function createBulkEditor(config) {
  const esc = config.escape, $ = selector => document.querySelector(selector);
  let ids = [], pending = null, busy = false;
  function open(values = null, targetIds = null) {
    ids = [...(targetIds || config.getSelection())]; pending = null;
    const papers = config.getPapers().filter(paper => ids.includes(paper.id));
    if (!papers.length) { config.toast(tr('请先在文献列表中勾选多篇文献。')); return; }
    const common = (papers[0].tags || []).filter(tag => papers.every(paper => paper.tags.includes(tag)));
    config.showModal(tr('批量修改标签与分组'), msg`${papers.length} 篇选中文献 · 可同时修改标签和分组`, html`<form id="bulk-edit-form"><div class="bulk-common"><span>共同标签</span>${common.map(tag => `<span class="tag">${esc(tag)}</span>`).join('') || tr('<small>暂无共同标签</small>')}</div><div class="bulk-edit-grid"><label class="form-field">标签操作<select name="tagMode"><option value="keep">保持原标签</option><option value="append">追加标签</option><option value="remove">移除指定标签</option><option value="replace">替换全部标签</option></select></label><label class="form-field">标签名称<input name="tags" maxlength="2500" placeholder="用逗号分隔多个标签"><small>追加保留原标签；替换会覆盖所选文献的全部标签，留空则清空。</small></label><label class="form-field">目标分组<select name="group"><option value="__keep__">保持原分组</option><option value="__none__">移出分组</option>${config.getCollections().map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}<option value="__new__">＋ 新建分组并移入</option></select></label><label class="form-field" id="bulk-group-name-field" hidden>新分组名称<input name="groupName" maxlength="80" placeholder="例如：高熵合金 · 强化机制"></label></div><p class="help-inline">仅修改选中文献的标签和分组，笔记、作者、性能参数及 PDF 保留。</p><div class="modal-footer"><button type="button" class="text-button" data-action="close-modal">取消</button><button class="primary" type="submit">预览修改</button></div></form>`, 'bulk-edit');
    if (values) {
      $('#bulk-edit-form [name=tagMode]').value = values.tagMode;
      $('#bulk-edit-form [name=tags]').value = values.tags.join('，');
      $('#bulk-edit-form [name=group]').value = values.groupMode === 'keep' ? '__keep__' : values.groupMode === 'new' ? '__new__' : values.collection || '__none__';
      $('#bulk-edit-form [name=groupName]').value = values.groupName || '';
      $('#bulk-group-name-field').hidden = values.groupMode !== 'new';
    }
  }
  function preview(form) {
    const fields = new FormData(form), group = fields.get('group');
    pending = { tagMode: fields.get('tagMode'), tags: [...new Set(String(fields.get('tags') || '').split(/[,，;；\n]+/).map(tag=>tag.trim()).filter(Boolean))], groupMode: group === '__keep__' ? 'keep' : group === '__new__' ? 'new' : 'set', collection: group === '__none__' ? '' : group, groupName: fields.get('groupName') };
    const plan = planBulkEdit(config.getPapers(), config.getCollections(), ids, pending, 'preview-new-group');
    if (!plan.updates.length) { config.toast(tr('选中文献已经符合这些标签和分组，无需修改。')); return; }
    const groupName = value => config.getCollections().find(item => item.id === value)?.name || (value === 'preview-new-group' ? pending.groupName : tr('未分组'));
    config.showModal(tr('确认批量修改'), msg`${plan.updates.length} 篇文献将更新 · ${ids.length - plan.updates.length} 篇保持原样`, html`<div class="bulk-preview">${plan.updates.map(paper => { const previous = config.getPapers().find(item => item.id === paper.id); return html`<article><strong>${esc(paper.title)}</strong><div><span>标签</span><del>${esc(previous.tags.join(' · ') || tr('无'))}</del><b>→</b><ins>${esc(paper.tags.join(' · ') || tr('清空全部标签'))}</ins></div><div><span>分组</span><del>${esc(groupName(previous.collection))}</del><b>→</b><ins>${esc(groupName(paper.collection))}</ins></div></article>`; }).join('')}</div><div class="modal-footer"><button class="text-button" data-bulk-action="back">返回修改</button><button class="primary" data-bulk-action="save">确认保存 ${plan.updates.length} 篇</button></div>`, 'bulk-edit');
  }
  document.addEventListener('change', event => { if (event.target.matches('#bulk-edit-form [name=group]')) $('#bulk-group-name-field').hidden = event.target.value !== '__new__'; });
  document.addEventListener('submit', event => {
    if (event.target.id !== 'bulk-edit-form') return;
    event.preventDefault(); try { preview(event.target); } catch (error) { config.toast(error.message, true); }
  });
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-bulk-action]'); if (!button || busy) return;
    if (button.dataset.bulkAction === 'back') { open(pending,ids); return; }
    if (button.dataset.bulkAction !== 'save' || !pending) return;
    button.disabled = true; busy = true;
    try { const result = await config.save(ids, pending); await config.reload(); busy = false; config.done(); config.toast(msg`已批量更新 ${result.count} 篇文献的标签与分组。`); }
    catch (error) { config.toast(msg`批量修改未完成：${error.message}`, true); }
    finally { busy = false; button.disabled = false; }
  });
  return { open, isBusy: () => busy };
}
