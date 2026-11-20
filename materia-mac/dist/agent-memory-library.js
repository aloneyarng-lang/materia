import {characterIdFor,profileFor,cleanReplyLanguage} from './agent-character-memory.js';

const locales={'zh-CN':'中文',en:'English',ja:'日本語'};
const titleFor=r=>(r.scene||r.work||'原作资料').split(' / ')[0];
const kindLabel=r=>r.source?.userEdited?'个人修订':r.kind==='dialogue'?'原作台词':r.kind==='canon_summary'?'资料摘要':r.kind==='authored_style_example'?'原创示例':'个人补充';
const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;if(cls)el.className=cls;return el;};
const button=(text,run,cls='text-button')=>{const el=node('button',text,cls);el.type='button';el.addEventListener('click',run);return el;};

export function createMemoryLibrary({host,native,getState,getCharacter,saveHistory,isBusy}){
  host.innerHTML=`<header class="memory-library-heading"><div><small>MEMORY LIBRARY</small><h2>记忆档案</h2><p class="memory-role"></p></div><span class="memory-local">本机保存</span></header>
    <div class="memory-library-tabs"><button type="button" data-memory-tab="canon" aria-pressed="true">原作记忆 <b></b></button><button type="button" data-memory-tab="relationship" aria-pressed="false">相处记忆 <b></b></button></div>
    <form id="agent-corpus-form" class="memory-library-search"><input id="agent-corpus-query" type="search" placeholder="搜索台词、场景或相处经历" maxlength="140" aria-label="搜索记忆"><button type="submit" class="outline-button">搜索</button><button type="button" data-memory-clear>全部</button></form>
    <div class="memory-library-filters"><select data-memory-kind aria-label="记忆类型"><option value="">全部类型</option><option value="dialogue">原作台词</option><option value="canon_summary">资料摘要</option><option value="authored_style_example">原创示例</option></select><select data-memory-locale aria-label="浏览语言"><option value="zh-CN">中文</option><option value="en">English</option><option value="ja">日本語</option></select><label><input type="checkbox" data-memory-trash> 已移除</label><button type="button" data-memory-add>＋ 添加记忆</button></div>
    <p id="agent-corpus-status" class="memory-library-status" role="status"></p><p id="agent-episode-status" hidden></p>
    <div class="memory-library-body"><ol id="agent-corpus-results" class="memory-library-list"></ol><section class="memory-library-detail" aria-label="记忆详情"></section></div>
    <footer class="memory-library-footer"><button type="button" data-memory-prev>上一页</button><span data-memory-page></span><button type="button" data-memory-next>下一页</button></footer>`;
  const $=s=>host.querySelector(s);
  let tab='canon',page=0,total=0,allCount=0,rows=[],selected=null,revision=0,request=0,role=null,saving=false;
  const status=text=>{$('#agent-corpus-status').textContent=text;};
  const id=()=>characterIdFor(getCharacter());
  const query=()=>$('#agent-corpus-query').value.trim();
  function relationshipRows(){
    const state=getState(),profile=profileFor(state,id()),edits=profile?.memoryEdits||{};
    const chats=new Map(state.conversations.map(c=>[c.id,c]));
    const result=[];
    for(const episode of profile?.episodes||[]){
      const chat=chats.get(episode.chatId);if(!chat)continue;
      for(const [userIndex,assistantIndex] of episode.turns.slice().reverse()){
        const key=episode.chatId+':'+userIndex,edit=edits[key];
        result.push({id:key,text:edit?.text??chat.entries[userIndex].content,reply:edit?.reply??chat.entries[assistantIndex].content,
          originalText:chat.entries[userIndex].content,originalReply:chat.entries[assistantIndex].content,
          deleted:edit?.deleted===true,edited:!!edit,title:chat.title,date:chat.updatedAt});
      }
    }
    for(const note of profile?.notes||[])result.unshift({...note,manual:true,title:'手动补充',date:note.updatedAt});
    return result;
  }
  async function refresh({reset=false}={}){
    const current=id();
    if(current!==role){role=current;page=0;selected=null;$('#agent-corpus-query').value='';$('[data-memory-trash]').checked=false;$('[data-memory-locale]').value=cleanReplyLanguage(profileFor(getState(),current)?.replyLanguage);}
    if(reset){page=0;selected=null;}
    const turn=++request,trash=$('[data-memory-trash]').checked;
    $('.memory-role').textContent=getCharacter()?.name||'当前角色';
    $('[data-memory-tab=relationship] b').textContent=String(relationshipRows().filter(r=>!r.deleted).length);
    for(const b of host.querySelectorAll('[data-memory-tab]'))b.setAttribute('aria-pressed',String(b.dataset.memoryTab===tab));
    $('[data-memory-kind]').hidden=tab!=='canon';$('[data-memory-locale]').hidden=tab!=='canon';$('[data-memory-add]').hidden=tab!=='relationship';
    status('正在读取本机记忆…');
    try{
      if(tab==='canon'){
        if(!native?.agentMemoryCorpus)throw Error('请重启更新后的桌面版以管理原作记忆。');
        const data=await native.agentMemoryCorpus({characterId:current,query:query(),kind:$('[data-memory-kind]').value,trash,offset:page*20,limit:20});
        if(turn!==request)return;
        rows=data.records;total=data.total;allCount=data.count;revision=data.revision;
        $('[data-memory-tab=canon] b').textContent=String(allCount);
      }else{
        const all=relationshipRows(),q=query().toLowerCase();allCount=all.filter(r=>!r.deleted).length;
        const filtered=all.filter(r=>r.deleted===trash&&(!q||(r.text+' '+r.reply+' '+r.title).toLowerCase().includes(q)));
        total=filtered.length;rows=filtered.slice(page*20,page*20+20);
        $('[data-memory-tab=relationship] b').textContent=String(allCount);
      }
      if(turn!==request)return;
      if(page>0&&!rows.length){page--;return refresh();}
      status(`${allCount} 条${tab==='canon'?'角色参考记录':'相处记忆'} · ${trash?'已移除':'当前筛选'} ${total} 条`);
      $('#agent-episode-status').textContent=`已整理 ${relationshipRows().length} 次交流`;
      render();
    }catch(e){if(turn===request){rows=[];total=0;render();status(e.message);}}
  }
  function render(){
    const list=$('#agent-corpus-results');list.replaceChildren();
    selected=rows.find(r=>r.id===selected?.id)||rows[0]||null;
    for(const row of rows){
      const li=node('li');const open=button('',()=>{selected=row;render();},'memory-card');open.dataset.memoryId=row.id;open.setAttribute('aria-pressed',String(selected===row));
      const label=tab==='canon'?kindLabel(row):row.manual?'手动记忆':row.edited?'已修订的交流':'相处记录';
      open.append(node('small',label,'memory-badge'),node('strong',tab==='canon'?titleFor(row):row.title));
      const text=tab==='canon'?row.lines.map(l=>l.texts[$('[data-memory-locale]').value]).join(' '):row.text;
      open.append(node('p',text.slice(0,150)+(text.length>150?'…':'')));
      if(tab==='canon'&&row.source?.method==='game_text_metadata')open.append(node('span','游戏原文','memory-card-foot'));
      if(tab==='canon'&&row.source?.method==='secondary_quote_transcription')open.append(node('span','原作台词 · 二手转录','memory-card-foot'));
      li.append(open);list.append(li);
    }
    if(!rows.length)list.append(node('li',query()?'没有匹配的记忆，试试清除筛选。':'这里还没有记忆。可在相处记忆中添加，或继续和角色聊天。','memory-empty'));
    $('[data-memory-page]').textContent=`${page+1} / ${Math.max(1,Math.ceil(total/20))}`;
    $('[data-memory-prev]').disabled=page===0;$('[data-memory-next]').disabled=(page+1)*20>=total;
    detail();
  }
  function detail(){
    const area=$('.memory-library-detail');area.replaceChildren();if(!selected){area.append(node('p','选择左侧记忆查看完整内容。','memory-empty'));return;}
    const row=selected,form=node('form');form.className='memory-editor';form.addEventListener('input',()=>status('有未保存的修改，点击保存后生效。'));
    form.append(node('small',tab==='canon'?kindLabel(row):'相处记忆','memory-badge'),node('h3',tab==='canon'?titleFor(row):row.title));
    const fields=[];
    function field(label,value,limit=12000){const wrap=node('label',label),input=node('textarea');input.value=value;input.maxLength=limit;input.rows=4;input.required=true;wrap.append(input);form.append(wrap);fields.push(input);return input;}
    if(tab==='canon'){
      const source=row.source||{};
      form.append(node('p',source.userEdited?'当前显示你的修订。原始资料保留，可恢复原文。':'修改会另存为个人修订，原始台词和来源保留。','memory-detail-note'));
      if(source.method==='secondary_quote_transcription')form.append(node('p','二手台词转录，尚未逐页核对漫画；中英为补译。','memory-detail-note'));
      if(source.locationNote)form.append(node('p',source.locationNote,'memory-detail-note'));
      if(/^https?:\/\//i.test(source.url||'')){const link=node('a','查看来源 ↗');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';form.append(link);}
      row.lines.forEach((line,i)=>{form.append(node('h4',(line.speaker||'台词')+(row.lines.length>1?' · '+(i+1):'')));for(const [locale,label] of Object.entries(locales)){const input=field(label,line.texts[locale]);input.dataset.locale=locale;input.dataset.line=String(i);}});
      if(row.originalLines){const original=node('details'),summary=node('summary','查看未修改的原始文本');original.append(summary);for(const line of row.originalLines)original.append(node('p',Object.entries(line.texts).map(([l,t])=>locales[l]+'：'+t).join('\n')));form.append(original);}
    }else{
      form.append(node('p','修订用于今后的回忆，原始聊天记录保留。移除后不再召回，仍可在“已移除”中恢复。','memory-detail-note'));
      field('记住的事情',row.text,4000);const reply=field('当时的回复 / 补充说明',row.reply||'',4000);reply.required=false;
      if(row.edited){const old=node('details');old.append(node('summary','查看原始交流'),node('p',row.originalText),node('p',row.originalReply));form.append(old);}
    }
    const actions=node('div',null,'memory-editor-actions');
    const save=node('button','保存修订','primary');save.type='submit';save.disabled=saving||isBusy()||!!row.personalDeleted||!!row.deleted;actions.append(save);
    const remove=button(row.personalDeleted||row.deleted?'恢复记忆':'移除记忆',()=>act(row.personalDeleted||row.deleted?'restore':'delete',row), 'text-button');remove.disabled=saving||isBusy();actions.append(remove);
    if((tab==='canon'&&row.source?.userEdited)||(tab==='relationship'&&row.edited&&!row.deleted))actions.append(button('恢复原文',()=>act('restore',row)));
    form.append(actions);form.addEventListener('submit',e=>{
      e.preventDefault();let value;
      if(tab==='canon')value=row.lines.map((line,i)=>({...line,texts:Object.fromEntries(fields.filter(f=>f.dataset.line===String(i)).map(f=>[f.dataset.locale,f.value]))}));
      else value={text:fields[0].value.trim(),reply:fields[1].value.trim()};
      void act('edit',row,value);
    });area.append(form);
  }
  async function act(action,row,value){
    if(saving||isBusy())return;
    const characterId=id(),kind=tab;saving=true;detail();
    try{
      if(kind==='canon')await native.agentMemoryCorpusUpdate({characterId,recordId:row.id,revision,action,lines:value});
      else{
        const state=getState(),before=structuredClone(state.characterMemory),previous=profileFor(state,characterId)||{};
        const profile={...previous,memoryEdits:{...previous.memoryEdits},notes:[...(previous.notes||[])]};
        if(row.manual){const index=profile.notes.findIndex(n=>n.id===row.id);if(index<0)throw Error('记忆已更新，请刷新。');profile.notes[index]={...profile.notes[index],...(action==='edit'?value:{}),deleted:action==='delete',updatedAt:Date.now()};}
        else if(action==='restore')delete profile.memoryEdits[row.id];
        else profile.memoryEdits[row.id]={...(profile.memoryEdits[row.id]||{}),...(action==='edit'?value:{}),deleted:action==='delete',updatedAt:Date.now()};
        state.characterMemory={version:1,roles:{...state.characterMemory?.roles,[characterId]:profile}};
        try{await saveHistory();}catch(e){state.characterMemory=before;throw e;}
      }
      if(id()===characterId){await refresh();status(action==='delete'?'已移除，不再用于回忆；可在“已移除”中恢复。':action==='restore'?'已恢复。':'已保存，之后回复会使用修订内容。');}
    }catch(e){status(e.message);}finally{saving=false;detail();}
  }
  $('[data-memory-add]').addEventListener('click',()=>{
    if(isBusy()||saving||!id())return;
    const area=$('.memory-library-detail');area.replaceChildren();const form=node('form');form.className='memory-editor';form.append(node('h3','添加相处记忆'),node('p','记录你希望角色记住的事情，作为手动补充保存。','memory-detail-note'));
    const input=node('textarea');input.required=true;input.maxLength=4000;input.rows=7;input.placeholder='例如：我喜欢安静的咖啡店，不喜欢太甜的饮料。';form.append(input);const save=node('button','保存记忆','primary');save.type='submit';form.append(save);
    form.addEventListener('submit',async e=>{e.preventDefault();if(saving||isBusy())return;const state=getState(),characterId=id(),old=structuredClone(state.characterMemory),profile=profileFor(state,characterId)||{};let added=false;saving=true;save.disabled=true;
      try{state.characterMemory={version:1,roles:{...state.characterMemory?.roles,[characterId]:{...profile,notes:[...(profile.notes||[]),{id:'note-'+crypto.randomUUID(),text:input.value.trim(),reply:'',updatedAt:Date.now(),deleted:false}]}}};await saveHistory();added=true;await refresh({reset:true});status('已添加相处记忆。');}
      catch(err){state.characterMemory=old;status(err.message);save.disabled=false;}finally{saving=false;if(added)detail();}
    });area.append(form);input.focus();
  });
  for(const el of host.querySelectorAll('[data-memory-tab]'))el.addEventListener('click',()=>{tab=el.dataset.memoryTab;void refresh({reset:true});});
  $('#agent-corpus-form').addEventListener('submit',e=>{e.preventDefault();void refresh({reset:true});});
  $('[data-memory-clear]').addEventListener('click',()=>{$('#agent-corpus-query').value='';$('[data-memory-kind]').value='';void refresh({reset:true});});
  for(const name of ['kind','locale','trash'])$('[data-memory-'+name+']').addEventListener('change',()=>void refresh({reset:true}));
  $('[data-memory-prev]').addEventListener('click',()=>{if(page){page--;void refresh();}});
  $('[data-memory-next]').addEventListener('click',()=>{if((page+1)*20<total){page++;void refresh();}});
  return {refresh,search:()=>refresh({reset:true})};
}
