import {solveNaturalLayout} from './natural-layout.js';

export function computeNaturalLayout(input,options={},signal,onProgress=()=>{}){
  return new Promise((resolve,reject)=>{
    let worker,startupTimer,deadline,settled=false,fallbackStarted=false;
    const controller=new AbortController();
    const cleanup=()=>{clearTimeout(startupTimer);clearTimeout(deadline);worker?.terminate();signal?.removeEventListener('abort',cancel);};
    const finish=(error,result)=>{if(settled)return;settled=true;controller.abort();cleanup();error?reject(error):resolve(result);};
    const cancel=()=>finish(new DOMException('整理已取消。','AbortError'));
    const progress=value=>{if(!settled)onProgress(value);};
    const fallback=()=>{
      if(settled||fallbackStarted)return;fallbackStarted=true;clearTimeout(startupTimer);worker?.terminate();worker=null;
      solveNaturalLayout(input,options,{signal:controller.signal,progress,yieldTask:()=>new Promise(r=>setTimeout(r,0))}).then(result=>finish(null,result),error=>finish(error));
    };
    if(signal?.aborted){cancel();return;}
    signal?.addEventListener('abort',cancel,{once:true});
    deadline=setTimeout(()=>finish(new Error('星图整理超时，请减少可见文献后重试。')),30000);
    if(typeof Worker==='undefined'){fallback();return;}
    try{
      worker=new Worker(new URL('./natural-layout-worker.js',import.meta.url),{type:'module'});
      worker.onmessage=event=>{
        if(settled||fallbackStarted)return;
        const data=event.data;
        if(data?.ready){clearTimeout(startupTimer);return;}
        if(data?.progress){clearTimeout(startupTimer);progress(data.progress);return;}
        const result=data?.result;
        if(data?.error||!result||!Array.isArray(result.points)||!result.points.every(p=>p&&typeof p.id==='string'&&Number.isFinite(p.x)&&Number.isFinite(p.y))||!['scale','x','y'].every(key=>Number.isFinite(result.camera?.[key]))){fallback();return;}
        finish(null,result);
      };
      worker.onerror=event=>{event.preventDefault();fallback();};worker.onmessageerror=fallback;
      startupTimer=setTimeout(fallback,3000);worker.postMessage({input,options});
    }catch{fallback();}
  });
}

// Complete even when a hidden/minimized window stops receiving animation frames.
export function animateNaturalLayout(update,signal,duration=680){
  return new Promise((resolve,reject)=>{
    let frame,timer,start=null,done=false;
    const finish=(error,completed)=>{if(done)return;done=true;cancelAnimationFrame(frame);clearTimeout(timer);signal.removeEventListener('abort',cancel);error?reject(error):resolve(completed);};
    const cancel=()=>finish(null,false);
    const apply=t=>{try{update(t);return true;}catch(error){finish(error);return false;}};
    const tick=time=>{if(done)return;if(start===null)start=time;const t=Math.min(1,(time-start)/duration);if(!apply(t))return;if(t===1)finish(null,true);else frame=requestAnimationFrame(tick);};
    if(signal.aborted){cancel();return;}
    signal.addEventListener('abort',cancel,{once:true});
    timer=setTimeout(()=>{if(!done&&apply(1))finish(null,true);},duration+1000);
    frame=requestAnimationFrame(tick);
  });
}
