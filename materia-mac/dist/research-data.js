import {parseComposition,compositionKey,exactNumber,uid,BASE_FEATURES} from './prediction-model.js';
import {toCSV,parseDelimited} from './prediction-import.js';

export const RESEARCH_FEATURES=[
 {id:'heatTreatment',name:'热处理状态',unit:'',type:'category'},
 {id:'protocol',name:'可比测试协议',unit:'',type:'category'},
 {id:'compositionEntropy',name:'成分分数熵（所选基准）',unit:'',type:'number'},
 {id:'elementCount',name:'元素种数',unit:'',type:'number'},
 {id:'magneticFraction',name:'Fe+Co+Ni 含量（所选基准）',unit:'%',type:'number'},
];
export const REVIEW_COLUMNS=['reviewed','form','basis','composition','sample','source','paperId','materialId','measurementIds','conditions','protocol','dataKind','reviewer','Hc','Hc_unit','Bs','Bs_unit','particleSize','particleSize_unit','method','phase','heatTreatment','annealTemperature','annealTemperature_unit','annealTime','annealTime_unit','atmosphere','testTemperature','testTemperature_unit','frequency','frequency_unit','induction','induction_unit','pressure','pressure_unit','binder','binder_unit','originalRecord'];
const canonical={Hc:'A/m',Bs:'T',particleSize:'μm',annealTemperature:'°C',annealTime:'min',testTemperature:'°C',frequency:'kHz',induction:'mT',pressure:'MPa',binder:'wt.%'};
const clean=s=>String(s??'').trim();
const unit=s=>clean(s).replaceAll('µ','μ').replaceAll('³','3').replaceAll(' ','');
export function convertUnit(value,from,to){
 const n=exactNumber(value);if(n===null)throw Error('数值必须为确定的有限数字');
 const a=unit(from),b=unit(to);if(a===b)return{value:n,factor:1,offset:0,rule:'同单位保留'};
 const families=[{'A/m':1,'kA/m':1000,Oe:1000/(4*Math.PI)}, {T:1,mT:.001,G:.0001,kG:.1}, {'μm':1,nm:.001,mm:1000}, {min:1,s:1/60,h:60}, {kHz:1,Hz:.001,MHz:1000}, {MPa:1,kPa:.001,GPa:1000}, {'wt.%':1}];
 if(['K','°C','C','℃'].includes(a)&&['K','°C','C','℃'].includes(b)){const offset=(a==='K'?-273.15:0)+(b==='K'?273.15:0);return{value:n+offset,factor:1,offset,rule:'绝对温标转换'};}
 for(const family of families)if(a in family&&b in family)return{value:n*family[a]/family[b],factor:family[a]/family[b],offset:0,rule:'同物理量单位换算'};
 throw Error(`不能自动把 ${from||'空单位'} 转换为 ${to}；Ms、磁极化和 Bs 不互相代换`);
}
export function ensureResearch(workspace){
 const w=structuredClone(workspace);
 for(const f of [...BASE_FEATURES,...RESEARCH_FEATURES])if(!w.features.some(x=>x.id===f.id))w.features.push({...f,aliases:f.aliases||[]});
 w.research??={version:1,analyses:[],runs:[],designs:[],feedback:[]};
 if(w.research.version!==1||['analyses','runs','designs','feedback'].some(k=>!Array.isArray(w.research[k])))throw Error('研究流程记录格式无效。');
 return w;
}
function sheet(rows){return toCSV([REVIEW_COLUMNS,...rows.map(r=>REVIEW_COLUMNS.map(k=>r[k]??''))]);}
export function reviewTemplate(){return sheet([]);}
export function literatureReviewSheet(papers){
 const records=[],issues=[];
 for(const p of papers)for(const m of p.materials||[]){
  const groups=new Map();for(const q of m.measurements||[]){const key=JSON.stringify([q.sample||'',q.conditions||'']);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(q);}
  for(const measurements of groups.values()){
   const identified=measurements.filter(q=>/\bHc\b|矫顽力|\bBs\b|饱和磁感应/i.test(q.name));if(!identified.length)continue;
   const r={reviewed:'',form:'',basis:'',composition:m.composition,sample:measurements[0].sample,source:p.doi||'paper:'+p.id,paperId:p.id,materialId:m.id,measurementIds:identified.map(q=>q.id).join('|'),conditions:measurements[0].conditions,dataKind:'measured',originalRecord:JSON.stringify({paper:{id:p.id,title:p.title,doi:p.doi,fingerprint:p.fingerprint},material:{id:m.id,name:m.name,description:m.description},measurements})};
   for(const [target,pattern]of [['Hc',/\bHc\b|矫顽力/i],['Bs',/\bBs\b|饱和磁感应/i]]){
    const qs=identified.filter(q=>pattern.test(q.name));if(qs.length===1&&!qs[0].qualifier&&exactNumber(qs[0].value)!==null){r[target]=qs[0].value;r[target+'_unit']=qs[0].unit;}
    else if(qs.length)issues.push({paperId:p.id,materialId:m.id,target,reason:'同条件多值或限定数值，需要回原文核对，审核表不自动填标签'});
   }
   records.push(r);
  }
 }
 return{csv:sheet(records),count:records.length,issues};
}
export function datasetReviewSheet(workspace,ids){
 return sheet(workspace.datasets.filter(d=>ids.includes(d.id)).flatMap(d=>d.rows.map(r=>{
  const out={reviewed:'',form:d.form,basis:d.basis,composition:compositionKey(r.composition),source:r.source,sample:r.provenance?.sample||r.id,dataKind:r.provenance?.kind||'',originalRecord:JSON.stringify({datasetId:d.id,row:r}),...r.features};
  for(const id of ['Hc','Bs'])if(Number.isFinite(r.targets[id])){out[id]=r.targets[id];out[id+'_unit']=workspace.properties.find(p=>p.id===id)?.unit||'';}
  for(const id of Object.keys(canonical))if(id in r.features)out[id+'_unit']=workspace.features.find(f=>f.id===id)?.unit||'';
  return out;
 })));
}
export function reviewCSV(text,name='审核后的粉末实验数据'){
 const table=parseDelimited(text),headers=table.shift()||[];if(new Set(headers).size!==headers.length)throw Error('审核表含重复列名。');
 for(const key of ['reviewed','form','basis','composition','source','protocol','reviewer'])if(!headers.includes(key))throw Error('缺少审核列：'+key);
 const rows=[],issues=[],rawRecords=[],seen=new Map();let duplicates=0,scope=null;
 for(const [i,cells]of table.entries()){
  const raw=Object.fromEntries(headers.map((key,j)=>[key,cells[j]??'']));rawRecords.push(raw);
  try{
   if(!['true','1','yes','是'].includes(clean(raw.reviewed).toLowerCase()))throw Error('未确认 reviewed，请核对来源和条件后标记 yes');
   if(!['powder','core'].includes(raw.form))throw Error('form 必须是 powder（粉末）或 core（磁粉芯），不能根据标题推断');
   if(!['at','wt','mol','formula'].includes(raw.basis))throw Error('必须明确成分基准 at / wt / mol / formula');
   for(const key of ['source','protocol','reviewer','method','phase','heatTreatment','sample'])if(!clean(raw[key]))throw Error('缺少 '+key);
   if(!['measured','calculated'].includes(raw.dataKind))throw Error('dataKind 只能为 measured 或 calculated，预测值不能作为标签');
   const current=JSON.stringify([raw.form,raw.basis,raw.protocol,raw.dataKind]);if(scope&&current!==scope)throw Error('不同形态、成分基准、协议或数据性质请拆成独立审核文件');
   const composition=parseComposition(raw.composition,raw.basis),features={},targets={},transformations=[];
   for(const [key,to]of Object.entries(canonical))if(clean(raw[key])){
    const converted=convertUnit(raw[key],raw[key+'_unit'],to);(key==='Hc'||key==='Bs'?targets:features)[key]=converted.value;
    transformations.push({field:key,original:raw[key],from:raw[key+'_unit'],to,...converted});
   }
   if(!Object.keys(targets).length)throw Error('没有确定的 Hc 或 Bs 标签');
   if(targets.Hc<0||targets.Bs<=0)throw Error('Hc 不能为负，Bs 必须为正');
   if(!(features.particleSize>0)||!Number.isFinite(features.testTemperature)||features.testTemperature<-273.15)throw Error('需要有效粒径和测试温度，单位必须明确');
   if(!['as-prepared','annealed'].includes(raw.heatTreatment))throw Error('heatTreatment 必须为 as-prepared 或 annealed');
   if(raw.heatTreatment==='annealed'&&(!Number.isFinite(features.annealTemperature)||features.annealTemperature<-273.15||!(features.annealTime>0)||!clean(raw.atmosphere)))throw Error('退火态需要温度、正的保温时间及气氛');
   if(raw.heatTreatment==='as-prepared'&&(features.annealTemperature!==undefined||features.annealTime!==undefined))throw Error('未热处理态不能同时填退火温度和时间');
   if(raw.form==='core'&&(!(features.pressure>0)||!(features.binder>=0)))throw Error('磁粉芯需要压制压力和粘结／包覆质量分数');
   for(const key of ['method','phase','heatTreatment','protocol','atmosphere'])if(clean(raw[key]))features[key]=clean(raw[key]);
   const signature=JSON.stringify([compositionKey(composition),Object.entries(features).sort(),Object.entries(targets).sort()]);
   const provenance={kind:raw.dataKind,raw,transformations,paperId:raw.paperId,materialId:raw.materialId,measurementIds:raw.measurementIds,sample:raw.sample,conditions:raw.conditions,reviewer:raw.reviewer,reviewedAt:Date.now(),inputRow:i+2};
   if(seen.has(signature)){const existing=seen.get(signature);existing.source=[...new Set([...existing.source.split(' | '),raw.source])].join(' | ');existing.provenance.duplicates??=[];existing.provenance.duplicates.push(provenance);duplicates++;continue;}
   const row={id:uid(),row:i+2,composition,features,targets,source:clean(raw.source),original:{},provenance};rows.push(row);seen.set(signature,row);scope??=current;
  }catch(e){issues.push({row:i+2,message:e.message});}
 }
 if(!rows.length)return{rows,issues,rawRecords,duplicates};
 const [form,basis,protocol,dataKind]=JSON.parse(scope);
 return{id:uid(),name,form,basis,protocol,dataKind,rows,rawRecords,issues,duplicates,qualified:0,createdAt:Date.now(),origin:'research-reviewed',revision:1,filename:name,reviewSchema:1};
}
export function commitReviewed(workspace,dataset){
 if(!dataset.id||!dataset.rows.length)throw Error('没有通过审核的记录。');
 const w=ensureResearch(workspace);w.datasets.push(structuredClone(dataset));w.revision++;return w;
}
export function recordFeedback(workspace,{designId,candidateId,raw}){
 const w=ensureResearch(workspace),design=w.research.designs.find(d=>d.id===designId),candidate=design?.candidates.find(c=>c.id===candidateId);
 if(!candidate)throw Error('候选记录不存在。');
 const review=reviewCSV(sheet([raw]),'实验反馈 '+raw.sample);if(review.issues.length||review.rows.length!==1)throw Error(review.issues.map(i=>i.message).join('；')||'反馈记录无效。');
 if(raw.dataKind!=='measured')throw Error('实验反馈必须为实测记录。');
 const row=review.rows[0];row.provenance.designId=designId;row.provenance.candidateId=candidateId;
 const feedback={id:uid(),designId,candidateId,datasetId:review.id,rowId:row.id,createdAt:Date.now(),predicted:structuredClone(candidate.predictions),measured:structuredClone(row.targets),actualComposition:row.composition,actualFeatures:row.features};
 w.datasets.push({...review,origin:'experimental-feedback'});w.research.feedback.push(feedback);w.revision++;return w;
}
