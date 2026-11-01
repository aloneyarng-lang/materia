import {t as tr,html,msg} from './i18n.js';
import { paperMeasurements } from './materials.js';
export const parameterNameKey = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase();
export const parameterUnitKey = value => String(value || '').normalize('NFKC').trim();

// Membership is based on the recorded name, independently of plot validity.
export function hasParameter(paper, name, unit = '*') {
  const key = parameterNameKey(name);
  return paperMeasurements(paper).some(measurement => parameterNameKey(measurement.name) === key && (unit === '*' || parameterUnitKey(measurement.unit) === parameterUnitKey(unit)));
}

export function parameterInventory(papers) {
  const names = new Map();
  for (const paper of papers) for (const measurement of paperMeasurements(paper)) {
    const key = parameterNameKey(measurement.name); if (!key) continue;
    if (!names.has(key)) names.set(key, { key, name: String(measurement.name).trim(), papers: new Set(), records: 0, units: new Map() });
    const item = names.get(key), unit = parameterUnitKey(measurement.unit);
    item.papers.add(paper.id); item.records++;
    if (!item.units.has(unit)) item.units.set(unit, { unit, papers: new Set(), records: 0 });
    item.units.get(unit).papers.add(paper.id); item.units.get(unit).records++;
  }
  return [...names.values()].map(item => ({ key: item.key, name: item.name, paperCount: item.papers.size, records: item.records, units: [...item.units.values()].map(unit => ({ unit: unit.unit, paperCount: unit.papers.size, records: unit.records })).sort((a,b)=>b.paperCount-a.paperCount||a.unit.localeCompare(b.unit)) })).sort((a,b)=>b.paperCount-a.paperCount||a.name.localeCompare(b.name));
}

export function parameterResults(papers, name, unit = '*') {
  return papers.filter(paper => hasParameter(paper, name, unit));
}

export function parameterRecordPreview(paper,name,unit,esc){
  const rows=paperMeasurements(paper).filter(row=>parameterNameKey(row.name)===parameterNameKey(name)&&(unit==='*'||parameterUnitKey(row.unit)===parameterUnitKey(unit)));
  const record=row=>`<div class="parameter-result-record"><strong>${esc(row.qualifier||'')}${row.value==null||row.value===''?tr('数值未填'):esc(row.value)} <span>${esc(row.unit||tr('单位未填'))}</span>${row.uncertainty!=null&&row.uncertainty!==''?` <small>± ${esc(row.uncertainty)}</small>`:''}</strong><small>${esc([row.materialName,row.sample!==row.materialName?row.sample:'',row.conditions].filter(Boolean).join(' · ')||tr('样品与条件未填'))}</small>${row.source?html`<details><summary>来源</summary><p>${esc(row.source)}</p></details>`:''}</div>`;
  return `<div class="parameter-result-records">${rows.slice(0,3).map(record).join('')}${rows.length>3?html`<details><summary>展开其余 ${rows.length-3} 条记录</summary>${rows.slice(3).map(record).join('')}</details>`:''}</div>`;
}

export function parameterCards(inventory, query, esc) {
  const words = String(query || '').normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const items = inventory.filter(item => words.every(word => `${item.name} ${item.units.map(unit=>unit.unit).join(' ')}`.toLocaleLowerCase().includes(word)));
  return items.map(item=>html`<article class="parameter-card"><button class="parameter-card-title" data-parameter-name="${esc(item.key)}" data-parameter-unit="*"><strong>${esc(item.name)}</strong><span>${item.paperCount} 篇文献 · ${item.records} 条记录 <b>↗</b></span></button><div class="parameter-unit-list">${item.units.map(unit=>html`<button data-parameter-name="${esc(item.key)}" data-parameter-unit="${esc(unit.unit)}" title="仅查看此单位的文献">${esc(unit.unit || tr('单位未填'))} <span>${unit.paperCount} 篇</span></button>`).join('')}</div><button class="parameter-material-entry" data-material-parameter="${esc(item.key)}" data-material-parameter-unit="*">直接选择此参数的材料 / 样品 →</button></article>`).join('') || tr('<div class="notes-empty">没有匹配的参数。可搜索参数名称或单位；导入或编辑性能记录后会自动加入这里。</div>');
}

export function createParameterFinder(config) {
  let inventory = [];
  function open(query = '') {
    inventory = parameterInventory(config.getPapers());
    config.showModal(tr('按性能参数找文献'), msg`${inventory.length} 个参数名称 · 按整个文献库检索，不受标签篇数限制`, html`<div class="parameter-finder-intro"><strong>先找参数，再选文献。</strong><p>点击名称查看所有单位的相关文献，也可点击单位缩小范围。找到文献后再设置绘图数值与测试条件。</p></div><input id="parameter-finder-query" class="parameter-search" type="search" value="${config.escape(query)}" placeholder="搜索参数名称或单位，例如：矫顽力、MPa…" aria-label="搜索性能参数"><div id="parameter-directory" class="parameter-directory">${parameterCards(inventory,query,config.escape)}</div>`, 'parameter-finder');
  }
  document.addEventListener('input',event=>{if(event.target.id==='parameter-finder-query')document.querySelector('#parameter-directory').innerHTML=parameterCards(inventory,event.target.value,config.escape);});
  document.addEventListener('click',async event=>{const button=event.target.closest('[data-parameter-name]');if(button)try{await config.apply(button.dataset.parameterName,button.dataset.parameterUnit ?? '*');}catch(error){config.toast(error.message,true);}});
  return { open };
}
