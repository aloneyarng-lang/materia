import test from 'node:test';
import assert from 'node:assert/strict';
import {ModuleRegistry} from '../dist/module-runtime.js';
import {DesktopModuleServices} from '../desktop/module-services.mjs';
import {LocalLibrary} from '../desktop/library.mjs';
import {mkdir,mkdtemp} from 'node:fs/promises';
import path from 'node:path';

const core={id:'core',required:true,create:()=>({})};
test('modules mount lazily once, share concurrent initialization and use dependency ordering',async()=>{
 const events=[],registry=new ModuleRegistry([core,{id:'data',create:()=>{events.push('data');return{};}},{id:'analysis',requires:['data'],create:()=>{events.push('analysis');return{};}}]);
 assert.deepEqual(events,[]);const [a,b]=await Promise.all([registry.get('analysis'),registry.get('analysis')]);assert.equal(a,b);assert.deepEqual(events,['data','analysis']);
 await registry.setEnabled('analysis',false);await registry.setEnabled('data',false);await registry.setEnabled('analysis',true);assert.ok(registry.enabled.has('data'));assert.deepEqual(events,['data','analysis']);
});
test('disable flushes then persists and disposes; enable remounts without deleting saved data',async()=>{
 const events=[],saved={value:42};let mounts=0;
 const registry=new ModuleRegistry([core,{id:'feature',create:()=>{mounts++;return{flush:()=>events.push('flush'),dispose:()=>events.push('dispose')};}}],()=>({release:()=>events.push('release')}),{persist:()=>events.push('persist')});
 await registry.get('feature');await registry.setEnabled('feature',false);assert.deepEqual(events,['flush','persist','dispose','release']);assert.deepEqual(saved,{value:42});assert.equal(registry.records.has('feature'),false);await assert.rejects(registry.get('feature'));
 await registry.setEnabled('feature',true);await registry.get('feature');assert.equal(mounts,2);
});
test('failed flush and failed preference save keep an active module intact',async()=>{
 let failFlush=true,disposed=false,failPersist=false;const registry=new ModuleRegistry([core,{id:'feature',create:()=>({flush(){if(failFlush)throw Error('busy');},dispose(){disposed=true;}})}],()=>({}),{persist(){if(failPersist)throw Error('disk');}});
 await registry.get('feature');await assert.rejects(registry.setEnabled('feature',false),/busy/);assert.ok(registry.enabled.has('feature'));assert.equal(disposed,false);
 failFlush=false;failPersist=true;await assert.rejects(registry.setEnabled('feature',false),/disk/);assert.ok(registry.enabled.has('feature'));assert.equal(disposed,false);
});
test('bad factories cannot poison other modules and release their scoped resources',async()=>{
 let released=0,attempt=0;const registry=new ModuleRegistry([core,{id:'broken',create(){attempt++;throw Error('failed');}}],()=>({release(){released++;}}));
 await assert.rejects(registry.get('broken'),/failed/);await registry.get('core');await assert.rejects(registry.get('broken'),/failed/);assert.equal(released,2);assert.equal(attempt,2);
});
test('preferences protect required modules, ignore removed definitions and preserve new defaults',async()=>{
 const registry=new ModuleRegistry([core,{id:'old',create:()=>({})},{id:'new',create:()=>({})}]);await registry.loadPreferences({disabled:['core','old','removed']});
 assert.deepEqual(registry.list().map(m=>m.id),['core','new']);await assert.rejects(registry.setEnabled('core',false),/基础/);assert.deepEqual(registry.preferences().disabled,['old']);
});
test('invalid identifiers, duplicate registrations, missing and circular dependencies fail explicitly',()=>{
 for(const definitions of [[core,core],[{id:'../x',create:()=>({})}],[{id:'a',requires:['b'],create:()=>({})}],[{id:'a',requires:['b'],create:()=>({})},{id:'b',requires:['a'],create:()=>({})}]])assert.throws(()=>new ModuleRegistry(definitions));
});
test('library reset flushes loaded features before resetting their state',async()=>{
 const events=[],registry=new ModuleRegistry([{id:'a',create:()=>({flush:()=>events.push('flush'),reset:()=>events.push('reset')})},{id:'unused',create:()=>{throw Error('should stay lazy');}}]);await registry.get('a');await registry.reset();assert.deepEqual(events,['flush','reset']);
});
test('desktop feature services load lazily and reject writes to a different library',async()=>{
 const events=[],values=new Map(),services=new DesktopModuleServices([{id:'prediction',create:async root=>{events.push(root);return{root,queue:Promise.resolve(),load:async()=>values.get(root)||{},save:async value=>values.set(root,value)};}}],'A');
 assert.deepEqual(events,[]);await services.save('prediction',{libraryKey:'A',state:{value:1}});assert.deepEqual(await services.load('prediction'),{libraryKey:'A',state:{value:1}});
 await services.changeLibrary('B');await assert.rejects(services.save('prediction',{libraryKey:'A',state:{value:99}}),/切换/);assert.deepEqual(values.get('A'),{value:1});assert.deepEqual(await services.load('prediction'),{libraryKey:'B',state:{}});assert.deepEqual(events,['A','B']);
 await assert.rejects(services.load('unknown'),/没有注册/);
});
test('real library files persist module preferences and namespaced data without adding a new storage key for each feature',async()=>{
 await mkdir('.local/tests',{recursive:true});const root=await mkdtemp(path.resolve('.local/tests/module-data-')),library=await new LocalLibrary(root).init(),papers=structuredClone(library.getPapers());
 await library.setSetting('workspaceModules',{version:1,disabled:['prediction']});await library.setSetting('module:future-feature',{counter:3,records:[1,2]});
 const reopened=await new LocalLibrary(root).init();assert.deepEqual(reopened.getSetting('workspaceModules'),{version:1,disabled:['prediction']});assert.deepEqual(reopened.getSetting('module:future-feature'),{counter:3,records:[1,2]});assert.deepEqual(reopened.getPapers(),papers);
 await assert.rejects(library.setSetting('module:../../other',{}));await assert.rejects(library.setSetting('workspaceModules',{version:1,disabled:['../x']}));await assert.rejects(library.setSetting('module:big','x'.repeat(5*1024*1024)));
});
