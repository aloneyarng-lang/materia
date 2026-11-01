import {t as tr,html,msg} from './i18n.js';
import { paperMeasurements } from './materials.js';
import { impactOf } from './catalog.js';
import { parameterKey, strictNumber } from './parameters.js';
import { parameterNameKey } from './parameter-index.js';

export const PLOT_REASONS = {
  get selection(){return tr('原选择项已删除或样品 / 条件发生变更');},
  get pairCondition(){return tr('同材料 / 样品没有相同测试条件的配对参数');},
  get parameter(){return tr('未录入所选参数');}, get unit(){return tr('同名参数使用其他单位');}, get condition(){return tr('测试条件不匹配');}, get sample(){return tr('样品筛选不匹配');},
  get missing(){return tr('缺少年份、IF 或配对参数');}, get invalid(){return tr('坐标数值无效');}, get ambiguous(){return tr('同样品配对参数存在多值歧义');},
  get qualified(){return tr('约数或界限值未开启');}, get nonpositive(){return tr('对数坐标要求数值大于 0');}, get range(){return tr('超出自定义坐标范围');},
};
const number = value => { try { return strictNumber(value); } catch { return null; } };
const errorOf = measurement => { const value = measurement?.uncertainty; return value === '' || value == null ? null : number(value); };

export function chartDataset(papers, config, metrics = []) {
  const points = [], paperStatus = [], skipped = { pairCondition:0, missing: 0, ambiguous: 0, qualified: 0, invalid: 0, condition: 0, sample: 0, nonpositive: 0, range: 0 };
  const xMetric = config.type !== 'bar' && config.x?.startsWith('m:') ? config.x.slice(2) : '', yMetric = config.y?.startsWith('m:') ? config.y.slice(2) : '', anchorKey = yMetric || xMetric;
  const chosenName = anchorKey.split('\u241f')[0];
  for (const paper of papers) {
    const subject=paper.comparisonSubject;
    const measurements = paperMeasurements(paper), sameName = anchorKey ? measurements.filter(m => parameterNameKey(m.name) === chosenName) : [];
    const initial = anchorKey ? measurements.filter(m => parameterKey(m.name,m.unit) === anchorKey) : [null];
    const status = { paperId: paper.id, title: paper.title,...(subject?{subjectKey:subject.key,materialId:subject.materialId,materialName:subject.materialName,sample:subject.sample,conditions:subject.conditions}:{}), recordedRecords: anchorKey ? sameName.length : 1, matchingRecords: initial.length, plottedPoints: 0, reasons: {} };
    paperStatus.push(status);
    const reject = (reason, count = 1) => { status.reasons[reason] = (status.reasons[reason] || 0) + count; skipped[['parameter','unit'].includes(reason) ? 'missing' : reason]++; };
    if (!initial.length) { reject(sameName.length ? 'unit' : 'parameter'); continue; }
    let anchors = initial;
    if (config.condition != null && config.condition !== '*') anchors = anchors.filter(m => (m?.conditions??subject?.conditions??'') === config.condition);
    if (!anchors.length) { reject('condition', initial.length); continue; }
    const beforeSample = anchors.length;
    if (config.sample) anchors = anchors.filter(m => [m?.materialName||subject?.materialName,m?.sample||subject?.sample].filter(Boolean).join(' ').toLocaleLowerCase().includes(config.sample.toLocaleLowerCase()));
    if (!anchors.length) { reject('sample', beforeSample); continue; }
    if (anchors.length < initial.length) {
      if (beforeSample < initial.length) status.reasons.condition = initial.length - beforeSample;
      if (anchors.length < beforeSample) status.reasons.sample = beforeSample - anchors.length;
    }
    for (const anchor of anchors) {
      let ambiguous = false, hasQualifier = false, invalid = false,pairMismatch=false;
      const axisValue = axis => {
        if (axis === 'year') return { value: /^\d{4}$/.test(String(paper.year)) ? Number(paper.year) : null };
        if (axis === 'impactFactor') return { value: impactOf(paper,metrics,config.impactYear)?.value ?? null };
        const key = String(axis || '').slice(2);
        let candidates = anchor && parameterKey(anchor.name,anchor.unit) === key ? [anchor] : measurements.filter(m => parameterKey(m.name,m.unit) === key && m.materialId === anchor?.materialId && (m.sample || '') === (anchor?.sample || ''));
        const exact=candidates.filter(m=>(m.conditions||'')===(anchor?.conditions||''));if(candidates.length&&!exact.length)pairMismatch=true;candidates=exact;
        if (!candidates.length){if(anchor&&(paper.comparisonPairingContext||[]).some(m=>parameterKey(m.name,m.unit)===key&&(m.sample||'')===(anchor.sample||'')&&(m.conditions||'')!==(anchor.conditions||'')))pairMismatch=true;return {value:null};}
        const numeric = candidates.map(m => number(m.value));
        if (numeric.some(value => value === null)) { invalid = true; return { value: null }; }
        const signatures = new Set(candidates.map((m,i)=>`${numeric[i]}|${errorOf(m)}|${m.qualifier || ''}`));
        if (signatures.size > 1) { ambiguous = true; return { value: null }; }
        const measurement = candidates[0];
        hasQualifier ||= Boolean(measurement.qualifier && measurement.qualifier !== '=');
        return { value: numeric[0], measurement, error: errorOf(measurement) };
      };
      const xAxis = config.type === 'bar' ? {value:paperStatus.length} : axisValue(config.x), yAxis = axisValue(config.y), x = xAxis.value, y = yAxis.value;
      if (pairMismatch) { reject('pairCondition'); continue; }
      if (ambiguous) { reject('ambiguous'); continue; }
      if (invalid) { reject('invalid'); continue; }
      if (hasQualifier && !config.includeQualified) { reject('qualified'); continue; }
      if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) { reject('missing'); continue; }
      if ((config.xScale === 'log' && x <= 0 && config.type !== 'bar') || (config.yScale === 'log' && y <= 0)) { reject('nonpositive'); continue; }
      const outside = (axis,value) => ['Min','Max'].some(bound => { const limit = config[axis+bound]; if (limit == null || limit === '') return false; const parsed = number(limit); return parsed !== null && (bound === 'Min' ? value < parsed : value > parsed); });
      if ((config.type !== 'bar' && outside('x',x)) || outside('y',y)) { reject('range'); continue; }
      const group = config.group === 'paper' ? paper.title : config.group === 'material' ? anchor?.materialName || subject?.materialName || tr('未命名材料') : config.group === 'journal' ? paper.journal || tr('期刊未填') : config.group === 'sample' ? anchor?.sample || subject?.sample || tr('样品未命名') : config.group === 'condition' ? anchor?.conditions || subject?.conditions || tr('条件未填') : config.group === 'all' ? tr('全部选中数据') : paper.tags?.[0] || tr('未分类');
      const cohortGroup=subject&&config.type==='line'&&config.group==='material'?'|subject:'+subject.key:'';
      points.push({ x, y, group,selectionKey:subject?.key||'',doi:paper.doi||'',journal:paper.journal||'',authors:paper.authors||(paper.authorDetails||[]).map(a=>a.name).join('; '),xRecordId:xAxis.measurement?.id||'',yRecordId:yAxis.measurement?.id||'',xConditions:xAxis.measurement?.conditions||'',yConditions:yAxis.measurement?.conditions||'', groupKey: (config.group === 'paper' ? `paper:${paper.id}` : config.group === 'material' ? `material:${paper.id}:${anchor?.materialId || subject?.materialId || ''}` : group)+cohortGroup, paperId: paper.id, title: paper.title, year: paper.year, materialId: anchor?.materialId || subject?.materialId || '', materialName: anchor?.materialName || subject?.materialName || '', materialComposition: anchor?.materialComposition || subject?.materialComposition || '', sample: anchor?.sample || subject?.sample || '', conditions: anchor?.conditions || subject?.conditions || '', source: [xAxis.measurement?.source,yAxis.measurement?.source].filter(Boolean).filter((value,index,array)=>array.indexOf(value)===index).join('；'), qualifier: yAxis.measurement?.qualifier || '', xQualifier: xAxis.measurement?.qualifier || '', uncertainty: yAxis.error ?? null, xUncertainty: xAxis.error ?? null, yUncertainty: yAxis.error ?? null });
      status.plottedPoints++;
    }
  }
  const warnings = [];
  for (const [reason,label] of Object.entries(PLOT_REASONS)) {
    const affected = paperStatus.filter(status=>status.reasons[reason]);
    if (affected.length) warnings.push(msg`${papers.some(p=>p.comparisonSubject)?affected.length+tr(' 项材料 / 样品',false):affected.length+tr(' 篇文献',false)}：${label}（${affected.reduce((sum,status)=>sum+status.reasons[reason],0)} 条）`);
  }
  points.sort((a,b)=>a.x-b.x||a.title.localeCompare(b.title)||a.sample.localeCompare(b.sample));
  const distinct=rows=>new Set(rows.map(row=>row.paperId)).size,selectedSources=new Set(papers.map(p=>p.id)).size,plottedSources=distinct(paperStatus.filter(row=>row.plottedPoints>0));
  return {points,warnings,skipped,paperStatus,summary:{selectedPapers:selectedSources,recordedPapers:distinct(paperStatus.filter(row=>row.recordedRecords>0)),unitMatchedPapers:distinct(paperStatus.filter(row=>row.matchingRecords>0)),plottedPapers:plottedSources,excludedPapers:selectedSources-plottedSources,plottedPoints:points.length,...(papers.some(p=>p.comparisonSubject)?{selectedSubjects:paperStatus.length,plottedSubjects:paperStatus.filter(row=>row.plottedPoints>0).length}: {})}};
}

