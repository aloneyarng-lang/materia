export const KG_PROPERTIES = [
 ['Bs','磁感应','T'],['Hc','矫顽力','A/m'],['mu_e','有效磁导率',''],['mu_i','起始磁导率',''],
 ['complex_permeability_real','复磁导率实部',''],['complex_permeability_imaginary','复磁导率虚部',''],
 ['lambda_s','磁致伸缩',''],['Tc','居里温度','K'],['T_x1','首峰晶化温度','K'],['T_x2','次峰晶化温度','K'],
 ['dTx','过冷液相区','K'],['Trg','约化玻璃转变温度',''],['d_c','临界直径','mm'],['P_cv','质量比损耗','W/kg'],
 ['Hv','维氏硬度','HV'],['sigma_f','断裂强度','MPa'],['rho','电阻率','μΩ·cm'],['t','带厚／膜厚','μm'],
 ['DC_bias','直流偏置','%'],['snoek_product','Snoek 积','Hz'],['cost_index','成本指数','USD/kg'],
 ['stacking_factor','叠装系数',''],['cu_cluster_density','铜团簇密度','m⁻³']
].map(([id,name,unit])=>({id,name,unit,aliases:[],requiredFeatures:['mu_e','mu_i','complex_permeability_real','complex_permeability_imaginary'].includes(id)?['cond_freq_hz','cond_temp_k']:id==='P_cv'?['cond_freq_hz','cond_flux_t','cond_temp_k']:[]}));
export const KG_FEATURES = [
 ['annealing_temperature','退火温度（KG）','K'],['annealing_time','退火时间（KG）','s'],['wheel_surface_speed','辊速','m/s'],
 ['cooling_rate_estimate','估计冷却速率','K/s'],['melt_ejection_temperature','熔体喷射温度','K'],
 ['cond_freq_hz','测量频率（KG）','Hz'],['cond_flux_t','磁通幅值（KG）','T'],['cond_temp_k','测量温度（KG）','K']
].map(([id,name,unit])=>({id,name,unit,type:'number',aliases:[]}));
export const isKGTable=table=>table[0]?.includes('norm_key')&&table[0]?.includes('property');
export function buildKGDataset(options,api){
 const {table,name,basis,form,filename,sheetName,rowOffset=0}=options;
 if(basis!=='at')throw Error('KG 观测表的成分基准必须选择 at.%。');
 const rows=[],issues=[],excludedObservations=[];
 for(let i=1;i<table.length;i++){
  if(!table[i]?.some(v=>String(v??'').trim()))continue;
  const raw=Object.fromEntries(table[0].map((k,j)=>[k,String(table[i][j]??'').trim()]));
  const reasons=[],qualityNotes=[],features={},targets={};
  const p=KG_PROPERTIES.find(p=>p.id===raw.property||p.name===raw.property);
  let composition;
  try{composition=api.parseComposition(raw.norm_key,'at');}catch(e){excludedObservations.push({raw,row:i+1+rowOffset,reason:e.message});issues.push({row:i+1+rowOffset,message:e.message});continue;}
  if(!p)reasons.push('未知属性键');
  if(!raw.family)qualityNotes.push('缺少材料族');
  if(!/^\d{4}$/.test(raw.paper_id)||!raw.anchor||!raw.workspace)qualityNotes.push('溯源不完整');
  if(!['high','medium','low'].includes(raw.conf))qualityNotes.push('置信度缺失或无效');
  if(!['in_range','no_range'].includes(raw.range_flag))qualityNotes.push('物理范围待核或异常');
  if(raw.competing_evidence!=='false')qualityNotes.push('证据冲突或未核实');
  if(raw.raw_backed!=='true')qualityNotes.push('原文未核实');
  if(/missing_condition|magnitude_suspect/.test(raw.quality_flags))qualityNotes.push('质量标注待核');
  for(const f of KG_FEATURES){const v=api.exactNumber(raw[f.id]);if(v!==null)features[f.id]=v;else if(raw[f.id])reasons.push(f.name+'不是确定数值');}
  for(const f of p?.requiredFeatures||[])if(features[f]===undefined)reasons.push('缺少 '+f);
  let value=api.exactNumber(raw.value),unit=raw.unit;
  const conversions={Bs:{kG:0.1},Hc:{Oe:79.577},lambda_s:{ppm:1e-6},P_cv:{'kW/kg':1000}};
  if(p&&unit!==p.unit){const factor=conversions[p.id]?.[unit];if(factor!==undefined&&value!==null)value*=factor;else reasons.push('单位未知或不兼容');}
  if(value===null)reasons.push('非确定数值不能作为标签');
  if(p&&value!==null&&!reasons.length)targets[p.id]=value;
  const source=[raw.workspace,raw.paper_id].filter(Boolean).join(':');
  rows.push({id:api.uid(),row:i+1+rowOffset,composition,features,targets,source,original:p?{[p.id]:raw.value}:{},observation:raw,qualityNotes,exclusionReasons:reasons,provenance:[{row:i+1+rowOffset,source,...raw}]});
 }
 if(!rows.length&&!excludedObservations.length)throw Error('没有观测行。');
 return{id:api.uid(),name:name.trim(),basis,form,filename,sheetName,createdAt:Date.now(),rows,issues,excludedObservations,duplicates:0,qualified:rows.filter(r=>r.exclusionReasons.length).length,observationFormat:'kg-v4'};
}
