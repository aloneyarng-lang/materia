import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createAgentVoice} from '../desktop/agent-voice.mjs';

async function fixture(){
 const root=await mkdtemp(path.join(os.tmpdir(),'materia-voice-pool-'));
 await mkdir(path.join(root,'runtime/runtime'),{recursive:true});
 for(const name of ['gpt.ckpt','sovits.pth','kurisu.ckpt','kurisu.pth','zh.wav','ja.wav','en.wav','runtime/runtime/python.exe'])
   await writeFile(path.join(root,name),'fixture:'+name);
 const common={runtime:'runtime',gpt:'gpt.ckpt',sovits:'sovits.pth',version:'v2Pro',isHalf:true,reference:'zh.wav',transcript:'Chinese reference',promptLanguage:'zh'};
 const voices={zh:{},ja:{reference:'ja.wav',transcript:'Japanese reference',promptLanguage:'ja'},en:{reference:'en.wav',transcript:'English reference',promptLanguage:'en'}};
 await writeFile(path.join(root,'reze.json'),JSON.stringify({...common,voices}));
 await writeFile(path.join(root,'ganyu.json'),JSON.stringify({...common,voices}));
 await writeFile(path.join(root,'kurisu.json'),JSON.stringify({...common,gpt:'kurisu.ckpt',sovits:'kurisu.pth'}));
 const requests=[],children=[];
 function spawnWorker(){
   const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.killed=false;
   child.kill=()=>{child.killed=true;child.emit('exit',0);};
   let buffer='';
   child.stdin.on('data',data=>{
     buffer+=data;
     while(buffer.includes('\n')){
       const end=buffer.indexOf('\n'),line=buffer.slice(0,end);buffer=buffer.slice(end+1);
       const request=JSON.parse(line);requests.push(request);
       const wav=Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(40),Buffer.from(request.profile.transcript+request.text)]).toString('base64');
       setImmediate(()=>child.stdout.write('MATERIA_VOICE '+JSON.stringify({wav})+'\n'));
     }
   });
   children.push(child);setImmediate(()=>child.stdout.write('MATERIA_VOICE {"ready":true}\n'));return child;
 }
 return {root,requests,children,voice:createAgentVoice(root,{spawnWorker})};
}
test('shared model survives role and language switches while each request retains its own voice conditioning',async()=>{
 const f=await fixture();const {voice}=f;
 try{
  const zh=await voice.synthesize({characterId:'chainsawman-reze',language:'zh',text:'Same text'});
  const ja=await voice.synthesize({characterId:'genshin-ganyu',language:'ja',text:'Same text'});
  assert.notEqual(zh,ja);assert.equal(f.children.length,1);
  assert.equal(f.requests[0].profile.promptLanguage,'zh');assert.equal(f.requests[1].profile.promptLanguage,'ja');
  await voice.synthesize({characterId:'genshin-ganyu',language:'zh',text:'Same text'});
  assert.equal(f.requests.length,3,'role identity remains part of the audio cache key');
  await voice.synthesize({characterId:'genshin-ganyu',language:'zh',text:'Same text'});
  assert.equal(f.requests.length,3);assert.equal(voice.diagnostics().cacheHits,1);
  await voice.synthesize({characterId:'makise-kurisu',language:'zh',text:'Different weights'});
  await voice.synthesize({characterId:'chainsawman-reze',language:'ja',text:'Return without a cold load'});
  assert.equal(f.children.length,2);assert.equal(voice.diagnostics().workers,2);
 }finally{voice.close();await rm(f.root,{recursive:true,force:true});}
});
test('configuration edits invalidate cached speech, and queued preparations do not race a synthesis',async()=>{
 const f=await fixture();const {voice}=f;
 try{
  const a=await voice.synthesize({characterId:'genshin-ganyu',language:'ja',text:'Hello'});
  const p=path.join(f.root,'ganyu.json');
  const {readFile}=await import('node:fs/promises');const cfg=JSON.parse(await readFile(p,'utf8'));
  cfg.voices.ja.transcript='Updated Japanese reference';await writeFile(p,JSON.stringify(cfg));
  const b=await voice.synthesize({characterId:'genshin-ganyu',language:'ja',text:'Hello'});
  assert.notEqual(a,b);assert.equal(f.children.length,1);
  await Promise.all([
   voice.prepare('chainsawman-reze','zh'),
   voice.synthesize({characterId:'chainsawman-reze',language:'zh',text:'Complete, no cancellation'}),
   voice.prepare('makise-kurisu','ja'),
  ]);
  assert.equal(f.requests.at(-1).text,'Complete, no cancellation');
 }finally{voice.close();await rm(f.root,{recursive:true,force:true});}
});