export function figureDataCSV(data, xLabel, yLabel) {
  const quote = (value, numeric = false) => { let text=String(value ?? '');if(!numeric && /^[=+\-@]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"'; };
  const rows = [[tr('文献标题'),tr('文献ID'),tr('发表年份'),tr('材料ID'),tr('材料名称'),tr('成分 / 配方'),tr('样品'),xLabel,yLabel,tr('X误差'),tr('Y误差'),tr('X限定符'),tr('Y限定符'),tr('测试条件'),tr('来源'),tr('分组'),tr('选择项ID'),'DOI',tr('刊物'),tr('作者'),tr('X测试条件'),tr('Y测试条件'),tr('X记录ID'),tr('Y记录ID')]];
  for (const point of data.points) rows.push([point.title,point.paperId,point.year,point.materialId,point.materialName,point.materialComposition,point.sample,point.category ?? point.x,point.y,point.xUncertainty,point.yUncertainty,point.xQualifier,point.qualifier,point.conditions,point.source,point.group,point.selectionKey,point.doi,point.journal,point.authors,point.xConditions,point.yConditions,point.xRecordId,point.yRecordId]);
  return '\uFEFF'+rows.map((row,index)=>row.map((value,column)=>quote(value,index>0&&[2,7,8,9,10].includes(column)&&typeof value==='number')).join(',')).join('\r\n');
}
