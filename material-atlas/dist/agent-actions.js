import {ACTORS,actionSequence} from './agent-actors.js';

export function createCharacterActions(panel,stage){
  const video=document.createElement('video');video.className='agent-actor-video';
  video.muted=true;video.playsInline=true;video.preload='metadata';video.hidden=true;
  video.setAttribute('aria-label','角色动作场景');stage.prepend(video);
  const notice=document.createElement('p');notice.className='agent-action-notice';notice.setAttribute('role','status');stage.append(notice);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let actor,queue=[],clipId='',eventId='',pending='',callback=0;
  const enabled=()=>actor?.media&&!panel.hidden&&!document.hidden&&panel.classList.contains('agent-motion')&&!reduced.matches&&!stage.classList.contains('agent-custom-art');
  function play(){
    if(!enabled()){video.pause();return;}
    const current=actor;
    video.play().catch(error=>{
      if(actor===current&&enabled()&&error.name!=='AbortError')notice.textContent='点击画面可继续播放角色动作。';
    });
  }
  function clip(id){
    clipId=id;stage.dataset.action=eventId||'idle';stage.dataset.actionClip=id;
    const range=actor.clips[id];
    if(video.readyState>=1&&Math.abs(video.currentTime-range.start)>.15)video.currentTime=range.start;
    play();
  }
  function start(event){
    const sequence=actionSequence(actor,event);if(!sequence.length)return false;
    eventId=event;queue=sequence;clip(queue.shift());return true;
  }
  function tick(){
    if(!actor?.media||!clipId||video.seeking)return;
    if(video.currentTime<actor.clips[clipId].end-.025)return;
    if(queue.length){clip(queue.shift());return;}
    if(pending){const next=pending;pending='';start(next);return;}
    eventId='';clip(actor.idle);
  }
  function cancelFrame(){if(callback&&video.cancelVideoFrameCallback)video.cancelVideoFrameCallback(callback);callback=0;}
  function frame(){
    callback=0;reveal();tick();
    if(!video.paused&&video.requestVideoFrameCallback)callback=video.requestVideoFrameCallback(frame);
  }
  function reveal(){
    if(!actor?.media||!clipId||video.seeking||video.readyState<2)return;
    const range=actor.clips[clipId];
    if(video.currentTime>=range.start-.1&&video.currentTime<=range.end+.1&&!stage.classList.contains('agent-video-ready'))stage.classList.add('agent-video-ready');
  }
  video.addEventListener('playing',()=>{notice.textContent='';if(!callback&&video.requestVideoFrameCallback)callback=video.requestVideoFrameCallback(frame);});
  video.addEventListener('pause',cancelFrame);
  video.addEventListener('timeupdate',tick);
  video.addEventListener('seeked',()=>{
    if(video.requestVideoFrameCallback)video.requestVideoFrameCallback(reveal);
    else requestAnimationFrame(reveal);
  });
  video.addEventListener('ended',tick);
  video.addEventListener('loadedmetadata',()=>{
    if(!actor?.media)return;
    if(Object.values(actor.clips).some(range=>range.end>video.duration+.05)){
      video.pause();notice.textContent='角色视频与动作片段不匹配。';return;
    }
    clip(clipId||actor.idle);
  });
  video.addEventListener('error',()=>{if(actor?.media)notice.textContent='角色视频无法播放，请检查素材文件。';});
  stage.addEventListener('pointerdown',()=>{if(actor?.media&&video.paused)play();});
  new MutationObserver(play).observe(panel,{attributes:true,attributeFilter:['hidden','class']});
  new MutationObserver(play).observe(stage,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',play);reduced.addEventListener('change',play);
  return {
    setActor(id){
      const next=ACTORS[id]||ACTORS.amadeus;if(actor===next)return;
      video.pause();cancelFrame();actor=next;queue=[];pending='';eventId='';clipId='';
      stage.classList.remove('agent-video-ready');
      notice.textContent='';stage.dataset.action='idle';stage.dataset.actionClip='';
      video.hidden=!actor.media;
      if(!actor.media){video.removeAttribute('src');video.load();return;}
      video.poster=actor.poster;video.src=actor.media;clipId=actor.idle;video.load();
    },
    trigger(event){
      if(!actor?.media||!enabled()||!actionSequence(actor,event).length)return false;
      if(eventId){pending=event;return true;}
      return start(event);
    },
    reset(){if(actor?.media){queue=[];pending='';eventId='';clip(actor.idle);}},
  };
}
