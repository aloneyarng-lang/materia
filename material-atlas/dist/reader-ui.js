import {t as tr,html,msg} from './i18n.js';
import {getLocale} from './i18n.js';
import {icon} from './icons.js';
import {createContinuousReader} from './reader-continuous.js';
import {actionMenu} from './action-menus.js';
import {MARK_COLORS,anchorMatchesPaper,cleanReaderState,cleanReaderDrafts} from './note-model.js';
import {noteImagesHTML,compressNoteImages,openNoteImage} from './note-media.js';
import {READER_LAYOUTS,visibleReaderPages,turnReaderPage,fitReaderScale,readerRasterPlan,readerNoteContent,sameReaderNote} from './reader-layout.js';
import {annotationName,gestureAnnotation,transformAnnotation,annotationHTML,translationAnnotation} from './reader-annotations.js';
import {pdfPageText} from './study-model.js';
import {createReaderStudy,readerStudyHTML} from './reader-study.js';
import {isTextMark,selectionFragments,textMarkAnchor} from './reader-text-marks.js';

export function createPDFReader(config){
  const host=document.querySelector('#pdf-reader'),esc=config.escape,$=selector=>host.querySelector(selector);
  let paper,doc,loading,pdfModule,session=0,renderVersion=0,renderTasks=[],textLayers=[],page=1,zoom='fit',layout='single',actualScale=1;
  let mode='read',color='yellow',draft,dirty=false,busy=false,imageBusy=false,selected='',filter='all',query='',drag=null;
  let flow='vertical',continuous=null,continuousKey='';
  let sidebarOpen=true,sidebarWidth=338,wheelTurn=false,tab='list',lastQuote=null,preferences={},draftRows=[],baseUpdatedAt=0;
  let editVersion=0,draftSavedVersion=-1,draftTimer,positionTimer,resizeTimer,draftQueue=Promise.resolve(),renderKey='',wheelSum=0,wheelAt=0,turnLockedUntil=0;
  let pan=null,transformDrag=null,inlineOpen=false,suppressAnnotationClick=false,relocating=false;
  let lastAnnotationTap={id:'',time:0},suppressPageClick=0,suppressContextMenu=0;
  let selectionTimer,selectingText=false,textMarkHistory=[];
  const notes=()=>config.getNotes()[`paper:${paper?.id}`]||[];
  const visible=()=>doc?visibleReaderPages(page,doc.numPages,layout):[page];
  const empty=()=>({id:`note-${crypto.randomUUID()}`,body:'',attachments:[],anchor:null,createdAt:Date.now()});
  const frameFor=number=>$(`[data-reader-page="${number}"]`);
  const study=createReaderStudy(host,{escape:esc,toast:config.toast,saveText:config.saveText,openSource:config.openStudySource,addAnnotation:addTranslationAnnotation,markSelection:addTextMark,translate:(...args)=>config.translate(...args),serviceStatus:()=>config.translationStatus(),configure:config.configureTranslation,context:()=>({paper,page,total:doc?.numPages||0,loaded:Boolean(doc)}),showTranslation:async()=>{await ensureSidebar();updateTab('translation');},pageText:async number=>{const current=doc,ticket=session;if(!current)throw new Error(tr('PDF 尚未加载。'));const pdf=await current.getPage(number),content=await pdf.getTextContent();if(ticket!==session||current!==doc)throw new Error(tr('文献已切换。'));return pdfPageText(content);}});
  function status(text){if($('#reader-status'))$('#reader-status').textContent=text;}
  function editorStatus(text,kind=''){if($('#reader-dirty')){$('#reader-dirty').textContent=text;$('#reader-dirty').dataset.state=kind;}}
  function currentPosition(){return{page,zoom,layout,flow,sidebarOpen,sidebarWidth,wheelTurn};}
  function savePosition(immediate=false){
    clearTimeout(positionTimer);if(!doc)return Promise.resolve();preferences={...preferences,[paper.id]:currentPosition()};const snapshot=cleanReaderState(preferences);
    const run=()=>config.savePosition(snapshot).catch(error=>config.toast(msg`阅读设置未保存：${error.message}`,true));
    return immediate?run():(positionTimer=setTimeout(run,350),Promise.resolve());
  }
  function cancelRender(){continuous?.dispose();continuous=null;continuousKey='';renderVersion++;renderTasks.forEach(task=>task.cancel());textLayers.forEach(layer=>layer.cancel());renderTasks=[];textLayers=[];}
  function dispose(){clearTimeout(selectionTimer);selectingText=false;textMarkHistory=[];host.classList.remove('reader-focus');study.dispose();session++;cancelRender();clearTimeout(resizeTimer);clearTimeout(positionTimer);clearTimeout(draftTimer);loading?.destroy().catch(()=>{});doc?.destroy().catch(()=>{});doc=null;loading=null;renderKey='';lastQuote=null;pan=null;transformDrag=null;inlineOpen=false;host.classList.remove('reader-panning');}
  function persistDraftRows(rows){
    const snapshot=cleanReaderDrafts(rows);draftRows=snapshot;const task=draftQueue.catch(()=>{}).then(()=>config.saveDrafts(snapshot));draftQueue=task;return task;
  }
  function hasCurrentDraft(){return readerNoteContent(draft)||notes().some(note=>note.id===draft.id);}
  async function stashDraft(){
    clearTimeout(draftTimer);if(!paper||!dirty||draftSavedVersion===editVersion)return;
    const version=editVersion,id=draft.id,paperId=paper.id;
    let next=draftRows.filter(row=>!(row.paperId===paperId&&row.note.id===id));
    if(hasCurrentDraft())next.push({paperId,note:structuredClone(draft),baseUpdatedAt,savedAt:Date.now()});
    editorStatus(tr('正在保存草稿…'),'saving');
    await persistDraftRows(next);
    if(draft.id===id&&version===editVersion){draftSavedVersion=version;editorStatus(tr('草稿已保存 · Ctrl+S 正式保存'),'draft');}
    renderList();
  }
  function changed(){
    dirty=true;editVersion++;clearTimeout(draftTimer);editorStatus(tr('等待保存草稿…'),'pending');updateEditorMeta();
    draftTimer=setTimeout(()=>stashDraft().catch(error=>{editorStatus(tr('草稿未写入磁盘，内容仍在编辑区'),'error');config.toast(error.message,true);}),900);
  }
  async function prepareSwitch(){
    if(busy||imageBusy){config.toast(tr('正在保存或处理图片，请稍候。'));return false;}
    try{while(dirty&&draftSavedVersion!==editVersion)await stashDraft();return true;}catch(error){editorStatus(tr('草稿未写入磁盘，请保存笔记后再离开'),'error');config.toast(error.message,true);return false;}
  }
  async function close(){const ticket=session;if(!await prepareSwitch()||ticket!==session)return false;await savePosition(true);if(ticket!==session)return false;dispose();host.close();return true;}
  function updateTab(next){
    tab=next;host.dataset.noteTab=tab;
    host.querySelectorAll('[data-reader-tab]').forEach(button=>{button.classList.toggle('active',button.dataset.readerTab===tab);button.setAttribute('aria-selected',String(button.dataset.readerTab===tab));});
    $('#reader-list-panel').hidden=tab!=='list';$('#reader-editor-panel').hidden=tab!=='edit';
    $('#reader-translation-panel').hidden=tab!=='translation';$('#reader-vocabulary-panel').hidden=tab!=='vocabulary';study.tabChanged(tab);
  }
  function updateSidebar(){
    host.classList.toggle('reader-sidebar-collapsed',!sidebarOpen);host.style.setProperty('--reader-sidebar-width',sidebarWidth+'px');
    const button=$('#reader-sidebar-toggle');button.textContent=sidebarOpen?tr('收起侧栏'):tr('展开侧栏');button.setAttribute('aria-expanded',String(sidebarOpen));
    const separator=$('.reader-sidebar-resizer');separator?.setAttribute('aria-valuemin','270');separator?.setAttribute('aria-valuemax','520');separator?.setAttribute('aria-valuenow',String(sidebarWidth));
  }
  async function ensureSidebar(){if(sidebarOpen)return;sidebarOpen=true;updateSidebar();if(doc&&typeof zoom==='string')await renderPages({preserve:true});savePosition();}
  function updateEditorMeta(){
    $('#reader-note-length').textContent=msg`${draft.body.length.toLocaleString()} / 40,000 字`;
    $('#reader-editor-context').textContent=draft.anchor?msg`${annotationName(draft.anchor)} · 第 ${draft.anchor.page} 页`:tr('整篇文献笔记');
    $('#reader-detach').hidden=!draft.anchor;$('#reader-relocate').hidden=!draft.anchor||isTextMark(draft.anchor);
    $('#reader-caption-field').hidden=!draft.anchor||isTextMark(draft.anchor);$('#reader-body-label').textContent=draft.anchor?tr('详细批注 · 文字和图片'):tr('文献笔记正文');
  }
  function renderEditor(){
    $('#reader-note-body').value=draft.body;$('#reader-draft-images').innerHTML=noteImagesHTML(draft.attachments||[],esc,true);
    $('#reader-caption-text').value=draft.anchor?.label||'';
    $('#reader-save-note').textContent=notes().some(note=>note.id===draft.id)?tr('保存修改'):tr('保存笔记');updateEditorMeta();
  }
  function markerHTML(anchor,id,draftMark=false){
    const frame=frameFor(anchor.page);return annotationHTML(anchor,id,{escape:esc,selected:id===selected||id===draft?.id&&dirty,draft:draftMark,width:frame?.offsetWidth||1000,height:frame?.offsetHeight||1000});
  }
  function paintMarks(){
    if(!paper)return;
    for(const frame of host.querySelectorAll('#reader-stage .reader-page')){
      const number=Number(frame.dataset.readerPage),layer=frame.querySelector('.reader-mark-layer');
      layer.innerHTML=notes().filter(note=>note.anchor?.page===number&&anchorMatchesPaper(note.anchor,paper)&&!(draft?.id===note.id&&dirty)).map(note=>markerHTML(note.anchor,note.id)).join('')+(draft?.anchor?.page===number&&dirty&&anchorMatchesPaper(draft.anchor,paper)?markerHTML(draft.anchor,draft.id,true):'');
      frame.classList.toggle('is-marking',mode!=='read');frame.dataset.annotationTool=mode;frame.classList.toggle('is-current-page',number===page);
    }
    positionAnnotationTools();
  }
  function positionAnnotationTools(){
    const tools=$('#reader-annotation-tools'),editor=$('#reader-inline-editor');if(!tools||!editor)return;
    const anchor=draft?.anchor,frame=anchor&&frameFor(anchor.page),scroll=$('#reader-scroll');
    if(!anchor||!frame||!selected||mode!=='read'||host.dataset.rendering){tools.hidden=true;editor.hidden=true;return;}
    const f=frame.getBoundingClientRect(),s=scroll.getBoundingClientRect(),r=anchor.rect,d=$('.reader-document').getBoundingClientRect();
    if(f.top+(r.y+r.height)*f.height<s.top||f.top+r.y*f.height>s.bottom||f.left+(r.x+r.width)*f.width<s.left||f.left+r.x*f.width>s.right){tools.hidden=true;editor.hidden=true;return;}
    $('#reader-annotation-kind').textContent=annotationName(anchor);$('#reader-annotation-save').hidden=!dirty;
    tools.querySelector('[data-annotation-action="caption"]').hidden=isTextMark(anchor);
    tools.querySelectorAll('[data-annotation-color]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.annotationColor===anchor.color)));
    $('#reader-annotation-detail').textContent=draft.body||draft.attachments?.length?tr('查看 / 编辑批注'):tr('添加详细批注');
    tools.hidden=inlineOpen;editor.hidden=!inlineOpen;const panel=inlineOpen?editor:tools;
    const caption=[...frame.querySelectorAll('.reader-arrow-caption,.reader-mark')].find(mark=>mark.dataset.readerMark===draft.id);
    const bounds=caption?.getBoundingClientRect()||{left:f.left+r.x*f.width,top:f.top+r.y*f.height,bottom:f.top+(r.y+r.height)*f.height};
    const x=bounds.left-d.left,y=bounds.top-d.top,below=bounds.bottom-d.top+12;
    panel.style.left=Math.max(10,Math.min(d.width-panel.offsetWidth-10,x))+'px';
    panel.style.top=Math.max(39,Math.min(d.height-panel.offsetHeight-68,y-panel.offsetHeight-12<39?below:y-panel.offsetHeight-12))+'px';
  }
  function openInlineEditor(){
    if(isTextMark(draft.anchor)){showAnnotationDetails();return;}
    if(!draft.anchor)return;inlineOpen=true;$('#reader-inline-label').value=draft.anchor.label||'';$('#reader-inline-font').value=draft.anchor.fontSize||14;$('#reader-inline-color').value=draft.anchor.color||color;$('#reader-inline-length').textContent=`${(draft.anchor.label||'').length} / 500`;
    positionAnnotationTools();$('#reader-inline-label').focus({preventScroll:true});
  }
  async function activateTool(tool,keepDraft=false){
    if(!await prepareSwitch())return;
    if(!keepDraft&&(readerNoteContent(draft)||notes().some(note=>note.id===draft.id))){draft=empty();dirty=false;selected='';baseUpdatedAt=0;editVersion++;draftSavedVersion=-1;renderEditor();}
    mode=tool;relocating=keepDraft;inlineOpen=false;updateMode();
  }
  async function selectAnnotation(id,editText=false){
    if(id!==draft.id){if(!await chooseNote(id,{reveal:false,locate:false,focus:false}))return;}
    selected=id;mode='read';inlineOpen=false;lastAnnotationTap={id,time:performance.now()};updateMode();paintMarks();if(editText)openInlineEditor();
  }
  async function showAnnotationDetails(){
    if(!draft.anchor)return;inlineOpen=false;await ensureSidebar();updateTab('edit');renderEditor();paintMarks();$('#reader-note-body').focus({preventScroll:true});
  }
  async function detachAnnotation(){
    if(draft.anchor?.label&&!draft.body.includes(draft.anchor.label))draft.body=draft.anchor.label+(draft.body?'\n\n'+draft.body:'');
    draft.anchor=null;inlineOpen=false;selected='';changed();await ensureSidebar();updateTab('edit');renderEditor();paintMarks();
  }
  function renderList(){
    const container=$('#reader-note-list');if(!container||!paper)return;
    const pages=new Set(visible()),pending=draftRows.filter(row=>row.paperId===paper.id),newDrafts=pending.filter(row=>!notes().some(note=>note.id===row.note.id));
    const rows=notes().filter(note=>(filter==='all'||filter==='paper'&&!note.anchor||filter==='page'&&pages.has(note.anchor?.page))&&[note.anchor?.label,note.body,...(note.attachments||[]).map(image=>image.name)].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a,b)=>b.updatedAt-a.updatedAt);
    $('#reader-note-count').textContent=msg`${notes().length} 条笔记 · ${notes().filter(note=>note.anchor).length} 个标记`;
    $('#reader-list-tab-count').textContent=notes().length;$('#reader-draft-count').textContent=pending.length?msg`${pending.length} 条本地草稿`:'';
    $('#reader-pending-drafts').innerHTML=newDrafts.map(row=>html`<div class="reader-pending-draft"><button data-reader-resume="${esc(row.note.id)}"><strong>未完成的新笔记${row.note.anchor?msg` · 第 ${row.note.anchor.page} 页`:''}</strong><span>${esc(row.note.body.slice(0,65)||tr('标记 / 图片草稿'))}</span></button><button data-reader-discard="${esc(row.note.id)}" aria-label="丢弃这条草稿">×</button></div>`).join('');
    container.innerHTML=rows.map(note=>{
      const anchor=note.anchor,valid=!anchor||anchorMatchesPaper(anchor,paper)&&(!doc||anchor.page<=doc.numPages),hasDraft=pending.some(row=>row.note.id===note.id);
      return html`<article class="reader-note-card ${selected===note.id?'active':''}"><div><button class="reader-note-location" data-reader-edit="${esc(note.id)}">${anchor?msg`第 ${anchor.page} 页 · ${annotationName(anchor)}`:tr('整篇文献笔记')}</button><small>${hasDraft?tr('有草稿'):new Date(note.updatedAt).toLocaleDateString(getLocale())}</small><button class="reader-note-delete" data-reader-delete="${esc(note.id)}" aria-label="删除这条笔记" title="删除这条笔记">${icon('trash')}</button></div>${!valid?tr('<p class="reader-note-warning">关联旧版 PDF 或页码超出当前文件，可重新定位。</p>'):''}${anchor?.label?`<strong class="reader-note-caption">${esc(anchor.label)}</strong>`:''}<p class="reader-note-excerpt">${config.renderText(note.body.slice(0,350))||tr('<span>点击标注可进一步批注</span>')}</p>${noteImagesHTML(note.attachments||[],esc)}</article>`;
    }).join('')||tr('<p class="reader-note-empty">在 PDF 上框选区域做批注，或点击“新笔记”记录整篇文献。</p>');
  }
  function updateNavigation(){
    if(!doc)return;const pages=visible(),first=pages[0],last=pages.at(-1),label=pages.length>1?`${first}–${last}`:String(first);
    $('#reader-page-number').value=page;$('#reader-page-number').max=doc.numPages;$('#reader-page-total').textContent=`/ ${doc.numPages}`;
    $('#reader-visible-pages').textContent=pages.length>1?msg`同时阅读 ${label} 页`:'';
    $('#reader-page-progress').max=doc.numPages;$('#reader-page-progress').value=page;$('#reader-page-progress').setAttribute('aria-valuetext',msg`第 ${label} 页，共 ${doc.numPages} 页`);
    host.querySelectorAll('[data-reader-action="prev"]').forEach(button=>button.disabled=first<=1);host.querySelectorAll('[data-reader-action="next"]').forEach(button=>button.disabled=last>=doc.numPages);
    $('#reader-layout').value=layout;$('#reader-flow').value=flow;$('#reader-wheel-turn').disabled=flow!=='paged';$('#reader-zoom').textContent=`${Math.round(actualScale*100)}%`;
    $('#reader-reading-progress').style.width=`${last/doc.numPages*100}%`;paintMarks();renderList();if(tab==='translation')study.pageChanged();
  }
  function updateMode(){
    if(mode!=='read')study.dismiss();
    $('#reader-mark-color').hidden=mode==='read';host.querySelectorAll('[data-reader-mode]').forEach(button=>{button.classList.toggle('active',button.dataset.readerMode===mode);button.setAttribute('aria-pressed',String(button.dataset.readerMode===mode));});paintMarks();
    if(!host.dataset.rendering)status(mode==='mark'?tr('拖出区域标记，随后可添加文字及详细批注；按住右键随时平移。'):mode==='text'?tr('点击页面放置文字，也可拖出文字框；双击文字可编辑。'):mode==='arrow'?tr('从起点拖到指向位置绘制箭头，可在起点添加简短文字。'):msg`${flow==='vertical'?tr('向下滚动连续阅读'):flow==='horizontal'?tr('向右滚动连续阅读'):tr('逐组翻页')} · ${tr(READER_LAYOUTS[layout])} · 按住右键可拖动页面。`);
  }
  async function ensurePDF(){pdfModule ||= import('./vendor/pdfjs/pdf.js');const module=await pdfModule;module.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.js',import.meta.url).href;return module;}
  function viewportAnchor(){
    const scroll=$('#reader-scroll'),bounds=scroll.getBoundingClientRect(),x=bounds.x+bounds.width/2,y=bounds.y+bounds.height/2;
    const frames=[...host.querySelectorAll('#reader-stage .reader-page')];if(!frames.length)return null;
    const frame=frames.reduce((a,b)=>Math.hypot(a.getBoundingClientRect().x+a.getBoundingClientRect().width/2-x,a.getBoundingClientRect().y+a.getBoundingClientRect().height/2-y)<Math.hypot(b.getBoundingClientRect().x+b.getBoundingClientRect().width/2-x,b.getBoundingClientRect().y+b.getBoundingClientRect().height/2-y)?a:b),r=frame.getBoundingClientRect();
    return{page:Number(frame.dataset.readerPage),x:Math.max(0,Math.min(1,(x-r.x)/r.width)),y:Math.max(0,Math.min(1,(y-r.y)/r.height))};
  }
  function scrollToPoint(anchor){
    if(!anchor)return;const scroll=$('#reader-scroll'),frame=frameFor(anchor.page);if(!frame)return;const bounds=scroll.getBoundingClientRect(),r=frame.getBoundingClientRect();
    scroll.scrollTo({left:Math.max(0,scroll.scrollLeft+r.x+anchor.x*r.width-(bounds.x+bounds.width/2)),top:Math.max(0,scroll.scrollTop+r.y+anchor.y*r.height-(bounds.y+bounds.height/2))});
  }
  async function renderPages({preserve=false,anchor=null,end=false}={}){
    if(!doc)return;
    if(flow!=='paged')return renderContinuous({preserve,anchor});
    continuous?.dispose();continuous=null;continuousKey='';delete $('#reader-scroll').dataset.flow;
    const version=++renderVersion,current=doc,pages=visible(),savedAnchor=anchor||(preserve?viewportAnchor():null),scroll=$('#reader-scroll');
    const loadedPages=await Promise.all(pages.map(number=>current.getPage(number)));if(version!==renderVersion||!host.open)return;
    const sizes=loadedPages.map(pdf=>pdf.getViewport({scale:1})),endBlank=layout!=='single'&&pages.length===1&&doc.numPages>1&&!(layout==='book'&&pages[0]===1);
    actualScale=typeof zoom==='number'?zoom:fitReaderScale(endBlank?[...sizes,sizes[0]]:sizes,Math.max(160,scroll.clientWidth-48),Math.max(160,scroll.clientHeight-92),zoom);
    const density=window.devicePixelRatio||1,viewports=loadedPages.map(pdf=>pdf.getViewport({scale:actualScale})),raster=readerRasterPlan(viewports,density);
    const nextKey=pages.join(',')+'|'+actualScale.toFixed(5)+'|'+density+'|'+raster.map(p=>p.width+'x'+p.height).join(',');
    if(nextKey===renderKey){renderTasks.forEach(task=>task.cancel());textLayers.forEach(layer=>layer.cancel());$('#reader-render-buffer').replaceChildren();delete host.dataset.rendering;$('#reader-stage').setAttribute('aria-busy','false');updateNavigation();updateMode();if(savedAnchor)scrollToPoint(savedAnchor);savePosition();return;}
    renderTasks.forEach(task=>task.cancel());textLayers.forEach(layer=>layer.cancel());renderTasks=[];textLayers=[];
    host.dataset.rendering='true';$('#reader-stage').setAttribute('aria-busy','true');status(tr('正在准备页面，当前内容仍可查看…'));
    const group=document.createElement('div');group.className='reader-spread';group.dataset.pages=pages.join(',');
    const buffer=$('#reader-render-buffer');buffer.replaceChildren(group);
    try{
      const module=await ensurePDF();if(version!==renderVersion)return;
      await Promise.all(loadedPages.map(async(pdf,index)=>{
        const number=pages[index],viewport=viewports[index],frame=document.createElement('div');frame.className='reader-page';frame.dataset.readerPage=String(number);frame.dataset.page=String(number);frame.dataset.rendered='loading';
        frame.style.width=viewport.width+'px';frame.style.height=viewport.height+'px';frame.style.setProperty('--total-scale-factor',String(actualScale*pdf.userUnit));
        frame.innerHTML=html`<canvas aria-label="PDF 第 ${number} 页"></canvas><div class="textLayer"></div><div class="reader-mark-layer"></div><span class="reader-page-label">${number}</span>`;group.append(frame);
        const canvas=frame.querySelector('canvas'),pixels=raster[index];canvas.width=pixels.width;canvas.height=pixels.height;canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
        const task=pdf.render({canvasContext:canvas.getContext('2d'),viewport,transform:[pixels.scaleX,0,0,pixels.scaleY,0,0]});renderTasks.push(task);await task.promise;if(version!==renderVersion)return;
        const layer=new module.TextLayer({textContentSource:pdf.streamTextContent(),container:frame.querySelector('.textLayer'),viewport});textLayers.push(layer);await layer.render();frame.dataset.rendered='true';
      }));
      if(version!==renderVersion||!host.open){group.remove();return;}
      if(endBlank){const blank=document.createElement('div');blank.className='reader-spread-blank';blank.style.width=viewports[0].width+'px';blank.style.height=viewports[0].height+'px';blank.setAttribute('aria-hidden','true');group.append(blank);}
      $('#reader-stage').replaceChildren(group);group.firstElementChild.id='reader-page';group.firstElementChild.querySelector('canvas').id='reader-pdf-canvas';group.firstElementChild.querySelector('.textLayer').id='reader-text-layer';
      renderKey=nextKey;delete host.dataset.rendering;$('#reader-stage').setAttribute('aria-busy','false');updateNavigation();updateMode();
      if(savedAnchor)scrollToPoint(savedAnchor);else scroll.scrollTo({left:0,top:end?scroll.scrollHeight:0});
      turnLockedUntil=performance.now()+380;savePosition();
    }catch(error){if(version===renderVersion){delete host.dataset.rendering;$('#reader-stage').setAttribute('aria-busy','false');if(error.name!=='RenderingCancelledException')status(msg`页面无法显示：${error.message}`);}}
  }
  async function renderContinuous({preserve=false,anchor=null}={}){
    const scroll=$('#reader-scroll'),savedAnchor=anchor||(preserve?viewportAnchor():null);
    const key=[layout,flow,zoom,scroll.clientWidth,scroll.clientHeight,devicePixelRatio].join('|');
    if(continuous&&key===continuousKey){await continuous.go(page);if(savedAnchor)scrollToPoint(savedAnchor);savePosition();return;}
    cancelRender();$('#reader-render-buffer').replaceChildren();renderKey='';const version=renderVersion;
    host.dataset.rendering='true';$('#reader-stage').setAttribute('aria-busy','true');status(tr('正在准备连续阅读…'));
    try{
      const module=await ensurePDF();if(version!==renderVersion||!doc||!host.open)return;
      continuous=createContinuousReader({scroll,stage:$('#reader-stage'),doc,module,layout,flow,zoom,
        onPage:(number,scale)=>{page=number;if(scale)actualScale=scale;updateNavigation();savePosition();},
        onPaint:paintMarks,onError:error=>status(msg`页面无法显示：${error.message}`)});continuousKey=key;
      await continuous.go(page);if(version!==renderVersion)return;
      delete host.dataset.rendering;$('#reader-stage').setAttribute('aria-busy','false');updateMode();
      if(savedAnchor)scrollToPoint(savedAnchor);savePosition();
    }catch(error){if(version===renderVersion){delete host.dataset.rendering;$('#reader-stage').setAttribute('aria-busy','false');status(msg`页面无法显示：${error.message}`);}}
  }
  async function navigate(number,{end=false}={}){if(!doc)return;page=Math.min(doc.numPages,Math.max(1,Math.floor(Number(number)||1)));lastQuote=null;study.dismiss();updateQuoteButton();await renderPages({end});}
  async function turn(direction,{end=false}={}){if(!doc)return;const next=turnReaderPage(page,doc.numPages,layout,direction);if(visible().includes(next))return;await navigate(next,{end});}
  async function screenStep(direction){
    if(flow!=='paged'){const scroll=$('#reader-scroll');scroll.scrollBy({[flow==='horizontal'?'left':'top']:direction*(flow==='horizontal'?scroll.clientWidth:scroll.clientHeight)*.86,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});return;}
    const scroll=$('#reader-scroll'),bottom=scroll.scrollHeight-scroll.clientHeight;
    if(direction>0&&scroll.scrollTop<bottom-4)scroll.scrollBy({top:scroll.clientHeight*.86,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    else if(direction<0&&scroll.scrollTop>4)scroll.scrollBy({top:-scroll.clientHeight*.86,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    else await turn(direction,{end:direction<0});
  }
  async function chooseNote(id,{reveal=true,locate=true,focus=true}={}){
    const ticket=session;if(!await prepareSwitch()||ticket!==session)return;
    const stored=draftRows.find(row=>row.paperId===paper.id&&row.note.id===id),existing=notes().find(note=>note.id===id);if(!stored&&!existing)return;
    let restoreMessage='';draft=structuredClone(stored?.note||existing);baseUpdatedAt=stored?.baseUpdatedAt??existing?.updatedAt??0;dirty=Boolean(stored);selected=id;editVersion++;draftSavedVersion=dirty?editVersion:-1;
    if(stored&&existing&&existing.updatedAt>stored.baseUpdatedAt&&!sameReaderNote(existing,stored.note)){
      draftRows=draftRows.filter(row=>!(row.paperId===paper.id&&row.note.id===id));draft.id=empty().id;baseUpdatedAt=0;selected='';draftSavedVersion=-1;restoreMessage=tr('原笔记已更新，旧草稿恢复为新笔记，避免覆盖。');changed();
    }
    mode='read';inlineOpen=false;if(reveal){await ensureSidebar();updateTab('edit');}renderEditor();editorStatus(restoreMessage||(dirty?tr('已恢复本地草稿 · Ctrl+S 正式保存'):tr('编辑笔记 · Ctrl+S 保存')),dirty?'draft':'');renderList();updateMode();
    if(locate&&draft.anchor&&anchorMatchesPaper(draft.anchor,paper)&&doc&&draft.anchor.page<=doc.numPages){page=draft.anchor.page;await renderPages({anchor:{page,x:draft.anchor.rect.x+draft.anchor.rect.width/2,y:draft.anchor.rect.y+draft.anchor.rect.height/2}});}
    if(focus)$('#reader-note-body').focus({preventScroll:true});return true;
  }
  async function newNote(){const ticket=session;if(!await prepareSwitch()||ticket!==session)return;draft=empty();dirty=false;selected='';baseUpdatedAt=0;editVersion++;draftSavedVersion=-1;mode='read';await ensureSidebar();updateTab('edit');renderEditor();editorStatus(tr('新笔记 · 编辑后自动保存本地草稿'));renderList();updateMode();$('#reader-note-body').focus({preventScroll:true});}
  async function addTextMark(value){
    const ticket=session;
    if(busy||!doc||value.paperId!==paper.id||value.fingerprint!==(paper.fingerprint||''))throw Error(tr('请先选择同一页中的文字。'));
    const anchor=textMarkAnchor(value);
    if(!await prepareSwitch()||ticket!==session)return false;
    const note={...empty(),body:value.text.slice(0,30000),anchor,updatedAt:Date.now()},paperId=paper.id;
    busy=true;
    try{await config.saveNote(paperId,note);}finally{busy=false;}
    if(ticket!==session)return false;
    textMarkHistory.push(structuredClone(note));textMarkHistory=textMarkHistory.slice(-30);
    await chooseNote(note.id,{reveal:false,locate:false,focus:false});
    getSelection()?.removeAllRanges();$('#reader-scroll').focus({preventScroll:true});
    status(tr('文字标记已保存 · Ctrl+Z 撤销本次标记'));return true;
  }
  async function undoTextMark(){
    const note=textMarkHistory.at(-1),current=note&&notes().find(row=>row.id===note.id);
    if(!note||busy)return;
    if(!current){textMarkHistory.pop();return;}
    if(!sameReaderNote(note,current)||draft.id===note.id&&dirty){config.toast(tr('此标记已有后续修改，请通过批注工具删除。'));return;}
    busy=true;
    try{await config.deleteNote(paper.id,note.id);textMarkHistory.pop();if(draft.id===note.id)await discardDraft(note.id);paintMarks();renderList();status(tr('已撤销文字标记'));}finally{busy=false;}
  }
  async function addTranslationAnnotation(value){
    const ticket=session;
    if(!host.open||!doc||value.paperId!==paper.id||value.fingerprint!==(paper.fingerprint||'')||value.page>doc.numPages)throw new Error(tr('选文对应的文献已切换，请重新划词翻译。'));
    const content=translationAnnotation(value);
    if(!await prepareSwitch()||ticket!==session)throw new Error(tr('当前草稿尚未保存，请先保存后再添加译文批注。'));
    const paperId=paper.id,note={...empty(),...content,...(/^note-[a-f\d-]{36}$/i.test(value.annotationId||'')?{id:value.annotationId}:{}),updatedAt:Date.now()};busy=true;
    try{await config.saveNote(paperId,note);}finally{busy=false;}
    if(ticket===session){paintMarks();await chooseNote(note.id,{focus:false});config.toast(tr('译文已保存为页内批注，可拖动、调整大小或继续编辑。'));}
    return note.id;
  }
  async function discardDraft(id=draft.id){
    const next=draftRows.filter(row=>!(row.paperId===paper.id&&row.note.id===id));await persistDraftRows(next);
    if(draft.id===id){clearTimeout(draftTimer);dirty=false;draft=empty();selected='';baseUpdatedAt=0;editVersion++;draftSavedVersion=-1;renderEditor();editorStatus(tr('已丢弃草稿'));paintMarks();}
    renderList();
  }
  async function saveNote(andNew=false){
    if(busy||imageBusy)return;draft.body=$('#reader-note-body').value;
    if(draft.anchor?.kind==='text'&&!draft.anchor.label?.trim()){openInlineEditor();$('#reader-inline-editor').dataset.error='true';$('#reader-inline-editor>p').textContent=tr('请先填写文献上的标注文字，再保存。');editorStatus(tr('请先填写文献上的标注文字'),'error');return;}
    if(!readerNoteContent(draft)){editorStatus(tr('请添加文字、图片或页面标记'),'error');return;}
    busy=true;clearTimeout(draftTimer);const version=editVersion,note={...structuredClone(draft),body:draft.body.trim(),updatedAt:Date.now()},paperId=paper.id;
    $('#reader-save-note').disabled=true;$('#reader-save-next').disabled=true;editorStatus(tr('正在保存笔记…'),'saving');
    try{
      await config.saveNote(paperId,note);draftRows=draftRows.filter(row=>!(row.paperId===paperId&&row.note.id===note.id));
      let cleared=true;try{await persistDraftRows(draftRows);}catch{cleared=false;}
      baseUpdatedAt=note.updatedAt;selected=note.id;
      if(version===editVersion&&draft.id===note.id){dirty=false;draft={...structuredClone(note),body:$('#reader-note-body').value};draftSavedVersion=-1;updateEditorMeta();$('#reader-save-note').textContent=tr('保存修改');editorStatus(cleared?tr('已保存到文献笔记'):tr('笔记已保存，草稿清理稍后重试'),'saved');}
      else changed();
      mode='read';updateMode();renderList();paintMarks();
      if(andNew&&version===editVersion){draft=empty();selected='';dirty=false;baseUpdatedAt=0;editVersion++;renderEditor();editorStatus(tr('上一条已保存，可继续新建'));$('#reader-note-body').focus();}
    }catch(error){editorStatus(tr('笔记未保存，内容仍在编辑区'),'error');config.toast(error.message,true);}
    finally{busy=false;$('#reader-save-note').disabled=false;$('#reader-save-next').disabled=false;}
  }
  async function addImages(files){
    if(!files.length||imageBusy)return;imageBusy=true;editorStatus(tr('正在处理图片…'),'saving');
    try{draft.attachments=await compressNoteImages(files,draft.attachments||[]);changed();$('#reader-draft-images').innerHTML=noteImagesHTML(draft.attachments,esc,true);}finally{imageBusy=false;}
  }
  function updateQuoteButton(){const button=$('#reader-quote');if(button)button.disabled=!lastQuote;}
  async function quoteSelection(){
    if(!lastQuote)return;await ensureSidebar();updateTab('edit');const text=$('#reader-note-body'),selection=msg`摘录（第 ${lastQuote.page} 页）：\n${lastQuote.text}\n\n`;
    text.setRangeText(selection,text.selectionStart,text.selectionEnd,'end');draft.body=text.value.slice(0,40000);text.value=draft.body;changed();text.focus();
  }
  function buildUI(){
    host.className='pdf-reader reader-v2';host.innerHTML=html`
      <header class="reader-header"><div><span>PDF READER · 阅读与研究记录</span><h2 title="${esc(paper.title)}">${esc(paper.title)}</h2></div><button id="reader-sidebar-toggle" data-reader-action="sidebar" class="outline-button" aria-expanded="true">收起笔记</button><button data-reader-action="close" class="icon-button" aria-label="关闭阅读器" title="关闭阅读器">${icon('close')}</button></header>
      <div class="reader-toolbar"><div class="reader-mode" role="group" aria-label="阅读与标注工具">${[['read','cursor',tr('选字'),tr('V · 阅读与选择文字')],['mark','area',tr('区域'),tr('R · 区域标记')],['text','text',tr('文字'),tr('T · 添加页内文字')],['arrow','arrow-diagonal',tr('箭头'),tr('A · 绘制箭头')]].map(([id,name,label,title])=>`<button data-reader-mode="${id}" aria-pressed="${id==='read'}" title="${title}" aria-label="${title}">${icon(name)}<span class="tool-label">${label}</span></button>`).join('')}<button data-reader-text-mark="highlight" title="选择文字后按 H 高亮">${icon('edit')}<span class="tool-label">高亮</span></button><button data-reader-text-mark="underline" title="选择文字后按 U 添加下划线"><span class="reader-underline-icon" aria-hidden="true">U</span><span class="tool-label">下划线</span></button><select id="reader-mark-color" aria-label="标记颜色" hidden>${Object.keys(MARK_COLORS).map((key,i)=>`<option value="${key}">${[tr('暖黄'),tr('青绿'),tr('海蓝'),tr('玫瑰')][i]}</option>`).join('')}</select></div><div class="reader-view-options"><button data-reader-action="focus" title="专注阅读 · F" aria-label="专注阅读">${icon('expand')}</button><select id="reader-flow" aria-label="连续阅读方向"><option value="vertical">向下连续</option><option value="horizontal">向右连续</option><option value="paged">逐组翻页</option></select><select id="reader-layout" aria-label="页面排列方式">${Object.entries(READER_LAYOUTS).map(([id,name])=>`<option value="${id}">${tr(name)}</option>`).join('')}</select><button data-reader-action="zoom-out" aria-label="缩小页面" title="缩小页面">${icon('minus')}</button>${actionMenu('reader-view-menu',tr('缩放与打开方式'),tr('<button type="button" data-reader-action="undo-text-mark">撤销文字标记 · Ctrl+Z</button><hr><button type="button" data-reader-action="fit">适合页面宽度</button><button type="button" data-reader-action="fit-page">显示完整页面</button><hr><button type="button" data-reader-action="external">',false)+icon('external')+tr('在系统阅读器打开</button>',false),{labelHTML:tr('<span id="reader-zoom">适宽</span>',false)+icon('chevron-down')})}<button data-reader-action="zoom-in" aria-label="放大页面" title="放大页面">${icon('plus')}</button></div></div>
      <div class="reader-workspace"><section class="reader-document"><button class="reader-focus-exit" data-reader-action="focus">退出专注 · F</button><div class="reader-status-row"><span id="reader-status" role="status">正在加载本地 PDF…</span><span id="reader-visible-pages"></span></div><div id="reader-password" hidden></div><div id="reader-scroll" tabindex="0" aria-label="PDF 页面阅读区域"><div class="reader-page-margin"><div id="reader-stage" aria-busy="true"></div></div></div><div id="reader-render-buffer" aria-hidden="true"></div><div id="reader-annotation-tools" class="reader-annotation-tools" hidden><span id="reader-annotation-kind"></span><div class="reader-color-swatches" role="group" aria-label="标记颜色">${Object.entries(MARK_COLORS).map(([key,value],i)=>`<button data-annotation-color="${key}" style="--swatch:${value}" aria-label="${[tr('暖黄'),tr('青绿'),tr('海蓝'),tr('玫瑰')][i]}" aria-pressed="false"></button>`).join('')}</div><button data-annotation-action="caption">编辑文字</button><button id="reader-annotation-detail" data-annotation-action="detail">添加详细批注</button><button id="reader-annotation-save" data-annotation-action="save" hidden>保存</button><button data-annotation-action="delete" title="删除此标注及其文字、图片批注">删除</button></div><section id="reader-inline-editor" class="reader-inline-editor" aria-label="编辑文献上的标注文字" hidden><header><strong>写在文献上的文字</strong><button data-annotation-action="close-inline" aria-label="收起标注文字编辑" title="收起标注文字编辑">${icon('close')}</button></header><textarea id="reader-inline-label" maxlength="500" rows="3" placeholder="简短结论、疑问或提示…" aria-label="页内标注文字"></textarea><div class="reader-inline-options"><label>字号 <input id="reader-inline-font" type="number" min="10" max="32" value="14" aria-label="页内文字字号"></label><select id="reader-inline-color" aria-label="页内标注颜色">${Object.keys(MARK_COLORS).map((key,i)=>`<option value="${key}">${[tr('暖黄'),tr('青绿'),tr('海蓝'),tr('玫瑰')][i]}</option>`).join('')}</select><small id="reader-inline-length">0 / 500</small></div><footer><button data-annotation-action="detail">继续写详细批注</button><button class="primary" data-annotation-action="save-inline">保存标注</button></footer><p>文字框可拖动、缩放；箭头可拖动端点。Ctrl+Enter 保存。</p></section><nav class="reader-bottom-nav" aria-label="阅读进度与翻页"><button id="reader-prev" data-reader-action="prev" aria-label="上一页或上一组" title="上一组 · ←">${icon('chevron-left')}</button><div class="reader-pagination"><label for="reader-page-number">页码</label><input id="reader-page-number" type="number" min="1" value="1" aria-label="跳转到页码"><span id="reader-page-total">/ …</span></div><input id="reader-page-progress" type="range" min="1" max="1" value="1" aria-label="拖动跳转到页码"><button id="reader-next" data-reader-action="next" aria-label="下一页或下一组" title="下一组 · →">${icon('chevron-right')}</button><details class="reader-turn-options"><summary title="翻页设置" aria-label="翻页设置">${icon('settings')}</summary><label><input id="reader-wheel-turn" type="checkbox">滚轮到边界后翻页</label><small>左右键翻一页 / 一组<br>空格、PageDown 阅读下一屏<br>Shift+空格、PageUp 返回上一屏</small></details></nav><div class="reader-progress-track"><i id="reader-reading-progress"></i></div></section>
      <div class="reader-sidebar-resizer" role="separator" tabindex="0" aria-label="调整阅读侧栏宽度，左右方向键微调" aria-orientation="vertical"></div><aside class="reader-sidebar" aria-label="批注与文献笔记"><div class="reader-sidebar-heading"><strong>阅读工作台</strong><button data-reader-action="new-note" title="新建整篇文献笔记">${icon('plus')}新笔记</button></div><div class="reader-note-tabs" role="tablist"><button data-reader-tab="list" id="reader-tab-list" role="tab">笔记列表 <span id="reader-list-tab-count">0</span></button><button data-reader-tab="edit" id="reader-tab-edit" role="tab">编辑批注</button><button data-reader-tab="translation" id="reader-tab-translation" role="tab">译文</button><button data-reader-tab="vocabulary" id="reader-tab-vocabulary" role="tab">生词</button></div>${readerStudyHTML()}
      <section id="reader-editor-panel"><form id="reader-composer"><div class="reader-editor-heading"><strong id="reader-editor-context"></strong><span id="reader-note-length"></span></div><div class="reader-editor-format"><button type="button" id="reader-quote" data-reader-action="quote" disabled>摘录选文</button><button type="button" data-reader-action="add-images" title="添加图片，也可直接粘贴">${icon('image')}图片</button>${actionMenu('reader-note-menu',tr('笔记操作'),tr('<button type="button" id="reader-save-next" data-reader-action="save-next">保存并新建笔记</button><hr><button type="button" id="reader-relocate" data-reader-action="relocate" hidden>为当前批注重新框选</button><button type="button" id="reader-detach" data-reader-action="detach" hidden>改为整篇文献笔记</button><hr><button type="button" class="danger" data-reader-action="discard">丢弃当前草稿</button>'),{iconOnly:true,className:'icon-button'})}</div><label id="reader-caption-field" class="reader-caption-field" hidden><span>文献上的标注文字</span><textarea id="reader-caption-text" rows="2" maxlength="500" placeholder="简短标注显示在文献页面上" aria-label="页内文字内容"></textarea></label><label id="reader-body-label" class="reader-body-label" for="reader-note-body">文献笔记正文</label><textarea id="reader-note-body" maxlength="40000" placeholder="记录你的理解、对比与问题…\n可粘贴图片，使用 [[文献标题]] 或 [[#标签]] 建立链接。" aria-label="批注文字"></textarea><div id="reader-draft-images"></div><div class="reader-editor-footer"><span id="reader-dirty" role="status"></span><div><button type="submit" class="primary" id="reader-save-note" title="Ctrl / Command + S">保存笔记</button></div><small>停止输入后自动保存本地草稿，正式保存后才计入文献笔记和完整备份。</small></div></form></section>
      <input id="reader-image-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" multiple hidden><section id="reader-list-panel"><div id="reader-pending-drafts"></div><div class="reader-note-filters"><strong id="reader-note-count"></strong><select id="reader-note-filter" aria-label="笔记范围"><option value="all">全部笔记</option><option value="page">当前视野标记</option><option value="paper">整篇笔记</option></select></div><input id="reader-note-query" type="search" placeholder="搜索文字或图片名称…" aria-label="搜索这篇文献的批注"><div id="reader-note-list"></div></section><div class="reader-draft-summary" id="reader-draft-count"></div></aside></div>`;
    updateSidebar();updateTab(tab);renderEditor();editorStatus(tr('新笔记 · 停止输入后保存草稿'));renderList();
  }
  async function open(id,noteId=''){
    const opening=session;if(host.open&&!await prepareSwitch()||opening!==session)return;const next=config.getPaper(id);if(!next)return;
    if(doc)await savePosition(true);dispose();const ticket=session;paper=next;page=1;zoom='fit';layout='single';flow='vertical';sidebarOpen=true;sidebarWidth=338;wheelTurn=false;mode='read';draft=empty();dirty=false;selected='';filter='all';query='';tab='list';baseUpdatedAt=0;editVersion++;draftSavedVersion=-1;config.beforeOpen();buildUI();if(!host.open)host.showModal();
    try{
      const [position,storedDrafts]=await Promise.all([config.getPosition(),config.getDrafts()]);if(ticket!==session)return;
      preferences=cleanReaderState(position);draftRows=cleanReaderDrafts(storedDrafts||[]);const previous=preferences[paper.id];if(previous){page=previous.page;zoom=previous.flow?previous.zoom:'page';layout=previous.layout||'single';flow=previous.flow||'vertical';sidebarOpen=previous.sidebarOpen??true;sidebarWidth=previous.sidebarWidth||338;wheelTurn=previous.wheelTurn||false;}
      updateSidebar();$('#reader-wheel-turn').checked=wheelTurn;renderList();
      const bytes=await config.readPDF(paper);if(ticket!==session)return;const module=await ensurePDF();if(ticket!==session)return;
      loading=module.getDocument({data:new Uint8Array(bytes),cMapUrl:new URL('./vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('./vendor/pdfjs/standard_fonts/',import.meta.url).href,wasmUrl:new URL('./vendor/pdfjs/wasm/',import.meta.url).href,iccUrl:new URL('./vendor/pdfjs/iccs/',import.meta.url).href,useWorkerFetch:false,isEvalSupported:false,enableXfa:false,maxImageSize:32000000});
      loading.onPassword=(update,reason)=>{if(ticket!==session)return;const el=$('#reader-password');el.hidden=false;el.innerHTML=html`<form><p>${reason===2?tr('密码不正确，请重新填写。'):tr('这份 PDF 需要密码。')}</p><input type="password" aria-label="PDF 密码" required><button class="primary">解锁 PDF</button></form>`;el.querySelector('form').onsubmit=event=>{event.preventDefault();update(el.querySelector('input').value);el.hidden=true;};};
      const loaded=await loading.promise;if(ticket!==session){await loaded.destroy();return;}doc=loaded;page=Math.min(page,doc.numPages);await renderPages();if(config.translationStatus)study.initialize();if(noteId)await chooseNote(noteId);else $('#reader-scroll').focus({preventScroll:true});
    }catch(error){if(ticket===session)status(msg`PDF 无法加载：${error.message}。可使用系统阅读器，笔记仍保留。`);}
  }
  host.addEventListener('submit',event=>{if(event.target.id==='reader-composer'){event.preventDefault();saveNote();}});
  host.addEventListener('input',event=>{
    if(event.target.id==='reader-note-body'){draft.body=event.target.value;changed();}
    if(['reader-inline-label','reader-caption-text'].includes(event.target.id)&&draft.anchor){
      draft.anchor.label=event.target.value;changed();
      delete $('#reader-inline-editor').dataset.error;$('#reader-inline-editor>p').textContent=tr('文字框可拖动、缩放；箭头可拖动端点。Ctrl+Enter 保存。');
      if(event.target.id==='reader-inline-label')$('#reader-caption-text').value=event.target.value;
      else $('#reader-inline-label').value=event.target.value;
      $('#reader-inline-length').textContent=`${event.target.value.length} / 500`;paintMarks();
    }
    if(event.target.id==='reader-note-query'){query=event.target.value;renderList();}
    if(event.target.id==='reader-page-progress')$('#reader-visible-pages').textContent=msg`松开跳转至第 ${event.target.value} 页`;
  });
  host.addEventListener('change',async event=>{try{
    const id=event.target.id;
    if(id==='reader-image-input'){const files=[...event.target.files];event.target.value='';await addImages(files);}
    if(id==='reader-note-filter'){filter=event.target.value;renderList();}
    if(id==='reader-mark-color'){color=event.target.value;if(draft.anchor&&draft.anchor.color!==color){draft.anchor.color=color;changed();paintMarks();}}
    if(id==='reader-inline-color'&&draft.anchor){color=event.target.value;$('#reader-mark-color').value=color;if(draft.anchor.color!==color){draft.anchor.color=color;changed();paintMarks();}}
    if(id==='reader-inline-font'&&draft.anchor){const size=Math.max(10,Math.min(32,Number(event.target.value)||14));event.target.value=size;if(draft.anchor.fontSize!==size){draft.anchor.fontSize=size;changed();paintMarks();}}
    if(id==='reader-page-number'||id==='reader-page-progress')await navigate(event.target.value);
    if(id==='reader-wheel-turn'){wheelTurn=event.target.checked;savePosition();}
    if(id==='reader-flow'){flow=event.target.value;await renderPages();savePosition();}
    if(id==='reader-layout'){
      layout=event.target.value;if(layout!=='single'){sidebarOpen=false;zoom=flow!=='paged'||layout==='book'?'page':'fit';}updateSidebar();await renderPages();savePosition();
    }
  }catch(error){config.toast(error.message,true);}});
  host.addEventListener('paste',event=>{if(!['reader-note-body','reader-inline-label','reader-caption-text'].includes(event.target.id))return;const files=[...(event.clipboardData?.files||[])].filter(file=>file.type.startsWith('image/'));if(files.length){event.preventDefault();Promise.resolve(event.target.id==='reader-note-body'?null:showAnnotationDetails()).then(()=>addImages(files)).catch(error=>config.toast(error.message,true));}});
  host.addEventListener('click',async event=>{
    event.stopPropagation();const button=event.target.closest('button,a,[data-reader-mark]');if(!button){if(mode==='read'&&event.target.closest('#reader-scroll')&&performance.now()>suppressPageClick){selected='';inlineOpen=false;paintMarks();}return;}
    try{
      if(button.dataset.annotationColor&&draft.anchor){color=button.dataset.annotationColor;draft.anchor.color=color;changed();paintMarks();if(isTextMark(draft.anchor))await saveNote();return;}
      if(button.dataset.readerTextMark){await study.markSelection(button.dataset.readerTextMark);return;}
      if(button.dataset.annotationAction){
        const action=button.dataset.annotationAction;
        if(action==='caption')openInlineEditor();
        if(action==='detail')await showAnnotationDetails();
        if(action==='close-inline'){inlineOpen=false;positionAnnotationTools();}
        if(action==='save'||action==='save-inline'){await saveNote();if(!dirty){inlineOpen=false;positionAnnotationTools();}}
        if(action==='delete'){
          if(!button.dataset.confirmed){button.dataset.confirmed='true';button.textContent=tr('再点删除');return;}
          const id=draft.id;if(notes().some(note=>note.id===id))await config.deleteNote(paper.id,id);inlineOpen=false;await discardDraft(id);paintMarks();
        }
        return;
      }
      if(button.dataset.readerImage){event.preventDefault();const image=[...(draft.attachments||[]),...notes().flatMap(note=>note.attachments||[])].find(image=>image.id===button.dataset.readerImage);if(image)openNoteImage(image);return;}
      if(button.dataset.linkPaper||button.dataset.linkTag){if(!await prepareSwitch())return;if(button.dataset.linkPaper)await open(button.dataset.linkPaper);else{await close();config.openTag(button.dataset.linkTag);}return;}
      if(button.dataset.readerEdit||button.dataset.readerResume){await chooseNote(button.dataset.readerEdit||button.dataset.readerResume);return;}
      if(button.dataset.readerDiscard){await discardDraft(button.dataset.readerDiscard);return;}
      if(button.dataset.readerMark&&mode==='read'){if(performance.now()<Number(suppressAnnotationClick))return;await selectAnnotation(button.dataset.readerMark);return;}
      if(button.dataset.readerTab){updateTab(button.dataset.readerTab);return;}
      if(button.dataset.readerFocus){page=Number(button.dataset.readerFocus);updateNavigation();savePosition();return;}
      if(button.dataset.readerRemoveImage){draft.attachments=draft.attachments.filter(image=>image.id!==button.dataset.readerRemoveImage);changed();$('#reader-draft-images').innerHTML=noteImagesHTML(draft.attachments,esc,true);return;}
      if(button.dataset.readerDelete){
        if(!await prepareSwitch())return;if(!button.dataset.confirmed){button.dataset.confirmed='true';button.textContent=tr('再点一次删除');return;}
        await config.deleteNote(paper.id,button.dataset.readerDelete);await discardDraft(button.dataset.readerDelete);renderList();paintMarks();return;
      }
      if(button.dataset.readerMode){
        if(button.dataset.readerMode==='read'){mode='read';relocating=false;updateMode();}else await activateTool(button.dataset.readerMode);return;
      }
      const action=button.dataset.readerAction;
      if(action==='undo-text-mark')await undoTextMark();
      if(action==='close')await close();if(action==='external')await config.openExternal(paper);
      if(action==='focus'){const anchor=viewportAnchor();host.classList.toggle('reader-focus');await renderPages({anchor});}
      if(action==='sidebar'){const anchor=viewportAnchor();sidebarOpen=!sidebarOpen;updateSidebar();if(doc&&typeof zoom==='string')await renderPages({anchor});savePosition();}
      if(action==='new-note')await newNote();
      if(action==='discard')await discardDraft();
      if(action==='save-next')await saveNote(true);
      if(action==='quote')await quoteSelection();
      if(action==='detach')await detachAnnotation();
      if(action==='relocate'){await activateTool(draft.anchor?.kind==='arrow'?'arrow':draft.anchor?.kind==='text'?'text':'mark',true);status(tr('为当前标注重新定位，文字和详细批注保留。'));}
      if(action==='add-images')$('#reader-image-input').click();
      if(action==='prev')await turn(-1);if(action==='next')await turn(1);
      if(['zoom-in','zoom-out','fit','fit-page'].includes(action)&&doc){const anchor=viewportAnchor();zoom=action==='fit'?'fit':action==='fit-page'?'page':Math.min(3,Math.max(.4,actualScale*(action==='zoom-in'?1.2:1/1.2)));await renderPages({anchor:typeof zoom==='number'?anchor:null});}
    }catch(error){config.toast(error.message,true);}
  });
  function point(event,frame){const r=frame.getBoundingClientRect();return{x:(event.clientX-r.left)/r.width,y:(event.clientY-r.top)/r.height};}
  let resizeDrag=null;
  host.addEventListener('pointerdown',event=>{
    const scroll=event.target.closest('#reader-scroll');
    if(event.button===2&&scroll&&!drag&&!transformDrag){event.preventDefault();pan={pointer:event.pointerId,x:event.clientX,y:event.clientY,left:scroll.scrollLeft,top:scroll.scrollTop};scroll.setPointerCapture(event.pointerId);host.classList.add('reader-panning');return;}
    if(event.button!==0)return;
    const separator=event.target.closest('.reader-sidebar-resizer');if(separator){event.preventDefault();resizeDrag={pointer:event.pointerId,start:event.clientX,width:sidebarWidth};separator.setPointerCapture(event.pointerId);return;}
    const frame=event.target.closest('#reader-stage .reader-page');if(!doc||host.dataset.rendering||!frame)return;
    const annotation=event.target.closest('[data-reader-mark]');
    if(mode==='read'&&annotation&&annotation.dataset.readerMark===draft.id&&draft.anchor&&!isTextMark(draft.anchor)&&!busy){event.preventDefault();transformDrag={pointer:event.pointerId,frame,start:point(event,frame),anchor:structuredClone(draft.anchor),handle:annotation.dataset.annotationHandle||annotation.dataset.annotationDrag||'move',moved:false,wasDirty:dirty};frame.setPointerCapture(event.pointerId);return;}
    if(mode==='read'){selectingText=!annotation;return;}event.preventDefault();drag={start:point(event,frame),pointer:event.pointerId,frame,page:Number(frame.dataset.readerPage),tool:mode};frame.setPointerCapture(event.pointerId);
  });
  host.addEventListener('pointermove',event=>{
    if(pan&&event.pointerId===pan.pointer){const scroll=$('#reader-scroll');scroll.scrollLeft=pan.left+pan.x-event.clientX;scroll.scrollTop=pan.top+pan.y-event.clientY;positionAnnotationTools();return;}
    if(resizeDrag&&event.pointerId===resizeDrag.pointer){sidebarWidth=Math.max(270,Math.min(520,host.clientWidth*.48,resizeDrag.width+resizeDrag.start-event.clientX));updateSidebar();return;}
    if(transformDrag&&event.pointerId===transformDrag.pointer){const p=point(event,transformDrag.frame),dx=p.x-transformDrag.start.x,dy=p.y-transformDrag.start.y;if(!transformDrag.moved&&Math.hypot(dx*transformDrag.frame.offsetWidth,dy*transformDrag.frame.offsetHeight)<4)return;transformDrag.moved=true;dirty=true;draft.anchor=transformAnnotation(transformDrag.anchor,dx,dy,transformDrag.handle);paintMarks();return;}
    if(!drag||drag.pointer!==event.pointerId)return;const anchor=gestureAnnotation(drag.tool,drag.page,drag.start,point(event,drag.frame),color,paper.fingerprint||'');drag.frame.querySelector('.reader-mark-layer').innerHTML=notes().filter(note=>note.anchor?.page===drag.page&&anchorMatchesPaper(note.anchor,paper)&&note.id!==draft.id).map(note=>markerHTML(note.anchor,note.id)).join('')+markerHTML(anchor,draft.id,true);
  });
  host.addEventListener('pointerup',async event=>{
    if(selectingText){selectingText=false;clearTimeout(selectionTimer);selectionTimer=setTimeout(captureSelection,100);}
    if(pan&&event.pointerId===pan.pointer){pan=null;suppressContextMenu=performance.now()+400;host.classList.remove('reader-panning');return;}
    if(resizeDrag&&event.pointerId===resizeDrag.pointer){resizeDrag=null;if(doc&&typeof zoom==='string')await renderPages({preserve:true});savePosition();return;}
    if(transformDrag&&event.pointerId===transformDrag.pointer){const moved=transformDrag.moved;transformDrag=null;suppressPageClick=performance.now()+220;if(moved){suppressAnnotationClick=performance.now()+180;lastAnnotationTap={id:'',time:0};changed();renderEditor();paintMarks();}else if(lastAnnotationTap.id===draft.id&&performance.now()-lastAnnotationTap.time<380){lastAnnotationTap={id:'',time:0};openInlineEditor();}else lastAnnotationTap={id:draft.id,time:performance.now()};return;}
    if(!drag||drag.pointer!==event.pointerId)return;const gesture=drag,previous=draft.anchor;drag=null;
    draft.anchor=gestureAnnotation(gesture.tool,gesture.page,gesture.start,point(event,gesture.frame),color,paper.fingerprint||'');
    if(relocating&&previous){draft.anchor.label=previous.label||'';if(previous.fontSize)draft.anchor.fontSize=previous.fontSize;}relocating=false;
    page=gesture.page;selected=draft.id;suppressPageClick=performance.now()+220;changed();mode='read';renderEditor();updateMode();paintMarks();
    if(gesture.tool==='mark'){await ensureSidebar();updateTab('edit');renderEditor();paintMarks();$('#reader-note-body').focus({preventScroll:true});}else openInlineEditor();
  });
  host.addEventListener('pointercancel',()=>{selectingText=false;clearTimeout(selectionTimer);if(transformDrag){draft.anchor=transformDrag.anchor;dirty=transformDrag.wasDirty;}drag=null;resizeDrag=null;pan=null;transformDrag=null;host.classList.remove('reader-panning');paintMarks();});
  host.addEventListener('contextmenu',event=>{if(pan||performance.now()<suppressContextMenu||event.target.closest('#reader-scroll'))event.preventDefault();});
  host.addEventListener('dblclick',event=>{const mark=event.target.closest('[data-reader-mark]');if(mark&&mode==='read'){event.preventDefault();selectAnnotation(mark.dataset.readerMark,true);}});
  host.addEventListener('scroll',event=>{if(event.target.id==='reader-scroll')positionAnnotationTools();},true);
  host.addEventListener('cancel',event=>{event.preventDefault();if($('#reader-selection-translation')){study.dismiss();return;}if(inlineOpen){inlineOpen=false;positionAnnotationTools();}else if(mode!=='read'){mode='read';updateMode();}else if(selected){selected='';paintMarks();}else close();});host.addEventListener('close',()=>{if(!host.open)dispose();});
  new ResizeObserver(()=>{if(host.open&&doc&&typeof zoom==='string'){clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>renderPages({preserve:true}).catch(error=>status(error.message)),160);}}).observe(host);
  let densityQuery,densityValue;
  function watchDensity(){densityQuery?.removeEventListener('change',densityChanged);densityValue=window.devicePixelRatio||1;densityQuery=matchMedia(`(resolution: ${densityValue}dppx)`);densityQuery.addEventListener('change',densityChanged);}
  function densityChanged(){if(densityValue===(window.devicePixelRatio||1))return;watchDensity();if(host.open&&doc){clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>renderPages({preserve:true}).catch(error=>status(error.message)),100);}}
  window.addEventListener('resize',densityChanged);window.addEventListener('focus',densityChanged);document.addEventListener('visibilitychange',densityChanged);
  watchDensity();
  function captureSelection(){
    if(!host.open||selectingText)return;
    const selection=getSelection(),node=selection?.anchorNode,element=node?.nodeType===Node.ELEMENT_NODE?node:node?.parentElement,frame=element?.closest('#reader-stage .reader-page');
    if(frame&&!selection.isCollapsed&&element.closest('.textLayer')&&selection.rangeCount){
      lastQuote={page:Number(frame.dataset.readerPage),text:selection.toString().trim().slice(0,30000)};updateQuoteButton();
      const endNode=selection.focusNode,endElement=endNode?.nodeType===Node.ELEMENT_NODE?endNode:endNode?.parentElement;
      if(mode==='read'&&endElement?.closest('#reader-stage .reader-page')===frame){
        const range=selection.getRangeAt(0),rect=range.getBoundingClientRect(),bounds=frame.getBoundingClientRect();
        const rects=selectionFragments([...range.getClientRects()],bounds);if(!rects.length)return;
        const anchor=textMarkAnchor({page:lastQuote.page,rects});
        study.selectionChanged({page:lastQuote.page,text:lastQuote.text,quote:element.textContent.slice(0,1200),rects,selectionRect:anchor.rect,pageAspect:bounds.height/bounds.width,rect:{left:rect.left,top:rect.top,bottom:rect.bottom}});
      }else study.selectionChanged(null);
    }else if(!element?.closest('#reader-selection-translation')&&!document.activeElement?.closest('#reader-selection-translation'))study.selectionChanged(null);
  }
  document.addEventListener('selectionchange',()=>{clearTimeout(selectionTimer);if(!selectingText)selectionTimer=setTimeout(captureSelection,120);});
  host.addEventListener('pointerdown',event=>{if(event.target.closest('[data-reader-text-mark],.selection-mark-tools'))event.preventDefault();});
  host.addEventListener('wheel',event=>{
    const scroll=event.target.closest('#reader-scroll');if(!scroll||!doc)return;
    if(pan)return;
    if(event.ctrlKey){event.preventDefault();clearTimeout(resizeTimer);const anchor=viewportAnchor();zoom=Math.max(.4,Math.min(3,(typeof zoom==='number'?zoom:actualScale)*(event.deltaY<0?1.1:1/1.1)));resizeTimer=setTimeout(()=>renderPages({anchor}),70);return;}
    if(flow!=='paged'){if(flow==='horizontal'&&Math.abs(event.deltaY)>Math.abs(event.deltaX)&&!event.shiftKey){event.preventDefault();scroll.scrollLeft+=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?scroll.clientWidth:1);}return;}
    if(!wheelTurn||mode!=='read'||host.dataset.rendering||!getSelection().isCollapsed||performance.now()<turnLockedUntil||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
    const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?scroll.clientHeight:1),direction=Math.sign(delta),atEdge=direction>0?scroll.scrollTop+scroll.clientHeight>=scroll.scrollHeight-4:scroll.scrollTop<=4;
    if(!atEdge){wheelSum=0;return;}const now=performance.now();if(now-wheelAt>300||Math.sign(wheelSum)!==direction)wheelSum=0;wheelAt=now;wheelSum+=delta;if(Math.abs(wheelSum)>150){wheelSum=0;turnLockedUntil=now+650;turn(direction,{end:direction<0}).catch(error=>status(error.message));}
  },{passive:false});
  host.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&event.target.id==='reader-inline-label'){event.preventDefault();saveNote().then(()=>{if(!dirty){inlineOpen=false;positionAnnotationTools();}});return;}
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();saveNote();return;}
    if(event.target.closest('.reader-sidebar-resizer')&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();sidebarWidth=Math.max(270,Math.min(520,sidebarWidth+(event.key==='ArrowLeft'?16:-16)));updateSidebar();if(doc&&typeof zoom==='string')renderPages({preserve:true});savePosition();return;}
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&!event.shiftKey&&!event.target.closest('input,textarea,[contenteditable=true]')){event.preventDefault();undoTextMark().catch(error=>config.toast(error.message,true));return;}
    if(event.target.closest('input,textarea,select,[contenteditable=true]')||event.ctrlKey||event.altKey||event.metaKey)return;
    if(event.key.toLowerCase()==='f'){event.preventDefault();host.querySelector('[data-reader-action=focus]').click();return;}
    if(['h','u'].includes(event.key.toLowerCase())){event.preventDefault();study.markSelection(event.key.toLowerCase()==='h'?'highlight':'underline').catch(error=>config.toast(error.message,true));return;}
    const tool={t:'text',a:'arrow',r:'mark',v:'read'}[event.key.toLowerCase()];if(tool){event.preventDefault();if(tool==='read'){mode='read';updateMode();}else activateTool(tool);return;}
    if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();turn(event.key==='ArrowRight'?1:-1);}
    if(['PageDown','PageUp'].includes(event.key)||event.key===' '&&!event.target.closest('button,summary')){event.preventDefault();screenStep(event.key==='PageUp'||event.shiftKey?-1:1);}
    if(event.key==='Home'){event.preventDefault();navigate(1);}if(event.key==='End'&&doc){event.preventDefault();navigate(doc.numPages);}
  });
  return{open,close,async openAt(id,number){if(!host.open||paper?.id!==id)await open(id);if(host.open&&paper?.id===id&&doc)await navigate(number);},isOpen:()=>host.open};
}



