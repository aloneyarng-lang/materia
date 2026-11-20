import {paperMaterials} from './materials.js';
import {cleanMaterialGroups} from './material-list-model.js';
import {parameterNameKey,parameterUnitKey} from './parameter-index.js';
export const MATERIAL_SELECTION_DEFAULTS={version:1,mode:'paper',keys:[],filters:{query:'',parameter:'',unit:'*',paperId:''}};
const string=(v,max)=>typeof v==='string'&&v.length<=max;
export function materialSelectionKey(paperId,materialId,sample='',conditions=''){return JSON.stringify([paperId,materialId,sample,conditions]);}
export function decodeMaterialKey(key){let row;try{row=JSON.parse(key);}catch{throw Error('材料选择项 ID 已损坏。');}if(!Array.isArray(row)||row.length!==4||!string(row[0],200)||!row[0]||!string(row[1],200)||!row[1]||!string(row[2],400)||!string(row[3],4000))throw Error('材料选择项格式不正确。');return row;}
export function cleanMaterialSelection(value){
 if(value==null)return{...MATERIAL_SELECTION_DEFAULTS,keys:[],filters:{...MATERIAL_SELECTION_DEFAULTS.filters}};
 if(!value||value.version!==1||!['paper','material'].includes(value.mode)||!Array.isArray(value.keys)||value.keys.length>5000)throw Error('不支持的材料选择设置，最多可选 5000 项。');
 const keys=[...new Set(value.keys.map(key=>{decodeMaterialKey(key);return key;}))],input=value.filters||{},filters={...MATERIAL_SELECTION_DEFAULTS.filters};
 for(const[key,max]of Object.entries({query:1000,parameter:300,unit:200,paperId:200}))if(input[key]!==undefined){if(!string(input[key],max))throw Error('材料筛选设置格式不正确。');filters[key]=input[key];}
 const result={version:1,mode:value.mode,keys,filters,...(value.groups!==undefined?{groups:cleanMaterialGroups(value.groups)}:{})};if(JSON.stringify(result).length>8*1024*1024)throw Error('材料选择设置过大，请减少选择项。');return result;
}
export function materialInventory(papers){
 const rows=[];
 for(const paper of papers)for(const[materialIndex,material]of paperMaterials(paper).entries()){
  const materialId=String(material.id||'unidentified-material-'+materialIndex),groups=new Map();
  for(const measurement of material.measurements||[]){const sample=String(measurement.sample??''),conditions=String(measurement.conditions??''),key=JSON.stringify([sample,conditions]);if(!groups.has(key))groups.set(key,{sample,conditions,measurements:[]});groups.get(key).measurements.push(measurement);}
  if(!groups.size)groups.set('empty',{sample:'',conditions:'',measurements:[]});
  for(const group of groups.values())rows.push({key:materialSelectionKey(paper.id,materialId,group.sample,group.conditions),paperId:paper.id,materialId,materialName:String(material.name||'材料名称未填'),composition:String(material.composition||''),description:String(material.description||''),material,paper,...group});
 }
 return rows;
}
export function filterMaterials(rows,filters={}){
 const words=String(filters.query||'').normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean),parameter=parameterNameKey(filters.parameter);
 return rows.filter(row=>(!filters.paperId||row.paperId===filters.paperId)&&words.every(word=>[row.materialName,row.composition,row.description,row.sample,row.conditions].join(' ').normalize('NFKC').toLocaleLowerCase().includes(word))&&(!parameter||row.measurements.some(m=>parameterNameKey(m.name)===parameter&&(filters.unit==='*'||filters.unit==null||parameterUnitKey(m.unit)===parameterUnitKey(filters.unit)))));
}
export function resolveMaterialSelection(papers,keys){const rows=materialInventory(papers),wanted=new Set(keys),selected=rows.filter(row=>wanted.has(row.key)),valid=new Set(selected.map(row=>row.key));return{rows,selected,missing:keys.filter(key=>!valid.has(key)),materials:new Set(selected.map(row=>JSON.stringify([row.paperId,row.materialId]))).size,papers:new Set(selected.map(row=>row.paperId)).size};}
// Each projection contains exactly one recorded material/sample/condition. Source IDs and names remain original.
export function materialSubjects(rows){return rows.map(row=>({...row.paper,materials:[{...row.material,id:row.materialId,measurements:row.measurements.map(m=>({...m}))}],comparisonPairingContext:row.material.measurements||[],comparisonSubject:{key:row.key,materialId:row.materialId,materialName:row.materialName,materialComposition:row.composition,sample:row.sample,conditions:row.conditions}}));}
export function materialParameterInventory(rows){
 const map=new Map();for(const row of rows)for(const m of row.measurements){const key=parameterNameKey(m.name);if(!key)continue;if(!map.has(key))map.set(key,{key,name:String(m.name),units:new Set(),items:new Set()});const item=map.get(key);item.units.add(parameterUnitKey(m.unit));item.items.add(row.key);}
 return [...map.values()].map(row=>({...row,units:[...row.units].sort(),count:row.items.size})).sort((a,b)=>a.name.localeCompare(b.name));
}
export function materialMatrixHTML(subjects,options,esc){

 const context=p=>p.comparisonSubject,measurements=p=>p.materials[0].measurements;
 return `<table class="comparison-table material-matrix"><thead><tr><th>材料 / 样品</th>${subjects.map(p=>`<th><strong>${esc(context(p).materialName)}</strong><small>${esc(context(p).materialComposition||'成分未填写')}</small></th>`).join('')}</tr></thead><tbody><tr class="material-source-row"><th>来源文献</th>${subjects.map(p=>`<td><button class="material-source-link" data-material-open-paper="${esc(p.id)}">${esc(p.title)}</button><small>${esc([p.year,p.journal].filter(Boolean).join(' · '))}</small>${p.doi?`<small>DOI: ${esc(p.doi)}</small>`:''}</td>`).join('')}</tr><tr><th>样品 / 测试条件</th>${subjects.map(p=>`<td><strong>样品：${esc(context(p).sample||'未填写')}</strong><small>条件：${esc(context(p).conditions||'未填写')}</small></td>`).join('')}</tr>${options.slice(0,100).map(option=>`<tr><th>${esc(option.name)}<small>${esc(option.unit||'单位未填')}</small></th>${subjects.map(p=>`<td>${measurements(p).filter(m=>parameterNameKey(m.name)+'\u241f'+parameterUnitKey(m.unit)===option.key).map(m=>`<div class="measurement-cell"><strong>${esc(m.qualifier||'')}${m.value===''||m.value==null?'数值未填':esc(m.value)}${m.uncertainty!=null&&m.uncertainty!==''?' ± '+esc(m.uncertainty):''}</strong><small>${esc(m.conditions||'测试条件未填')}</small>${m.source?`<small>数据位置：${esc(m.source)}</small>`:''}</div>`).join('')||'<span class="missing-value">—</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table>${!options.length?'<p class="chart-footnote">所选材料尚无性能记录；材料、样品与来源信息已完整保留。</p>':''}${options.length>100?'<p class="chart-footnote">预览前 100 个参数，CSV 导出全部记录。</p>':''}`;
}

export function materialSelectionAudit(papers,keys,data){
 const resolved=resolveMaterialSelection(papers,keys);if(!resolved.missing.length)return data;
 const unavailable=resolved.missing.map(key=>{const[paperId,materialId,sample,conditions]=decodeMaterialKey(key),paper=papers.find(p=>p.id===paperId),material=paper&&paperMaterials(paper).find(m=>m.id===materialId);return{paperId,title:paper?.title||'来源文献已移除（'+paperId+'）',subjectKey:key,materialId,materialName:material?.name||'原材料记录已不可用',sample,conditions,recordedRecords:0,matchingRecords:0,plottedPoints:0,reasons:{selection:1}};});
 const paperStatus=[...data.paperStatus,...unavailable],sourceCount=new Set(paperStatus.map(row=>row.paperId)).size,plottedSources=new Set(paperStatus.filter(row=>row.plottedPoints).map(row=>row.paperId)).size;
 return{...data,paperStatus,warnings:[...data.warnings,unavailable.length+' 项原材料 / 样品选择已失效，未重新匹配或绘制。'],summary:{...data.summary,selectedPapers:sourceCount,excludedPapers:sourceCount-plottedSources,selectedSubjects:(data.summary.selectedSubjects??resolved.selected.length)+unavailable.length,plottedSubjects:data.summary.plottedSubjects??0}};
}
