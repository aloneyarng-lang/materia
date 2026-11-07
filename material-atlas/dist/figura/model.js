import {resolveFigureTheme,themeColorParameter} from './schemes/figure-themes.js';

export const schemeID = /^[a-z][a-z0-9-]{0,79}$/;
export const maxRows = 30000;
export const maxColumns = 250;
export const maxCells = 300000;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const scalar = value => typeof value === 'string' || Number.isFinite(value);
const keyPattern = /^[a-z][a-z0-9_-]{0,79}$/i;
const colorPattern = /^#[\da-f]{6}$/i;
const text = (value, max) => typeof value === 'string' && value.length <= max;
const label = (value, max) => text(value, max) && value.trim().length > 0;

export function validateScheme(scheme, id) {
  if (!isObject(scheme) || !schemeID.test(id) || scheme.id !== id) throw Error('方案 ID 必须与目录名一致。');
  if (scheme.apiVersion !== 1) throw Error('绘图方案仅支持 API 1。');
  if (!label(scheme.name, 160) || !label(scheme.version, 80) || !label(scheme.category, 100)
      || !text(scheme.description ?? '', 4000) || !text(scheme.dataDescription ?? '', 4000)) throw Error('方案名称、版本、分类或描述格式不正确。');
  if (scheme.requires != null && (!Array.isArray(scheme.requires) || scheme.requires.length)) throw Error('绘图方案须使用随包提供的 JavaScript。');
  const cover = scheme.cover || 'cover.svg';
  if (typeof cover !== 'string' || !/^[a-z0-9_][a-z0-9_.-]*\.(?:svg|png|jpe?g)$/i.test(cover)) throw Error('封面须为方案目录中的 SVG、PNG 或 JPEG 文件。');
  for (const [items, types] of [[scheme.fields, ['number', 'string']], [scheme.parameters, ['number', 'text', 'color', 'select']]]) {
    if (!Array.isArray(items) || !items.length || items.length > 100 || new Set(items.map(item => item?.key)).size !== items.length
        || items.some(item => !isObject(item) || typeof item.key !== 'string' || !keyPattern.test(item.key) || item.key === 'constructor' || !label(item.label, 160) || !types.includes(item.type))) {
      throw Error('字段或参数的标识、类型、标签无效或重复。');
    }
  }
  for (const field of scheme.fields) {
    if (field.required != null && typeof field.required !== 'boolean' || field.min != null && !Number.isFinite(field.min)) throw Error('字段约束无效：' + field.label);
  }
  for (const parameter of scheme.parameters) validateParameter(parameter, parameter.default);
  for (const key of ['width', 'height']) {
    const parameter = scheme.parameters.find(item => item.key === key);
    if (!parameter || parameter.type !== 'number' || !Number.isInteger(parameter.default) || parameter.default < 100 || parameter.default > 4000) {
      throw Error('方案必须声明有效的 width 和 height 数字参数。');
    }
  }
  return {...scheme, cover};
}

function validateParameter(parameter, value) {
  const {type, min, max, options, label} = parameter;
  const invalid = () => { throw Error('参数无效：' + label); };
  if (type === 'number') {
    if (min != null && !Number.isFinite(min) || max != null && !Number.isFinite(max) || min > max
        || !scalar(value) || String(value).trim() === '' || !Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max) invalid();
    return Number(value);
  }
  if (type === 'color' && (typeof value !== 'string' || !colorPattern.test(value))) invalid();
  if (type === 'select' && (!Array.isArray(options) || !options.length || options.length > 100 || options.some(option => !text(option, 200)) || !options.includes(value))) invalid();
  if (type === 'text' && !text(value, 5000)) invalid();
  return value;
}

export const defaults = scheme => Object.fromEntries(scheme.parameters.map(item => [item.key, item.default]));

export function normalizeTable(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > maxRows + 1 || rows.some(row => !Array.isArray(row))) throw Error('工作表为空或超过 30,000 行。');
  const width = rows.reduce((count, row) => Math.max(count, row.length), 0);
  if (!width || width > maxColumns || width * rows.length > maxCells) throw Error('表格最多支持 250 列和 300,000 个单元格。');
  return rows.map(row => Array.from({length: width}, (_, column) => {
    const value = row[column];
    if (value != null && (!scalar(value) || String(value).length > 10000)) throw Error('表格中含无法读取或过长的单元格。');
    return String(value ?? '');
  }));
}

export function mapColumns(scheme, headers, previous = {}) {
  const normalize = value => value.trim().normalize('NFKC').toLowerCase();
  return Object.fromEntries(scheme.fields.map(field => {
    const aliases = [normalize(field.key), normalize(field.label)];
    return [field.key, headers.includes(previous[field.key]) ? previous[field.key] : headers.find(header => aliases.includes(normalize(header))) || ''];
  }));
}

