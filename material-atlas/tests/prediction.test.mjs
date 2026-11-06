import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {parseComposition,compositionKey,exactNumber,validateComposition,suggestMapping,buildDataset,freshWorkspace,trainProperty,predictProperty,trainingRows,validateWorkspace} from '../dist/prediction-model.js';
import {parseDelimited,toCSV} from '../dist/prediction-import.js';
import {PredictionFile} from '../desktop/prediction-store.mjs';

const fixture=()=>{const w=freshWorkspace();w.datasets.push({id:'fixture',name:'SYNTHETIC TEST ONLY',form:'powder',basis:'at',rows:Array.from({length:60},(_,i)=>({id:String(i),composition:{Fe:70+i*.3,B:30-i*.3},features:{particleSize:10+i%5},targets:{Tg:500+i*5,Tx:540+i*5},source:'source-'+Math.floor(i/4)})),issues:[],duplicates:0,qualified:0});return w;};
const options={target:'Tg',form:'powder',basis:'at',datasetIds:['fixture']};
test('element percentages, nested alloy groups and input rejection are explicit',()=>{
 assert.deepEqual(parseComposition('Fe80Si9B11'),{Fe:80,Si:9,B:11});
 const c=parseComposition('(Fe71.2B24Y4.8)98Nb2');assert.ok(Math.abs(c.Fe-69.776)<1e-10);assert.equal(c.Nb,2);
 assert.equal(compositionKey(parseComposition('B20Fe80')),compositionKey(parseComposition('Fe80B20')));
 for(const value of ['Fe80B10','FeB','Fe72B22Ln6','Fe80B20 (x=2)','Fe80B20)','Fe-1B101'])assert.throws(()=>parseComposition(value),value);
 assert.throws(()=>validateComposition({Fe:100.1,B:-.1}));
 const formula=parseComposition('LiFePO4','formula');assert.ok(Math.abs(formula.O-formula.Li*4)<1e-10);assert.ok(Math.abs(Object.values(formula).reduce((a,b)=>a+b,0)-100)<1e-10);
});
test('uncertain values stay distinct from exact numbers and CSV escaping round trips',()=>{
 for(const v of ['',null,'?','<1','1-2','~0.32','100±5','1,000'])assert.equal(exactNumber(v),null);
 assert.equal(exactNumber('0'),0);assert.equal(exactNumber('1.2e3'),1200);
 const rows=[['composition','notes','Tg'],['Fe80B20','source "A", line\n2','0']];assert.deepEqual(parseDelimited(toCSV(rows)),rows);
 assert.deepEqual(parseDelimited('a\tb\r\n1\t2'),[['a','b'],['1','2']]);assert.throws(()=>parseDelimited('a,b\n"oops'));
});
test('header mapping separates B modulus, Bs magnetism, composition and source',()=>{
 assert.deepEqual(suggestMapping('Alloys'),{role:'composition',id:''});assert.deepEqual(suggestMapping('Fe'),{role:'element',id:'Fe'});
 assert.equal(suggestMapping('B(GPa)').id,'bulkModulus');assert.equal(suggestMapping('Bs(T)').id,'Bs');assert.equal(suggestMapping('URL/DOI').role,'source');
});
test('import retains partial labels, rejects invalid alloys and deduplicates exact repeats',()=>{
 const w=freshWorkspace(),table=[['Alloys','Tg(K)','Tx(K)','DOI'],['Fe80B20','800','850','A'],['Fe80B20','800','850','A'],['Fe79B21','<800','860','B'],['Fe78B22','','','C'],['Fe70B20','810','860','D']];
 const d=buildDataset({name:'test',basis:'at',form:'reference',table,mapping:table[0].map(h=>suggestMapping(h)),features:w.features,properties:w.properties});
 assert.equal(d.rows.length,2);assert.equal(d.duplicates,1);assert.equal(d.issues.length,2);assert.equal(d.qualified,1);assert.equal(d.rows[1].targets.Tg,undefined);assert.equal(d.rows[1].original.Tg,'<800');assert.equal(d.rows[1].targets.Tx,860);
 assert.throws(()=>buildDataset({name:'bad',basis:'at',form:'powder',table,mapping:[{role:'composition'},{role:'target',id:'Tg'},{role:'target',id:'Tg'}],features:w.features,properties:w.properties}),/两列/);
});
test('training isolates material type, converts composition bases and skips missing labels',()=>{
 const w=fixture();w.datasets.push({...structuredClone(w.datasets[0]),id:'core',form:'core'});w.datasets.push({...structuredClone(w.datasets[0]),id:'wt',basis:'wt'});w.datasets[0].rows[0].targets={Tx:540};
 assert.equal(trainingRows(w,{...options,datasetIds:['fixture','core','wt']}).length,119);
 w.datasets.push({...structuredClone(w.datasets[0]),id:'thin-film',form:'thinFilm'});const model=trainProperty(w,{...options,form:'thinFilm',datasetIds:['thin-film']});assert.equal(model.form,'thinFilm');assert.equal(model.usable,true);
});
test('real fitted forest beats a held-out baseline and survives model serialization',()=>{
 const w=fixture(),before=JSON.stringify(w),m=trainProperty(w,options);assert.equal(JSON.stringify(w),before);assert.equal(m.usable,true);assert.equal(m.metrics.n,60);assert.equal(m.metrics.groups,60);assert.ok(m.metrics.mae<m.metrics.baselineMAE);assert.ok(m.metrics.r2>.9);assert.equal(m.metrics.folds.reduce((n,f)=>n+f.testing,0),60);
 const restored=JSON.parse(JSON.stringify(m)),row={composition:{Fe:80,B:20},features:{particleSize:12}};
 assert.equal(predictProperty(m,row).value,predictProperty(restored,row).value);assert.ok(Math.abs(predictProperty(m,row).value-(500+(10/.3)*5))<20);
 assert.throws(()=>predictProperty(m,{composition:{Fe:80,Cu:20},features:{particleSize:12}}),/未包含元素/);
 assert.throws(()=>predictProperty(m,{composition:{Fe:80,B:20},features:{}}),/补充/);
 assert.ok(predictProperty(m,{composition:{Fe:95,B:5},features:{particleSize:30}}).warnings.length>=2);
 assert.throws(()=>predictProperty({...m,usable:false},row),/基线/);
 const result=predictProperty(restored,row);assert.equal(result.interval.length,2);assert.ok(result.interval[0]<result.value&&result.value<result.interval[1]);assert.ok(m.featureImportance.length>0);
});
test('custom material types, molar composition and formula datasets need no source-code changes',()=>{
 const w=freshWorkspace(),table=[['composition','Tg(K)'],...Array.from({length:20},(_,i)=>[`Li${1+i/100}Fe${1-i/100}PO4`,500+i])],mapping=[{role:'composition',id:''},{role:'target',id:'Tg'}];
 const dataset=buildDataset({name:'cathodes',basis:'formula',form:'自定义正极材料',table,mapping,features:w.features,properties:w.properties});assert.equal(dataset.form,'自定义正极材料');assert.equal(dataset.basis,'formula');assert.equal(dataset.rows.length,20);assert.ok(dataset.rows[0].composition.O>50);
});
test('repeated compositions remain one validation group and source grouping joins connected alloys',()=>{
 const w=fixture();w.datasets[0].rows.push(...structuredClone(w.datasets[0].rows.slice(0,10)).map(r=>({...r,features:{particleSize:20},targets:{Tg:r.targets.Tg+2}})));
 const a=trainProperty(w,options);assert.equal(a.metrics.n,70);assert.equal(a.metrics.groups,60);
 const b=trainProperty(w,{...options,validation:'source'});assert.equal(b.metrics.groups,15);
 for(const r of w.datasets[0].rows)r.source='same-source';assert.throws(()=>trainProperty(w,{...options,validation:'source'}),/独立分组/);
});
test('too little data, too few alloys and constant labels do not become usable predictors',()=>{
 const w=fixture();w.datasets[0].rows=w.datasets[0].rows.slice(0,10);assert.throws(()=>trainProperty(w,options),/15/);
 w.datasets[0].rows=Array.from({length:20},(_,i)=>({composition:{Fe:80,B:20},features:{particleSize:i},targets:{Tg:i}}));assert.throws(()=>trainProperty(w,options),/5/);
 const c=fixture();c.datasets[0].rows.forEach(r=>r.targets.Tg=800);const m=trainProperty(c,options);assert.equal(m.usable,false);assert.equal(m.metrics.r2,null);
});
test('arbitrary new numerical properties and categorical input conditions train without code changes',()=>{
 const w=fixture();w.properties.push({id:'custom',name:'新性能',unit:'unit'});w.features.push({id:'process',name:'工艺',unit:'',type:'category'});
 w.datasets[0].rows.forEach((r,i)=>{r.targets.custom=100+i*2;r.features.process=i%2?'gas':'water';});
 const m=trainProperty(w,{...options,target:'custom'});assert.equal(m.usable,true);assert.ok(m.encoder.specs.some(s=>s.id==='process'));
 assert.throws(()=>predictProperty(m,{composition:{Fe:80,B:20},features:{particleSize:12,process:'unknown'}}),/未见/);
 assert.ok(Number.isFinite(predictProperty(m,{composition:{Fe:80,B:20},features:{particleSize:12,process:'gas'}}).value));
});
test('condition-dependent magnetic properties require their measurement conditions before training',()=>{
 const w=fixture();for(const r of w.datasets[0].rows)r.targets.coreLoss=r.targets.Tg;
 assert.throws(()=>trainProperty(w,{...options,target:'coreLoss'}),/测试频率/);
 for(const r of w.datasets[0].rows)r.features.frequency=100;
 assert.throws(()=>trainProperty(w,{...options,target:'coreLoss'}),/磁感应强度/);
 for(const r of w.datasets[0].rows)r.features.induction=50;
 const m=trainProperty(w,{...options,target:'coreLoss'});assert.equal(m.usable,true);
 assert.throws(()=>predictProperty(m,{composition:{Fe:80,B:20},features:{particleSize:12}}),/补充/);
});
test('prediction files preserve data across reopen and keep library roots isolated',async()=>{
 await mkdir('.local/tests',{recursive:true});const root=await mkdtemp(path.resolve('.local/tests/prediction-')),a=new PredictionFile(path.join(root,'a')),b=new PredictionFile(path.join(root,'b')),w=fixture();
 await a.save(w);const second=structuredClone(w);second.revision=2;await a.save(second);assert.equal((await new PredictionFile(a.root).load()).revision,2);assert.equal((await b.load()).datasets.length,0);
 assert.equal(JSON.parse(await readFile(path.join(a.root,'prediction-workspace.previous.json'),'utf8')).revision,0);
 await writeFile(a.file,'broken');await assert.rejects(a.load(),/原文件已保留/);assert.equal(await readFile(a.file,'utf8'),'broken');
 assert.throws(()=>validateWorkspace({...w,version:999}));
});

