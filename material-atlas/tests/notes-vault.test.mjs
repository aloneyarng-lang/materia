import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {NotesVault} from '../desktop/notes-vault.mjs';
import {notePath} from '../dist/notes-vault-model.js';
import {noteReferences,renderNoteMarkdown,resolveNoteLink} from '../dist/notes-markdown.js';

test('vault writes actual Markdown, rejects collisions and preserves external edits',async t=>{
  const scratch=await mkdtemp(path.join(os.tmpdir(),'materia-notes-'));
  t.after(()=>rm(scratch,{recursive:true,force:true}));
  const root=path.join(scratch,'笔记库'),vault=new NotesVault(root);
  assert.deepEqual(await vault.list(),{notes:[],skipped:0});
  for(const invalid of ['../逃逸','C:/逃逸','notes\\逃逸','COM1','绝对/../路径'])assert.throws(()=>notePath(invalid));
  const id='实验/材料.md',filename=path.join(root,'实验','材料.md');
  const initial=await vault.save({id,body:'# 材料',revision:null});
  await assert.rejects(vault.save({id,body:'重复',revision:null}),/同名/);
  const saved=await vault.save({id,body:'# 已修改',revision:initial.revision});
  assert.equal(await readFile(filename,'utf8'),'# 已修改');
  assert.equal((await vault.list()).notes[0].revision,saved.revision);
  await writeFile(filename,'# 外部编辑');
  await assert.rejects(vault.save({id,body:'不应覆盖',revision:saved.revision}),/外部修改/);
  assert.equal(await readFile(filename,'utf8'),'# 外部编辑');
});

test('Markdown renders offline math without enabling active HTML, and indexes only real links',()=>{
  const body=['# 材料','','$x^2$','', '$$','E=\\frac{\\sigma}{\\varepsilon}','$$','', '[[实验/测量|实验]] [讨论](../讨论.md#结果)','', '`[[字面文本]]`','', '<img src=x onerror=alert(1)>','', '- [x] 完成'].join('\n');
  const {markup,outline}=renderNoteMarkdown(body);
  assert.match(markup,/katex-display/);
  assert.doesNotMatch(markup,/<img/);
  assert.match(markup,/note-task/);
  assert.equal(outline[0].label,'材料');
  assert.deepEqual(noteReferences(body),[{target:'实验/测量',wiki:true},{target:'../%E8%AE%A8%E8%AE%BA.md#%E7%BB%93%E6%9E%9C',wiki:false}]);
  const notes=[{id:'实验/测量.md'},{id:'讨论.md'}];
  assert.deepEqual(resolveNoteLink('实验/测量','草稿/材料.md',notes),{id:'实验/测量.md',heading:''});
  assert.deepEqual(resolveNoteLink('../%E8%AE%A8%E8%AE%BA.md#%E7%BB%93%E6%9E%9C','草稿/材料.md',notes,false),{id:'讨论.md',heading:'结果'});
});
