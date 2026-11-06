import test from 'node:test';
import assert from 'node:assert/strict';
import {trainingInventory,trainingControls} from '../dist/prediction-report.js';
test('training inventory joins composition and normalized DOI without exposing target labels',()=>{
 const rows=[{composition:{Fe:80,B:20},source:'https://doi.org/10.1234/ABC'},
 {composition:{Fe:81,B:19},source:'DOI:10.1234/abc'},
 {composition:{Fe:81,B:19},source:''},
 {composition:{Fe:82,B:18},source:'another'}];
 assert.deepEqual(trainingInventory(rows),{n:4,groups:2,missingSources:1});
 assert.equal(trainingInventory(rows,'composition').groups,3);
});
test('advanced controls remain available behind task-focused options',()=>{
 const html=trainingControls({algorithms:['ridge'],inputMode:'composition',targetScale:'auto',descriptorMode:'auto',search:'standard',trees:64,threads:4,seed:8427});
 assert.match(html,/新配方筛选/);assert.match(html,/Hc 用对数/);assert.match(html,/<details><summary>高级设置/);
});
