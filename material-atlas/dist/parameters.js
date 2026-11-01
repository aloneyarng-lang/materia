import { parameterNameKey, parameterUnitKey } from './parameter-index.js';
export { chartDataset } from './chart-data.js';
export const parameterKey = (name, unit) => `${parameterNameKey(name)}\u241f${parameterUnitKey(unit)}`;
export { strictNumber, normalizeMeasurements } from './measurements.js';
import { paperMeasurements } from './materials.js';
export function parameterOptions(papers) {
  const map = new Map();
  for (const p of papers) for (const m of paperMeasurements(p)) {
    const key = parameterKey(m.name, m.unit);
    if (!map.has(key)) map.set(key, { key, name: m.name, unit: m.unit || '', count: 0, paperIds: new Set() });
    map.get(key).count++;
    map.get(key).paperIds.add(p.id);
  }
  return [...map.values()].map(({paperIds,...item})=>({...item,paperCount:paperIds.size})).sort((a, b) => a.name.localeCompare(b.name) || a.unit.localeCompare(b.unit));
}
export function axisLabel(axis, options) {
  if (axis === 'year') return tr('发表年份'); if (axis === 'impactFactor') return tr('期刊影响因子 IF');
  const item = options.find(p => 'm:' + p.key === axis);
  return item ? `${item.name}${item.unit ? ` (${item.unit})` : tr('（单位未填）')}` : tr('请选择参数');
}
export function measurementsCSV(papers) {
  const quote = (value, numeric = false) => {
    let text = String(value ?? ''); if (!numeric && /^[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const rows = [['文献标题','发表年份','材料ID','材料名称','成分 / 配方','样品','参数名称','数值','单位','测试条件','来源','限定符','误差','文献ID','DOI','刊物','作者','选择项ID','记录ID']];
  for (const p of papers) for (const m of paperMeasurements(p)) rows.push([p.title, p.year, m.materialId, m.materialName, m.materialComposition, m.sample, m.name, m.value, m.unit, m.conditions, m.source, m.qualifier, m.uncertainty,p.id,p.doi||'',p.journal||'',p.authors||(p.authorDetails||[]).map(a=>a.name).join('; '),p.comparisonSubject?.key||'',m.id||'']);
  return '\uFEFF' + rows.map((r, i) => r.map((v, col) => quote(v, i > 0 && [1,7,12].includes(col))).join(',')).join('\r\n');
}
import {t as tr} from './i18n.js';
