import {html,t} from './i18n.js';
import {wantsNoteCatalog} from './note-edit.js';

export function createNoteEditDialog(host,editNote,apply){
  const dialog=document.createElement('dialog');
  dialog.className='modal vault-ai-dialog';
  dialog.setAttribute('aria-labelledby','vault-ai-heading');
  dialog.innerHTML=html`
    <form>
      <header><h2 id="vault-ai-heading">AI 编辑笔记</h2><p data-ai-scope></p><p data-ai-catalog hidden>加入文献目录时，当前 AI 服务还会收到文献总数和前 20 篇的标题、年份及 DOI。</p></header>
      <label>修改指令<textarea name="instruction" rows="3" maxlength="4000" placeholder="例如：把实验步骤整理成编号列表" required></textarea></label>
      <div class="vault-ai-comparison" hidden>
        <label class="vault-ai-original">修改前<textarea name="original" readonly></textarea></label>
        <label>修改建议<textarea name="proposal"></textarea></label>
      </div>
      <p class="vault-status" role="status"></p>
      <div class="modal-footer">
        <button type="button" class="text-button" data-ai-close>取消</button>
        <button class="outline-button" type="submit">生成修改建议 <kbd class="vault-ai-key">Enter</kbd></button>
        <button type="button" class="primary" data-ai-apply hidden>应用并保存 <kbd class="vault-ai-key">Ctrl / ⌘ + Enter</kbd></button>
      </div>
    </form>`;
  host.append(dialog);
  const form=dialog.querySelector('form');
  const {instruction,original,proposal}=form.elements;
  const scope=dialog.querySelector('[data-ai-scope]');
  const catalogNotice=dialog.querySelector('[data-ai-catalog]');
  const comparison=dialog.querySelector('.vault-ai-comparison');
  const status=dialog.querySelector('[role=status]');
  const generate=dialog.querySelector('[type=submit]');
  const confirm=dialog.querySelector('[data-ai-apply]');
  const cancel=dialog.querySelector('[data-ai-close]');
  let session,saving=false;
  function updateCatalogNotice(){catalogNotice.hidden=!wantsNoteCatalog(instruction.value);}
  instruction.addEventListener('input',updateCatalogNotice);
  function report(message,error=false){
    status.textContent=t(message);
    status.classList.toggle('is-error',error);
  }
  function close(){
    session?.request?.abort();
    session=null;
    dialog.close();
  }
  cancel.addEventListener('click',close);
  dialog.addEventListener('cancel',event=>{
    event.preventDefault();
    if(!saving)close();
  });
  dialog.addEventListener('close',()=>{if(!dialog.open){session?.request?.abort();session=null;}});
  form.addEventListener('keydown',event=>{
    if(!session?.quick||event.key!=='Enter'||event.isComposing||event.keyCode===229||event.altKey||event.shiftKey)return;
    if(event.ctrlKey||event.metaKey){
      if(confirm.hidden)return;
      event.preventDefault();
      if(!event.repeat)confirm.click();
    }else if(event.target===instruction){
      event.preventDefault();
      if(!event.repeat)form.requestSubmit();
    }
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!session||session.request||saving)return;
    const current=session,request=new AbortController();
    current.request=request;
    const {body,start,end,selected}=current.snapshot;
    const payload={body:body.slice(start,end),instruction:instruction.value,selected};
    if(current.command){
      payload.body='';
      payload.context=current.command.context;
    }
    comparison.hidden=confirm.hidden=true;
    generate.disabled=instruction.readOnly=true;
    report('正在生成修改建议…');
    try{
      const result=await editNote(payload,{signal:request.signal});
      if(session!==current||request.signal.aborted)return;
      proposal.value=result;
      comparison.hidden=confirm.hidden=false;
      report('核对修改建议后，可应用到原笔记。');
      proposal.focus();
    }catch(error){
      if(session===current&&!request.signal.aborted)report(error.message,true);
    }finally{
      if(session===current){current.request=null;generate.disabled=instruction.readOnly=false;}
    }
  });
  confirm.addEventListener('click',async()=>{
    if(!session||confirm.hidden||saving)return;
    saving=true;
    confirm.disabled=generate.disabled=cancel.disabled=true;
    instruction.readOnly=proposal.readOnly=true;
    try{await apply(session.snapshot,proposal.value);close();}
    catch(error){report(error.message,true);}
    finally{
      saving=false;
      confirm.disabled=generate.disabled=cancel.disabled=false;
      instruction.readOnly=proposal.readOnly=false;
    }
  });
  return {open(snapshot,{quick=false,command=null}={}){
    if(dialog.open)return;
    session={snapshot,quick,command,request:null};
    dialog.classList.toggle('vault-ai-quick',quick);
    form.reset();
    instruction.value=command?.instruction??'';
    updateCatalogNotice();
    original.value=snapshot.body.slice(snapshot.start,snapshot.end);
    scope.textContent=t(command?'将指令和它前面的部分正文发送给当前 AI 服务。':snapshot.selected?'仅将选中的文字和修改指令发送给当前 AI 服务。':'将当前笔记正文和修改指令发送给当前 AI 服务。');
    comparison.hidden=confirm.hidden=true;
    generate.disabled=instruction.readOnly=false;
    report('');
    dialog.showModal();
    instruction.focus();
    if(command)form.requestSubmit();
  }};
}
