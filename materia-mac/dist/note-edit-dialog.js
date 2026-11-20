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
        <label>修改前<textarea name="original" readonly></textarea></label>
        <label>修改建议<textarea name="proposal"></textarea></label>
      </div>
      <p class="vault-status" role="status"></p>
      <div class="modal-footer">
        <button type="button" class="text-button" data-ai-close>取消</button>
        <button class="outline-button" type="submit">生成修改建议</button>
        <button type="button" class="primary" data-ai-apply hidden>应用并保存</button>
      </div>
    </form>`;
  host.append(dialog);
  const form=dialog.querySelector('form');
  const {instruction,original,proposal}=form.elements;
  const scope=dialog.querySelector('[data-ai-scope]');
  const catalogNotice=dialog.querySelector('[data-ai-catalog]');
  instruction.addEventListener('input',()=>{catalogNotice.hidden=!wantsNoteCatalog(instruction.value);});
  const comparison=dialog.querySelector('.vault-ai-comparison');
  const status=dialog.querySelector('[role=status]');
  const generate=dialog.querySelector('[type=submit]');
  const confirm=dialog.querySelector('[data-ai-apply]');
  const cancel=dialog.querySelector('[data-ai-close]');
  let session,saving=false;
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
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!session||session.request||saving)return;
    const current=session,request=new AbortController();
    current.request=request;
    const {body,start,end,selected}=current.snapshot;
    comparison.hidden=confirm.hidden=true;
    generate.disabled=instruction.readOnly=true;
    report('正在生成修改建议…');
    try{
      const result=await editNote({body:body.slice(start,end),instruction:instruction.value,selected},{signal:request.signal});
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
  return {open(snapshot){
    session={snapshot,request:null};
    form.reset();
    catalogNotice.hidden=true;
    original.value=snapshot.body.slice(snapshot.start,snapshot.end);
    scope.textContent=t(snapshot.selected?'将选中的文字和修改指令发送给当前 AI 服务。':'将当前笔记正文和修改指令发送给当前 AI 服务。');
    comparison.hidden=confirm.hidden=true;
    generate.disabled=instruction.readOnly=false;
    report('');
    dialog.showModal();
    instruction.focus();
  }};
}
