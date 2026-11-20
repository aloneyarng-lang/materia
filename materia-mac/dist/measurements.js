export function strictNumber(value, label = '数值') {
  const text = String(value ?? '').trim().replace(/^−/, '-');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text) || !Number.isFinite(Number(text))) throw new Error(`${label}必须是独立数字，支持科学计数法；请将单位、范围或 ± 误差放入对应列。`);
  return Number(text);
}
export function normalizeMeasurements(input = []) {
  if (!Array.isArray(input) || input.length > 10000) throw new Error('性能参数需要是记录数组，每个材料最多 10000 条。');
  const ids = new Set();
  return input.map((item, index) => {
    const name = String(item.name ?? item.parameter ?? '').trim(), unit = String(item.unit ?? '').trim();
    if (!name || name.length > 200) throw new Error(`第 ${index + 1} 条性能参数需要参数名称（最多 200 字）。`);
    const value = strictNumber(item.value, `「${name}」的数值`);
    let qualifier = String(item.qualifier || '').trim().replace('>=', '≥').replace('<=', '≤').replace('~', '≈');
    if (!['', '≈', '>', '<', '≥', '≤', '='].includes(qualifier)) throw new Error(`「${name}」的限定符只能是 ≈、>、<、≥、≤ 或空白。`);
    const uncertainty = item.uncertainty === '' || item.uncertainty === null || item.uncertainty === undefined ? null : strictNumber(item.uncertainty, `「${name}」的误差`);
    if (uncertainty !== null && uncertainty < 0) throw new Error('误差不能为负数。');
    const id = String(item.id || `m-${index + 1}`).slice(0, 120);
    if (ids.has(id)) throw new Error('同一材料中的性能记录 ID 不能重复。'); ids.add(id);
    return { id, name, value, unit: unit.slice(0, 120), sample: String(item.sample || '').trim().slice(0, 300), conditions: String(item.conditions || '').trim().slice(0, 3000), source: String(item.source || '').trim().slice(0, 2000), qualifier, uncertainty };
  });
}
