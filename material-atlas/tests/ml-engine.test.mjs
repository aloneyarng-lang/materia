import test from 'node:test';
import assert from 'node:assert/strict';
import {MachineLearningEngine} from '../desktop/ml-engine.mjs';
import {freshWorkspace,validateWorkspace} from '../dist/prediction-model.js';

test('missing scientific runtime fails explicitly without falling back to a handmade estimator',async()=>{
 const engine=new MachineLearningEngine({appRoot:'C:/does-not-exist/materia-ml'});
 await assert.rejects(engine.run('status'),/运行环境未安装/);
});

test('ML bridge validates task actions, workspace and identifiers before spawning',async()=>{
 const engine=new MachineLearningEngine();
 await assert.rejects(engine.run('shell'),/未知/);
 await assert.rejects(engine.run('train',{workspace:{}}),/格式/);
 await assert.rejects(engine.run('status',{},''),/编号/);
 assert.equal(engine.jobs.size,0);
});

test('new artifacts must contain valid typed metadata and a digest',()=>{
 const w=freshWorkspace();w.models.push({algorithm:'sklearn-regression-v1',form:'powder',basis:'at',target:'Tg'});
 assert.throws(()=>validateWorkspace(w),/模型/);
});