export function preparePlot(scheme, draft) {
  const {rows, mapping, params} = draft, headers = rows[0];
  if (headers.some(header => !header.trim()) || new Set(headers.map(header => header.trim())).size !== headers.length) throw Error('表头不能为空或重复。');
  const columns = scheme.fields.map(field => {
    const index = headers.indexOf(mapping[field.key]);
    if (index < 0 && field.required !== false) throw Error('请映射字段：' + field.label);
    return {field, index};
  });
  const data = [];
  for (let row = 1; row < rows.length; row++) {
    if (!rows[row].some(value => value.trim())) continue;
    data.push(Object.fromEntries(columns.map(({field, index}) => {
      const value = rows[row][index] ?? '';
      const where = `第 ${row + 1} 行 ${field.label}`;
      if (!value.trim()) {
        if (field.required !== false) throw Error(where + ' 为空。');
        return [field.key, ''];
      }
      if (field.type === 'string') return [field.key, value];
      const number = Number(value);
      if (!Number.isFinite(number)) throw Error(where + ' 必须是有限数字。');
      if (number < field.min) throw Error(where + ' 不能小于 ' + field.min + '。');
      return [field.key, number];
    })));
  }
  if (!data.length) throw Error('请至少输入一行有效数据。');
  const values = Object.fromEntries(scheme.parameters.map(parameter => [parameter.key, validateParameter(parameter, params[parameter.key])]));
  for (const axis of ['x', 'y']) {
    const range = [values[axis + 'Min'], values[axis + 'Max']].filter(value => value != null && value !== '');
    if (range.some(value => !Number.isFinite(Number(value)))) throw Error('坐标范围必须是数字或留空。');
    if (range.length === 2 && Number(range[0]) >= Number(range[1])) throw Error(axis.toUpperCase() + ' 轴最小值须小于最大值。');
  }
  dimensions(values.width, values.height);
  const theme = resolveFigureTheme(draft.themeId);
  if (!theme) return {data, params: values};
  for (const parameter of scheme.parameters) {
    if (parameter.type !== 'color') continue;
    const index = themeColorParameter(parameter.key);
    if (index >= 0) values[parameter.key] = theme.series[index % theme.series.length];
  }
  return {data, params: values, theme};
}

export function dimensions(width, height) {
  if ([width, height].some(value => !Number.isInteger(value) || value < 100 || value > 4000)) throw Error('画布宽高须为 100 至 4000 之间的整数。');
  return {width, height};
}

export const emptyWorkspace = () => ({schemaVersion: 1, projects: [], metadata: {}, draft: null});

export function readDraft(value) {
  if (!isObject(value) || typeof value.schemeId !== 'string' || !schemeID.test(value.schemeId) || !label(value.schemeVersion, 80)
      || !text(value.name, 250) || !isObject(value.mapping) || !isObject(value.params)
      || Object.values(value.mapping).some(column => !text(column, 10000)) || Object.values(value.params).some(parameter => !scalar(parameter))) {
    throw Error('项目格式无效，或缺少方案 ID、版本、数据及参数。');
  }
  return {
    schemeId: value.schemeId, schemeVersion: value.schemeVersion, name: value.name,
    rows: normalizeTable(value.rows), mapping: {...value.mapping}, params: {...value.params},
    ...(resolveFigureTheme(value.themeId) ? {themeId:value.themeId} : {}),
    ...(value.touched ? {touched:true} : {}),
    ...(label(value.projectId, 120) ? {projectId: value.projectId} : {}),
  };
}

export function readWorkspace(value) {
  if (!isObject(value) || value.schemaVersion !== 1 || !Array.isArray(value.projects) || value.projects.length > 200 || !isObject(value.metadata)) {
    throw Error('不支持此绘图工作区格式，或项目超过 200 个。');
  }
  const metadata = Object.fromEntries(Object.entries(value.metadata).map(([id, item]) => {
    if (!schemeID.test(id) || !isObject(item) || !text(item.name, 160) || !text(item.description, 4000)
        || item.cover != null && (!text(item.cover, 4200000) || !/^data:image\/(?:png|jpeg);base64,[a-z0-9+/]+={0,2}$/i.test(item.cover))) {
      throw Error('绘图方案资料无效：' + id);
    }
    return [id, {name:item.name, description:item.description, ...(item.cover ? {cover:item.cover} : {})}];
  }));
  return {schemaVersion: 1, projects: value.projects.map(readDraft), metadata, draft: value.draft == null ? null : readDraft(value.draft)};
}
