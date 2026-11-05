import test from 'node:test';
import assert from 'node:assert/strict';
import {computeNaturalLayout,animateNaturalLayout} from '../dist/natural-layout-client.js';
const input={nodes:[{id:'paper:a',x:500,y:310},{id:'paper:b',x:500,y:310}],edges:[]};
test('malformed worker responses fall back and finish instead of leaving the task pending',async()=>{
  globalThis.Worker=class{postMessage(){queueMicrotask(()=>this.onmessage({data:null}));}terminate(){}};
  try{const result=await computeNaturalLayout(input);assert.equal(result.points.length,2);}finally{delete globalThis.Worker;}
});
test('unresponsive workers fall back after startup timeout; fallback reports progress',async()=>{
  let stopped=0,progress=0;globalThis.Worker=class{postMessage(){}terminate(){stopped++;}};
  try{const result=await computeNaturalLayout(input,{},undefined,()=>progress++);assert.equal(result.points.length,2);assert.ok(stopped>0);assert.equal(progress,5);}finally{delete globalThis.Worker;}
});
test('cancelling worker calculation rejects promptly and terminates its worker',async()=>{
  let stopped=false;globalThis.Worker=class{postMessage(){}terminate(){stopped=true;}};
  try{const controller=new AbortController(),pending=computeNaturalLayout(input,{},controller.signal);controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(stopped,true);}finally{delete globalThis.Worker;}
});
test('animation exceptions reject and animation starvation completes without leaving the UI busy',async()=>{
  const controller=new AbortController();let tick;
  globalThis.requestAnimationFrame=fn=>(tick=fn,1);globalThis.cancelAnimationFrame=()=>{};
  try{
    const pending=animateNaturalLayout(()=>{throw Error('paint failed');},controller.signal);tick(1);await assert.rejects(pending,/paint failed/);
    let last=-1;assert.equal(await animateNaturalLayout(t=>last=t,controller.signal,1),true);assert.equal(last,1);
    const cancelled=new AbortController();let painted=false;const aborted=animateNaturalLayout(()=>painted=true,cancelled.signal);cancelled.abort();assert.equal(await aborted,false);tick(10);assert.equal(painted,false);
  }finally{delete globalThis.requestAnimationFrame;delete globalThis.cancelAnimationFrame;}
});

test('a worker that starts but never finishes times out and releases its resources',async()=>{
  const schedule=globalThis.setTimeout;let stopped=false;
  globalThis.setTimeout=(fn,delay,...args)=>schedule(fn,delay===30000?20:delay,...args);
  globalThis.Worker=class{postMessage(){queueMicrotask(()=>this.onmessage({data:{ready:true}}));}terminate(){stopped=true;}};
  try{await assert.rejects(computeNaturalLayout(input),/超时/);assert.equal(stopped,true);}finally{globalThis.setTimeout=schedule;delete globalThis.Worker;}
});
