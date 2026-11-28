export const pitchNames = ['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
export const presets = {
  '原音阶':Array.from({length:12},(_,i)=>i),
  '都节':[0,1,5,7,8], '平调子':[0,2,3,7,8], '琉球':[0,4,5,7,11]
};
const profiles = [
  [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88],
  [6.33,2.68,3.52,5.38,2.6,3.53,2.54,4.75,3.98,2.69,3.34,3.17]
];

export function guessKey(notes) {
  const bins = Array(12).fill(0);
  for (const {pitch,beats} of notes) if (pitch !== null) bins[pitch%12] += beats;
  const mean = bins.reduce((a,b)=>a+b,0)/12;
  const centered = bins.map(n=>n-mean);
  const norm = Math.hypot(...centered);
  if (!norm) return null;
  let best;
  profiles.forEach((profile,mode)=>{
    const avg = profile.reduce((a,b)=>a+b,0)/12;
    const weights = profile.map(n=>n-avg);
    for(let root=0;root<12;root++){
      const score = weights.reduce((sum,w,i)=>sum+w*centered[(root+i)%12],0)/(norm*Math.hypot(...weights));
      if(!best || score>best.score) best={root,mode,score};
    }
  });
  return best;
}

export function remapPitch(pitch, root, scale, tweaks) {
  if(pitch===null)return null;
  const allowed = n=>n>=0 && n<=127 && scale.includes((n-root+120)%12);
  let mapped=pitch;
  for(let d=0;d<12;d++){
    if(allowed(pitch-d)){mapped=pitch-d;break;}
    if(allowed(pitch+d)){mapped=pitch+d;break;}
  }
  return Math.max(0,Math.min(127,mapped+tweaks[pitch%12]));
}

export function melodyMidi(notes) {
  const track=[0,0xff,0x51,3,7,0xa1,0x20]; // 120 BPM, 96 ticks per quarter
  function delta(n){
    const bytes=[n&127];
    while((n=Math.floor(n/128))>0)bytes.unshift((n&127)|128);
    track.push(...bytes);
  }
  let delay=0;
  for(const {pitch,beats} of notes){
    const ticks=Math.round(beats*96);
    if(pitch===null){delay+=ticks;continue;}
    delta(delay);track.push(0x90,pitch,90);delta(ticks);track.push(0x80,pitch,0);delay=0;
  }
  delta(delay);track.push(0xff,0x2f,0);
  const n=track.length;
  return Uint8Array.from([77,84,104,100,0,0,0,6,0,0,0,1,0,96,77,84,114,107,n>>>24,n>>>16,n>>>8,n,...track]);
}
