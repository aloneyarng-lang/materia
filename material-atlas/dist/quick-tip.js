import {t} from './i18n.js';
import {dailyTipName} from './notes-vault-model.js';
import {compressNoteImages} from './note-media.js';
import {normalizeAttachments} from './note-model.js';
import {browserScreenshot} from './screenshot-selection.js';

function transferImages(transfer){
  if(!transfer)return [];
  const images = [...(transfer.files??[])].filter(file=>file.type.startsWith('image/'));
  return images.length ? images : [...(transfer.items??[])].filter(item=>item.kind==='file'&&item.type.startsWith('image/'))
    .map(item=>item.getAsFile()).filter(Boolean);
}

function imageDataUrl(blob){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function createQuickTip({flushNotes,toast}){
  const get = id => document.getElementById(id);
  const button = get('workspace-tip'), panel = get('quick-tip-dialog'), form = get('quick-tip-form');
  const field = get('quick-tip-body'), status = get('quick-tip-status');
  const cancel = get('quick-tip-cancel'), save = get('quick-tip-save');
  const picker = get('quick-tip-files'), add = get('quick-tip-add-image'), images = get('quick-tip-images');
  const screenshot = get('quick-tip-screenshot');
  const native = globalThis.materiaDesktop;
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  let saving = false, adding = false, capturing = false, attachments = [];
  screenshot.hidden = !native?.captureQuickTipRegion && !navigator.mediaDevices?.getDisplayMedia;
  button.title = t('快速随记') + (mac ? ' · ⌘⌥N' : ' · Alt+Q');
  save.title = t('保存') + (mac ? ' · ⌘↵' : ' · Ctrl+Enter');
  button.setAttribute('aria-keyshortcuts', mac ? 'Meta+Alt+N' : 'Alt+Q');

  function open(){
    get('quick-tip-filename').value = dailyTipName();
    panel.hidden = false;
    button.setAttribute('aria-expanded','true');
    field.focus({preventScroll:true});
  }

  function close(){
    const restoreFocus = panel.contains(document.activeElement);
    panel.hidden = true;
    panel.classList.remove('is-image-target');
    button.setAttribute('aria-expanded','false');
    if(restoreFocus)button.focus({preventScroll:true});
  }

  function syncControls(){
    field.readOnly = saving;
    save.disabled = saving || adding || capturing;
    add.disabled = screenshot.disabled = saving || adding || capturing || attachments.length >= 6;
    for(const remove of images.querySelectorAll('button'))remove.disabled=saving||adding;
  }

  function renderAttachments(){
    images.replaceChildren(...attachments.map(attachment=>{
      const figure = document.createElement('figure');
      const thumbnail = document.createElement('img');
      thumbnail.src = attachment.dataUrl;
      thumbnail.alt = attachment.name;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-button';
      remove.textContent = '×';
      remove.title = t('移除图片') + ' · ' + attachment.name;
      remove.setAttribute('aria-label',remove.title);
      remove.addEventListener('click',()=>{
        attachments = attachments.filter(image=>image.id!==attachment.id);
        renderAttachments();
        add.focus({preventScroll:true});
      });
      figure.append(thumbnail,remove);
      return figure;
    }));
    images.hidden = !attachments.length;
    syncControls();
  }

  async function attach(files){
    if(!files.length||saving||adding)return;
    if(attachments.length+files.length>6){
      status.textContent=t('每条随记最多 6 张图片。');
      return;
    }
    adding=true;
    status.textContent='';
    syncControls();
    try{attachments=await compressNoteImages(files,attachments);renderAttachments();}
    catch(error){status.textContent=t(error.message);}
    finally{adding=false;syncControls();}
  }

  button.addEventListener('click',()=>panel.hidden?open():close());
  cancel.addEventListener('click',close);
  native?.onQuickTip?.(open);
  add.addEventListener('click',()=>picker.click());
  screenshot.addEventListener('click',async()=>{
    if(saving||adding||capturing||attachments.length>=6)return;
    capturing=true;
    syncControls();
    status.textContent='';
    panel.classList.add('is-capturing');
    try {
      let image;
      if(native?.captureQuickTipRegion){
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const result=await native.captureQuickTipRegion();
        if(result?.bytes.byteLength)image={...result,blob:new Blob([result.bytes],{type:result.type})};
      } else {
        image=await browserScreenshot({guide:t('拖动鼠标框选截图区域，按 Esc 取消。'),confirm:t('确定'),cancel:t('取消')});
      }
      if(image?.blob.size){
        const extension=image.blob.type==='image/jpeg'?'.jpg':'.png';
        const next={id:'img-'+crypto.randomUUID(),name:t('截图')+extension,dataUrl:await imageDataUrl(image.blob),
          width:image.width,height:image.height};
        attachments=normalizeAttachments([...attachments,next]);
        renderAttachments();
      }
    } catch(error) {
      if(!['NotAllowedError','AbortError'].includes(error.name))status.textContent=t('无法截取当前屏幕。');
    } finally {
      capturing=false;
      panel.classList.remove('is-capturing');
      syncControls();
      if(!panel.hidden)field.focus({preventScroll:true});
    }
  });
  picker.addEventListener('change',()=>{
    const files=[...picker.files];
    picker.value='';
    void attach(files);
  });
  panel.addEventListener('paste',event=>{
    const files=transferImages(event.clipboardData);
    if(!files.length)return;
    event.preventDefault();
    event.stopPropagation();
    void attach(files);
  });
  panel.addEventListener('dragover',event=>{
    if(!event.dataTransfer?.types.includes('Files'))return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect='copy';
    panel.classList.add('is-image-target');
  });
  panel.addEventListener('dragleave',event=>{
    if(!panel.contains(event.relatedTarget))panel.classList.remove('is-image-target');
  });
  panel.addEventListener('drop',event=>{
    panel.classList.remove('is-image-target');
    if(!event.dataTransfer?.types.includes('Files'))return;
    event.preventDefault();
    event.stopPropagation();
    void attach(transferImages(event.dataTransfer));
  });
  document.addEventListener('keydown',event=>{
    if(event.isComposing||event.defaultPrevented)return;
    const quickTip = mac ? event.metaKey&&!event.ctrlKey&&event.code==='KeyN' : !event.ctrlKey&&!event.metaKey&&event.code==='KeyQ';
    if(quickTip&&event.altKey&&!event.shiftKey){
      event.preventDefault();
      if(!event.repeat)open();
    }
  });
  panel.addEventListener('keydown',event=>{
    if(event.isComposing||event.defaultPrevented)return;
    if(event.key==='Escape'){
      event.preventDefault();
      close();
      return;
    }
    const modifier = mac ? event.metaKey&&!event.ctrlKey : event.ctrlKey&&!event.metaKey;
    if(modifier&&!event.altKey&&!event.shiftKey&&event.key==='Enter'){
      event.preventDefault();
      if(!event.repeat)form.requestSubmit();
    }
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(saving||adding||capturing)return;
    const entry = field.value.trim();
    if(!entry&&!attachments.length){status.textContent=t('请输入随记内容或添加图片。');return;}
    saving = true;
    syncControls();
    status.textContent = '';
    try{
      await flushNotes();
      const {appendDailyTip} = await import('./notes-vault.js');
      const note = await appendDailyTip(entry,attachments);
      document.dispatchEvent(new CustomEvent('notes-vault:created',{detail:note}));
      field.value = '';
      attachments = [];
      renderAttachments();
      close();
      toast(t('已保存') + ' · ' + note.id);
    }catch(error){
      status.textContent = t(error.message);
    }finally{
      saving = false;
      syncControls();
    }
  });
}
