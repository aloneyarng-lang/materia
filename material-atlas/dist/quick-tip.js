import {t} from './i18n.js';
import {dailyTipName} from './notes-vault-model.js';

export function createQuickTip({flushNotes,toast}){
  const get = id => document.getElementById(id);
  const button = get('workspace-tip'), dialog = get('quick-tip-dialog');
  const field = get('quick-tip-body'), status = get('quick-tip-status');
  const cancel = get('quick-tip-cancel'), save = get('quick-tip-save');
  const native = globalThis.materiaDesktop;
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  let saving = false;
  button.title = t('快速随记') + (mac ? ' · ⌘⌥N' : ' · Alt+Q');
  save.title = t('保存') + (mac ? ' · ⌘↵' : ' · Ctrl+Enter');
  button.setAttribute('aria-keyshortcuts', mac ? 'Meta+Alt+N' : 'Alt+Q');

  function open(){
    if(!dialog.open){
      get('quick-tip-filename').value = dailyTipName();
      dialog.showModal();
    }
    field.focus();
  }

  button.addEventListener('click',open);
  cancel.addEventListener('click',()=>dialog.close());
  native?.onQuickTip?.(open);
  document.addEventListener('keydown',event=>{
    if(event.isComposing||event.defaultPrevented)return;
    const modifier = mac ? event.metaKey&&!event.ctrlKey : event.ctrlKey&&!event.metaKey;
    const quickTip = mac ? modifier&&event.code==='KeyN' : !event.ctrlKey&&!event.metaKey&&event.code==='KeyQ';
    if(quickTip&&event.altKey&&!event.shiftKey){
      event.preventDefault();
      if(!event.repeat)open();
    }
    if(dialog.open&&modifier&&!event.altKey&&!event.shiftKey&&event.key==='Enter'){
      event.preventDefault();
      if(!event.repeat)get('quick-tip-form').requestSubmit();
    }
  });
  dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  get('quick-tip-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(saving)return;
    const entry = field.value.trim();
    if(!entry){status.textContent=t('请输入随记内容。');return;}
    saving = field.readOnly = cancel.disabled = save.disabled = true;
    status.textContent = '';
    try{
      await flushNotes();
      const {appendDailyTip} = await import('./notes-vault.js');
      const note = await appendDailyTip(entry);
      document.dispatchEvent(new CustomEvent('notes-vault:created',{detail:note}));
      field.value = '';
      dialog.close();
      toast(t('已保存') + ' · ' + note.id);
    }catch(error){
      status.textContent = t(error.message);
    }finally{
      saving = field.readOnly = cancel.disabled = save.disabled = false;
      if(dialog.open)field.focus();
    }
  });
}
