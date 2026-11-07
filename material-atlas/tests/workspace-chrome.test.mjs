import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanWorkspaceLayout,workspaceLayoutKey,readWorkspaceLayout,writeWorkspaceLayout} from '../dist/workspace-chrome.js';
test('workspace layout restores only known views and real boolean preferences',()=>{
 assert.deepEqual(cleanWorkspaceLayout({view:'prediction',leftPanelOpen:true,detailOpen:false,focusGraph:true,query:'not persisted',papers:['not persisted']}),{view:'materials',leftPanelOpen:true,detailOpen:false,focusGraph:true});
 for(const v of [null,undefined,[],{view:'unknown',leftPanelOpen:'true',detailOpen:1}])assert.deepEqual(cleanWorkspaceLayout(v),{});
});
test('workspace preferences survive restart and stay isolated by library without changing content',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 assert.equal(writeWorkspaceLayout(storage,'A',{view:'notes',detailOpen:false,query:'private search'}),true);
 assert.deepEqual(readWorkspaceLayout(storage,'A'),{view:'notes',detailOpen:false});assert.deepEqual(readWorkspaceLayout(storage,'B'),{});assert.notEqual(workspaceLayoutKey('A'),workspaceLayoutKey('B'));
 assert.ok(![...map.values()][0].includes('private search'));
});
test('corrupt or unavailable preference storage never prevents using the workspace',()=>{
 assert.deepEqual(readWorkspaceLayout({getItem:()=>'{broken'},'A'),{});assert.deepEqual(readWorkspaceLayout(null,'A'),{});
 assert.equal(writeWorkspaceLayout({setItem:()=>{throw Error('full');}},'A',{view:'list'}),false);
});
