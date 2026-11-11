import {t as tr,html,msg} from './i18n.js';
import {bindStaticDOM} from './i18n.js';
import {icon} from './icons.js';
import {actionMenu} from './action-menus.js';
import {newCanvas,findCanvasPosition,cleanCanvas,cleanCanvasStore,parseCanvasRules,serializeCanvasRules,arrangeCanvas,arrangeCanvasMode,CANVAS_ARRANGEMENTS,canvasNodesInRect,canvasDescendants,moveCanvasNodes,CANVAS_EXAMPLE,CANVAS_SHAPES,CANVAS_COLORS,exportCanvasDocument,importCanvasDocument,canvasBounds} from './research-canvas-model.js';
import {canvasContent,canvasPalette,exportCanvasSVG,xml} from './research-canvas-render.js';
const copy=b=>({...b,nodes:b.nodes.map(n=>({...n})),edges:b.edges.map(e=>({...e})),assets:{...b.assets},camera:{...b.camera}});
const uid=prefix=>prefix+'_'+crypto.randomUUID().replaceAll('-','').slice(0,18);
const shapeNames={get roundrect(){return tr('圆角卡片');},get rect(){return tr('矩形');},get ellipse(){return tr('椭圆');},get diamond(){return tr('菱形');},get hexagon(){return tr('六边形');}};
const colorNames={get accent(){return tr('主题强调色');},get blue(){return tr('蓝色');},get purple(){return tr('紫色');},get gold(){return tr('金色');},get green(){return tr('绿色');},get red(){return tr('红色');},get gray(){return tr('灰色');}};
export function createResearchCanvas(config){
 const esc=config.escape||xml,native=globalThis.materiaDesktop;
 let store=cleanCanvasStore(),libraryKey='',loaded=false,opening=false,revision=0,savedRevision=0,saving=null,timer,saveError='',selected='',preview=null,connect=false,sourceNode='',drag=null,frame=null,codeOpen=false,libraryOpen=true,deleteArmed='',removed=null,activeImageNode='',exporting=false;
 let pendingWork=null,selection=new Set(),selectionBoard='',pointerTool='select',spaceHeld=false,suppressContextUntil=0;
 const draft=b=>Boolean(b&&(b.hasCodeDraft||b.codeDraft));
 const histories=new Map(),dialog=document.createElement('dialog');dialog.id='research-canvas';dialog.className='research-canvas';dialog.setAttribute('aria-labelledby','rc-heading');
 const button=(action,name,label,extra='')=>`<button type="button" data-rc-action="${action}" title="${label}" aria-label="${label}" ${extra}>${icon(name)}<span>${label}</span></button>`;
 dialog.innerHTML=html`<div class="rc-shell"><header class="rc-header"><div class="rc-brand">${icon('network')}<div><h2 id="rc-heading">研究画布</h2></div></div><span id="rc-save-status" role="status"></span>${button('save','upload',tr('立即保存'),'id="rc-retry" hidden')}${button('toggle-library','panel-left',tr('画布列表'),'aria-pressed="true"')}${button('toggle-code','edit',tr('规则代码'),'aria-pressed="false"')}${actionMenu('rc-export-menu',tr('导入与导出'),html`<button type="button" data-rc-action="import">导入画布 / 规则文本</button><hr><button type="button" data-rc-action="export-json">导出完整画布（含图片）</button><button type="button" data-rc-action="export-code">导出规则文本</button><button type="button" data-rc-action="export-svg">导出 SVG 矢量图</button><button type="button" data-rc-action="export-png">导出 PNG 图片</button>`,{iconName:'download'})}${button('close','close',tr('返回文献库'))}</header><div class="rc-body"><aside class="rc-library"><div class="rc-section-heading"><strong>我的画布</strong>${button('new','plus',tr('新建画布'))}</div><div id="rc-board-list"></div><div class="rc-library-footer">${actionMenu('rc-board-menu',tr('画布操作'),html`${button('duplicate','files',tr('复制当前画布'))}${button('delete-board','trash',tr('删除当前画布'),'data-keep-menu-open')}`,{iconName:'folder'})}<button type="button" data-rc-action="undo-delete" id="rc-undo-delete" hidden>撤销删除画布</button></div></aside><section class="rc-workspace"><div class="rc-toolbar"><input id="rc-name" maxlength="100" aria-label="画布名称" placeholder="画布名称"><label><span class="sr-only">布局</span><select id="rc-layout" aria-label="画布布局"><option value="mindmap">思维导图</option><option value="free">自由关系</option></select></label><label><span class="sr-only">方向</span><select id="rc-direction" aria-label="展开方向"><option value="both">左右展开</option><option value="right">向右展开</option><option value="left">向左展开</option><option value="down">向下展开</option></select></label><div class="rc-toolbar-actions"><div class="rc-tool-group" role="group" aria-label="画布操作工具">${button('select-tool','area',tr('框选节点'),'aria-pressed="true"')}${button('pan-tool','mouse',tr('平移画布'),'aria-pressed="false"')}</div><div class="rc-tool-group" role="group" aria-label="节点操作">${button('add','plus',tr('新节点'))}${button('connect','network',tr('连接节点'),'aria-pressed="false"')}</div><div class="rc-tool-group" role="group" aria-label="撤销与重做">${button('undo','undo',tr('撤销'))}${button('redo','redo',tr('重做'))}</div></div></div><div id="rc-preview-banner" hidden role="status"></div><div class="rc-stage" id="rc-stage"><div id="rc-message" hidden role="alert"></div><svg id="rc-svg" xmlns="http://www.w3.org/2000/svg" aria-label="研究画布：拖动节点，拖动空白移动视图，滚轮缩放" tabindex="0"></svg><div class="rc-empty" id="rc-empty"><span>${icon('network')}</span><h3>把研究思路放在一张画布上</h3><p>整理知识、连接证据，或从规则文本生成一张图。</p>${button('new','plus',tr('创建第一张画布'))}<button type="button" class="text-button" data-rc-action="new-example">从材料研究示例开始</button></div><div class="rc-camera">${button('arrange','natural-layout',tr('自动整理画布'),'id="rc-arrange"')}${actionMenu('rc-arrange-menu',tr('选择整理方式'),Object.entries(CANVAS_ARRANGEMENTS).map(([id,label])=>`<button type="button" data-rc-arrange="${id}">${label}</button>`).join(''),{iconName:'chevron-down',iconOnly:true,className:'rc-arrange-options'})}<i class="rc-camera-divider" aria-hidden="true"></i>${button('zoom-out','minus',tr('缩小'))}<output id="rc-zoom">100%</output>${button('zoom-in','plus',tr('放大'))}${button('fit','expand',tr('适应画布'))}</div><div class="rc-hint" id="rc-hint">拖动节点或空白 · 滚轮缩放 · 双击节点编辑</div></div><footer class="rc-footer"><span id="rc-stats"></span><span>内容仅保存在本地 · 文献链接可随时补充</span></footer></section><aside class="rc-inspector" id="rc-inspector"></aside><section class="rc-code" id="rc-code" hidden><div class="rc-code-heading"><div><strong>规则文本</strong><small>预览后应用，已有 ID 保留手工布局</small></div>${button('toggle-code','close',tr('收起代码'))}</div><div class="rc-code-actions">${button('preview','eye',tr('预览生成'))}${button('apply-code','check',tr('应用到画布'))}${button('reset-code','undo',tr('还原代码'))}</div><textarea id="rc-source" spellcheck="false" maxlength="250000" aria-label="画布规则代码" placeholder="node root &quot;研究主题&quot;"></textarea><div id="rc-code-status" role="status"></div><details class="rc-rule-help"><summary>规则说明与示例</summary><p>用稳定 ID 标识节点；文字使用双引号。Ctrl + Enter 预览。</p><pre>canvas "画布名称"\nlayout mindmap\ndirection right\nnode root "研究主题"\nnode a "子主题"\nroot -&gt; a : "关联"\nstyle a shape=hexagon color=purple\nnote a "补充说明"\nlink a paper="文献ID"\ngroup "分组" [root, a]</pre><p>形状：roundrect / rect / ellipse / diamond / hexagon。颜色：accent / blue / purple / gold / green / red / gray 或 #RRGGBB。上传图片后可用 image 节点ID "asset:图片ID" 引用。</p><p>position a 100 200 指定位置；edge-style root a dashed=true arrow=false 设置连线。</p><button type="button" data-rc-action="example" class="outline-button">将材料研究示例放入编辑器</button></details></section></div><input id="rc-import" type="file" accept=".json,.txt,.md,.mcanvas" hidden><input id="rc-image" type="file" accept="image/png,image/jpeg,image/webp" hidden></div><div id="rc-context" class="ui-action-popover rc-context-menu" popover="auto" role="menu" aria-label="画布快捷操作"></div>`;
 bindStaticDOM(dialog,{translated:true});
 document.body.append(dialog);
 const $=selector=>dialog.querySelector(selector),board=()=>store.boards.find(b=>b.id===store.selected),visible=()=>preview||board(),history=()=>{if(!histories.has(store.selected))histories.set(store.selected,{undo:[],redo:[]});return histories.get(store.selected);};
 let messageTimer;
 function notify(message,error=false){if(!dialog.open)return config.toast(message,error);const node=$('#rc-message');node.textContent=message;node.dataset.state=error?'error':'info';node.hidden=false;clearTimeout(messageTimer);messageTimer=setTimeout(()=>node.hidden=true,5000);}
 function saveStatus(){const status=$('#rc-save-status');status.textContent=saveError?tr('保存失败，内容仍在编辑器中'):saving?tr('正在保存…'):revision!==savedRevision?tr('尚未保存'):tr('已在本地保存');status.dataset.state=saveError?'error':revision!==savedRevision?'pending':'saved';$('#rc-retry').hidden=!saveError;}
 function changed(){revision++;saveError='';if(board())board().updatedAt=Date.now();clearTimeout(timer);timer=setTimeout(()=>flush().catch(e=>notify(tr('画布未保存：',false)+e.message,true)),350);saveStatus();}
 async function flush(){
  if(pendingWork)await pendingWork;
  clearTimeout(timer);if(saving)return saving.then(()=>revision!==savedRevision?flush():undefined);if(!loaded||revision===savedRevision)return;
  const ticket=revision,payload=cleanCanvasStore(store);
  // An earlier save timer must not persist a half-finished, cancellable gesture.
  if(drag?.moved){const snapshot=payload.boards.find(b=>b.id===store.selected);if(snapshot){if(drag.kind==='nodes')moveCanvasNodes(snapshot.nodes,drag.positions,0,0);if(drag.kind==='pan')snapshot.camera={...drag.camera};}}
  saving=Promise.resolve().then(()=>config.persist({libraryKey,state:payload}));saveStatus();
  try{await saving;savedRevision=ticket;saveError='';}catch(e){saveError=e.message;throw e;}finally{saving=null;saveStatus();}if(revision!==savedRevision)return flush();
 }
 function reset(){if(revision!==savedRevision)throw Error(tr('请先保存当前画布。'));loaded=false;store=cleanCanvasStore();histories.clear();selected='';selection.clear();selectionBoard='';spaceHeld=false;preview=null;libraryKey='';revision=savedRevision=0;}
 function remember(){const h=history();h.undo.push(copy(board()));if(h.undo.length>30)h.undo.shift();h.redo=[];}
 function canEdit(){if(!board())return false;if(preview||draft(board())){notify(tr('请先应用或还原规则代码，再编辑图形。'));return false;}return true;}
 function mutate(run,{full=true,record=true}={}){if(!canEdit())return false;const before=copy(board());try{run(board());const next=cleanCanvas(board());if(record){const h=history();h.undo.push(before);if(h.undo.length>30)h.undo.shift();h.redo=[];}store.boards[store.boards.findIndex(b=>b.id===next.id)]=next;changed();if(full)render();else{draw();syncCode();renderList();saveStatus();}return true;}catch(e){store.boards[store.boards.findIndex(b=>b.id===before.id)]=before;notify(e.message,true);return false;}}
 function renderList(){$('#rc-board-list').innerHTML=store.boards.map(b=>html`<button type="button" data-rc-board="${esc(b.id)}" class="rc-board ${b.id===store.selected?'is-active':''}" aria-current="${b.id===store.selected?'true':'false'}"><strong>${esc(b.name)}</strong><small>${b.nodes.length} 个节点 · ${b.layout==='mindmap'?tr('思维导图'):tr('自由关系')}</small></button>`).join('');$('#rc-undo-delete').hidden=!removed;}
 function syncCode(){const b=board();if(!b)return;const source=draft(b)?b.codeDraft:serializeCanvasRules(b);if(document.activeElement!==$('#rc-source'))$('#rc-source').value=source;}
 function normalizeSelection(){
  const b=board();if(selectionBoard!==b?.id){selection.clear();selectionBoard=b?.id;}
  const ids=new Set(b?.nodes.map(n=>n.id)||[]);selection=new Set([...selection].filter(id=>ids.has(id)));
  if(!ids.has(selected))selection.clear();else if(!selection.has(selected))selection=new Set([selected]);
 }
 function setSelection(ids,{full=true}={}){selection=new Set(ids);selected=[...selection][0]||'';normalizeSelection();if(full)render();else{renderInspector();draw();}}
 function render(){
  normalizeSelection();
  const b=board(),disabled=!b||Boolean(preview||draft(b));dialog.classList.toggle('rc-library-hidden',!libraryOpen);dialog.classList.toggle('rc-code-open',codeOpen);$('#rc-code').hidden=!codeOpen;$('#rc-empty').hidden=Boolean(b);$('#rc-svg').hidden=!b;
  $('#rc-name').value=b?.name||'';$('#rc-name').disabled=disabled;$('#rc-layout').value=b?.layout||'mindmap';$('#rc-direction').value=b?.direction||'both';$('#rc-layout').disabled=disabled;$('#rc-direction').disabled=disabled||b?.layout==='free';
  for(const item of dialog.querySelectorAll('[data-rc-arrange],[data-menu-toggle="rc-arrange-menu"]'))item.disabled=disabled||(item.dataset.rcArrange==='selection'&&selection.size<2);
  for(const action of ['select-tool','pan-tool'])$(`[data-rc-action="${action}"]`).setAttribute('aria-pressed',String(pointerTool===(action==='select-tool'?'select':'pan')));
  for(const action of ['add','connect','arrange'])$(`[data-rc-action="${action}"]`).disabled=disabled;
  for(const action of ['duplicate','delete-board','export-json','export-code','export-svg','export-png'])$(`[data-rc-action="${action}"]`).disabled=!b||Boolean(preview);
  for(const action of ['preview','apply-code','reset-code'])$(`[data-rc-action="${action}"]`).disabled=!b;
  $('[data-rc-action="undo"]').disabled=!b||!history().undo.length||Boolean(preview);$('[data-rc-action="redo"]').disabled=!b||!history().redo.length||Boolean(preview);
  $('[data-rc-action="toggle-code"]').setAttribute('aria-pressed',String(codeOpen));$('[data-rc-action="toggle-library"]').setAttribute('aria-pressed',String(libraryOpen));$('[data-rc-action="connect"]').setAttribute('aria-pressed',String(connect));
  const banner=$('#rc-preview-banner');banner.hidden=!preview;if(preview)banner.innerHTML=html`<span>生成预览：${preview.nodes.length} 个节点、${preview.edges.length} 条连线，尚未应用</span><button type="button" data-rc-action="apply-code">应用</button><button type="button" data-rc-action="cancel-preview">返回编辑</button>`;
  $('#rc-stats').textContent=b?msg`${(preview||b).nodes.length} 个节点 · ${(preview||b).edges.length} 条连线${draft(b)?tr(' · 规则草稿已保留'):''}`:tr('尚未创建画布');
  $('#rc-hint').textContent=connect?sourceNode?tr('点击另一个节点完成连线 · Esc 取消'):tr('先点击起点，再点击终点 · Esc 取消'):msg`已选 ${selection.size} 个 · ${pointerTool==='select'?tr('空白拖动框选'):tr('空白拖动平移')} · Ctrl/Shift 加选 · 右键拖动平移`;
  const deleteButton=$('[data-rc-action="delete-board"]'),confirmDelete=Boolean(b&&deleteArmed===b.id);
  const deleteLabel=tr(confirmDelete?'再次点击确认删除':'删除当前画布');
  deleteButton.querySelector('span').textContent=deleteLabel;
  deleteButton.setAttribute('aria-label',deleteLabel);
  renderList();syncCode();renderInspector();draw();saveStatus();
 }
 function renderPaperOptions(){const b=board(),n=b?.nodes.find(n=>n.id===selected),input=$('#rc-paper-search'),select=$('#rc-paper');if(!n||!select)return;const query=(input?.value||'').trim().toLowerCase(),papers=config.getPapers(),matches=papers.filter(p=>!query||p.title.toLowerCase().includes(query)).slice(0,500);if(n.paperId&&!matches.some(p=>p.id===n.paperId)){const current=papers.find(p=>p.id===n.paperId);matches.unshift(current||{id:n.paperId,title:tr('文献已移除：',false)+n.paperId});}select.innerHTML=tr('<option value="">不关联文献</option>',false)+matches.map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('');select.value=n.paperId;}
 function renderInspector(){
  normalizeSelection();
  const b=board(),n=b?.nodes.find(n=>n.id===selected),edge=b?.edges.find(e=>e.id===selected),disabled=preview||draft(b)?'disabled':'';
  if(!b){$('#rc-inspector').innerHTML=tr('<div class="rc-inspector-empty"><strong>研究思路的工作台</strong><p>节点可以附带笔记、图片与文献证据。所有内容都能单独导出。</p></div>');return;}
  if(preview){$('#rc-inspector').innerHTML=tr('<div class="rc-inspector-empty"><strong>正在预览生成结果</strong><p>应用后即可拖动、添加说明与关联文献。</p></div>');return;}
  if(selection.size>1&&!preview){$('#rc-inspector').innerHTML=html`<div class="rc-section-heading"><strong>已选择 ${selection.size} 个节点</strong></div><p class="rc-selection-help">拖动任意选中节点一起移动。Ctrl / Shift 点击可增减选择，右键打开快捷操作。</p>${button('select-all','files',tr('选择全部节点'))}${button('clear-selection','close',tr('取消选择'))}<div class="rc-inspector-divider"></div>${button('arrange-selection','natural-layout',tr('整理所选节点'),disabled)}${button('remove','trash',msg`删除所选 ${selection.size} 个节点`,disabled)}`;return;}
  if(edge){$('#rc-inspector').innerHTML=html`<div class="rc-section-heading"><strong>连线属性</strong></div><small>${esc(b.nodes.find(n=>n.id===edge.source)?.text)} → ${esc(b.nodes.find(n=>n.id===edge.target)?.text)}</small><label>关系说明<input data-rc-edge-field="label" maxlength="160" value="${esc(edge.label)}" ${disabled}></label><label class="rc-check"><input type="checkbox" data-rc-edge-field="dashed" ${edge.dashed?'checked':''} ${disabled}>虚线</label><label class="rc-check"><input type="checkbox" data-rc-edge-field="arrow" ${edge.arrow?'checked':''} ${disabled}>显示箭头</label>${button('remove','trash',tr('删除这条连线'),disabled)}`;return;}
  if(!n){$('#rc-inspector').innerHTML=html`<div class="rc-inspector-empty"><strong>${esc(b.name)}</strong><p>选中节点以编辑文字、笔记、图片和证据；选中连线以填写关系说明。</p>${button('add','plus',tr('添加一个节点'),disabled)}</div>`;return;}
  const missing=n.paperId&&!config.getPapers().some(p=>p.id===n.paperId),tags=[...new Set(config.getPapers().flatMap(p=>p.tags||[]))].sort();
  $('#rc-inspector').innerHTML=html`<div class="rc-section-heading"><strong>节点属性</strong><code>${esc(n.id)}</code></div><label>节点文字<textarea data-rc-node-field="text" maxlength="400" rows="3" ${disabled}>${esc(n.text)}</textarea></label><div class="rc-field-pair"><label>形状<select data-rc-node-field="shape" ${disabled}>${CANVAS_SHAPES.map(s=>`<option value="${s}" ${s===n.shape?'selected':''}>${shapeNames[s]}</option>`).join('')}</select></label><label>颜色<select data-rc-node-field="color" ${disabled}>${CANVAS_COLORS.map(s=>`<option value="${s}" ${s===n.color?'selected':''}>${colorNames[s]}</option>`).join('')}${n.color.startsWith('#')?html`<option value="${n.color}" selected>自定义 ${n.color}</option>`:''}</select></label></div><label>分组<input data-rc-node-field="group" maxlength="80" value="${esc(n.group)}" placeholder="相同名称的节点归入一组" ${disabled}></label><label>研究笔记<textarea data-rc-node-field="note" maxlength="10000" rows="5" placeholder="结论、条件、证据与待验证的问题…" ${disabled}>${esc(n.note)}</textarea></label><div class="rc-image-editor">${n.image?html`<img src="${esc(b.assets[n.image].data)}" alt="节点图片"><small>资源 ID：${esc(n.image)}</small>`:''}${button('image','plus',n.image?tr('替换图片'):tr('添加图片'),disabled)}${n.image?button('remove-image','close',tr('移除图片'),disabled):''}</div><div class="rc-inspector-divider"></div><label>关联文献<input id="rc-paper-search" type="search" placeholder="输入标题查找…" aria-label="搜索画布关联文献" ${disabled}><select id="rc-paper" data-rc-node-field="paperId" aria-label="关联文献" ${disabled}></select></label>${n.paperId?button('open-paper','external',missing?tr('文献已不在库中'):tr('打开关联文献'),missing?'disabled':''):''}<label>关联标签笔记<input data-rc-node-field="tag" maxlength="80" value="${esc(n.tag)}" list="rc-tags" placeholder="输入标签名称" ${disabled}></label><datalist id="rc-tags">${tags.map(tag=>`<option value="${esc(tag)}">`).join('')}</datalist>${n.tag?button('open-tag','tag',tr('打开标签笔记')):''}<div class="rc-inspector-divider"></div><div class="rc-inspector-actions">${button('add-child','plus',tr('添加子节点'),disabled)}${button('remove','trash',tr('删除节点'),disabled)}</div>`;renderPaperOptions();
 }
 function draw(){normalizeSelection();const b=visible(),svg=$('#rc-svg');if(!b){svg.replaceChildren();return;}const palette=canvasPalette();svg.innerHTML=`<g id="rc-scene" style="font-family:${esc(palette.font)}">${canvasContent(b,palette,selection.size?selection:selected,true)}</g>`;transform();}
 function transform(){const b=board(),scene=$('#rc-scene');if(!b||!scene)return;scene.setAttribute('transform',`translate(${b.camera.x} ${b.camera.y}) scale(${b.camera.scale})`);$('#rc-zoom').textContent=Math.round(b.camera.scale*100)+'%';}
 function fit(){const b=board();if(!b)return;const bounds=canvasBounds(visible()),r=$('#rc-svg').getBoundingClientRect();if(!r.width||!r.height)return;const scale=Math.max(.1,Math.min(1.3,(r.width-32)/bounds.width,(r.height-48)/bounds.height));b.camera={scale,x:r.width/2-(bounds.x+bounds.width/2)*scale,y:r.height/2-(bounds.y+bounds.height/2)*scale};transform();}
 function zoom(factor,point){const b=board();if(!b)return;const r=$('#rc-svg').getBoundingClientRect(),p=point||{x:r.width/2,y:r.height/2},s=Math.max(.1,Math.min(3,b.camera.scale*factor)),ratio=s/b.camera.scale;b.camera.x=p.x-(p.x-b.camera.x)*ratio;b.camera.y=p.y-(p.y-b.camera.y)*ratio;b.camera.scale=s;transform();changed();}
 async function open(){if(dialog.open||opening)return;if(!config.isReady()){notify(tr('文献库尚未就绪。'));return;}opening=true;try{if(!loaded){const response=await config.load();store=cleanCanvasStore(response.state);libraryKey=response.libraryKey;loaded=true;revision=savedRevision=0;}preview=null;connect=false;if(draft(board()))codeOpen=true;selected=board()?.nodes[0]?.id||'';render();dialog.showModal();requestAnimationFrame(()=>{if(board()&&board().camera.x===0&&board().camera.y===0)fit();else transform();});}catch(e){notify(tr('研究画布无法打开：',false)+e.message,true);}finally{opening=false;}}
 async function close(){await flush();preview=null;connect=false;dialog.close();}
 function addCanvas(example=false){if(store.boards.length>=50)throw Error(tr('最多保存 50 张画布，请先导出归档。'));let b=newCanvas(uid('canvas'),tr('未命名画布 ',false)+(store.boards.length+1));if(example)b=parseCanvasRules(CANVAS_EXAMPLE,{...b,nodes:[]});store.boards.push(b);store.selected=b.id;selected=b.nodes[0]?.id||'';preview=null;connect=false;deleteArmed='';changed();render();requestAnimationFrame(fit);}
 function addNode(parentId=''){if(!canEdit())return;const b=board(),parent=b.nodes.find(n=>n.id===parentId),id=uid('node'),r=$('#rc-svg').getBoundingClientRect(),siblings=b.edges.filter(e=>e.source===parentId).length;mutate(b=>{b.nodes.push({id,text:tr('新主题'),x:parent?parent.x+350:(r.width/2-b.camera.x)/b.camera.scale,y:parent?parent.y+siblings*145:(r.height/2-b.camera.y)/b.camera.scale,shape:'roundrect',color:parent?.color||'accent',note:'',paperId:'',tag:'',image:'',group:parent?.group||''});Object.assign(b.nodes.at(-1),findCanvasPosition(b.nodes.slice(0,-1),b.nodes.at(-1)));if(parent)b.edges.push({id:uid('edge'),source:parent.id,target:id,label:'',dashed:false,arrow:true});selected=id;});requestAnimationFrame(()=>$('[data-rc-node-field="text"]')?.focus());}
 function selectNode(id){if(connect){if(!sourceNode){sourceNode=id;selected=id;render();return;}if(sourceNode===id){notify(tr('请选择另一个节点作为终点。'));return;}const source=sourceNode;if(mutate(b=>{b.edges.push({id:uid('edge'),source,target:id,label:'',dashed:false,arrow:true});selected=b.edges.at(-1).id;})){connect=false;sourceNode='';render();}return;}setSelection([id]);}
 function undo(redo=false){if(!board()||preview)return;const h=history(),from=redo?h.redo:h.undo,to=redo?h.undo:h.redo;if(!from.length)return;to.push(copy(board()));const previous=from.pop();store.boards[store.boards.findIndex(b=>b.id===store.selected)]=previous;selected=previous.nodes.some(n=>n.id===selected)||previous.edges.some(e=>e.id===selected)?selected:previous.nodes[0]?.id||'';changed();render();}
 function previewCode(){const b=board();if(!b)return;try{preview=parseCanvasRules($('#rc-source').value,b);selected='';$('#rc-code-status').textContent=tr('预览已生成；点击应用后保存图形。');$('#rc-code-status').dataset.state='success';render();requestAnimationFrame(fit);}catch(e){preview=null;$('#rc-preview-banner').hidden=true;$('#rc-code-status').textContent=e.message;$('#rc-code-status').dataset.state='error';const line=Number(e.message.match(/第 (\d+) 行/)?.[1]);if(line){const area=$('#rc-source'),start=area.value.split('\n').slice(0,line-1).join('\n').length+(line>1?1:0);area.focus();area.setSelectionRange(start,area.value.indexOf('\n',start)<0?area.value.length:area.value.indexOf('\n',start));}draw();}}
 function applyCode(){const b=board();if(!b)return;let candidate;try{candidate=parseCanvasRules($('#rc-source').value,b);}catch(e){$('#rc-code-status').textContent=e.message;$('#rc-code-status').dataset.state='error';return;}remember();candidate.updatedAt=Date.now();store.boards[store.boards.findIndex(row=>row.id===b.id)]=candidate;preview=null;selected=candidate.nodes[0]?.id||'';connect=false;changed();$('#rc-code-status').textContent=tr('已应用，节点坐标与规则同时保存。');$('#rc-code-status').dataset.state='success';render();requestAnimationFrame(fit);}
 async function work(run){const task=Promise.resolve().then(run),settled=task.catch(()=>{});pendingWork=settled;try{return await task;}finally{if(pendingWork===settled)pendingWork=null;}}
 async function importFile(file){if(file.size>12593000)throw Error(tr('画布文件不超过 12 MB。'));const source=await file.text();let b;if(/\.json$/i.test(file.name))b=importCanvasDocument(source);else b=parseCanvasRules(source,{...newCanvas(uid('canvas'),file.name.replace(/\.[^.]+$/,'').slice(0,90)||tr('导入画布')),nodes:[]});for(const asset of Object.values(b.assets))await new Promise((resolve,reject)=>{const image=new Image();image.onload=resolve;image.onerror=()=>reject(Error(tr('导入的图片资源无法解码，原画布已保留。')));image.src=asset.data;});if(store.boards.length>=50)throw Error(tr('最多保存 50 张画布。'));b.id=uid('canvas');b.name=(b.name+tr('（导入）',false)).slice(0,100);store.boards.push(b);store.selected=b.id;selected=b.nodes[0]?.id||'';preview=null;connect=false;changed();render();requestAnimationFrame(fit);}
 async function addImage(file,nodeId,boardId){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>15*1024*1024)throw Error(tr('请选择 15 MB 以内的 PNG、JPEG 或 WebP 图片。'));
  const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error(tr('图片无法读取。')));r.readAsDataURL(file);});const image=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error(tr('图片无法解码。')));i.src=data;});
  if(image.width*image.height>64000000||image.width>16000||image.height>16000)throw Error(tr('图片像素过大，请先缩小图片。'));
  const factor=Math.min(1,1280/image.width,1280/image.height),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*factor));canvas.height=Math.max(1,Math.round(image.height*factor));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);let compressed=canvas.toDataURL(file.type==='image/jpeg'?'image/jpeg':'image/png',.9);if(compressed.length>2800000)compressed=canvas.toDataURL('image/webp',.88);if(compressed.length>2800000)throw Error(tr('压缩后图片仍超过 2 MB，请缩小图片。'));
  if(board()?.id!==boardId||!board().nodes.some(n=>n.id===nodeId))throw Error(tr('目标节点已切换，请重新选择节点再添加图片。'));
  const assetId=uid('image');mutate(b=>{b.assets[assetId]={name:file.name.slice(0,200),data:compressed};b.nodes.find(n=>n.id===nodeId).image=assetId;const used=new Set(b.nodes.map(n=>n.image));b.assets=Object.fromEntries(Object.entries(b.assets).filter(([id])=>used.has(id)));});
 }
 async function exportFile(type){
  let b=board();if(!b||exporting)return;exporting=true;const name=b.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,80)||tr('研究画布');
  try{if(pendingWork)await pendingWork;b=store.boards.find(row=>row.id===b.id)||b;if(type==='json')return await config.saveText(exportCanvasDocument(b),name+'.materia-canvas.json','json');if(type==='code')return await config.saveText(draft(b)?b.codeDraft:serializeCanvasRules(b),name+'.canvas.md','md');
   const svg=exportCanvasSVG(b,canvasPalette());if(type==='svg')return await config.saveText(svg,name+'.svg','svg');
   const image=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error(tr('图片导出失败，请尝试 SVG 格式。')));i.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);});
   const scale=Math.min(2,6000/image.width,6000/image.height,Math.sqrt(24000000/(image.width*image.height))),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error(tr('PNG 无法生成。'));
   if(native?.saveImage)await native.saveImage({filename:name+'.png',bytes:new Uint8Array(await blob.arrayBuffer()),type:'png'});else{const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }finally{exporting=false;}
 }
 function arrange(mode){const r=$('#rc-svg').getBoundingClientRect();if(mutate(b=>Object.assign(b,arrangeCanvasMode(b,mode,{selection:[...selection],aspect:r.width/Math.max(1,r.height)})))){if(mode!=='selection')fit();changed();notify(msg`${CANVAS_ARRANGEMENTS[mode]}已完成，可撤销恢复。`);}}
 const actions={
  new:()=>addCanvas(), 'new-example':()=>addCanvas(true),close,'toggle-library':()=>{libraryOpen=!libraryOpen;render();},'toggle-code':()=>{codeOpen=!codeOpen;render();},
  add:()=>addNode(),'add-child':()=>addNode(selected),connect:()=>{if(!canEdit())return;connect=!connect;sourceNode=board().nodes.some(n=>n.id===selected)?selected:'';render();},
  arrange:()=>arrange('auto'),'arrange-selection':()=>arrange('selection'),'select-tool':()=>{pointerTool='select';render();},'pan-tool':()=>{pointerTool='pan';render();},'select-all':()=>setSelection(board()?.nodes.map(n=>n.id)||[]),'clear-selection':()=>setSelection([]),undo:()=>undo(),redo:()=>undo(true),fit:()=>{fit();changed();},'zoom-in':()=>zoom(1.15),'zoom-out':()=>zoom(1/1.15),save:flush,
  remove:()=>mutate(b=>{normalizeSelection();if(selection.size){const ids=new Set(selection);b.nodes=b.nodes.filter(n=>!ids.has(n.id));b.edges=b.edges.filter(e=>!ids.has(e.source)&&!ids.has(e.target));const used=new Set(b.nodes.map(n=>n.image));b.assets=Object.fromEntries(Object.entries(b.assets).filter(([id])=>used.has(id)));}else b.edges=b.edges.filter(e=>e.id!==selected);selected='';selection.clear();}),
  duplicate:()=>{if(!board()||store.boards.length>=50)throw Error(tr('最多保存 50 张画布。'));const b=copy(board());b.id=uid('canvas');b.name=(b.name+tr('（副本）',false)).slice(0,100);store.boards.push(b);store.selected=b.id;changed();render();},
  'delete-board':()=>{const b=board();if(!b)return;if(deleteArmed!==b.id){deleteArmed=b.id;render();return;}$('#rc-board-menu').hidePopover();removed=copy(b);histories.delete(b.id);store.boards=store.boards.filter(row=>row.id!==b.id);store.selected=store.boards[0]?.id||'';deleteArmed='';preview=null;selected=board()?.nodes[0]?.id||'';changed();render();},
  'undo-delete':()=>{if(!removed)return;if(store.boards.length>=50)throw Error(tr('画布数量已达上限。'));store.boards.push(removed);store.selected=removed.id;removed=null;selected=board().nodes[0]?.id||'';changed();render();},
  preview:previewCode,'apply-code':applyCode,'cancel-preview':()=>{preview=null;render();},'reset-code':()=>{if(!board())return;board().codeDraft='';board().hasCodeDraft=false;preview=null;$('#rc-source').value=serializeCanvasRules(board());$('#rc-code-status').textContent=tr('已恢复当前图形对应的规则。');$('#rc-code-status').dataset.state='info';changed();render();},
  example:()=>{if(!board())return;board().codeDraft=CANVAS_EXAMPLE;board().hasCodeDraft=true;preview=null;$('#rc-source').value=CANVAS_EXAMPLE;changed();render();},
  import:()=>$('#rc-import').click(),image:()=>{if(!canEdit())return;activeImageNode=selected;$('#rc-image').click();},'remove-image':()=>mutate(b=>{b.nodes.find(n=>n.id===selected).image='';const used=new Set(b.nodes.map(n=>n.image));b.assets=Object.fromEntries(Object.entries(b.assets).filter(([id])=>used.has(id)));}),
  'open-paper':async()=>{const n=board()?.nodes.find(n=>n.id===selected);if(n?.paperId){await close();config.openPaper(n.paperId);}},'open-tag':async()=>{const n=board()?.nodes.find(n=>n.id===selected);if(n?.tag){await close();config.openTag(n.tag);}},
  'export-json':()=>exportFile('json'),'export-code':()=>exportFile('code'),'export-svg':()=>exportFile('svg'),'export-png':()=>exportFile('png'),
 };
 $('#rc-board-menu').addEventListener('toggle',event=>{
  if(event.newState==='closed'&&deleteArmed){deleteArmed='';render();}
 });
 dialog.addEventListener('click',async event=>{const layout=event.target.closest('[data-rc-arrange]'),context=event.target.closest('[data-rc-context-action]');if(layout&&!layout.disabled){try{arrange(layout.dataset.rcArrange);}catch(e){notify(e.message,true);}return;}if(context&&!context.disabled){try{contextAction(context.dataset.rcContextAction);}catch(e){notify(e.message,true);}return;}const item=event.target.closest('[data-rc-board]'),button=event.target.closest('[data-rc-action]');try{if(item){await flush();store.selected=item.dataset.rcBoard;preview=null;connect=false;selected=board()?.nodes[0]?.id||'';deleteArmed='';changed();render();return;}if(button&&!button.disabled)await actions[button.dataset.rcAction]?.();}catch(e){notify(tr('画布操作未完成：',false)+e.message,true);}});
 dialog.addEventListener('input',event=>{
  const e=event.target;if(e.id==='rc-source'){if(!board())return;connect=false;sourceNode='';board().hasCodeDraft=e.value!==serializeCanvasRules(board());board().codeDraft=board().hasCodeDraft?e.value:'';preview=null;$('#rc-preview-banner').hidden=true;changed();$('#rc-code-status').textContent=tr('规则草稿已保留；预览后应用到图形。');$('#rc-code-status').dataset.state='info';for(const item of dialog.querySelectorAll('[data-rc-arrange],[data-menu-toggle="rc-arrange-menu"]'))item.disabled=draft(board())||(item.dataset.rcArrange==='selection'&&selection.size<2);renderInspector();draw();for(const action of ['add','connect','arrange'])$(`[data-rc-action="${action}"]`).disabled=draft(board());$('#rc-name').disabled=draft(board());$('#rc-layout').disabled=draft(board());$('#rc-direction').disabled=draft(board())||board().layout==='free';return;}
  if(e.id==='rc-paper-search'){renderPaperOptions();return;}
  if(e.id==='rc-name'){if(!e.value.trim()){e.setAttribute('aria-invalid','true');return;}e.removeAttribute('aria-invalid');mutate(b=>b.name=e.value,{full:false});return;}
  const field=e.dataset.rcNodeField,edgeField=e.dataset.rcEdgeField;if((field||edgeField)&&e.tagName!=='SELECT'&&e.type!=='checkbox'){
   if(field==='text'&&!e.value.trim()){e.setAttribute('aria-invalid','true');return;}e.removeAttribute('aria-invalid');mutate(b=>{const item=field?b.nodes.find(n=>n.id===selected):b.edges.find(n=>n.id===selected);if(item)item[field||edgeField]=e.value;},{full:false});
  }
 });
 dialog.addEventListener('change',async event=>{const e=event.target;try{
  if(e.id==='rc-import'){const file=e.files[0];e.value='';if(file)await work(()=>importFile(file));return;}
  if(e.id==='rc-image'){const file=e.files[0],id=activeImageNode,boardId=board()?.id;e.value='';if(file)await work(()=>addImage(file,id,boardId));return;}
  if(e.id==='rc-layout'||e.id==='rc-direction'){if(mutate(b=>{b[e.id==='rc-layout'?'layout':'direction']=e.value;if(e.id==='rc-direction')Object.assign(b,arrangeCanvas(b));}))if(e.id==='rc-direction')requestAnimationFrame(fit);return;}
  if(e.dataset.rcNodeField&&(e.tagName==='SELECT'||e.type==='checkbox'))mutate(b=>b.nodes.find(n=>n.id===selected)[e.dataset.rcNodeField]=e.value);
  else if(e.dataset.rcEdgeField&&e.type==='checkbox')mutate(b=>b.edges.find(n=>n.id===selected)[e.dataset.rcEdgeField]=e.checked);
 }catch(error){notify(tr('画布操作未完成：',false)+error.message,true);}});
 const svg=$('#rc-svg'),point=e=>{const r=svg.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};
 let contextNode='';
 function openContext(event,id='',edge=''){
  if(performance.now()<suppressContextUntil)return;
  contextNode=id;
  if(id){if(!selection.has(id))setSelection([id]);else{selected=id;render();}}
  else if(edge){selection.clear();selected=edge;render();}
  const node=board()?.nodes.find(n=>n.id===id),disabled=!board()||Boolean(preview||draft(board()));
  const item=(action,label,off=false)=>`<button type="button" role="menuitem" tabindex="-1" data-rc-context-action="${action}" ${off?'disabled':''}>${label}</button>`;
  const panel=$('#rc-context');panel.innerHTML=(node?item('only',tr('仅选择此节点'))+item('toggle',selection.has(id)?tr('取消选择此节点'):tr('加入选择'))+item('group',tr('选择同组节点'),!node.group)+item('branch',tr('选择此节点及下游节点'))+'<hr>'+item('connect',tr('从此节点拉线…'),disabled)+item('child',tr('添加子节点'),disabled)+item('edit',tr('编辑此节点'),disabled)+'<hr>':'')+item('all',tr('选择全部节点'))+item('clear',tr('取消选择'),!selection.size)+(node||edge?'<hr>'+item('remove',edge?tr('删除这条连线'):msg`删除所选 ${selection.size} 个节点`,disabled):'');
  panel.showPopover();panel.style.left=Math.max(8,Math.min(innerWidth-panel.offsetWidth-8,event.clientX))+'px';panel.style.top=Math.max(8,Math.min(innerHeight-panel.offsetHeight-8,event.clientY))+'px';panel.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
 }
 function contextAction(action){
  const id=contextNode,node=board()?.nodes.find(n=>n.id===id);$('#rc-context').hidePopover();
  if(action==='only')setSelection([id]);
  if(action==='toggle'){const ids=new Set(selection);ids.has(id)?ids.delete(id):ids.add(id);setSelection(ids);}
  if(action==='group'&&node?.group)setSelection(board().nodes.filter(n=>n.group===node.group).map(n=>n.id));
  if(action==='branch')setSelection(canvasDescendants(board(),id));
  if(action==='all')actions['select-all']();if(action==='clear')actions['clear-selection']();
  if(action==='connect'&&canEdit()){setSelection([id]);connect=true;sourceNode=id;render();notify(tr('点击目标节点完成连线，Esc 取消。'));}
  if(action==='child')addNode(id);
  if(action==='edit'){setSelection([id]);$('[data-rc-node-field="text"]')?.focus();}
  if(action==='remove'){actions.remove();return;}
  if(!['edit','child'].includes(action))svg.focus({preventScroll:true});
 }
 svg.addEventListener('contextmenu',event=>{event.preventDefault();if(!board())return;openContext(event,event.target.closest('[data-rc-node]')?.dataset.rcNode,event.target.closest('[data-rc-edge]')?.dataset.rcEdge);});
 svg.addEventListener('pointerdown',event=>{
  if(event.button!==0&&event.button!==2||!board())return;
  const id=event.target.closest('[data-rc-node]')?.dataset.rcNode,edge=event.target.closest('[data-rc-edge]')?.dataset.rcEdge,additive=event.shiftKey||event.ctrlKey||event.metaKey,editable=!preview&&!draft(board());
  if(connect&&id&&event.button===0){selectNode(id);event.preventDefault();return;}
  if(event.button===0&&id&&additive){const ids=new Set(selection);ids.has(id)?ids.delete(id):ids.add(id);setSelection(ids);svg.focus({preventScroll:true});event.preventDefault();return;}
  const pan=event.button===2||spaceHeld||pointerTool==='pan';
  if(!pan&&id&&!selection.has(id))setSelection([id]);
  const moving=!pan&&id&&editable,marquee=!pan&&!id&&!edge&&!preview&&!connect;
  svg.focus({preventScroll:true});
  drag={pointer:event.pointerId,start:point(event),kind:moving?'nodes':marquee?'marquee':pan?'pan':'click',id,edge,positions:new Map(moving?board().nodes.filter(n=>selection.has(n.id)).map(n=>[n.id,{x:n.x,y:n.y}]):[]),base:additive?new Set(selection):new Set(),previousSelection:new Set(selection),camera:{...board().camera},moved:false};
  svg.setPointerCapture(event.pointerId);event.preventDefault();
 });
 function paintMarquee(d,p){
  const x=Math.min(d.start.x,p.x),y=Math.min(d.start.y,p.y),width=Math.abs(p.x-d.start.x),height=Math.abs(p.y-d.start.y),c=d.camera;
  const hits=canvasNodesInRect(board().nodes,{x:(x-c.x)/c.scale,y:(y-c.y)/c.scale,width:width/c.scale,height:height/c.scale});
  setSelection(new Set([...d.base,...hits]),{full:false});
  const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');rect.id='rc-marquee';rect.setAttribute('x',x);rect.setAttribute('y',y);rect.setAttribute('width',width);rect.setAttribute('height',height);rect.setAttribute('rx','4');svg.append(rect);
 }
 svg.addEventListener('pointermove',event=>{
  if(!drag||drag.pointer!==event.pointerId)return;const p=point(event),dx=p.x-drag.start.x,dy=p.y-drag.start.y;if(!drag.moved&&Math.hypot(dx,dy)<3)return;
  if(!drag.moved){drag.moved=true;if(drag.kind==='nodes'){drag.previousRedo=[...history().redo];remember();}}
  if(drag.kind==='nodes'){
   moveCanvasNodes(board().nodes,drag.positions,dx/drag.camera.scale,dy/drag.camera.scale);
   if(!frame)frame=requestAnimationFrame(()=>{frame=null;draw();});
  }else if(drag.kind==='marquee')paintMarquee(drag,p);
  else if(drag.kind==='pan'){board().camera.x=Math.max(-190000,Math.min(190000,drag.camera.x+dx));board().camera.y=Math.max(-190000,Math.min(190000,drag.camera.y+dy));transform();}
 });
 const finish=(event,cancel=false)=>{
  if(!drag||drag.pointer!==event.pointerId)return;const d=drag;drag=null;if(frame){cancelAnimationFrame(frame);frame=null;}if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);$('#rc-marquee')?.remove();
  if(cancel){
   if(d.kind==='nodes'&&d.moved){moveCanvasNodes(board().nodes,d.positions,0,0);history().undo.pop();history().redo=d.previousRedo;}
   board().camera=d.camera;setSelection(d.previousSelection);return;
  }
  if(d.moved){if(d.kind==='nodes'||d.kind==='pan')changed();if(d.kind==='pan')suppressContextUntil=performance.now()+350;render();}
  else if(event.button===2)return;
  else if(d.id&&d.kind!=='pan'){selected=d.id;render();}
  else if(d.kind!=='pan'){selected=d.edge||'';selection.clear();render();}
 };
 svg.addEventListener('pointerup',e=>finish(e));svg.addEventListener('pointercancel',e=>finish(e,true));svg.addEventListener('lostpointercapture',e=>finish(e,true));
 svg.addEventListener('wheel',event=>{if(!board())return;event.preventDefault();zoom(event.deltaY>0?1/1.12:1.12,point(event));},{passive:false});
 svg.addEventListener('dblclick',event=>{const id=event.target.closest('[data-rc-node]')?.dataset.rcNode;if(!id||!canEdit())return;selected=id;renderInspector();$('[data-rc-node-field="text"]')?.focus();$('[data-rc-node-field="text"]')?.select();});
 dialog.addEventListener('keyup',event=>{if(event.key===' ')spaceHeld=false;});
 dialog.addEventListener('blur',()=>{spaceHeld=false;},true);
 dialog.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&drag){event.preventDefault();event.stopPropagation();finish({pointerId:drag.pointer,button:0},true);return;}
  if(!event.target.matches('input,textarea,select')&&!event.target.isContentEditable){
   if(event.key===' '&&!event.target.closest('button,summary,.ui-action-popover')){event.preventDefault();spaceHeld=true;return;}
   if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'&&!event.target.closest('.ui-action-popover')){event.preventDefault();event.stopPropagation();actions['select-all']();return;}
   if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){event.preventDefault();const r=selected?svg.querySelector(`[data-rc-node="${CSS.escape(selected)}"]`)?.getBoundingClientRect():svg.getBoundingClientRect();if(r)openContext({clientX:r.x+r.width/2,clientY:r.y+r.height/2},selected);return;}
   if(event.key==='Escape'&&!connect&&!preview&&selection.size){event.preventDefault();event.stopPropagation();setSelection([]);return;}
  }
  if(event.target.closest('.ui-action-popover,[data-menu-toggle]'))return;
  if(event.target.id==='rc-source'&&(event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();event.shiftKey?applyCode():previewCode();event.stopPropagation();return;}
  if(event.key==='Escape'&&(connect||preview)){event.preventDefault();event.stopPropagation();connect=false;preview=null;render();return;}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();event.stopPropagation();flush().catch(e=>notify(e.message,true));return;}
  if(event.target.matches('input,textarea,select')||event.target.isContentEditable){event.stopPropagation();return;}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();undo(event.shiftKey);}
  else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();undo(true);}
  else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();flush().catch(e=>notify(e.message,true));}
  else if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();actions.remove();}
  else if(event.key==='0'){event.preventDefault();fit();changed();}
  else if(event.key==='Enter'&&event.target.dataset.rcNode){event.preventDefault();selectNode(event.target.dataset.rcNode);}
  event.stopPropagation();
 });
 dialog.addEventListener('cancel',event=>{event.preventDefault();close().catch(e=>notify(tr('请先保存画布：',false)+e.message,true));});
 for(const type of ['dragenter','dragover','dragleave'])dialog.addEventListener(type,event=>{event.preventDefault();event.stopPropagation();});
 dialog.addEventListener('drop',async event=>{event.preventDefault();event.stopPropagation();const file=event.dataTransfer?.files[0];if(!file)return;try{if(file.type.startsWith('image/')){if(!board()?.nodes.some(n=>n.id===selected))throw Error(tr('请先选择要放入图片的节点。'));await work(()=>addImage(file,selected,board().id));}else await work(()=>importFile(file));}catch(e){notify(e.message,true);}});
 const observer=new MutationObserver(()=>{if(dialog.open)draw();});observer.observe(document.documentElement,{attributes:true,attributeFilter:['style','data-theme']});
 let viewportSize=null;const resize=new ResizeObserver(()=>{const r=$('#rc-svg').getBoundingClientRect();if(!dialog.open||!r.width||!r.height)return;if(viewportSize&&board()){board().camera.x+=(r.width-viewportSize.width)/2;board().camera.y+=(r.height-viewportSize.height)/2;}viewportSize={width:r.width,height:r.height};transform();});resize.observe($('#rc-stage'));
 if(native?.requestClose)window.close=()=>{native.requestClose().catch(e=>notify(e.message,true));};
 native?.onCanvasClose?.(async()=>{try{await config.flushBeforeExit?.();await flush();await native.canvasConfirmClose();}catch(e){notify(tr('画布尚未保存，已保留窗口：',false)+e.message,true);}});native?.canvasReady?.().catch(()=>{});
 return{open,close,flush,reset,isOpen:()=>dialog.open,isDirty:()=>revision!==savedRevision,getState:()=>cleanCanvasStore(store)};
}