test('import detects explicit units and basis while preserving every duplicate citation',()=>{
 const w=freshWorkspace();
 const build=(table,basis='at')=>buildDataset({name:'unit-check',basis,form:'powder',table,mapping:table[0].map(h=>suggestMapping(h,w.properties,w.features)),features:w.features,properties:w.properties,rowOffset:2});
 assert.throws(()=>build([['composition (at.%)','Hc (Oe)'],['Fe80B20',1.5]]),/A\/m/);
 assert.throws(()=>build([['composition (wt.%)','Ms (emu/g)'],['Fe80B20',150]]),/成分基准/);
 assert.throws(()=>build([['composition','Ms (T)'],['Fe80B20',1.5]]),/emu\/g/);
 const ds=build([['composition (at.%)','Ms [A·m²/kg]','annealTemperature °C','DOI'],['Fe80B20',150,500,'A'],['Fe80B20',150,500,'B'],['Fe80B20',150,510,'C']]);
 assert.equal(ds.rows.length,2);
 assert.equal(ds.duplicates,1);
 assert.equal(ds.rows[0].source,'A | B');
 assert.deepEqual(ds.rows[0].provenance.map(p=>p.row),[4,5]);
 w.datasets.push(ds);
 ds.rows[1].provenance={excelRow:6,sample:'legacy'};
 const rows=trainingRows(w,{form:'powder',basis:'at',target:'Ms',datasetIds:[ds.id]});
 assert.equal(rows[1].provenance[0].sample,'legacy');
});
