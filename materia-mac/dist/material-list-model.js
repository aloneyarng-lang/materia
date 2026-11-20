export const materialReference = (paperId, materialId) => JSON.stringify([paperId, materialId]);

export function cleanMaterialGroups(value = []) {
  if (!Array.isArray(value) || value.length > 500) throw Error('材料分组最多支持 500 个。');
  const ids = new Set(), names = new Set(), assigned = new Set();
  return value.map(group => {
    if (!group || typeof group.id !== 'string' || !group.id || group.id.length > 200 || typeof group.name !== 'string' || !group.name.trim() || group.name.trim().length > 80 || !Array.isArray(group.members) || group.members.length > 10000) throw Error('材料分组格式不正确。');
    const name = group.name.trim(), nameKey = name.normalize('NFKC').toLocaleLowerCase();
    if (ids.has(group.id) || names.has(nameKey)) throw Error('材料分组名称或 ID 重复。');
    ids.add(group.id); names.add(nameKey);
    const members = [...new Set(group.members.map(key => {
      let pair; try { pair = JSON.parse(key); } catch { throw Error('材料分组中的材料 ID 已损坏。'); }
      if (!Array.isArray(pair) || pair.length !== 2 || pair.some(id => typeof id !== 'string' || !id || id.length > 200)) throw Error('材料分组中的材料 ID 不正确。');
      return materialReference(...pair);
    }))];
    for (const key of members) {
      if (assigned.has(key)) throw Error('同一材料不能同时归入多个材料分组。');
      assigned.add(key);
    }
    return {id: group.id, name, members};
  });
}

// Membership follows the recorded material, independently of its name or sample conditions.
export function assignMaterialGroup(groups, references, targetId = '') {
  const clean = cleanMaterialGroups(groups), members = new Set(references);
  if (targetId && !clean.some(group => group.id === targetId)) throw Error('材料分组已不存在，请重新选择。');
  return cleanMaterialGroups(clean.map(group => ({...group, members: [
    ...group.members.filter(key => !members.has(key)), ...(group.id === targetId ? members : []),
  ]})));
}

export function mergeMaterialGroups(current, incoming) {
  let result = cleanMaterialGroups(current);
  for (const folder of cleanMaterialGroups(incoming)) {
    const match = result.find(item => item.id === folder.id) || result.find(item => item.name.normalize('NFKC').toLocaleLowerCase() === folder.name.normalize('NFKC').toLocaleLowerCase());
    const id = match?.id || folder.id;
    if (!match) result.push({...folder, members: []});
    else if (!result.some(item => item.id !== id && item.name.normalize('NFKC').toLocaleLowerCase() === folder.name.normalize('NFKC').toLocaleLowerCase())) result = result.map(item => item.id === id ? {...item, name: folder.name} : item);
    result = assignMaterialGroup(result, folder.members, id);
  }
  return result;
}

export function materialListEntries(rows) {
  const map = new Map();
  for (const row of rows) {
    const ref = materialReference(row.paperId, row.materialId);
    if (!map.has(ref)) map.set(ref, {...row, ref, cohorts: []});
    map.get(ref).cohorts.push(row);
  }
  return [...map.values()];
}

export function filterMaterialList(entries, {query = '', group = '', onlySelected = false} = {}, groups = [], keys = []) {
  const words = query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const selected = new Set(keys), memberships = new Map(groups.flatMap(folder => folder.members.map(ref => [ref, folder.id])));
  return entries.filter(entry => {
    if (group === 'ungrouped' ? memberships.has(entry.ref) : group && memberships.get(entry.ref) !== group) return false;
    if (onlySelected && !entry.cohorts.some(row => selected.has(row.key))) return false;
    const content = [entry.materialName, entry.composition, entry.description, entry.paper.title, entry.paper.journal, entry.paper.year,
      ...entry.cohorts.flatMap(row => [row.sample, row.conditions, ...row.measurements.flatMap(m => [m.name, m.value, m.unit])]),
    ].join(' ').normalize('NFKC').toLocaleLowerCase();
    return words.every(word => content.includes(word));
  });
}
