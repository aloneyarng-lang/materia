import {scopedDataset} from './prediction-composition.js';
import {KG_PROPERTIES,KG_FEATURES,isKGTable,buildKGDataset} from './prediction-kg.js';
// Local, serializable regression models. Measured labels are never filled with predictions.
export const ELEMENTS = 'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'.split(' ');
const elementSet = new Set(ELEMENTS);
export const FORMS = {powder:'粉末',core:'磁粉芯',bulk:'块体',ribbon:'带材',thinFilm:'薄膜',coating:'涂层',composite:'复合材料',ceramic:'陶瓷',polymer:'聚合物',semiconductor:'半导体',electrode:'电极／电池材料',catalyst:'催化材料',reference:'其他／参考数据'};
export const BASIS = {at:'原子百分比 at.%',wt:'质量百分比 wt.%',mol:'摩尔百分比 mol.%',formula:'化学计量式'};
export const formLabel=value=>FORMS[value]||String(value||'未命名材料类型');
export const basisLabel=value=>BASIS[value]||String(value||'未知成分类型');
export function normalizeForm(value){const v=String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ');if(!v||v.length>80||/[\u0000-\u001f]/.test(v))throw Error('材料类型为空或无效。');return v;}
export const BASE_PROPERTIES = [
 ['density','密度 ρ','g/cm³',['ρ','density']], ['dc','临界尺寸 dc','mm',['dc']],
 ['Tg','玻璃转变温度 Tg','K',['Tg']], ['Tx','晶化起始温度 Tx','K',['Tx']],
 ['Tm','熔化温度 Tm','K',['Tm']], ['Tl','液相线温度 Tl','K',['Tl']],
 ['deltaTx','过冷液相区 ΔTx','K',['DTx','ΔTx']], ['E','杨氏模量 E','GPa',['E']],
 ['G','剪切模量 G','GPa',['G']], ['bulkModulus','体积模量 B','GPa',['B']],
 ['poisson','泊松比 ν','',['ν','poisson']], ['yieldStrength','屈服强度 σy','MPa',['σy']],
 ['compressionStrength','压缩强度 σc','MPa',['σc']], ['plasticStrain','塑性应变 εp','%',['εp']],
 ['KIC','断裂韧性 KIC','MPa·m½',['KIC']], ['HV','维氏硬度 HV','HV',['HV']],
 ['Ms','饱和磁化强度 Ms','emu/g',['Ms']], ['Bs','饱和磁感应强度 Bs','T',['Bs']],
 ['Hc','矫顽力 Hc','A/m',['Hc']], ['permeability','有效磁导率 μe','',['μe']],
 ['coreLoss','磁芯损耗 Pcv','kW/m³',['Pcv','Pcm','core loss']], ['dcBias','直流偏置保持率','%',['DC bias']],
 ['resistivity','电阻率','μΩ·cm',['resistivity']], ['Tc','居里温度 Tc','K',['Tc']],
 ['magnetostriction','饱和磁致伸缩系数 λs','ppm',['λs']],
].map(([id,name,unit,aliases])=>({id,name,unit,aliases,requiredFeatures:{coreLoss:['frequency','induction'],permeability:['frequency'],dcBias:['biasField']}[id]||[]}));
export const BASE_FEATURES = [
 ['particleSize','粒径 D50','μm','number',['D50','particle size','粒径']],
 ['grainSize','晶粒尺寸','nm','number',['grain size','晶粒尺寸']],
 ['thickness','厚度','μm','number',['thickness','厚度']],
 ['synthesisTemperature','合成／烧结温度','°C','number',['synthesis temperature','sintering temperature','烧结温度']],
 ['synthesisTime','合成／烧结时间','h','number',['synthesis time','sintering time','烧结时间']],
 ['annealTemperature','退火温度','°C','number',['annealing temperature','退火温度']],
 ['annealTime','退火时间','min','number',['annealing time','退火时间']],
 ['coolingRate','冷却速率','K/s','number',['cooling rate','冷却速率']],
 ['pressure','压力','MPa','number',['pressure','压制压力']],
 ['binder','粘结剂／包覆含量','wt.%','number',['binder','包覆含量']],
 ['frequency','测试频率','kHz','number',['frequency','频率']],
 ['induction','测试磁感应强度 Bm','mT','number',['Bm','induction','测试磁感应强度']],
 ['testTemperature','测试温度','°C','number',['test temperature','测试温度']],
 ['biasField','直流偏置磁场','A/m','number',['bias field','偏置磁场']],
 ['method','制备工艺','','category',['process','method','制备工艺','制粉方式']],
 ['phase','物相／晶体结构','','category',['phase','crystal structure','物相','晶体结构']],
 ['atmosphere','气氛','','category',['atmosphere','气氛']],
 ['substrate','基底','','category',['substrate','基底']],
 ['coating','包覆材料','','category',['coating','包覆材料']],
].map(([id,name,unit,type,aliases])=>({id,name,unit,type,aliases}));
for(const p of KG_PROPERTIES)if(!BASE_PROPERTIES.some(f=>f.id===p.id))BASE_PROPERTIES.push(p);
for(const f of KG_FEATURES)if(!BASE_FEATURES.some(p=>p.id===f.id))BASE_FEATURES.push(f);
export const uid = () => crypto.randomUUID();
export const freshWorkspace = () => ({format:'materia-prediction',version:1,revision:0,properties:structuredClone(BASE_PROPERTIES),features:structuredClone(BASE_FEATURES),datasets:[],models:[]});
export function validateWorkspace(value) {
 if(!value||value.format!=='materia-prediction'||value.version!==1||!Array.isArray(value.datasets)||!Array.isArray(value.models)||!Array.isArray(value.properties)||!Array.isArray(value.features))throw Error('预测工作区格式不正确。');
 if(value.datasets.length>100||value.properties.length>150||value.features.length>80||value.models.length>300)throw Error('工作区过大，请拆分数据集。');
 for(const [list,defaults] of [[value.properties,KG_PROPERTIES],[value.features,KG_FEATURES]])for(const field of defaults)if(!list.some(f=>f.id===field.id))list.push(structuredClone(field));
 for(const rows of [value.properties,value.features]){const ids=new Set();for(const row of rows){if(!row||typeof row.id!=='string'||!row.id||ids.has(row.id)||typeof row.name!=='string'||!row.name.trim()||typeof row.unit!=='string')throw Error('性能或输入字段定义无效。');ids.add(row.id);}}
 for(const property of value.properties){if(!Array.isArray(property.requiredFeatures))property.requiredFeatures=structuredClone(BASE_PROPERTIES.find(base=>base.id===property.id)?.requiredFeatures||[]);if(property.requiredFeatures.some(id=>!value.features.some(feature=>feature.id===id)))throw Error('性能依赖了不存在的输入字段。');}
 if(value.features.some(f=>!['number','category'].includes(f.type)))throw Error('输入字段类型无效。');
 if(value.datasets.reduce((n,d)=>n+(Array.isArray(d.rows)?d.rows.length:100001),0)>30000)throw Error('最多保留 30,000 条记录，请拆分工作区。');
 for(const d of value.datasets){d.form=normalizeForm(d.form);if(typeof d.id!=='string'||!BASIS[d.basis]||!Array.isArray(d.rows))throw Error('数据集定义无效。');for(const r of d.rows){if(d.form==='mixed'&&!r.form)throw Error('混合数据集缺少逐行材料形态。');if(r.form)normalizeForm(r.form);validateComposition(r.composition);if(!r.features||!r.targets||Object.values(r.targets).some(x=>typeof x!=='number'||!Number.isFinite(x)))throw Error('性能标签无效。');}}
 if(!Number.isSafeInteger(value.revision)||value.revision<0)throw Error('工作区数据版本无效。');
 const checkTree=(node,depth=0)=>{if(!node||depth>12)throw Error('模型树结构无效。');if(node.f===undefined){if(!Number.isFinite(node.v))throw Error('模型叶节点无效。');return;}if(!Number.isSafeInteger(node.f)||node.f<0||!Number.isFinite(node.t))throw Error('模型节点无效。');checkTree(node.l,depth+1);checkTree(node.r,depth+1);};
 for(const m of value.models){m.form=normalizeForm(m.form);if(m.algorithm==='sklearn-regression-v1'){if(!value.properties.some(p=>p.id===m.target)||!BASIS[m.basis]||!m.encoder||!Array.isArray(m.encoder.elements)||!Array.isArray(m.encoder.specs)||!m.property||!Array.isArray(m.datasetIds)||!Array.isArray(m.validationPoints)||!m.metrics||!Number.isFinite(m.metrics.mae)||!m.environment||!m.training||!Array.isArray(m.training.leaderboard)||m.training.leaderboard.some(r=>!r||!r.params||!Number.isFinite(r.mae)||!Number.isFinite(r.std))||!Array.isArray(m.training.warnings)||m.training.warnings.some(w=>typeof w!=='string')||!m.training.options||!m.training.bestParams||!Array.isArray(m.featureImportance)||m.featureImportance.some(f=>!f||typeof f.name!=='string'||!Number.isFinite(f.importance))||typeof m.usable!=='boolean'||!Array.isArray(m.metrics.folds)||m.validationPoints.some(p=>!p||!Number.isFinite(p.actual)||!Number.isFinite(p.predicted))||!m.artifact||m.artifact.format!=='skops'||typeof m.artifact.data!=='string'||m.artifact.data.length>400*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(m.artifact.data)||! /^[a-f0-9]{64}$/.test(m.artifact.sha256))throw Error('机器学习模型或训练报告格式无效。');continue;}if(m.algorithm!=='extra-trees-v1'||!value.properties.some(p=>p.id===m.target)||!BASIS[m.basis]||!m.encoder||!Array.isArray(m.encoder.elements)||!Array.isArray(m.encoder.specs)||!Array.isArray(m.forest)||!m.forest.length||m.forest.length>100||!m.metrics||!Number.isFinite(m.metrics.mae)||!Array.isArray(m.datasetIds)||!Array.isArray(m.validationPoints)||!m.property)throw Error('保存的模型格式无效，请使用原始工作区导出文件。');m.forest.forEach(tree=>checkTree(tree));}
 return structuredClone(value);
}
export function exactNumber(value) {
 if(typeof value==='number')return Number.isFinite(value)?value:null;
 const s=String(value??'').trim();if(!s||!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(s))return null;
 const n=Number(s);return Number.isFinite(n)?n:null;
}
export function validateComposition(c) {
 if(!c||typeof c!=='object'||Array.isArray(c))throw Error('请填写元素与百分比。');
 const pairs=Object.entries(c);if(!pairs.length||pairs.some(([e,n])=>!elementSet.has(e)||!Number.isFinite(n)||n<0||n>100))throw Error('元素符号或百分比无效。');
 const sum=pairs.reduce((s,[,v])=>s+v,0);if(Math.abs(sum-100)>0.15)throw Error(`元素百分比合计为 ${sum.toFixed(3)}%，应为 100%。`);
 return Object.fromEntries(pairs.filter(([,n])=>n>0).map(([e,n])=>[e,n/sum*100]));
}
export function parseComposition(text,basis='at') {
 const stoichiometric=basis==='formula',s=String(text??'').normalize('NFKC').replace(/\s+/g,'');
 if(!s||s.length>500)throw Error('成分式为空或过长。');let i=0;
 const amount=()=>{const m=s.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);if(!m)return null;i+=m[0].length;return Number(m[0]);};
 function group(depth=0){if(depth>6)throw Error('成分式括号层数过多。');const out={};
  while(i<s.length&&s[i]!==')'){
   if(s[i]==='('){i++;const child=group(depth+1);if(s[i++]!==')')throw Error('成分式括号不匹配。');const sum=Object.values(child).reduce((a,b)=>a+b,0),n=amount()??(stoichiometric?1:sum);if(!sum)throw Error('空的成分组。');for(const [e,v]of Object.entries(child))out[e]=(out[e]||0)+(stoichiometric?v*n:v/sum*n);}
   else{const m=s.slice(i).match(/^[A-Z][a-z]?/);if(!m||!elementSet.has(m[0]))throw Error('成分含未确定元素或无法识别的内容。');const e=m[0];i+=e.length;const n=amount();if(n===null&&!stoichiometric)throw Error('每种元素必须给出百分比，不支持未展开的变量或余量。');out[e]=(out[e]||0)+(n??1);}
  }return out;
 }
 const result=group();if(i!==s.length)throw Error('成分式有多余括号。');if(stoichiometric){const sum=Object.values(result).reduce((a,b)=>a+b,0);return validateComposition(Object.fromEntries(Object.entries(result).map(([element,value])=>[element,value/sum*100])));}return validateComposition(result);
}
export const compositionKey=c=>Object.entries(c).filter(([,v])=>v>0).sort(([a],[b])=>a.localeCompare(b)).map(([e,n])=>e+Number(n.toFixed(5))).join('');
const norm=s=>String(s).normalize('NFKC').toLowerCase().replace(/[\s_]/g,'');
export function suggestMapping(header,properties=BASE_PROPERTIES,features=BASE_FEATURES) {
 const h=String(header).normalize('NFKC').trim();
 const {base,unit}=headerParts(h);
 if(elementSet.has(h)||elementSet.has(base)&&['at.%','wt.%','mol.%'].includes(unitKey(unit)))return{role:'element',id:base};
 if(['alloys','alloy','composition','成分','成分式','合金成分'].includes(norm(base)))return{role:'composition',id:''};
 if(/^(url|doi|ref|参考|来源)/i.test(h))return{role:'source',id:''};
 const matches=[];
 for(const [role,items] of [['target',properties],['feature',features]]){
  for(const f of items){
   const names=[f.id,f.name,...(f.aliases||[])];
   if(names.some(a=>norm(a)===norm(base)||norm(a)===norm(h)))matches.push({role,f});
  }
 }
 const match=matches.find(({f})=>unit&&unitKey(f.unit)===unitKey(unit))||matches[0];
 return match?{role:match.role,id:match.f.id}:{role:'ignore',id:''};
}
// Duplicate observations keep every source so source-connected validation stays intact.
const mergeSources=(...values)=>[...new Set(values.flatMap(value=>String(value||'').split(' | ')).map(s=>s.trim()).filter(Boolean))].join(' | ');
const unitKey=value=>{
 const key=String(value||'').normalize('NFKC').replace(/[μµ]/g,'u').replace(/[·⋅*\s]/g,'').replace(/\^/g,'');
 return ({'Am2/kg':'emu/g','Am2kg-1':'emu/g','A/m':'A/m','Am-1':'A/m','gcm-3':'g/cm3','kgm-3':'kg/m3','Wkg-1':'W/kg','Wm-3':'W/m3','kWm-3':'kW/m3','℃':'°C'})[key]||key;
};
const explicitUnits=new Set([...BASE_PROPERTIES,...BASE_FEATURES].map(f=>unitKey(f.unit)).concat(['Oe','kOe','kA/m','T','mT','G','kG','Hz','MHz','Pa','MPa','GPa','W/kg','W/m3','kg/m3','s','h','min','m','mm','um','nm','at.%','wt.%','mol.%']));
function headerParts(header){
 const h=String(header||'').normalize('NFKC').trim();
 const bracket=h.match(/(?:\(([^()]*)\)|\[([^\[\]]*)\])\s*$/);
 if(bracket)return{base:h.slice(0,bracket.index).trim(),unit:(bracket[1]??bracket[2]).trim()};
 const plain=h.match(/^(.+?)\s+(\S+)$/);
 if(plain&&explicitUnits.has(unitKey(plain[2])))return{base:plain[1],unit:plain[2]};
 return{base:h,unit:''};
}
function validateMappedUnits(headers,mapping,features,properties,basis){
 const basisUnits={'at.%':'at','wt.%':'wt','mol.%':'mol'};
 mapping.forEach((m,index)=>{
  if(!m)return;
  const header=String(headers[index]||''),{unit:declared}=headerParts(header),unit=unitKey(declared);
  if(!unit)return;
  if(['composition','element'].includes(m.role)&&basisUnits[unit]&&basisUnits[unit]!==basis){
   throw Error(`列“${header}”的成分基准是 ${declared}，与所选的“${basisLabel(basis)}”不一致。请按原表选择成分表达。`);
  }
  if(!['target','feature'].includes(m.role))return;
  const field=(m.role==='target'?properties:features).find(f=>f.id===m.id);if(!field)return;
  // An unrecognized free-text annotation may be a test condition, rather than a unit.
  const knownUnit=explicitUnits.has(unit)||[...features,...properties].some(f=>unitKey(f.unit)===unit);
  if(knownUnit&&unit!==unitKey(field.unit)){
   throw Error(`列“${header}”标注单位 ${declared}，但字段“${field.name}”要求 ${field.unit||'无量纲'}。请先换算源数据，或新增使用原单位的字段。软件不会自动换算。`);
  }
 });
}
export function buildDataset({name,basis,form,table,mapping,features,properties,sheetName='',filename='',rowOffset=0}) {
 form=normalizeForm(form);if(!name.trim()||!BASIS[basis])throw Error('请填写数据集名称、成分表达方式和材料类型。');
 if(isKGTable(table))return buildKGDataset({name,basis,form,table,filename,sheetName,rowOffset},{parseComposition,exactNumber,uid});
 if(!mapping.some(m=>m.role==='composition'||m.role==='element'))throw Error('至少指定一个成分式列或元素列。');
 if(mapping.filter(m=>m.role==='composition').length>1||mapping.some(m=>m.role==='composition')&&mapping.some(m=>m.role==='element'))throw Error('成分式与元素百分比列请选择一种方式。');
 const assigned=mapping.filter(m=>['target','feature','element'].includes(m.role)).map(m=>m.role+':'+m.id);if(new Set(assigned).size!==assigned.length)throw Error('同一个性能、条件或元素不能映射到两列。');
 if(!mapping.some(m=>m.role==='target'))throw Error('请至少指定一项实测性能。');
 validateMappedUnits(table[0]||[],mapping,features,properties,basis);
 if(!Number.isSafeInteger(rowOffset)||rowOffset<0)throw Error('源表行号偏移无效。');
 const rows=[],issues=[],seen=new Map();let duplicates=0,qualified=0;
 for(let index=1;index<table.length;index++){
  const raw=table[index];if(!raw?.some(v=>String(v??'').trim()))continue;
  try{
   let c={},values={},conditions={},source=[],original={};
   for(let col=0;col<mapping.length;col++){
    const m=mapping[col],v=raw[col];if(!m||m.role==='ignore')continue;
    if(m.role==='composition')c=parseComposition(v,basis);
    if(m.role==='element'){if(v!==''&&v!==null&&v!==undefined&&exactNumber(v)===null)throw Error('元素百分比必须是确定数值。');c[m.id]=exactNumber(v)??0;}
    if(m.role==='source'&&v)source.push(String(v));
    if(m.role==='target'){
     if(!properties.some(p=>p.id===m.id))throw Error('性能字段不存在。');
     const n=exactNumber(v);if(n!==null)values[m.id]=n;else if(String(v??'').trim()){original[m.id]=String(v);qualified++;}
    }
    if(m.role==='feature'){
     const f=features.find(f=>f.id===m.id);if(!f)throw Error('条件字段不存在。');
     if(f.type==='number'){const n=exactNumber(v);if(n!==null)conditions[m.id]=n;else if(String(v??'').trim())throw Error(f.name+'必须是确定数值。');}
     else if(String(v??'').trim())conditions[m.id]=String(v).trim();
    }
   }
   c=validateComposition(c);if(!Object.keys(values).length)throw Error('无可用于训练的确定数值性能。');
   const signature=JSON.stringify([compositionKey(c),Object.entries(conditions).sort(),Object.entries(values).sort()]);
   const sourceValue=mergeSources(...source),provenance={row:index+1+rowOffset,source:sourceValue,original:{...original}};
   if(seen.has(signature)){const existing=seen.get(signature);existing.source=mergeSources(existing.source,sourceValue);existing.provenance.push(provenance);duplicates++;continue;}
   const row={id:uid(),row:index+1+rowOffset,composition:c,features:conditions,targets:values,source:sourceValue,original,provenance:[provenance]};
   seen.set(signature,row);rows.push(row);
  }catch(e){issues.push({row:index+1+rowOffset,message:e.message});}
 }
 if(!rows.length)throw Error('没有可导入的记录，请检查列映射、成分合计和性能数值。');
 return{id:uid(),name:name.trim(),basis,form,filename,sheetName,createdAt:Date.now(),rows,issues,duplicates,qualified};
}

