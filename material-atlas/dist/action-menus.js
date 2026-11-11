import {icon} from './icons.js';
// Each menu keeps the original action attributes so every command retains its scope.
export function actionMenu(id,label,body,{iconName='more',iconOnly=false,className='outline-button',labelHTML='',controls=false}={}){
 const role=controls?'dialog':'menu';
 return '<div class="ui-action-menu"><button type="button" class="'+className+'" data-menu-toggle="'+id+'" popovertarget="'+id+'" aria-controls="'+id+'" aria-haspopup="'+role+'" aria-expanded="false" aria-label="'+label+'" title="'+label+'">'+(iconOnly?icon(iconName):labelHTML||icon(iconName)+'<span>'+label+'</span>')+'</button><div id="'+id+'" class="ui-action-popover'+(controls?' ui-control-popover':'')+'" popover="auto" role="'+role+'" aria-label="'+label+'">'+body+'</div></div>';
}
let initialized=false;
export function initActionMenus(){
 if(initialized)return;initialized=true;
 const triggerFor=panel=>document.querySelector('[data-menu-toggle="'+CSS.escape(panel.id)+'"],[data-menu-context="'+CSS.escape(panel.id)+'"]');
 const items=panel=>[...panel.querySelectorAll(panel.classList.contains('ui-control-popover')?'select:not(:disabled),input:not(:disabled),button:not(:disabled)':'button:not(:disabled),a[href]')].filter(el=>!el.hidden&&el.getClientRects().length);
 function position(panel,trigger){
  const r=trigger.getBoundingClientRect(),width=panel.offsetWidth,height=panel.offsetHeight;
  const left=r.left<60?r.right+8:r.right-width;
  const top=r.bottom+height+8<=innerHeight?r.bottom+6:Math.max(8,r.top-height-6);
  panel.style.left=Math.max(8,Math.min(innerWidth-width-8,left))+'px';panel.style.top=Math.max(8,Math.min(innerHeight-height-8,top))+'px';
 }
 function open(trigger,last=false,point=null){
  const panel=document.getElementById(trigger.dataset.menuToggle||trigger.dataset.menuContext);if(!panel)return;
  if(!panel.classList.contains('ui-control-popover'))for(const item of panel.querySelectorAll('button,a[href]')){if(!item.hasAttribute('role'))item.setAttribute('role','menuitem');item.tabIndex=-1;}
  panel.showPopover();
  let section=false,lastSeparator=null;
  for(const child of panel.children){
    if(child.tagName==='HR'){child.hidden=!section;if(section)lastSeparator=child;section=false;}
    else if(!child.hidden&&child.getClientRects().length&&!child.classList.contains('ui-menu-caption'))section=true;
  }
  if(!section&&lastSeparator)lastSeparator.hidden=true;
  position(panel,trigger);if(point){panel.style.left=Math.max(8,Math.min(innerWidth-panel.offsetWidth-8,point.x))+'px';panel.style.top=Math.max(8,Math.min(innerHeight-panel.offsetHeight-8,point.y))+'px';}trigger.setAttribute('aria-expanded','true');
  const list=items(panel);(last?list.at(-1):list[0])?.focus({preventScroll:true});
 }
 document.addEventListener('click',event=>{
  const trigger=event.target.closest('[data-menu-toggle]');
  if(trigger){event.preventDefault();const panel=document.getElementById(trigger.dataset.menuToggle);if(panel?.matches(':popover-open'))panel.hidePopover();else open(trigger);return;}
  const panel=event.target.closest('.ui-action-popover'),item=event.target.closest('button,a[href]');
  if(panel&&item)queueMicrotask(()=>{if(!item.hasAttribute('data-keep-menu-open')&&panel.matches(':popover-open'))panel.hidePopover();});
 },true);
 document.addEventListener('contextmenu',event=>{const trigger=event.target.closest('[data-menu-context]');if(!trigger)return;event.preventDefault();open(trigger,false,{x:event.clientX,y:event.clientY});},true);
 document.addEventListener('toggle',event=>{const panel=event.target;if(panel.classList?.contains('ui-action-popover'))triggerFor(panel)?.setAttribute('aria-expanded',String(event.newState==='open'));},true);
 document.addEventListener('keydown',event=>{
  const trigger=event.target.closest('[data-menu-toggle],[data-menu-context]');if(trigger&&(['ArrowDown','ArrowUp'].includes(event.key)||trigger.dataset.menuContext&&(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'))){event.preventDefault();open(trigger,event.key==='ArrowUp');return;}
  const panel=event.target.closest('.ui-action-popover');if(!panel)return;
  if(panel.classList.contains('ui-control-popover')&&event.key!=='Escape')return;
  const list=items(panel),index=list.indexOf(document.activeElement);let target;
  if(event.key==='ArrowDown')target=list[(index+1)%list.length];
  if(event.key==='ArrowUp')target=list[(index-1+list.length)%list.length];
  if(event.key==='Home')target=list[0];if(event.key==='End')target=list.at(-1);
  if(target){event.preventDefault();event.stopPropagation();target.focus();}
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();panel.hidePopover();triggerFor(panel)?.focus();}
  if(event.key==='Tab'){panel.hidePopover();triggerFor(panel)?.focus();}
 },true);
 document.addEventListener('focusout',event=>{
  const panel=event.target.closest?.('.ui-control-popover:popover-open');
  if(panel&&event.relatedTarget&&!panel.contains(event.relatedTarget)&&event.relatedTarget!==triggerFor(panel))panel.hidePopover();
 });
 addEventListener('resize',()=>document.querySelectorAll('.ui-action-popover:popover-open').forEach(panel=>{const trigger=triggerFor(panel);if(trigger)position(panel,trigger);}));
 document.addEventListener('close',event=>event.target.querySelectorAll?.('.ui-action-popover:popover-open').forEach(panel=>panel.hidePopover()),true);
}
