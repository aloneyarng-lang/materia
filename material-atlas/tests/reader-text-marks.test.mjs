import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {selectionFragments,textMarkAnchor} from '../dist/reader-text-marks.js';
import {normalizeAnchor,normalizeNotes} from '../dist/note-model.js';
import {annotationHTML,transformAnnotation} from '../dist/reader-annotations.js';
import {LocalLibrary} from '../desktop/library.mjs';

const rects=[{x:.1,y:.2,width:.3,height:.02},{x:.1,y:.23,width:.2,height:.02}];
test('text selection clips to the page, removes duplicate boxes and preserves separate lines and columns',()=>{
  const first={left:110,top:220,right:210,bottom:240};
  const parts=selectionFragments([first,first,{left:300,top:220,right:400,bottom:240},{left:110,top:250,right:180,bottom:270},{left:0,top:0,right:1,bottom:1}],{left:100,top:200,width:400,height:600});
  assert.equal(parts.length,3);assert.equal(parts[0].x,.025);assert.equal(parts[1].x,.5);assert.notEqual(parts[0].y,parts[2].y);
  assert.deepEqual(selectionFragments([first],{left:0,top:0,width:0,height:0}),[]);
});
test('multi-line marks normalize round-trip and cannot be detached from their text by dragging',()=>{
  for(const kind of ['highlight','underline']){
    const anchor=textMarkAnchor({kind,page:3,rects,color:'rose'});
    assert.deepEqual(normalizeAnchor(anchor),anchor);assert.deepEqual(anchor.rects,rects);
    assert.equal(transformAnnotation(anchor,.1,.1),anchor);
    const markup=annotationHTML(anchor,'mark',{escape:String});
    assert.equal((markup.match(/reader-text-fragment/g)||[]).length,2);assert.ok(markup.includes('reader-text-mark-pin'));assert.ok(!markup.includes('data-annotation-handle'));
    assert.throws(()=>normalizeAnchor({...anchor,rects:[{x:2,y:0,width:1,height:1}]}));
    assert.throws(()=>normalizeAnchor({...anchor,rects:[{x:.8,y:.8,width:.1,height:.1}]}));
    assert.throws(()=>normalizeAnchor({...anchor,rects:[]}));
    assert.throws(()=>normalizeAnchor({...anchor,rects:Array(2001).fill(rects[0])}));
  }
});
test('saved highlights and underlines survive disk reopening and draft storage alongside legacy regions',async()=>{
  const parent=path.resolve('.local/tests');await mkdir(parent,{recursive:true});
  const lib=await new LocalLibrary(await mkdtemp(path.join(parent,'text-marks-'))).init();
  const notes={'paper:a':['highlight','underline'].map((kind,i)=>({id:kind,body:'Selected source text',anchor:textMarkAnchor({kind,page:1,rects}),createdAt:i+1,updatedAt:i+1}))};
  notes['paper:a'].push({id:'old',body:'Legacy note',anchor:{page:1,rect:rects[0],color:'yellow',fingerprint:''},createdAt:3,updatedAt:3});
  await lib.setSetting('notes',notes);
  const reopened=await new LocalLibrary(lib.root).init();assert.deepEqual(reopened.getSetting('notes'),normalizeNotes(notes));
  await reopened.setSetting('readerDrafts',[{paperId:'a',note:notes['paper:a'][0],savedAt:5,baseUpdatedAt:1}]);
  const again=await new LocalLibrary(lib.root).init();assert.deepEqual(again.getSetting('readerDrafts')[0].note.anchor.rects,rects);
});
test('older native annotation stores cannot discard text fragment geometry',async()=>{
  let writes=0;globalThis.materiaDesktop={info:async()=>({readerNotesVersion:1,readerAnnotationsVersion:1}),setSetting:async()=>writes++};
  try{
    const {setSetting}=await import('../dist/storage.js?old-text-mark-store');
    await assert.rejects(setSetting('notes',{'paper:a':[{id:'n',body:'source',anchor:textMarkAnchor({page:1,rects})}]}),/重新启动/);
    assert.equal(writes,0);
  }finally{delete globalThis.materiaDesktop;}
});
