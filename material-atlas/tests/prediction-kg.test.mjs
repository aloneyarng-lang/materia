import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDataset,freshWorkspace,validateWorkspace,trainingRows} from '../dist/prediction-model.js';
const headers=['norm_key','family','property','value','unit','paper_id','anchor','workspace','conf','range_flag','competing_evidence','raw_backed'];
const observation=['Fe80B20','fe_based','Hc','1','Oe','0073','^p-1-abc','soft','high','in_range','false','true'];
const build=rows=>buildDataset({name:'KG',basis:'at',form:'ribbon',table:[headers,...rows],mapping:[],features:[],properties:[]});
test('KG preserves distinct evidence, converts explicit units and retains quality flags without excluding labels',()=>{
 const flagged=[...observation];flagged[9]='out_of_range';
 const d=build([observation,observation,flagged]);assert.equal(d.rows.length,3);assert.equal(d.rows[0].targets.Hc,79.577);assert.equal(d.rows[2].targets.Hc,79.577);assert.ok(d.rows[2].qualityNotes.length);assert.equal(d.rows[2].observation.value,'1');
 const ws=freshWorkspace();ws.datasets.push(d);validateWorkspace(ws);assert.equal(trainingRows(ws,{datasetIds:[d.id],form:'ribbon',basis:'at',target:'Hc'}).length,1);
});
test('KG unknown units and variable families remain auditable without training labels',()=>{
 const unknown=[...observation];unknown[4]='unknown';const variable=[...observation];variable[0]='var:fe_based:B|Fe';
 const d=build([unknown,variable]);assert.deepEqual(d.rows[0].targets,{});assert.equal(d.excludedObservations.length,1);
});
test('KG registers all controlled properties and conditions',()=>{
 const ws=freshWorkspace();assert.ok(ws.properties.some(p=>p.id==='P_cv'&&p.unit==='W/kg'));assert.ok(ws.features.some(p=>p.id==='cond_freq_hz'&&p.unit==='Hz'));
});

test('KG admits unverified and incomplete evidence while preserving annotations',()=>{
 const row=[...observation];row[5]='';row[6]='';row[7]='';row[8]='';row[9]='';row[10]='true';row[11]='false';
 const d=build([row]);assert.equal(d.rows[0].targets.Hc,79.577);assert.equal(d.rows[0].observation.raw_backed,'false');assert.equal(d.rows[0].source,'');assert.deepEqual(d.rows[0].exclusionReasons,[]);assert.ok(d.rows[0].qualityNotes.includes('原文未核实'));
});
