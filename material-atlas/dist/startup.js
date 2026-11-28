// Startup splash: picks the animation style from ?style= and drives the
// shared progress value used by the ruler, orbit ring, counters and matrix.
(()=>{
const STYLES=['classic','drafting','obsidian','telemetry','aperture','diffraction','telescope','monolith','horology','prism','chrome'];
const root=document.documentElement;
const params=new URLSearchParams(location.search);
const requested=params.get('style');
root.dataset.style=STYLES.includes(requested)?requested:'aperture';
if(params.get('autoplay')==='1')root.classList.add('playing');
const STAGES=[[.35,'// BOOTSTRAP','CORE SERVICES'],[.78,'// LITERATURE VAULT','INDEXING PAPERS'],[Infinity,'// STAR GRAPH READY','ONLINE']];
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
let start=0,frame=0,done=false,lastLabel='';
// Climb to 92% within the minimum splash time, then creep until the workspace is ready.
function progressAt(ms){
  if(done)return 1;
  const ramp=root.dataset.style==='prism'||root.dataset.style==='chrome'?2450:1900;
  if(ms<ramp)return .92*ease(ms/ramp);
  return .92+.07*(1-Math.exp(-(ms-ramp)/1500));
}
function paint(p){
  window.__materiaStartupProgress=p;
  root.style.setProperty('--p',p.toFixed(4));
  const pct=Math.round(p*100);
  for(const out of document.querySelectorAll('output[data-digits]'))out.textContent=String(pct).padStart(Number(out.dataset.digits),'0');
  const arc=document.querySelector('.ring .arc');
  if(arc)arc.style.strokeDashoffset=String(1-p);
  if(root.dataset.style!=='telemetry')return;
  const cells=document.querySelectorAll('.matrix i'),lit=Math.floor(p*cells.length);
  cells.forEach((cell,index)=>{cell.classList.toggle('on',index<lit);cell.classList.toggle('head',index===lit-1&&p<1);});
  const [,command,sub]=STAGES.find(([limit])=>p<limit)||STAGES.at(-1);
  if(command!==lastLabel){
    lastLabel=command;
    document.querySelector('[data-stage]').textContent=command;
    document.querySelector('[data-stage-sub]').textContent=sub;
  }
}
function tick(now){paint(progressAt(now-start));if(!done)frame=requestAnimationFrame(tick);}
function begin(){if(start||done)return;start=performance.now();frame=requestAnimationFrame(tick);}
function sync(){
  if(root.classList.contains('playing'))begin();
  if(root.classList.contains('depart')&&!done){done=true;cancelAnimationFrame(frame);paint(1);}
}
new MutationObserver(sync).observe(root,{attributes:true,attributeFilter:['class']});
document.addEventListener('DOMContentLoaded',()=>{paint(0);sync();});
})();
