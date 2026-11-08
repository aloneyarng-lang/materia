import {html, msg, t} from '../i18n.js';
import {icon} from '../icons.js';
import {svgImage} from './export.js';
import {appendPanels,arrangePanels,autoSizePanels,clampPosition,clampWeight,emptyMontage,montageBoard,montageLayout,montageLimit,readMontage} from './montage-layout.js';
import {composeMontage,figureFromImage} from './montage-svg.js';
import {escape} from './view.js';

export function montageHTML(native) {
  return html`<dialog class="modal figura-dialog figura-montage" data-fig="montage" aria-labelledby="figura-montage-title">
    <div class="figura-dialog-heading"><h2 id="figura-montage-title">论文拼版</h2><button type="button" class="icon-button" data-montage-action="close" aria-label="关闭弹窗">${icon('close')}</button></div>
    <div class="montage-layout">
      <aside class="montage-controls">
        <label class="figura-field">拼版名称<input type="text" maxlength="250" data-montage="name" placeholder="例如：图 2"></label>
        <div class="montage-library" ${native?'':'hidden'}>
          <label class="figura-field">图片库 · Ctrl / Shift 多选<select data-montage="images" multiple size="4"></select></label>
          <button type="button" class="outline-button" data-montage-action="image">${icon('plus')}加入所选图片</button>
          <div class="montage-library-actions">
            <button type="button" class="text-button" data-montage-action="import-images">导入并加入</button>
            <button type="button" class="text-button" data-montage-action="open-images">打开图片库</button>
            <button type="button" class="icon-button" data-montage-action="refresh-images" title="刷新图片库" aria-label="刷新图片库">${icon('refresh')}</button>
          </div>
        </div>
        <button type="button" class="outline-button" data-montage-action="current">${icon('plus')}加入当前图稿</button>
        <label class="figura-field">已保存图稿 · 可多选<select data-montage="projects" multiple size="3"></select></label>
        <button type="button" class="outline-button" data-montage-action="project">${icon('plus')}加入所选图稿</button>
        <div class="montage-fields">
          <label class="figura-field">排齐列数<select data-montage="columns"><option value="0">自动均衡</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label>
          <label class="figura-field">留白 / 排齐间距<select data-montage="gap"><option value="12">紧凑</option><option value="20">标准</option><option value="32">宽松</option></select></label>
        </div>
        <button type="button" class="outline-button" data-montage-action="arrange">${icon('overview')}自动排齐</button>
        <button type="button" class="outline-button" data-montage-action="auto-size" title="根据当前位置等比例调整各图尺寸，整理间距。">${icon('overview')}自动调整大小</button>
        <label class="montage-checkbox"><input type="checkbox" data-montage="labels">添加 A、B、C 面板编号</label>
      </aside>
      <section class="montage-main" aria-label="拼版预览">
        <div class="montage-summary"><p class="figura-help">自由拖动图稿，右下角可等比例缩放。也可一次拖入多张图片。</p><span class="figura-help" data-montage="size"></span></div>
        <div class="montage-viewport">
          <div class="figura-empty" data-montage="empty"><strong>加入图稿开始拼版</strong><span>拖入图片，或从图片库多选加入。最多 12 张。</span></div>
          <div class="montage-board" data-montage="board" hidden></div>
          <img class="montage-output" data-montage="output" alt="拼版成图" hidden>
        </div>
        <p class="figura-status" data-fig-dialog-status role="status"></p>
      </section>
    </div>
    <div class="figura-dialog-footer montage-footer">
      <button type="button" class="primary" data-montage-action="generate">一键生成大图</button>
      <button type="button" class="outline-button" data-montage-action="edit" hidden>继续调整</button>
      <span class="figura-spacer"></span>
      <label class="figura-field">PNG 分辨率<select data-montage="dpi"><option>300</option><option>600</option><option>150</option><option>96</option></select></label>
      <button type="button" class="outline-button" data-montage-action="svg">SVG</button>
      <button type="button" class="outline-button" data-montage-action="pdf" ${native?'':'hidden'}>PDF</button>
      <button type="button" class="outline-button" data-montage-action="png">PNG</button>
    </div>
  </dialog>`;
}

