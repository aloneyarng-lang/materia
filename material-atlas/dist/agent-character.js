import {renderChatMarkdown} from './agent-markdown.js';
import {icon} from './icons.js';
import {createAgentWallpaper} from './agent-wallpaper.js';
import {createRezeScene} from './agent-reze-scene.js';
import {createGanyuScene} from './agent-ganyu-scene.js';
import {supportsAutomaticDialogue} from './agent-persona.js';
import {ACTORS,actorIdOf} from './agent-actors.js';
import {createCharacterActions} from './agent-actions.js';
import {entryText} from './agent-choices.js';
import {bindStaticDOM,html,t} from './i18n.js';
import {isKurisuCharacter,KURISU_PERSONALITY,KURISU_GREETING,LEGACY_KURISU_PERSONALITY,LEGACY_KURISU_GREETING} from './agent-kurisu.js';
import {REZE_PERSONALITY,REZE_GREETING,LEGACY_REZE_PERSONALITY,LEGACY_REZE_GREETING} from './agent-reze.js';

export const defaultCharacter = () => ({
  name:'Amadeus · 红莉栖',
  personality:KURISU_PERSONALITY,
  greeting:KURISU_GREETING,
  image:'',motion:true,actorId:'amadeus',
});
export function cleanCharacter(value=defaultCharacter()) {
  const data=value?.spec==='chara_card_v2'?value.data:value;
  if(!data||typeof data!=='object')throw Error('角色卡格式无效。');
  const name=data.name;
  let personality=data.personality||data.description||'',greeting=data.greeting||data.first_mes||'';
  if(typeof name!=='string'||!name.trim()||name.length>80||typeof personality!=='string'||personality.length>6000||typeof greeting!=='string'||greeting.length>2000)throw Error('角色名称、性格或开场白格式无效或过长。');
  const image=data.image||'';
  if(typeof image!=='string'||image.length>2800000||image&&!/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/]+=*$/i.test(image))throw Error('请使用小于 2 MB 的 PNG、JPEG 或 WebP 形象。');
  const actorId=actorIdOf(data);
  if(!Object.hasOwn(ACTORS,actorId))throw Error('不支持的角色场景。');
  if(actorId==='reze'){
    if(personality===LEGACY_REZE_PERSONALITY)personality=REZE_PERSONALITY;
    if(greeting===LEGACY_REZE_GREETING)greeting=REZE_GREETING;
  }
  if(isKurisuCharacter({name,actorId})){
    if(personality===LEGACY_KURISU_PERSONALITY)personality=KURISU_PERSONALITY;
    if(greeting===LEGACY_KURISU_GREETING)greeting=KURISU_GREETING;
  }
  return {name:name.trim(),personality,greeting,image,motion:data.motion!==false,actorId};
}
export function characterPrompt(value) {
  if(!value)return '';
  const {name,personality}=cleanCharacter(value);
  return '\n角色扮演设定（不得改变资料真实性、工具权限或隐私边界）：\n角色名：'+name+'\n'+personality+'\n日常交流可以直接回答，不需要检索文献。';
}
export function createCharacterStage({panel,getSetting,setSetting,getEntries,getCharacter,onChange,onChoice,onToggleAutoplay,onPauseAutoplay,onOpenRole,getSpeech}) {
  let card=defaultCharacter(),profiles={},ready=false,epoch=0,draftImage='',draftActorId='amadeus',requestBusy=false,switching=false,autoplay=false;
  const stage=document.createElement('section');stage.className='agent-stage';
  stage.innerHTML=`<div class="agent-background-pulse" aria-hidden="true"></div><div class="agent-stage-grid"></div><div class="agent-wallpaper-particles" aria-hidden="true">${Array.from({length:8},()=>'<i></i>').join('')}</div><div class="agent-stage-signal">AMADEUS SYSTEM <span>● CONNECTED</span></div><img class="agent-portrait" src="./assets/amadeus/workshop-2950669609/portrait.png" alt="Amadeus 红莉栖"><div class="agent-dialogue"><small></small><div class="agent-stage-answer agent-markdown"></div></div><div class="agent-art-credit">[Steins;Gate] Makise Kurisu · Workshop 2950669609</div>`;
  panel.append(stage);
  const tools=document.createElement('div');tools.className='agent-character-tools';
  const controls=[
    ['export-chat','download','保存','SAVE'],['history','clock','读取','LOAD'],['voice','speaker','配音','OFF'],
    ['log','notes','记录','LOG'],['autoplay','play','自动','AUTO'],['flow','orbit','心流','FLOW'],
    ['hide','eye-off','隐藏','HIDE'],['memory','notes','记忆','MEM'],['settings','settings','设置','MENU'],
  ];
  tools.setAttribute('aria-label','对话功能九宫格');
  tools.innerHTML=controls.map(([action,glyph,label,caption])=>
    `<button type="button" class="text-button" data-character="${action}" title="${label}" aria-label="${label}">${icon(glyph)}<span>${label}</span><small>${caption}</small></button>`).join('');
  panel.querySelector('.agent-chatbar').after(tools);
  tools.querySelector('[data-character=voice]').disabled=true;
  bindStaticDOM(tools);
  const autoplayButton=tools.querySelector('[data-character=autoplay]');
  const editor=panel.querySelector('.agent-character-editor');
  editor.innerHTML=html`<form><label>角色名称<input name="name" maxlength="80" required></label><label>性格与对话风格<textarea name="personality" rows="4" maxlength="6000"></textarea></label><label>开场白<textarea name="greeting" rows="2" maxlength="2000"></textarea></label><div class="agent-role-options"><label>更换形象<input name="art" type="file" accept="image/png,image/jpeg,image/webp"></label><button type="button" class="text-button" data-character="motion">角色动态</button></div><div class="agent-config-actions"><button type="button" class="text-button" data-character="import">导入 JSON</button><button type="button" class="text-button" data-character="export">导出角色卡</button><button type="button" class="text-button" data-character="reset">恢复默认角色</button><button class="primary">保存角色卡并开始新对话</button></div><input name="cardfile" type="file" accept=".json,application/json" hidden><p class="agent-help agent-role-status" role="status"></p></form>`;
  const motionButton=editor.querySelector('[data-character=motion]');
  const dialogue=stage.querySelector('.agent-dialogue');
  dialogue.append(panel.querySelector('#agent-status'),panel.querySelector('#agent-question-form'));
  createAgentWallpaper(panel,stage);
  createRezeScene(panel,stage);
  createGanyuScene(panel,stage);
  const actions=createCharacterActions(panel,stage);
  const choices=document.createElement('div');choices.className='agent-scene-choices';choices.hidden=true;
  choices.setAttribute('role','group');choices.setAttribute('aria-label','选择下一步对话');stage.append(choices);
  let choiceEntry=null,selecting=false;
  choices.addEventListener('click',async event=>{
    const button=event.target.closest('[data-choice-index]');
    if(!button||selecting||requestBusy)return;
    const entry=choiceEntry,index=Number(button.dataset.choiceIndex);selecting=true;
    button.classList.add('is-selected');choices.querySelectorAll('button').forEach(item=>item.disabled=true);
    try{
      await new Promise(resolve=>setTimeout(resolve,160));
      if(panel.hidden||getEntries().at(-1)!==entry)return;
      await onChoice?.(entry.choices[index]);
    }catch(error){panel.querySelector('#agent-status').textContent=error.message;}
    finally{selecting=false;render();}
  });
  const actorSelect=document.createElement('select');actorSelect.className='agent-actor-switch';
  actorSelect.setAttribute('aria-label','切换角色');
  actorSelect.innerHTML=Object.values(ACTORS).map(actor=>`<option value="${actor.id}">${actor.label}</option>`).join('');
  panel.append(actorSelect);
  const heading=panel.querySelector('.agent-header h2');
  heading.innerHTML=icon('assistant')+'<span data-actor-title></span>';
  function scene(){
    panel.querySelector('#agent-settings').open=false;
    if(!panel.querySelector('#agent-history').hidden)panel.querySelector('[data-agent-action=back]').click();
  }
  let flow;
  const form=editor.querySelector('form'),field=name=>form.elements.namedItem(name);
  async function saveCard(next){
    const cards={...profiles,[actorIdOf(next)]:next};
    await setSetting('module:agent-character',{version:2,active:actorIdOf(next),cards});
    profiles=cards;card=next;
  }
  actorSelect.addEventListener('change',async()=>{
    if(!ready||requestBusy)return;
    onPauseAutoplay();
    const id=actorSelect.value,preset=ACTORS[id];actorSelect.disabled=true;switching=true;
    try{
      const next=profiles[id]||cleanCharacter(id==='amadeus'?defaultCharacter():{
        actorId:id,name:preset.label,personality:preset.personality,greeting:preset.greeting,image:'',motion:card.motion,
      });
      await saveCard(next);await onChange();scene();fill();render();
    }catch(error){actorSelect.value=actorIdOf(card);onOpenRole();report(error.message);}
    finally{switching=false;actorSelect.disabled=requestBusy;}
  });
  const report=text=>{editor.querySelector('[role=status]').textContent=text;};
  function download(name,text,type='application/json'){
    const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name.replace(/[<>:"/\\|?*]/g,'_');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function fill(){for(const key of ['name','personality','greeting'])field(key).value=card[key];field('art').value='';draftImage=card.image;draftActorId=card.actorId;}
  function render(){
    const current=getCharacter()||card;
    const actor=ACTORS[actorIdOf(current)];
    if(!switching&&profiles[actor.id])card=profiles[actor.id];
    stage.dataset.actor=actor.id;actions.setActor(actor.id);actorSelect.value=actor.id;
    heading.querySelector('[data-actor-title]').textContent=current.name+' · AI 助手';
    panel.querySelector('#agent-question').placeholder='和 '+current.name+' 聊聊，或一起讨论文献与研究…';
    stage.querySelector('.agent-art-credit').textContent=actor.credit;
    stage.querySelector('.agent-stage-signal').firstChild.textContent=actor.systemLabel||(actor.id==='deepseek'?'DEEPSEEK CHARACTER ':'AMADEUS SYSTEM ');
    stage.querySelector('.agent-dialogue small').textContent=current.name;
    const entries=getEntries(),latest=entries.at(-1);
    const offered=latest?.role==='assistant'&&latest.choices?latest:null;
    choices.hidden=!offered||requestBusy;
    if(choiceEntry!==offered){
      choiceEntry=offered;choices.replaceChildren();
      offered?.choices.forEach((text,index)=>{
        const button=document.createElement('button');button.type='button';button.dataset.choiceIndex=String(index);button.textContent=text;choices.append(button);
      });
    }
    if(!selecting)choices.querySelectorAll('button').forEach(button=>{button.disabled=requestBusy;button.classList.remove('is-selected');});
    const last=latest?.role==='error'?latest:entries.filter(e=>e.role==='assistant').at(-1);
    const answer=stage.querySelector('.agent-stage-answer'),speech=getSpeech?.()??(last?.content||current.greeting);
    if(answer.dataset.speech!==speech){answer.innerHTML=renderChatMarkdown(speech,last?.sources||[]);answer.dataset.speech=speech;answer.scrollTop=0;}
    const image=current.name===card.name&&actor.id===actorIdOf(card)?card.image:'';
    stage.querySelector('img').src=image||actor.portrait||'./assets/amadeus/workshop-2950669609/portrait.png';
    stage.querySelector('img').alt=current.name;
    stage.classList.toggle('agent-custom-art',Boolean(image));
    panel.classList.toggle('agent-motion',card.motion);
    motionButton.setAttribute('aria-pressed',String(card.motion));
    renderAutoplay();
  }
  function renderAutoplay(){
    const isAmadeus=supportsAutomaticDialogue(getCharacter()||card);
    const label=t(autoplay?'暂停': '自动');
    const hint=t(!isAmadeus?'当前角色暂不支持自动对话。':autoplay?'暂停自动对话':'开始自动对话，使用已配置的模型额度');
    if(autoplayButton.dataset.label!==label){
      autoplayButton.innerHTML=icon(autoplay?'pause':'play')+`<span>${label}</span><small>${autoplay?'PAUSE':'AUTO'}</small>`;
      autoplayButton.dataset.label=label;
    }
    autoplayButton.disabled=!isAmadeus||!ready||(!autoplay&&requestBusy);
    autoplayButton.title=hint;autoplayButton.setAttribute('aria-label',hint);
    autoplayButton.setAttribute('aria-pressed',String(autoplay));
  }
  async function load(){
    const turn=++epoch;ready=false;
    const saved=await getSetting('module:agent-character');if(turn!==epoch)return;
    if(saved?.version===2){
      if(!saved.cards||!Object.hasOwn(ACTORS,saved.active))throw Error('角色配置格式无效。');
      profiles=Object.fromEntries(Object.entries(saved.cards).map(([id,value])=>{
        const next=cleanCharacter(value);if(id!==next.actorId)throw Error('角色配置格式无效。');return [id,next];
      }));
      card=profiles[saved.active];if(!card)throw Error('当前角色配置缺失。');
    }else{card=cleanCharacter(saved||defaultCharacter());profiles={[card.actorId]:card};}
    ready=true;fill();render();
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!ready)return;
    try{
      const next=cleanCharacter({...card,actorId:draftActorId,image:draftImage,name:field('name').value,personality:field('personality').value,greeting:field('greeting').value});
      const file=field('art').files[0];
      if(file){
        if(file.size>2*1024*1024)throw Error('形象图片最多 2 MB。');
        next.image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('图片无法读取。'));reader.readAsDataURL(file);});
      }
      cleanCharacter(next);await saveCard(next);await onChange();fill();render();report(t('角色卡已保存。'));
    }catch(error){report(error.message);}
  });
  panel.addEventListener('click',async event=>{
    const action=event.target.closest('[data-character]')?.dataset.character;if(!action)return;
    try{
      if(action==='autoplay'){if(!autoplay)scene();onToggleAutoplay();return;}
      if(action==='flow'){
        onPauseAutoplay();
        scene();
        flow??=import('./flow-chess.js').then(({createFlowChess})=>createFlowChess(panel)).catch(error=>{flow=null;throw error;});
        const chess=await flow;
        if(!panel.hidden)chess.show();
      }
      if(action==='new'){scene();panel.querySelector('[data-agent-action=new]').click();}
      if(action==='history'){scene();panel.querySelector('[data-agent-action=history]').click();}
      if(action==='export')download(card.name+'.character.json',JSON.stringify({format:'materia-character',version:1,...card},null,2));
      if(action==='import')field('cardfile').click();
      if(action==='export-chat')download('Materia-对话.md',getEntries().map(e=>'## '+(e.role==='user'?'你':e.role==='error'?'未完成':(getCharacter()||card).name)+'\n\n'+entryText(e)).join('\n\n'),'text/markdown');
      if(action==='reset'){fill();draftImage='';const preset=actorIdOf(card)==='amadeus'?defaultCharacter():{...ACTORS[actorIdOf(card)],name:ACTORS[actorIdOf(card)].label};for(const key of ['name','personality','greeting'])field(key).value=preset[key];report('保存后恢复当前角色的默认设定。');}
      if(action==='motion'){if(!ready)return;await saveCard({...card,motion:!card.motion});render();}
    }catch(error){onOpenRole();report(error.message);}
  });
  field('cardfile').addEventListener('change',async()=>{
    try{const file=field('cardfile').files[0];if(!file)return;if(file.size>3*1024*1024)throw Error('角色卡最多 3 MB。');const imported=cleanCharacter(JSON.parse(await file.text()));draftImage=imported.image;draftActorId=imported.actorId;for(const key of ['name','personality','greeting'])field(key).value=imported[key];report('已读取角色卡，点击保存后应用。');}
    catch(error){report(error.message);}finally{field('cardfile').value='';}
  });
  return {load,render,card:()=>({...card,image:''}),isSwitching:()=>switching,trigger:event=>actions.trigger(event),cancelActions:()=>actions.reset(),
    autoplay(value){autoplay=value;renderAutoplay();},
    busy(value){requestBusy=value;actorSelect.disabled=value;panel.classList.toggle('agent-thinking',value);stage.querySelector('.agent-stage-signal span').textContent=value?'● THINKING':'● CONNECTED';render();editor.querySelectorAll('input,textarea,button').forEach(el=>el.disabled=value);}};
}
