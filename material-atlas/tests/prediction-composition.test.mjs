import test from 'node:test';
import assert from 'node:assert/strict';
import {convertComposition,canonicalDataset,scopedDataset,compositionText} from '../dist/prediction-composition.js';
import {freshWorkspace,parseComposition,trainingRows,validateWorkspace} from '../dist/prediction-model.js';
test('formula and atomic percentages describe identical ratios; weight conversion round trips',()=>{
 const c=parseComposition('Fe2O3','formula');assert.deepEqual(c,{Fe:40,O:60});
 const wt=convertComposition(c,'formula','wt');assert.ok(Math.abs(wt.Fe-69.94)<.02);
 const at=convertComposition(wt,'wt','at');assert.ok(Math.abs(at.Fe-40)<1e-10);
 assert.ok(Math.abs(parseComposition(compositionText(c,'formula'),'formula').Fe-40)<1e-6);
 assert.throws(()=>convertComposition({Og:100},'at','wt'),/原子量/);
});
test('one dataset selects row-level shapes and any composition basis without mutating original rows',()=>{
 const row={id:'a',composition:{Fe:40,O:60},features:{},targets:{Hc:10},source:'paper-a',form:'powder'};
 const ds={id:'mixed',name:'Hc',basis:'at',form:'mixed',rows:[row,{...row,id:'b',form:'core'}]};
 const original=JSON.stringify(ds),view=scopedDataset(ds,'powder','wt');assert.equal(view.rows.length,1);assert.ok(view.rows[0].composition.Fe>69);
 assert.equal(JSON.stringify(ds),original);const normalized=canonicalDataset(view);assert.equal(normalized.basis,'at');assert.equal(normalized.rows[0].compositionInput.basis,'wt');assert.ok(Math.abs(normalized.rows[0].composition.Fe-40)<1e-10);
 const ws=freshWorkspace();ws.datasets=[ds];validateWorkspace(ws);assert.equal(trainingRows(ws,{datasetIds:['mixed'],form:'core',basis:'wt',target:'Hc'}).length,1);
});
test('equivalent formula, atomic and weight records deduplicate for training while keeping citations',()=>{
 const c={Fe:40,O:60};const w=freshWorkspace();w.datasets=['at','wt','formula'].map((basis,i)=>({id:'d'+i,name:basis,basis,form:'powder',rows:[{id:'r'+i,composition:convertComposition(c,'at',basis),features:{},targets:{Hc:10},source:'p'+i}]}));
 const rows=trainingRows(w,{datasetIds:w.datasets.map(d=>d.id),form:'powder',basis:'at',target:'Hc'});assert.equal(rows.length,1);assert.equal(rows[0].provenance.length,3);assert.match(rows[0].source,/p0/);assert.match(rows[0].source,/p2/);
});