export function createMontage({dialog,on,read,write,getDraft,getProjects,plot,save,run,images}) {
  const find = key => dialog.querySelector('[data-montage="'+key+'"]');
  const control = action => dialog.querySelector('[data-montage-action="'+action+'"]');
  const board = find('board'), image = find('output'), notice = dialog.querySelector('[data-fig-dialog-status]');
  const get = () => read() || emptyMontage();
  let output, gesture, importing=false;
  const selected=key=>[...find(key).selectedOptions].filter(option=>!option.disabled).map(option=>option.value);

  function report(message,error=false) {
    notice.classList.toggle('is-error',error);
    notice.textContent = message;
  }

  async function refreshImages(pick=selected('images')) {
    if (!images) return;
    const select=find('images');
    const files=await images('imageList');
    const choices=new Set(pick);
    select.innerHTML=files.map(name=>`<option value="${escape(name)}" ${choices.has(name)?'selected':''}>${escape(name)}</option>`).join('')
      || html`<option disabled>图片库为空</option>`;
    syncControls();
  }

  function geometry(layout, frame=layout) {
    board.style.setProperty('--montage-ratio',String(frame.width/frame.height));
    layout.placements.forEach(({x,y,width,height,labelHeight,letter},i)=>{
      const tile=board.children[i];
      tile.style.left=100*(x-frame.x)/frame.width+'%';
      tile.style.top=100*(y-frame.y)/frame.height+'%';
      tile.style.width=100*width/frame.width+'%';
      tile.style.height=100*height/frame.height+'%';
      tile.style.setProperty('--label-space',100*labelHeight/height+'%');
      const label=tile.querySelector('.montage-letter');
      if(label)label.textContent=letter;
      tile.setAttribute('aria-label',letter+' · '+tile.title);
    });
  }

  function syncControls() {
    const full=get().panels.length>=montageLimit;
    control('current').disabled=importing||full||!getDraft();
    control('project').disabled=importing||full||!selected('projects').length;
    control('image').disabled=importing||full||!selected('images').length;
    control('arrange').disabled=importing||!get().panels.length;
    control('auto-size').disabled=importing||!get().panels.length;
    control('generate').disabled=importing||!get().panels.length;
  }

  function renderBoard() {
    const value = get(), layout = montageLayout(value);
    find('empty').hidden = Boolean(layout);
    board.hidden = !layout || Boolean(output);
    image.hidden = !output;
    if (!output) image.removeAttribute('src');
    else image.src = svgImage(output.svg);
    find('size').textContent = layout ? msg`${value.panels.length} 张图 · ${layout.width} × ${layout.height} px` : '';
    for (const action of ['svg','pdf','png']) control(action).disabled = !output;
    control('generate').hidden = Boolean(output);
    control('edit').hidden = !output;
    syncControls();
    if (!layout) {
      board.replaceChildren();
      return;
    }
    if (output) return;
    board.innerHTML = value.panels.map((panel,i) => {
      const name = panel.name || t('未命名绘图');
      return html`<div class="montage-card" tabindex="0" data-montage-card="${i}" title="${escape(name)}">
        ${value.labels ? '<strong class="montage-letter"></strong>' : ''}
        <img src="${svgImage(panel.svg)}" alt="${escape(name)}" draggable="false">
        <div class="montage-card-actions">
          <button type="button" class="icon-button" data-montage-action="remove" aria-label="移除图稿" title="移除图稿">${icon('close')}</button>
        </div>
        <button type="button" class="montage-resize" data-montage-resize aria-label="等比例缩放图稿" title="拖拽或用方向键缩放"></button>
      </div>`;
    }).join('');
    geometry(montageBoard(value));
  }

  function update(patch) {
    const next = readMontage({...get(),...patch});
    output = null;
    write(next);
    renderBoard();
  }

  async function projectPanel(project) {
    const figure = await plot(project);
    return {name:project.name,svg:figure.svg,...figure.size};
  }

  const libraryPanel=async name=>figureFromImage(await images('imageRead',name));
  async function addBatch(entries,load,failures=[]) {
    const accepted=[], errors=[...failures];
    importing=true;
    syncControls();
    report(t('正在载入图稿…'));
    try{
      for(const entry of entries){
        if(get().panels.length+accepted.length>=montageLimit){errors.push(t('拼版最多可加入 12 张图。'));break;}
        try{
          const panel=await load(entry);
          const candidate={...get(),panels:appendPanels(get(),[...accepted,panel])};
          readMontage(candidate);
          accepted.push(panel);
        }catch(error){
          const name=typeof entry==='string'?entry:entry?.name;
          errors.push(name?name+' · '+error.message:error.message);
        }
      }
      if(accepted.length)update({panels:appendPanels(get(),accepted)});
      const count=msg`本次加入 ${accepted.length} 张图稿`;
      report(errors.length?count+' · '+errors[0]:count,Boolean(errors.length));
    }finally{
      importing=false;
      syncControls();
    }
  }

  async function droppedPanel(file) {
    if(file.size>24*1024*1024)throw Error(t('图片文件超过 24 MB。'));
    const ext=file.name.split('.').at(-1)?.toLowerCase();
    const format={png:'png',jpg:'jpeg',jpeg:'jpeg',svg:'svg'}[ext];
    if(!format)throw Error(t('仅支持 PNG、JPEG 和 SVG。'));
    if(images){
      const name=await images('imageStore',{name:file.name,bytes:new Uint8Array(await file.arrayBuffer())});
      return libraryPanel(name);
    }
    if(format==='svg')return figureFromImage({name:file.name,format,content:await file.text()});
    const encoded=await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result.split(',')[1]);
      reader.onerror=()=>reject(reader.error);
      reader.readAsDataURL(file);
    });
    return figureFromImage({name:file.name,format,content:encoded});
  }

  const updatePanel=(index,patch)=>get().panels.map((panel,i)=>i===index?{...panel,...patch}:panel);

  const actions = {
    close: () => dialog.close(),
    current: () => addBatch([getDraft()],projectPanel),
    project: () => addBatch(selected('projects').map(index=>getProjects()[Number(index)]),projectPanel),
    image: () => addBatch(selected('images'),libraryPanel),
    'refresh-images':()=>refreshImages(),
    'open-images':()=>images('imageOpen'),
    async 'import-images'() {
      const result=await images('imageImport');
      if(!result)return;
      await refreshImages(result.added);
      await addBatch(result.added,libraryPanel,result.errors);
    },
    arrange: () => update({panels:arrangePanels(get())}),
    'auto-size'() {
      update({panels:autoSizePanels(get())});
      report(t('已等比例调整大小并整理间距，可继续拖动微调。'));
    },
    remove: index => update({panels:get().panels.filter((_,i)=>i!==index)}),
    async generate() {
      output=composeMontage(get());
      renderBoard();
      if (images) {
        const saved=await save(output,'svg',get().name.trim()||t('论文拼版'),96,true);
        await refreshImages([saved.filename]);
        report(msg`已保存到图片库 · ${saved.filename}`);
      } else report(t('矩形大图已生成'));
    },
    edit() {
      output=null;
      renderBoard();
      report('');
    },
  };
  for (const type of ['svg','pdf','png']) actions[type] = () => {
    if (output) return save(output,type,get().name.trim() || t('论文拼版'),Number(find('dpi').value));
  };
  on(dialog,'click',event => {
    const button = event.target.closest('[data-montage-action]'), action = button?.dataset.montageAction;
    if (!Object.hasOwn(actions,action) || button.disabled) return;
    const index = Number(button.closest('[data-montage-card]')?.dataset.montageCard);
    if (action==='close') dialog.close();
    else run(() => actions[action](index));
  });
  on(dialog,'change',event => {
    const {montage:key} = event.target.dataset;
    if (key==='projects'||key==='images') syncControls();
    if (key==='columns' || key==='gap') update({[key]:Number(event.target.value)});
    if (key==='labels') update({labels:event.target.checked});
  });
  on(dialog,'input',event => {
    if (event.target===find('name')) write({...get(),name:event.target.value});
  });

  function cardOf(event) { return event.target.closest('[data-montage-card]'); }
  for(const type of ['dragenter','dragover','drop'])on(dialog,type,event=>{
    if(!event.dataTransfer?.types.includes('Files'))return;
    event.preventDefault();
    event.stopPropagation();
    if(type!=='drop'){event.dataTransfer.dropEffect='copy';return;}
    const files=[...event.dataTransfer.files];
    if(files.length)run(async()=>{
      await addBatch(files,droppedPanel);
      await refreshImages();
    });
  });

  on(board,'pointerdown',event=>{
    const card=cardOf(event), resize=Boolean(event.target.closest('[data-montage-resize]'));
    if(!card||event.button!==0||gesture||importing||(!resize&&event.target.closest('button')))return;
    event.preventDefault();
    const index=Number(card.dataset.montageCard), frame=montageBoard(get()), panel=get().panels[index];
    const rect=card.querySelector('img').getBoundingClientRect(), boardRect=board.getBoundingClientRect();
    const viewport=board.parentElement;
    gesture={id:event.pointerId,index,resize,frame,panel,patch:null,x:event.clientX,y:event.clientY,
      width:rect.width,height:rect.height,unitsX:frame.width/boardRect.width,unitsY:frame.height/boardRect.height,
      scrollX:viewport.scrollLeft,scrollY:viewport.scrollTop};
    board.setPointerCapture(event.pointerId);
    card.classList.add(resize?'is-resizing':'is-dragging');
  });
  on(board,'pointermove',event=>{
    if(gesture?.id!==event.pointerId)return;
    const g=gesture, viewport=board.parentElement;
    const dx=event.clientX-g.x+viewport.scrollLeft-g.scrollX,dy=event.clientY-g.y+viewport.scrollTop-g.scrollY;
    if(!g.patch&&Math.hypot(dx,dy)<2)return;
    g.patch=g.resize
      ? {weight:clampWeight(g.panel.weight*(1+(dx*g.width+dy*g.height)/Math.max(1,g.width**2+g.height**2)))}
      : {x:clampPosition(g.panel.x+dx*g.unitsX),y:clampPosition(g.panel.y+dy*g.unitsY)};
    geometry(montageBoard({...get(),panels:updatePanel(g.index,g.patch)}),g.frame);
  });
  function finishGesture(event) {
    if(gesture?.id!==event.pointerId)return;
    const {index,patch}=gesture;
    gesture=null;
    if(event.type==='pointerup'&&patch)update({panels:updatePanel(index,patch)});
    else renderBoard();
    board.children[index]?.focus({preventScroll:true});
  }
  for(const event of ['pointerup','pointercancel','lostpointercapture'])on(board,event,finishGesture);
  on(board,'keydown',event=>{
    const directions={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};
    const card=cardOf(event),resize=Boolean(event.target.closest('[data-montage-resize]')), direction=directions[event.key];
    if(!card||!direction||importing||(!resize&&event.target!==card))return;
    event.preventDefault();
    const index=Number(card.dataset.montageCard),panel=get().panels[index],step=event.shiftKey?40:10;
    const [x,y]=direction, patch=resize?{weight:clampWeight(panel.weight+(x-y)*.1)}
      : {x:clampPosition(panel.x+x*step),y:clampPosition(panel.y+y*step)};
    update({panels:updatePanel(index,patch)});
    (resize?board.children[index].querySelector('[data-montage-resize]'):board.children[index]).focus({preventScroll:true});
  });

  return {
    async show() {
      output=null;
      gesture=null;
      const value=get();
      find('name').value=value.name;
      find('columns').value=String(value.columns);
      find('gap').value=String(value.gap);
      find('labels').checked=value.labels;
      find('projects').innerHTML=getProjects().map((item,i)=>
        `<option value="${i}">${escape(item.name || t('未命名绘图'))}</option>`).join('')||html`<option disabled>暂无已保存图稿</option>`;
      report('');
      renderBoard();
      dialog.showModal();
      await refreshImages();
    },
  };
}
