import { normalizeMeasurements } from './measurements.js';

// Legacy observations are grouped by their exact sample label, without guessing composition.
export function paperMaterials(paper) {
  if (Array.isArray(paper?.materials)) return paper.materials;
  const groups = new Map();
  for (const measurement of paper?.measurements || []) {
    const name = String(measurement.sample || '').trim();
    if (!groups.has(name)) groups.set(name, { id: `legacy-material-${groups.size + 1}`, name: name || '未命名材料', composition: '', description: '', measurements: [] });
    groups.get(name).measurements.push(measurement);
  }
  return [...groups.values()];
}

export function normalizeMaterials(input = []) {
  if (!Array.isArray(input) || input.length > 1000) throw new Error('材料需要是数组，每篇文献最多 1000 个材料。');
  const ids = new Set(); let total = 0;
  return input.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`第 ${index + 1} 个材料格式不正确。`);
    const name = String(item.name ?? '').trim(), id = String(item.id || `material-${index + 1}`);
    if (!name || name.length > 300) throw new Error(`第 ${index + 1} 个材料需要名称（最多 300 字）。`);
    if (!/^[a-z\d_-]{1,120}$/i.test(id) || ids.has(id)) throw new Error('同一文献中的材料 ID 必须唯一，只能包含字母、数字、下划线或短横线。');
    ids.add(id);
    const composition = String(item.composition || '').trim(), description = String(item.description || '').trim();
    if (composition.length > 2000 || description.length > 6000) throw new Error(`材料「${name}」的成分或说明过长。`);
    if (item.measurements !== undefined && !Array.isArray(item.measurements)) throw new Error(`材料「${name}」的性能参数必须是数组。`);
    const measurements = normalizeMeasurements(item.measurements ?? []); total += measurements.length;
    if (total > 10000) throw new Error('每篇文献的材料性能记录合计最多 10000 条。');
    return { id, name, composition, description, measurements };
  });
}

export function materializePaper(paper) {
  if (paper.materials !== undefined && !Array.isArray(paper.materials)) throw new Error('文献的 materials 必须是材料数组。');
  const { measurements, ...metadata } = paper;
  return { ...metadata, materials: structuredClone(paperMaterials(paper)) };
}

export function normalizePaperMaterials(paper) { const result = materializePaper(paper); result.materials = normalizeMaterials(result.materials); return result; }

// A derived view for search, comparison and export. It is never a second stored copy.
export function paperMeasurements(paper) {
  return paperMaterials(paper).flatMap((material,index) => (material.measurements || []).map(measurement => ({
    ...measurement, materialId: material.id||'unidentified-material-'+index, materialName: material.name,
    materialComposition: material.composition || '',
  })));
}
