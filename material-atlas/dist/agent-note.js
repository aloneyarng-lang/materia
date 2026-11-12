import {html,t} from './i18n.js';
import {notePath,noteBody} from './notes-vault-model.js';

export function createAgentNoteEditor(panel,announce){
  const dialog=document.createElement('dialog');
  dialog.id='agent-note-editor';
  dialog.setAttribute('aria-labelledby','agent-note-heading');
  dialog.innerHTML=html`
    <form>
      <h2 id="agent-note-heading">AI 笔记</h2>
      
      <label>标题<input name="title" maxlength="110" required></label>
      <label>Markdown 正文<textarea name="body" rows="12" required></textarea></label>
      <p class="agent-note-status" role="status"></p>
      <div class="modal-footer">
        <button type="button" class="text-button" data-discard-note>放弃草稿</button>
        <button type="submit" class="primary">保存笔记</button>
      </div>
    </form>`;
  panel.append(dialog);
  const form=dialog.querySelector('form');
  const {title,body}=form.elements;
  const feedback=dialog.querySelector('.agent-note-status');
  let hasDraft=false,saving=false;
  function hide(){if(dialog.open)dialog.close();}
  function discard(){hasDraft=false;form.reset();feedback.textContent='';hide();}
  dialog.querySelector('[data-discard-note]').addEventListener('click',discard);
  dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!hasDraft||saving)return;
    saving=true;
    for(const control of form.elements)control.disabled=true;
    feedback.textContent='';
    try{
      const name=title.value.trim();
      const content=noteBody(body.value);
      if(name.includes('/'))throw Error(t('请输入笔记标题，标题不能包含文件夹路径。'));
      if(!content.trim())throw Error(t('请输入笔记正文。'));
      const {saveNote}=await import('./notes-vault.js');
      const note=await saveNote({id:notePath(name),body:content,revision:null});
      document.dispatchEvent(new CustomEvent('notes-vault:created',{detail:note}));
      discard();
      announce(t('已保存到笔记库。'));
    }catch(error){feedback.textContent=t(error.message);}
    finally{
      saving=false;
      for(const control of form.elements)control.disabled=false;
    }
  });
  return {
    hasDraft:()=>hasDraft,
    hide,
    setDraft(draft){title.value=draft.title;body.value=draft.body;feedback.textContent='';hasDraft=true;},
    show(){if(hasDraft&&!dialog.open)dialog.showModal();},
  };
}
