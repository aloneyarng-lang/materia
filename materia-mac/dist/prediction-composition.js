import {ATOMIC_MASSES} from './atomic-masses.js';
const bases=new Set(['at','mol','formula','wt']);
export function convertComposition(composition,from='at',to='at'){
 if(!bases.has(from)||!bases.has(to))throw Error('成分基准不受支持。');
 const entries=Object.entries(composition);
 if(!entries.length||entries.some(([,v])=>!Number.isFinite(v)||v<0))throw Error('成分数值无效。');
 const values=entries.map(([e,v])=>{
  if(v===0||((from==='wt')===(to==='wt')))return[e,v];
  const mass=ATOMIC_MASSES[e];if(!Number.isFinite(mass)||mass<=0)throw Error(e+' 缺少原子量，不能进行质量／原子配比换算。');
  return[e,from==='wt'?v/mass:v*mass];
 });
 const total=values.reduce((s,[,v])=>s+v,0);if(!(total>0))throw Error('成分合计必须大于零。');
 return Object.fromEntries(values.map(([e,v])=>[e,v/total*100]));
}
export const rowForm=(dataset,row)=>row.form||dataset.form;
export const datasetForms=dataset=>[...new Set(dataset.rows.map(r=>rowForm(dataset,r)))];
export function scopedDataset(dataset,form,basis='at'){
 const rows=dataset.rows.filter(r=>!form||form==='all'||rowForm(dataset,r)===form).map(r=>({...r,form:rowForm(dataset,r),composition:dataset.basis===basis?r.composition:convertComposition(r.composition,dataset.basis,basis)}));
 return {...dataset,form:form||dataset.form,basis,rows};
}
export function canonicalDataset(dataset){
 return {...dataset,basis:'at',rows:dataset.rows.map(r=>({...r,form:rowForm(dataset,r),compositionInput:r.compositionInput||{basis:dataset.basis,composition:structuredClone(r.composition)},composition:convertComposition(r.composition,dataset.basis,'at')}))};
}
export function compositionText(composition,basis='at'){
 const nonzero=Object.entries(composition).filter(([,v])=>v>0).sort(([a],[b])=>a.localeCompare(b));
 const scale=basis==='formula'?Math.min(...nonzero.map(([,v])=>v)):1;
 return nonzero.map(([e,v])=>e+Number((v/scale).toFixed(8))).join('');
}