const median=xs=>{const a=[...xs].sort((a,b)=>a-b);return a.length?a[Math.floor(a.length/2)]:0;};
function makeEncoder(rows,features) {
 const elements=ELEMENTS.filter(e=>rows.some(r=>(r.composition[e]||0)>0));
 const specs=features.filter(f=>rows.some(r=>r.features[f.id]!==undefined)).map(f=>{
  const values=rows.map(r=>r.features[f.id]).filter(v=>v!==undefined&&v!==null);
  if(f.type==='number'){const xs=values.filter(Number.isFinite);return{...f,median:median(xs),min:Math.min(...xs),max:Math.max(...xs),required:xs.length===rows.length};}
  const cats=[...new Set(values.map(String))].sort();if(cats.length>40)throw Error(f.name+'类别过多，请勿把文献编号作为模型输入。');return{...f,categories:cats,required:values.length===rows.length};
 });
 const featureNames=[...elements,...specs.flatMap(f=>f.type==='number'?[f.name,f.name+'（缺失）']:[...f.categories.map(c=>f.name+'='+c),f.name+'（缺失）'])];
 return{elements,specs,featureNames,ranges:Object.fromEntries(elements.map(e=>[e,[Math.min(...rows.map(r=>r.composition[e]||0)),Math.max(...rows.map(r=>r.composition[e]||0))]]))};
}
function encode(row,encoder) {
 const out=encoder.elements.map(e=>(row.composition[e]||0)/100);
 for(const f of encoder.specs){const v=row.features[f.id];if(f.type==='number')out.push(Number.isFinite(v)?v:f.median,Number.isFinite(v)?0:1);else out.push(...f.categories.map(c=>String(v)===c?1:0),v===undefined?1:0);}
 return out;
}
const rng=seed=>()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const avg=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
const quantile=(xs,q)=>{const a=[...xs].sort((a,b)=>a-b);if(!a.length)return 0;const p=(a.length-1)*q,l=Math.floor(p),h=Math.ceil(p);return a[l]+(a[h]-a[l])*(p-l);};
function trainForest(X,y,seed,trees=48) {
 const random=rng(seed),dimensions=X[0].length;if(!dimensions)throw Error('没有可用于训练的成分或描述符输入。');
 function node(indices,depth){const mean=avg(indices.map(i=>y[i]));if(depth>=9||indices.length<6)return{v:mean};
  const sum=indices.reduce((s,i)=>s+y[i],0),sq=indices.reduce((s,i)=>s+y[i]*y[i],0);let best=null,bestError=sq-sum*sum/indices.length;
  const candidates=new Set();while(candidates.size<Math.min(dimensions,Math.max(3,Math.ceil(Math.sqrt(dimensions)))))candidates.add(Math.floor(random()*dimensions));
  for(const f of candidates){let lo=Infinity,hi=-Infinity;for(const i of indices){lo=Math.min(lo,X[i][f]);hi=Math.max(hi,X[i][f]);}if(lo===hi)continue;
   for(let k=0;k<10;k++){const threshold=lo+random()*(hi-lo);let n=0,s=0,ss=0;for(const i of indices)if(X[i][f]<=threshold){n++;s+=y[i];ss+=y[i]*y[i];}if(n<2||indices.length-n<2)continue;
    const error=ss-s*s/n+(sq-ss)-(sum-s)*(sum-s)/(indices.length-n);if(error<bestError-1e-12){bestError=error;best={f,t:threshold};}}
  }
  if(!best)return{v:mean};const left=indices.filter(i=>X[i][best.f]<=best.t),right=indices.filter(i=>X[i][best.f]>best.t);return{...best,l:node(left,depth+1),r:node(right,depth+1)};
 }
 const forest=[];for(let t=0;t<trees;t++)forest.push(node(Array.from({length:X.length},()=>Math.floor(random()*X.length)),0));return forest;
}
const treePredict=(tree,x)=>{let n=tree;while(n.f!==undefined)n=x[n.f]<=n.t?n.l:n.r;return n.v;};
const forestValues=(forest,x)=>forest.map(tree=>treePredict(tree,x));
function forestPredict(forest,x){return avg(forestValues(forest,x));}
function featureImportance(forest,names){const counts=Array(names.length).fill(0);const visit=node=>{if(node.f===undefined)return;counts[node.f]++;visit(node.l);visit(node.r);};forest.forEach(visit);const total=counts.reduce((a,b)=>a+b,0)||1;return counts.map((count,index)=>({name:names[index]||`输入 ${index+1}`,importance:count/total})).filter(row=>row.importance>0).sort((a,b)=>b.importance-a.importance).slice(0,12);}
export function trainingRows(workspace,{datasetIds,form,basis,target}) {
 form=normalizeForm(form);
 const rows=[],seen=new Map();
 for(const original of workspace.datasets)if(datasetIds.includes(original.id))for(const d of [scopedDataset(original,form,basis)])for(const r of d.rows){if(!Number.isFinite(r.targets[target]))continue;
  const key=JSON.stringify([compositionKey(r.composition),Object.entries(r.features).sort(),r.targets[target]]);
  const provenance=(Array.isArray(r.provenance)&&r.provenance.length?r.provenance:[
   {row:r.row,source:r.source,original:r.original,...(r.provenance||{})},
  ]).map(p=>({...p,rowId:r.id,datasetId:d.id}));
  if(seen.has(key)){const existing=seen.get(key);existing.source=mergeSources(existing.source,r.source);existing.provenance.push(...provenance);continue;}
  const row={...r,source:mergeSources(r.source),datasetId:d.id,provenance};seen.set(key,row);rows.push(row);
 }return rows;
}
export function trainProperty(workspace,options) {
 const {target,basis,datasetIds,validation='composition'}=options,form=normalizeForm(options.form);
 if(!BASIS[basis])throw Error('成分表达方式不受支持。');
 const property=workspace.properties.find(p=>p.id===target);if(!property)throw Error('性能不存在。');
 const rows=trainingRows(workspace,options);if(rows.length<15)throw Error('至少需要 15 条有效记录，且覆盖至少 5 组不同成分。');
 const requiredConditions=property.requiredFeatures||[];
 for(const id of requiredConditions)if(rows.some(r=>!Number.isFinite(r.features[id])))throw Error(property.name+'的每条训练记录都需要'+(workspace.features.find(f=>f.id===id)?.name||id)+'，请在导入时映射测试条件。');
 const compositions=[...new Set(rows.map(r=>compositionKey(r.composition)))];if(compositions.length<5)throw Error('至少需要 5 组不同成分，重复测量不能代替新成分。');
 // Connected source/composition groups keep repeated alloys out of both sides of a fold.
 const parent=rows.map((_,i)=>i),find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));const seenC=new Map(),seenS=new Map();
 rows.forEach((r,i)=>{const c=compositionKey(r.composition);if(seenC.has(c))parent[find(i)]=find(seenC.get(c));else seenC.set(c,i);
  if(validation==='source'&&r.source)for(const s of r.source.split(' | ').map(v=>v.trim().toLowerCase()).filter(Boolean)){
   if(seenS.has(s))parent[find(i)]=find(seenS.get(s));else seenS.set(s,i);
  }
 });
 const groups=[...new Set(rows.map((_,i)=>find(i)))];if(groups.length<5)throw Error('所选验证方式不足 5 个独立分组，请补充不同来源／成分的数据。');
 const random=rng(8427);for(let i=groups.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[groups[i],groups[j]]=[groups[j],groups[i]];}
 const foldOf=new Map(groups.map((g,i)=>[g,i%5])),predictions=[],errors=[],baselineErrors=[];const folds=[];
 for(let fold=0;fold<5;fold++){
  const train=rows.filter((_,i)=>foldOf.get(find(i))!==fold),test=rows.filter((_,i)=>foldOf.get(find(i))===fold);
  const encoder=makeEncoder(train,workspace.features),X=train.map(r=>encode(r,encoder)),y=train.map(r=>r.targets[target]),forest=trainForest(X,y,100+fold,32),base=avg(y);
  for(const r of test){const actual=r.targets[target],predicted=forestPredict(forest,encode(r,encoder));predictions.push({actual,predicted});errors.push(actual-predicted);baselineErrors.push(actual-base);}
  folds.push({training:train.length,testing:test.length});
 }
 const actual=predictions.map(p=>p.actual),mean=avg(actual),sse=errors.reduce((s,e)=>s+e*e,0),sst=actual.reduce((s,y)=>s+(y-mean)**2,0);
 const absoluteErrors=errors.map(Math.abs),mae=avg(absoluteErrors),rmse=Math.sqrt(sse/errors.length),baselineMAE=avg(baselineErrors.map(Math.abs)),errorP90=quantile(absoluteErrors,.9);
 const encoder=makeEncoder(rows,workspace.features),forest=trainForest(rows.map(r=>encode(r,encoder)),rows.map(r=>r.targets[target]),600,64);
 return{id:uid(),target,property:structuredClone(property),form,basis,datasetIds:[...datasetIds],revision:workspace.revision,createdAt:Date.now(),algorithm:'extra-trees-v1',encoder,forest,featureImportance:featureImportance(forest,encoder.featureNames||encoder.elements),
  metrics:{n:rows.length,compositions:compositions.length,groups:groups.length,features:(encoder.featureNames||encoder.elements).length,mae,rmse,errorP90,r2:sst>0?1-sse/sst:null,baselineMAE,validation,folds},validationPoints:predictions.slice(0,500),usable:mae<baselineMAE&&sst>0,
  targetRange:[Math.min(...actual),Math.max(...actual)]};
}
export function predictProperty(model,row) {
 if(model.algorithm!=='extra-trees-v1')throw Error('模型版本不受支持，请重新训练。');
 if(!model.usable)throw Error('验证未优于均值基线，请补充数据或调整输入后重训。');
 const composition=validateComposition(row.composition),warnings=[],missing=[];
 const unknown=Object.keys(composition).filter(e=>composition[e]>0&&!model.encoder.elements.includes(e));if(unknown.length)throw Error('训练数据未包含元素：'+unknown.join('、'));
 for(const f of model.encoder.specs){const v=row.features[f.id];if(v===undefined||v===''){if(f.required)missing.push(f.name);else warnings.push(f.name+'缺失，使用训练集缺失值处理');}
  else if(f.type==='number'){if(!Number.isFinite(v))throw Error(f.name+'必须为数值。');if(v<f.min||v>f.max)warnings.push(f.name+'超出训练范围');}
  else if(!f.categories.includes(String(v)))throw Error(f.name+'含训练中未见的类别：'+v);
 }
 if(missing.length)throw Error('请补充：'+missing.join('、'));
 for(const e of model.encoder.elements){const n=composition[e]||0,[lo,hi]=model.encoder.ranges[e];if(n<lo-0.0001||n>hi+0.0001)warnings.push(e+'含量超出训练范围');}
 const values=forestValues(model.forest,encode({...row,composition},model.encoder)),value=avg(values),spread=Math.sqrt(avg(values.map(prediction=>(prediction-value)**2))),errorP90=Number.isFinite(model.metrics.errorP90)?model.metrics.errorP90:model.metrics.mae;
 return{value,warnings,mae:model.metrics.mae,errorP90,interval:[value-errorP90,value+errorP90],ensembleSpread:spread};
}
