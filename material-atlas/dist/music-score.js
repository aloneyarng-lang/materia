import {guessKey, melodyMidi, pitchNames, presets, remapPitch, shadeCadences} from './music-remap.js';
const letters = 'CDEFGAB';
const natural = [0, 2, 4, 5, 7, 9, 11];
const durations = {whole:4, half:2, quarter:1, eighth:0.5};
const sample = [60,64,67,65,64,62,60,67].map((pitch,i) => ({pitch, beats:1, bar:1+Math.floor(i/4)}));

function spell(pitch) {
  const chroma = pitch % 12;
  let step = natural.indexOf(chroma);
  const flat = step < 0;
  if (flat) step = natural.indexOf(chroma + 1);
  return {step, flat, octave:Math.floor(pitch/12)-1};
}

export function mountScore(root, audio, onRemap = () => {}) {
  root.innerHTML = `<header class="score-heading">
      <div class="score-heading-meta">
        <h2>乐谱手稿</h2>
        <p class="score-subtitle" data-title></p>
      </div>
      <div class="music-tools">
        <button type="button" data-import>导入 MusicXML</button>
        <button type="button" data-export>导出乐谱</button>
      </div>
    </header>
    <input type="file" accept=".musicxml,.xml" hidden>
    <p class="score-lead">点选谱面上的一个或多个音符，即可升降半音或进行调式重映射；再次点击取消选择。</p>
    <div class="score-paper" aria-label="高音谱表"></div>
    <div class="score-toolbar">
      <div class="music-tools">
        <button type="button" data-down>降半音 ♭</button>
        <button type="button" data-up>升半音 ♯</button>
        <button type="button" data-undo>撤销</button>
        <button type="button" data-preview>试听全谱</button>
      </div>
      <span class="score-count" data-count></span>
    </div>
    <details class="score-remap" open>
      <summary>音阶重映射控制台</summary>
      <div class="score-remap-body">
        <div class="music-tools">
          <label>主音 <select data-root></select></label>
          <button type="button" data-guess>自动猜调</button>
          <label>调式预设 <select data-scale></select></label>
        </div>
        <details class="score-tweaks-details">
          <summary>逐音微调（12 半音偏移）</summary>
          <p class="score-lead">按原音名选择偏移量，在预设映射后再升降半音。</p>
          <div data-tweaks class="score-tweaks-grid"></div>
        </details>
        <div class="music-tools">
          <button type="button" data-ab aria-pressed="false">对比原音</button>
          <button type="button" data-midi>导出 MIDI</button>
          <button type="button" data-record>录制音频</button>
        </div>
      </div>
    </details>
    <p class="score-message" data-message role="status"></p>`;
  const el = name => root.querySelector('[data-'+name+']');
  const paper = root.querySelector('.score-paper');
  const input = root.querySelector('input');
  const selected = new Set();
  let notes = structuredClone(sample), title = '示例旋律', history = [], source = null;
  let recorder, capture, recordingRequested=false;
  let synth, run = 0, voices = [], timer;
  let tonic=0, scale='原音阶', original=false;
  const tweaks=Array(12).fill(0);
  const effective=p=>original?p:remapPitch(p,tonic,presets[scale],tweaks);
  const rendered=()=>{
    const mapped=notes.map(n=>({...n,pitch:effective(n.pitch)}));
    return !original && scale==='日本小调变奏' ? shadeCadences(notes,mapped,tonic,tweaks) : mapped;
  };
  function changed(){
    onRemap(scale, tonic, Array.from({length:12}, (_, i) => effective(60+i)-60-i), original);
    const playing=voices.length>0;
    stop();draw();
    if(playing)el('preview').click();
  }
  pitchNames.forEach((name,i)=>{
    el('root').add(new Option(name,i));
    const label=document.createElement('label'), select=document.createElement('select');
    label.append(name+' ',select);
    [-1,0,1].forEach(n=>select.add(new Option(n>0?'+1':String(n),n)));
    select.value='0';select.onchange=()=>{tweaks[i]=Number(select.value);changed();};
    el('tweaks').append(label);
  });
  Object.keys(presets).forEach(name=>el('scale').add(new Option(name,name)));
  el('scale').onchange=()=>{scale=el('scale').value;changed();};
  el('root').onchange=()=>{tonic=Number(el('root').value);changed();};
  el('guess').onclick=()=>{
    const key=guessKey(notes);
    if(!key){el('message').textContent='音高分布不足以判断主音。';return;}
    tonic=key.root;el('root').value=String(tonic);
    el('message').textContent='估计原调：'+pitchNames[tonic]+(key.mode?' 小调':' 大调');changed();
  };
  el('ab').onclick=()=>{original=!original;el('ab').setAttribute('aria-pressed',String(original));el('ab').textContent=original?'返回映射版':'对比原音';changed();};
  el('midi').onclick=()=>{
    const url=URL.createObjectURL(new Blob([melodyMidi(rendered())],{type:'audio/midi'}));
    const link=document.createElement('a');link.href=url;link.download=title.replace(/\.(xml|musicxml)$/i,'')+(original?'原音':'编配')+'.mid';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  el('record').disabled=typeof MediaRecorder==='undefined';
  el('record').onclick=()=>{
    if(recorder?.state==='recording'){stop();return;}
    stop();recordingRequested=true;el('preview').click();
  };
  function stop() {
    if(recorder?.state==='recording')recorder.stop();
    el('record').textContent='录制音频';
    run++;
    clearTimeout(timer);
    for (const voice of voices) { try { voice.stop(); } catch {} }
    voices = [];
    el('preview').textContent = '试听全谱';
  }
  function controls() {
    el('count').textContent = '已选 ' + selected.size + ' 个音符';
    for (const [key,limit] of [['down',48],['up',84]]) {
      el(key).disabled = !selected.size || [...selected].some(i => notes[i].pitch === limit);
    }
    el('undo').disabled = !history.length;
  }
  function draw() {
    el('title').textContent = title;
    const width = Math.max(440, notes.length * 54 + 76);
    let drawing = [0,1,2,3,4].map(i=>`<path d="M6 ${60+i*10} H${width-8}"/>`).join('');
    drawing += '<text x="8" y="91" font-size="47">𝄞</text>';
    rendered().forEach(({pitch,beats,bar},i)=>{
      const x = 66+i*54;
      if (i && notes[i-1].bar !== bar) drawing += `<path d="M${x-28} 60v40"/>`;
      if (pitch === null) {
        const rest = {4:'𝄻',2:'𝄼',1:'𝄽',0.5:'𝄾'}[beats];
        drawing += `<text x="${x}" y="86" font-size="24">${rest}</text>`;
        return;
      }
      const {step,flat,octave} = spell(pitch);
      const y = 110-5*((octave-4)*7+step);
      const label = letters[step]+(flat?'♭':'')+octave;
      drawing += `<g tabindex="0" role="button" data-note="${i}" aria-label="第${i+1}音 ${label}" aria-pressed="${selected.has(i)}"><title>${label}</title><rect x="${x-22}" y="8" width="44" height="152" rx="6"/>`;
      for(let line=110;line<=y;line+=10) drawing+=`<path d="M${x-11} ${line}h22"/>`;
      for(let line=50;line>=y;line-=10) drawing+=`<path d="M${x-11} ${line}h22"/>`;
      drawing+=`<text x="${x-20}" y="${y+4}" font-size="15">${flat?'♭':'♮'}</text><ellipse cx="${x}" cy="${y}" rx="6.5" ry="4.5" class="${beats>=2?'hollow':''}"/>`;
      if(beats<4) {
        const dir=y<80?1:-1, sx=x-dir*6;
        drawing+=`<path d="M${sx} ${y}v${dir*30}${beats===0.5?'q12 '+(-dir*6)+' 7 '+(-dir*16):''}"/>`;
      }
      drawing+='</g>';
    });
    paper.innerHTML=`<svg width="${width}" height="170" viewBox="0 0 ${width} 170" xmlns="http://www.w3.org/2000/svg">${drawing}</svg>`;
    controls();
  }
  function toggle(event) {
    const node = event.target.closest('[data-note]');
    if (!node) return;
    const i = Number(node.dataset.note);
    if (selected.has(i)) selected.delete(i); else selected.add(i);
    node.setAttribute('aria-pressed',String(selected.has(i)));
    controls();
  }
  paper.onclick=toggle;
  paper.onkeydown=e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();toggle(e);}};
  function shift(delta) {
    stop();
    history.push(notes.map(n=>n.pitch));
    selected.forEach(i=>notes[i].pitch+=delta);
    draw();
  }
  el('down').onclick=()=>shift(-1);
  el('up').onclick=()=>shift(1);
  el('undo').onclick=()=>{stop();const last=history.pop();notes.forEach((n,i)=>n.pitch=last[i]);draw();};
  el('preview').onclick=async()=>{
    const record=recordingRequested;recordingRequested=false;
    if(voices.length){stop();return;}
    stop();
    const token=run;
    try {
      synth ||= new AudioContext();
      await synth.resume();
      if(token!==run)return;
      audio.pause();
      if(record){
        capture ||= synth.createMediaStreamDestination();
        const session=new MediaRecorder(capture.stream);
        const chunks=[], name=title;
        session.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
        session.onstop=()=>{
          if(!chunks.length)return;
          const url=URL.createObjectURL(new Blob(chunks,{type:session.mimeType}));
          const link=document.createElement('a');link.href=url;
          link.download=name+'-试听.'+(session.mimeType.includes('mp4')?'m4a':session.mimeType.includes('ogg')?'ogg':'webm');
          link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
        };
        recorder=session;session.start();el('record').textContent='结束录制并保存';
      }
      let time=synth.currentTime+0.03;
      for(const {pitch,beats} of rendered()){
        const duration=beats*0.5;
        if(pitch!==null){
          const tone=synth.createOscillator(),gain=synth.createGain();
          tone.type='triangle';tone.frequency.value=440*2**((pitch-69)/12);
          gain.gain.setValueAtTime(0.0001,time);
          gain.gain.exponentialRampToValueAtTime(0.14,time+0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001,time+duration-0.01);
          tone.connect(gain).connect(synth.destination);
          if(record)gain.connect(capture);
          tone.onended=()=>{tone.disconnect();gain.disconnect();};
          tone.start(time);tone.stop(time+duration);voices.push(tone);
        }
        time+=duration;
      }
      el('preview').textContent='停止试听';
      timer=setTimeout(stop,(time-synth.currentTime)*1000);
    }catch{stop();el('message').textContent='无法启动试听，请检查音频设备。';}
  };
  el('import').onclick=()=>input.click();
  input.onchange=async()=>{
    const file=input.files[0];if(!file)return;
    try {
      if(file.size>2_000_000)throw Error();
      const xml=new DOMParser().parseFromString(await file.text(),'application/xml');
      const parts=xml.querySelectorAll('score-partwise > part');
      if(parts.length!==1 || xml.querySelector('parsererror,chord,backup,forward,tie,grace,dot,time-modification,transpose,unpitched'))throw Error();
      let divisions=1;
      const parsed=[];
      [...parts[0].children].forEach((measure,bar)=>{
        for(const item of measure.children){
          if(item.tagName==='attributes') divisions=Number(item.querySelector('divisions')?.textContent??divisions);
          if(item.tagName!=='note')continue;
          const beats=Number(item.querySelector('duration')?.textContent)/divisions;
          if(!Object.values(durations).includes(beats))throw Error();
          let pitch=null;
          if(!item.querySelector('rest')){
            const letter=item.querySelector('step')?.textContent;
            const step=letters.indexOf(letter), octave=item.querySelector('octave');
            if(!letter||step<0||!octave)throw Error();
            pitch=(Number(octave.textContent)+1)*12+natural[step]+Number(item.querySelector('alter')?.textContent??0);
            if(!Number.isInteger(pitch)||pitch<48||pitch>84)throw Error();
          }
          parsed.push({pitch,beats,bar});
        }
      });
      if(!parsed.length||parsed.length>512)throw Error();
      stop();source=xml;notes=parsed;title=file.name;selected.clear();history=[];draw();
      el('message').textContent='';
    }catch{el('message').textContent='支持单声部 MusicXML（C3–C6），可含全音符、二分、四分、八分音符和休止符。请先将复杂谱面导出为单旋律。';}
    input.value='';
  };
  el('export').onclick=()=>{
    const pitchXML=p=>{
      const {step,flat,octave}=spell(p);
      return '<step>'+letters[step]+'</step>'+(flat?'<alter>-1</alter>':'')+'<octave>'+octave+'</octave>';
    };
    const output=rendered();
    let result;
    if(source){
      const copy=source.cloneNode(true);
      copy.querySelectorAll('part > measure > note').forEach((item,i)=>{
        if(output[i].pitch===null || (output[i].pitch===notes[i].pitch && !history.some(snapshot=>snapshot[i]!==notes[i].pitch)))return;
        item.querySelector('pitch').innerHTML=pitchXML(output[i].pitch);
        item.querySelector('accidental')?.remove();
      });
      result=new XMLSerializer().serializeToString(copy);
    }else{
      const measures=[0,4].map((start,i)=>'<measure number="'+(i+1)+'">'+(i?'':'<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>')+output.slice(start,start+4).map(n=>'<note><pitch>'+pitchXML(n.pitch)+'</pitch><duration>1</duration><type>quarter</type></note>').join('')+'</measure>').join('');
      result='<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>旋律</part-name></score-part></part-list><part id="P1">'+measures+'</part></score-partwise>';
    }
    const url=URL.createObjectURL(new Blob([result],{type:'application/xml'}));
    const link=document.createElement('a');link.href=url;link.download=title.replace(/\.(musicxml|xml)$/i,'')+'-编辑.musicxml';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  audio.addEventListener('play',stop);
  draw();
  return ()=>{stop();audio.removeEventListener('play',stop);void synth?.close();};
}
