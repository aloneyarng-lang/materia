import {t as tr,html,msg} from './i18n.js';
export function createGroupActions(config){
  const menu=document.createElement('div');menu.className='paper-context-panel group-context-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label',tr('分组操作'));menu.hidden=true;document.body.append(menu);
  let target='',origin=null,busy=false;
  function close(restore=false){menu.hidden=true;if(restore&&origin?.isConnected)origin.focus();}
  function open(button,x,y){const folder=config.getGroups().find(c=>c.id===button.dataset.collection);if(!folder)return;target=folder.id;origin=button;
    menu.innerHTML=html`<button role="menuitem" data-group-command="rename">重命名分组…</button>${config.openFolder?tr('<button role="menuitem" data-group-command="open">在文件夹中打开</button>'):''}`;menu.hidden=false;
    menu.style.left=Math.max(8,Math.min(innerWidth-menu.offsetWidth-8,x))+'px';menu.style.top=Math.max(8,Math.min(innerHeight-menu.offsetHeight-8,y))+'px';menu.querySelector('button').focus();
  }
  document.addEventListener('contextmenu',event=>{const button=event.target.closest('[data-collection]');if(!button||busy||document.querySelector('#modal')?.open)return;event.preventDefault();open(button,event.clientX,event.clientY);});
  document.addEventListener('keydown',event=>{
    if(menu.hidden){if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){const button=event.target.closest('[data-collection]');if(button){event.preventDefault();const r=button.getBoundingClientRect();open(button,r.right,r.top);}}return;}
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}
    if(event.key==='Tab')close();
    if(['ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();const items=[...menu.querySelectorAll('button')],i=items.indexOf(document.activeElement);items[event.key==='Home'?0:event.key==='End'?items.length-1:(i+(event.key==='ArrowUp'?-1:1)+items.length)%items.length]?.focus();}
  },true);
  document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target))close();},true);addEventListener('blur',()=>close());addEventListener('resize',()=>close());document.addEventListener('scroll',event=>{if(!menu.contains(event.target))close();},true);
  menu.addEventListener('click',async event=>{const command=event.target.closest('[data-group-command]')?.dataset.groupCommand;if(!command||busy)return;close();try{
    if(command==='open')await config.openFolder(target);
    if(command==='rename'){const folder=config.getGroups().find(c=>c.id===target);if(!folder)return;config.showModal(tr('重命名分组'),'',html`<form id="rename-group-form" data-group-id="${config.escape(target)}"><label class="form-field">分组名称<input name="name" required maxlength="80" value="${config.escape(folder.name)}" autofocus></label><div class="modal-footer"><button type="button" class="text-button" data-action="close-modal">取消</button><button class="primary" type="submit">保存</button></div></form>`,'group-rename');}
  }catch(error){config.toast(error.message,true);}});
  document.addEventListener('submit',async event=>{const form=event.target;if(form.id!=='rename-group-form')return;event.preventDefault();if(busy)return;busy=true;const submit=form.querySelector('[type=submit]');submit.disabled=true;
    try{const name=String(new FormData(form).get('name')).trim();if(!name)throw Error(tr('请填写分组名称。'));if(config.getGroups().some(c=>c.id!==form.dataset.groupId&&c.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error(tr('已有同名分组。'));await config.save(config.getGroups().map(c=>c.id===form.dataset.groupId?{...c,name}:c));await config.reload();busy=false;config.closeModal();}catch(error){config.toast(error.message,true);}finally{busy=false;submit.disabled=false;}
  });
  return {close,isBusy:()=>busy};
}
