// Original frames from the user's Codex pet 灵梦:
// pet_6ad58bbf21808191a976a3c39496238d, processing row (7).
(()=>{
const pet=document.querySelector('.pet');
const durations=[120,120,120,120,120,220];
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let frame=0,timer;
function stop(){clearTimeout(timer);timer=undefined;}
function play(){
  stop();
  if(document.hidden||reduced.matches){pet.style.backgroundPosition='0px 0px';return;}
  pet.style.backgroundPosition=`${-192*frame}px 0px`;
  timer=setTimeout(()=>{frame=(frame+1)%durations.length;play();},durations[frame]);
}
document.addEventListener('visibilitychange',play);
reduced.addEventListener('change',()=>{frame=0;play();});
addEventListener('pagehide',stop);
play();
})();
