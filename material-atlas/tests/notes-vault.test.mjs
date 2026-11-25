import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {NotesVault} from '../desktop/notes-vault.mjs';
import {NOTE_LIMIT,notePath,dailyTipName} from '../dist/notes-vault-model.js';
import {noteReferences,renderNoteMarkdown,resolveNoteLink} from '../dist/notes-markdown.js';
import {editNoteMarkdown,noteCommandAt} from '../dist/note-edit.js';
import {screenshotCrop} from '../dist/screenshot-selection.js';

test('screenshot selection maps display fractions to bounded pixel coordinates',()=>{
  assert.deepEqual(screenshotCrop({left:.25,top:.2,right:.75,bottom:.8},3840,2160),
    {x:960,y:432,width:1920,height:1296});
  assert.deepEqual(screenshotCrop({left:-.2,top:.01,right:.075,bottom:1.2},100,200),
    {x:0,y:2,width:8,height:198});
  assert.equal(screenshotCrop({left:.8,top:.2,right:.25,bottom:.8},400,200),null);
  assert.equal(screenshotCrop({left:.1,top:.1,right:.1,bottom:.1},200,200),null);
  assert.equal(screenshotCrop({left:0,top:0,right:Infinity,bottom:1},400,200),null);
});

test('Tab commands identify only the bracketed range and retain nearby text as context',()=>{
  const prefix='实验结果\n原句 ',command='【AI： 总结上文 】',body=prefix+command+' 后续正文';
  const end=prefix.length+command.length;
  const expected={start:prefix.length,end,instruction:'总结上文',context:prefix};
  assert.deepEqual(noteCommandAt(body,end,end),expected);
  assert.deepEqual(noteCommandAt(body,prefix.length,end),expected);
  assert.equal(noteCommandAt(body,0,end),null);
  assert.equal(noteCommandAt(body,end-1,end-1),null);
  assert.equal(noteCommandAt(body,body.length,body.length),null);
  assert.equal(noteCommandAt('【AI： 】',6,6),null);
  const preceding='x'.repeat(9000)+'\n';
  const ascii=preceding+'{{AI: continue}}';
  assert.deepEqual(noteCommandAt(ascii,ascii.length,ascii.length),{
    start:preceding.length,end:ascii.length,instruction:'continue',context:preceding.slice(-8000),
  });
});

test('note edit requests distinguish insertion context from selected text',async()=>{
  async function payload(request){
    let messages;
    const result=await editNoteMarkdown(request,input=>{
      assert.deepEqual(input.tools,[]);
      messages=input.messages;
      return {content:'生成结果'};
    });
    assert.equal(result,'生成结果');
    return messages;
  }
  const context='甲'.repeat(9000);
  const insertion=await payload({body:'',instruction:'总结上文',selected:false,context});
  assert.match(insertion[0].content,/生成插入当前位置/);
  assert.deepEqual(JSON.parse(insertion[1].content),{body:'',instruction:'总结上文',selected:false,context:context.slice(-8000)});
  const selection=await payload({body:'段落',instruction:'润色',selected:true});
  assert.deepEqual(JSON.parse(selection[1].content),{body:'段落',instruction:'润色',selected:true});
});

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

test('daily tips use the local date and append concurrent entries without overwriting the note',async t=>{
  assert.equal(dailyTipName(new Date(2026,10,20,0,1)),'tip_261120.md');
  const root=await mkdtemp(path.join(os.tmpdir(),'materia-tip-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const vault=new NotesVault(root),id=dailyTipName();
  await vault.save({id,body:'原有内容\r\n',revision:null});
  await Promise.all([vault.appendTip('第一条'),vault.appendTip('第二条')]);
  assert.equal(await readFile(path.join(root,id),'utf8'),'原有内容\r\n\r\n---\r\n\r\n第一条\r\n\r\n---\r\n\r\n第二条\r\n');
});

test('quick tips can save just an image as portable Markdown and leave no new assets when the note is full',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'materia-tip-image-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const vault=new NotesVault(root);
  const encoded='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2pUAAAAASUVORK5CYII=';
  const image={id:'clipboard-image',name:'实验 [截图].png',dataUrl:'data:image/png;base64,'+encoded,width:1,height:1};
  const note=await vault.appendTip({entry:'',attachments:[image]});
  const [reference]=note.body.match(/tip-images\/img-[a-f\d-]+\.png/g);
  assert.match(renderNoteMarkdown(note.body).markup,/data-note-image="tip-images\//);
  assert.deepEqual(await vault.image(note.id,reference),{type:'image/png',bytes:Buffer.from(encoded,'base64')});
  const files=await readdir(path.join(root,'tip-images'));
  await vault.save({id:note.id,revision:note.revision,body:'x'.repeat(NOTE_LIMIT)});
  await assert.rejects(vault.appendTip({entry:'still too long',attachments:[image]}),/512/);
  assert.deepEqual(await readdir(path.join(root,'tip-images')),files);
});
