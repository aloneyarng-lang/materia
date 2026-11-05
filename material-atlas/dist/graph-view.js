import {t as tr,html,msg} from './i18n.js';
import {GRAPH_THEME_TOKENS,graphAppearance,nodeGeometry,edgeGeometry} from './graph-appearance.js';
import {CosmicBackdrop,cosmicNodeParts,cosmicPartNode} from './graph-cosmos.js';
import {getGraphSymbols,graphSymbolNode,SymbolBackdrop} from './graph-symbols.js';
import { createNetwork, stepNetwork, networkSnapshot, cleanLayout } from './force-layout.js';
import { GRAPH_DEFAULTS, cleanGraphSettings, placeNodeLabels,fitGraphViewport } from './graph-settings.js';
import { PALETTE } from './palette.js';
import {computeNaturalLayout,animateNaturalLayout} from './natural-layout-client.js';
import { ASSOCIATION_KINDS } from './associations.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}, text) => {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
};

export class StarMap {
  constructor(svg, callbacks) {
    Object.assign(this, callbacks);
    this.naturalTask=null;this.naturalUndo=null;this.naturalOverview=false;
    this.svg = svg; this.scale = 1; this.x = 0; this.y = 0;this.viewHeight=620;this.labelPositions=new Map();
    this.cache = {}; this.nodes = []; this.selected = ''; this.paused = false; this.preferences={...GRAPH_DEFAULTS};this.collections=[];this.cosmos=new CosmicBackdrop(svg);
    this.symbolBackdrop=new SymbolBackdrop(svg);this.bindInput();
    this.labelCanvas=document.createElement('canvas').getContext('2d');this.labelWidths=new Map();
    this.resizeObserver=new ResizeObserver(()=>{const r=svg.getBoundingClientRect();if(!r.width||!r.height)return;this.bounds={width:r.width,height:r.height};const height=Math.max(430,Math.min(1200,1000*r.height/r.width));if(Math.abs(height-this.viewHeight)>1)this.cancelNaturalLayout();this.y+=(height-this.viewHeight)/2;this.viewHeight=height;svg.setAttribute('viewBox',`0 0 1000 ${height}`);this.cosmos.resize(height);this.symbolBackdrop.resize(height);this.transform();});this.resizeObserver.observe(svg);
  }
  configure(value,collections=[],associations=[]){this.preferences=cleanGraphSettings(value);this.collections=collections;this.associations=associations;}
  setLayout(value) { this.dataKey=null;this.dataMode=null;this.modeCaches={};this.cancelNaturalLayout();this.naturalUndo=null;this.naturalOverview=false;cancelAnimationFrame(this.frame); this.network = null; const normalized=cleanLayout(value),legacy=Object.keys(normalized).some(key=>key.startsWith('tag:'));this.cache=Object.fromEntries(Object.entries(normalized).filter(([key,point])=>key.startsWith('relation:')||key.startsWith('paper:')&&(!legacy||point.pinned))); }
  setData(papers, selected, allGroups = []) {
    const dataKey=JSON.stringify([papers.map(p=>[p.id,p.title,p.abstract,p.tags,p.authors,p.authorDetails,p.journal,p.collection]),this.preferences,this.associations,allGroups,this.collections,this.options]);
    if(this.network&&dataKey===this.dataKey){
      this.papers=papers.slice();const current=new Map(papers.map(p=>[p.id,p]));
      for(const item of this.nodes)if(item.node.type==='paper'){item.node.paper=current.get(item.node.paper.id);item.paper=item.node.paper;}
      if(this.selected!==selected){this.selected=selected;this.highlight(selected);}return;
    }
    this.dataKey=dataKey;
    const wasMoving=Boolean(this.frame);this.cancelNaturalLayout();
    if(this.dataMode&&this.dataMode!==this.preferences.mode){this.modeCaches??={};this.modeCaches[this.dataMode]={...this.cache,...networkSnapshot(this.network)};this.cache=this.modeCaches[this.preferences.mode]||{};this.network=null;this.naturalUndo=null;}this.dataMode=this.preferences.mode;
    cancelAnimationFrame(this.frame);
    this.frame=null;const first=!this.network;this.drag=null;this.svg.classList.remove('dragging');this.labelPositions.clear();
    this.svg.dataset.graphMoving='false';this.hitScale=null;
    if (this.network) Object.assign(this.cache, networkSnapshot(this.network));
    this.papers = papers.slice(); this.selected = selected; this.groups = allGroups;
    this.network = createNetwork(this.papers, this.groups, this.cache,this.preferences.showRelations?this.associations:[],this.preferences.mode,this.preferences.neighbors);
    const colorNames=[...new Set(this.papers.map(p=>this.preferences.colorBy==='journal'?p.journal||tr('期刊未填'):this.collections.find(c=>c.id===p.collection)?.name||tr('未分组')))].sort();
    for(const node of this.network.nodes){node.radius*=this.preferences.nodeSize;if(node.type==='paper'&&this.preferences.colorBy!=='tag'){const name=this.preferences.colorBy==='journal'?node.paper.journal||tr('期刊未填'):this.collections.find(c=>c.id===node.paper.collection)?.name||tr('未分组');node.color=PALETTE[colorNames.indexOf(name)%PALETTE.length];}if(node.type==='relation'&&this.preferences.colorBy!=='tag')node.color=node.color;}
    this.svg.replaceChildren();
    this.viewport = el('g'); this.svg.append(this.viewport);
    this.edgeLayer = el('g', { 'aria-hidden': true, class: 'network-edges' });
    this.edgeLayer.style.display = this.options?.showEdges === false ? 'none' : '';
    this.viewport.append(this.edgeLayer);
    this.batchedEdges=this.network.nodes.length>=200;
    this.svg.dataset.graphDensity=this.batchedEdges?'dense':'normal';
    this.edgeBatches=this.batchedEdges?Array.from({length:3},()=>{const path=el('path',{fill:'none','vector-effect':'non-scaling-stroke'});this.edgeLayer.append(path);return path;}):null;
    this.edgeNodes = this.network.edges.map(edge => {
      if(this.batchedEdges)return {...edge,path:null,batch:0};
      const path = el('path', { fill: 'none', stroke: 'var(--muted)', 'stroke-width': .8, opacity: .18, 'vector-effect': 'non-scaling-stroke' });
      this.edgeLayer.append(path); return { ...edge, path };
    });
    this.nodeLayer = el('g'); this.viewport.append(this.nodeLayer);
    this.nodes = this.network.nodes.map(node => {
      const isTag = node.type === 'relation', name = isTag ? node.tag : node.paper.title;
      const group = el('g', { class: `graph-node ${isTag ? 'relation-node relation-'+node.kind : 'paper-node'}`, tabindex: 0, role: 'button', 'aria-label': isTag ? msg`${ASSOCIATION_KINDS[node.kind]}关联 ${name}` : name, 'data-node-id': node.id, ...(isTag ? { 'data-association-id': node.id } : { 'data-paper-id': node.paper.id }) });
      group.style.setProperty('--node-color',node.color);
      group.append(el('title', {}, msg`${name}\n拖动牵引，Shift 拖动固定，双击或 P 释放${isTag ? tr('；点击查看匹配，右键移除此关联节点') : tr('；右键打开文献操作')}`));
      const hit=el('circle',{r:Math.max(14,node.radius+5),fill:'transparent',class:'node-hit-area'});group.append(hit);
      const ring = el('circle', { r: node.radius + 3, fill: 'none', stroke: node.color, 'stroke-width': .8, opacity: .3, class: 'node-ring' });
      const core = el('circle', { r:node.radius, fill: node.color, stroke: 'var(--canvas)', 'stroke-width': isTag ? 1.6 : 1.8, class: 'node-core' });
      const effectsBack=el('g',{class:'cosmic-node-effects','aria-hidden':'true'}),effectsFront=el('g',{class:'cosmic-node-effects','aria-hidden':'true'});
      group.append(ring, effectsBack, core, effectsFront);
      const label = el('text', { x: 0, y: node.radius + 20, 'text-anchor': 'middle', class: isTag ? 'tag-node-label' : 'node-label' }, name.length > (isTag ? 22 : 40) ? name.slice(0, isTag ? 21 : 38) + '…' : name);
      group.append(label);

      const pin = el('circle', { cx: node.radius + 4, cy: -node.radius - 3, r: 2.4, fill: '#ad8d58', class: 'node-pin' }); group.append(pin);
      group.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); isTag ? this.onRelation?.(node.id) : this.onSelect(node.paper.id); }
        if (event.key === 'Delete') { event.preventDefault(); isTag ? this.onRemoveAssociation?.(node.id) : this.onHide?.(node.paper.id); }
        if (event.key.toLowerCase() === 'p') { node.pinned = !node.pinned; this.paint(); this.saveLayout(); if (!node.pinned) this.start(.4); }
      });
      group.addEventListener('dblclick', event => { event.stopPropagation(); clearTimeout(this.clickTimer); node.pinned = false; this.start(.6); this.saveLayout(); });
      group.addEventListener('contextmenu', event => { event.preventDefault(); isTag ? this.onRemoveAssociation?.(node.id) : this.onPaperMenu?.(node.paper.id,event,group); });
      group.addEventListener('pointerenter', event => {
        if (this.drag) return;
        this.highlightNode(node.id);
        this.onHover(isTag ? { title: `${ASSOCIATION_KINDS[node.kind]} · ${node.tag}`, journal: msg`${node.members.length} 篇可见匹配文献 · 拖动牵引，点击查看` } : node.paper, event);
      });
      group.addEventListener('pointerleave', () => { this.highlight(this.selected); this.onHover(null); });
      this.nodeLayer.append(group);
      return { ...node, node, paper: node.paper, group, ring, core, effectsBack,effectsFront,label, pin,hit };
    });
    const allSaved=this.network.nodes.every(node=>this.cache[node.id]);
    if (first&&!allSaved) for (let i = 0; i < (this.batchedEdges?8:75); i++) stepNetwork(this.network, .8,this.preferences);
    this.applyAppearance(); this.paint(); this.highlight(selected);if(first)this.fit();else this.transform();if(!allSaved||wasMoving)this.start(.6);
    this.naturalState();
    this.onStats?.({ papers: this.papers.length, tags: this.network.nodes.filter(node => node.type === 'relation').length, edges: this.network.edges.length, omittedTags: this.network.omittedTags });
  }
  applyAppearance() {
    const style=getComputedStyle(document.documentElement),tokens=Object.fromEntries(Object.keys(GRAPH_THEME_TOKENS).map(key=>[key,style.getPropertyValue(key).trim()]));
    const appearance=this.appearance=graphAppearance(tokens,this.preferences.appearance);
    Object.assign(this.svg.dataset,{graphAppearance:this.preferences.appearance,graphBackground:appearance.background,graphFill:appearance.nodeFill,graphTwinkle:appearance.twinkle,graphPaused:String(this.paused)});
    const color=(value,fallback)=>value==='auto'?fallback:value;
    for(const[key,value]of Object.entries({'--render-star-color':color(appearance.starColor,'var(--muted)'),'--render-nebula-color':color(appearance.nebulaColor,'var(--teal)'),'--render-nebula-secondary':color(appearance.nebulaColorSecondary,'var(--warning)'),'--render-nebula-intensity':appearance.nebulaIntensity}))this.svg.style.setProperty(key,String(value));
    this.cosmos.sync(appearance,this.viewHeight);
    this.symbolBackdrop.sync(appearance,this.viewHeight,getGraphSymbols(this.preferences.appearance));
    for(const[key,value]of Object.entries({'--render-node-stroke':appearance.nodeStroke+'px','--render-label-halo':appearance.labelHalo+'px','--render-glow':appearance.glow+'px','--render-label-color':appearance.labelColor==='auto'?'var(--muted)':appearance.labelColor}))this.svg.style.setProperty(key,value);
    for(const item of this.nodes){
      const node=item.node,shape=node.type==='relation'?appearance.relationShape:appearance.nodeShape,r=node.radius*appearance.nodeScale,geometry=nodeGeometry(shape,r);
      const symbol=getGraphSymbols(this.preferences.appearance)[node.type==='relation'?'relation':'node'];
      const parts=cosmicNodeParts(shape,r,appearance);node.visualRadius=shape==='symbol'?r*Math.SQRT2:parts.radius;
      item.effectsBack.replaceChildren(...parts.back.map(cosmicPartNode));item.effectsFront.replaceChildren(...parts.front.map(cosmicPartNode));item.group.dataset.cosmicShape=shape;
      const core=el(geometry.tag,{...geometry.attrs,class:'node-core','data-shape':shape});
      if(shape==='symbol')core.append(symbol?.length?graphSymbolNode(symbol,r):el('circle',{r,fill:'var(--node-color)'}));
      item.core.replaceWith(core);item.core=core;
      const customColor=node.type==='relation'?appearance.relationColor:appearance.nodeColor;
      item.group.style.setProperty('--node-color',appearance.colorMode==='category'?node.color:customColor&&customColor!=='auto'?customColor:node.type==='relation'?'var(--warning)':'var(--teal)');
      item.ring.setAttribute('r',node.visualRadius+3);item.ring.setAttribute('stroke','var(--node-color)');
      item.pin.setAttribute('cx',node.visualRadius+4);item.pin.setAttribute('cy',-node.visualRadius-3);
    }
    this.labelWidths.clear();if(this.network){this.paint();this.highlightNode(this.activeId||'');}
  }
  paint() {
    // Read label metrics before writing thousands of node transforms.
    this.placeLabels(false);
    for (const [index, item] of this.nodes.entries()) {
      const node = item.node;
      item.group.setAttribute('transform', `translate(${node.x.toFixed(2)} ${node.y.toFixed(2)})`);
      item.group.classList.toggle('pinned', Boolean(node.pinned)); item.pin.style.display = node.pinned ? '' : 'none';
    }
    if(this.options?.showEdges===false)return;
    const batches=this.batchedEdges?[[],[],[]]:null;
    for (const edge of this.edgeNodes) {
      const a = edge.source, b = edge.target;
      const d=edgeGeometry(a,b,this.appearance?.edgeStyle);
      if(batches)batches[edge.batch].push(d);else edge.path.setAttribute('d',d);
    }
    if(batches)for(let i=0;i<3;i++)this.edgeBatches[i].setAttribute('d',batches[i].join(''));
  }
  start(alpha = .5) {
    if (this.paused || !this.network || !this.network.nodes.length) return;
    this.heat=Math.max(this.heat||0,alpha);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cancelAnimationFrame(this.frame);this.frame=null;
      for(let i=0;i<35;i++)stepNetwork(this.network,.35,this.preferences);
      this.heat=0;for(const node of this.network.nodes){node.vx=0;node.vy=0;}
      this.svg.dataset.graphMoving='false';this.paint();this.placeLabels();this.saveLayout();return;
    }
    if(this.frame)return;
    this.svg.dataset.graphMoving='true';
    let previous=0,quiet=0;const network=this.network;
    const tick = time => {
      this.frame=null;if (this.paused||this.network!==network)return;
      if(matchMedia('(prefers-reduced-motion: reduce)').matches){this.heat=0;for(const node of network.nodes){node.vx=0;node.vy=0;}this.svg.dataset.graphMoving='false';this.placeLabels();this.saveLayout();return;}
      const dt=previous?Math.max(.25,Math.min(2,(time-previous)/16.667)):1;previous=time;
      const held=Boolean(this.drag?.node);
      // Holding keeps the entire force simulation warm, even without pointer movement.
      this.heat=held?.3:this.heat*Math.pow(.9772,dt);
      const movement=stepNetwork(network,this.heat,this.preferences,dt)/Math.max(1,network.nodes.length);
      this.paint();quiet=movement<.025?quiet+1:0;
      if(held||this.heat>.001||quiet<18)this.frame=requestAnimationFrame(tick);
      else{this.heat=0;for(const node of network.nodes){node.vx=0;node.vy=0;}this.svg.dataset.graphMoving='false';this.placeLabels();this.saveLayout();}
    };
    this.frame = requestAnimationFrame(tick);
  }
  saveLayout() {
    if (!this.network) return;
    Object.assign(this.cache, networkSnapshot(this.network)); this.onLayout?.(cleanLayout(this.cache));
  }
  toggleMotion() { this.cancelNaturalLayout();this.paused = !this.paused;this.svg.dataset.graphPaused=String(this.paused); if (this.paused) { cancelAnimationFrame(this.frame);this.frame=null;this.heat=0;this.svg.dataset.graphMoving='false';this.placeLabels();this.saveLayout(); } else this.start(.6); return !this.paused; }
  releasePins() {
    this.cancelNaturalLayout();
    for(const position of Object.values(this.cache))position.pinned=false;
    for(const node of this.network?.nodes||[]){node.pinned=false;node.fx=null;node.fy=null;}
    this.paint();this.saveLayout();this.start(.3);
  }
  relayout() {return this.arrangeNaturalLayout();}
  naturalState(){this.onNaturalLayoutState?.({busy:Boolean(this.naturalTask),progress:this.naturalTask?.progress,canUndo:Boolean(this.naturalUndo),count:this.network?.nodes.length||0});}
  cancelNaturalLayout(){const task=this.naturalTask;if(!task)return;this.naturalTask=null;task.controller.abort();this.svg.dataset.naturalLayout='cancelled';this.naturalState();}
  async arrangeNaturalLayout(options={}){
    this.cancelNaturalLayout();if(!this.network?.nodes.length)return false;
    const network=this.network,controller=new AbortController(),task={network,controller};
    cancelAnimationFrame(this.frame);this.frame=null;this.heat=0;for(const node of network.nodes){node.vx=0;node.vy=0;}
    this.svg.dataset.graphMoving='false';
    const previous={points:networkSnapshot(network),camera:{scale:this.scale,x:this.x,y:this.y},height:this.viewHeight,key:network.nodes.map(n=>n.id).sort().join('|'),overview:this.naturalOverview,activeId:this.activeId};
    const glyphWidths={},style=getComputedStyle(this.svg);this.labelCanvas.font=`${style.fontWeight} 10px ${style.fontFamily}`;
    for(const node of network.nodes)for(const c of String(node.paper?.title||node.label||node.tag||''))if(glyphWidths[c]===undefined)glyphWidths[c]=this.labelCanvas.measureText(c).width/10;
    const input={height:this.viewHeight,activeId:'',threshold:this.preferences.labelThreshold,showLabels:this.options?.showLabels,fontScale:(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--font-size'))||13)/13*(this.appearance?.labelScale||1),glyphWidths,
      nodes:network.nodes.map(n=>({id:n.id,type:n.type,title:n.paper?.title||n.label||n.tag||'',group:n.paper?.collection||'',x:n.x,y:n.y,pinned:n.pinned,radius:n.visualRadius??n.radius})),edges:network.edges.map(e=>({source:e.source.id,target:e.target.id,similarity:e.similarity}))};
    this.naturalTask=task;this.svg.dataset.naturalLayout='calculating';this.naturalState();
    try{
      const result=await computeNaturalLayout(input,options,controller.signal,progress=>{if(this.naturalTask===task){task.progress=progress;this.naturalState();}});if(this.naturalTask!==task||this.network!==network)return false;
      this.naturalUndo=previous;this.naturalState();
      const destinations=new Map(result.points.map(p=>[p.id,p]));
      const apply=t=>{const ease=1-Math.pow(1-t,3);for(const n of network.nodes){const a=previous.points[n.id],b=destinations.get(n.id);if(!a||!b)continue;n.x=t===1?b.x:a.x+(b.x-a.x)*ease;n.y=t===1?b.y:a.y+(b.y-a.y)*ease;n.pinned=b.pinned;n.vx=0;n.vy=0;n.fx=null;n.fy=null;}
        for(const key of ['scale','x','y'])this[key]=t===1?result.camera[key]:previous.camera[key]+(result.camera[key]-previous.camera[key])*ease;this.viewport?.setAttribute('transform',`translate(${this.x} ${this.y}) scale(${this.scale})`);this.onZoom?.(Math.round(this.scale*100));this.paint();};
      if(matchMedia('(prefers-reduced-motion: reduce)').matches)apply(1);
      else{this.svg.dataset.naturalLayout='animating';await animateNaturalLayout(apply,controller.signal);}
      if(this.naturalTask!==task)return false;this.naturalOverview=true;this.highlightNode('');this.saveLayout();this.svg.dataset.naturalLayout='settled';return result;
    }catch(error){if(error.name==='AbortError')return false;this.svg.dataset.naturalLayout='error';throw error;}
    finally{if(this.naturalTask===task){this.naturalTask=null;this.naturalState();}}
  }
  undoNaturalLayout(){
    if(!this.naturalUndo)return false;this.cancelNaturalLayout();cancelAnimationFrame(this.frame);this.frame=null;this.heat=0;
    const previous=this.naturalUndo;this.naturalUndo=null;Object.assign(this.cache,previous.points);
    for(const node of this.network?.nodes||[]){const point=previous.points[node.id];if(point)Object.assign(node,point,{vx:0,vy:0,fx:null,fy:null});}
    const key=this.network?.nodes.map(n=>n.id).sort().join('|');if(key===previous.key&&Math.abs(this.viewHeight-previous.height)<1)Object.assign(this,previous.camera);else Object.assign(this,fitGraphViewport(this.network?.nodes||[],1000,this.viewHeight));
    this.naturalOverview=Boolean(previous.overview);this.paint();this.transform();this.highlightNode(previous.activeId||'');this.saveLayout();this.svg.dataset.naturalLayout='restored';this.naturalState();return true;
  }
  select(id) { this.cancelNaturalLayout();this.naturalOverview=false;this.selected = id; this.highlight(id); }
  highlight(id) { this.highlightNode(this.naturalOverview?'':id?'paper:'+id:''); }
  highlightNode(key) {
    this.activeId=key;const active=this.network?.byId.get(key),tagIds=new Set();this.relatedIds=new Set(key?[key]:[]);
    if(active?.type==='relation')tagIds.add(active.id);
    else if(active)for(const neighbor of this.network.adjacency.get(active.id)||[]){tagIds.add(neighbor.id);this.relatedIds.add(neighbor.id);}
    for(const edge of this.network?.edges||[])if(tagIds.has(edge.target.id)){this.relatedIds.add(edge.target.id);this.relatedIds.add(edge.source.id);}
    for(const item of this.nodes){const chosen=item.node.id===key;item.group.classList.toggle('is-active',chosen);item.group.setAttribute('opacity',!key||chosen||!tagIds.size?1:this.relatedIds.has(item.node.id)?.9:.32);item.group.setAttribute('aria-pressed',String(item.node.type==='paper'&&item.node.paper.id===this.selected));item.ring.setAttribute('opacity',chosen?.8:0);}
    const appearance=this.appearance||{},base=appearance.edgeOpacity??.2;
    const edgeStyle=(path,batch)=>{path.setAttribute('stroke',batch===2?'var(--teal)':appearance.edgeColor&&appearance.edgeColor!=='auto'?appearance.edgeColor:'var(--muted)');path.setAttribute('opacity',!key||!tagIds.size?base:batch===2?Math.min(.95,base*3.4):batch===1?base*.8:base*.225);path.setAttribute('stroke-width',(batch===2?1.15:.65)*this.preferences.linkWidth*(appearance.edgeWidth||1));path.setAttribute('stroke-dasharray',appearance.edgeDash==='dashed'?'5 4':appearance.edgeDash==='dotted'?'1 4':'none');};
    for(const edge of this.edgeNodes){const adjacent=edge.source.id===key||edge.target.id===key;edge.batch=adjacent?2:tagIds.has(edge.target.id)?1:0;if(edge.path)edgeStyle(edge.path,edge.batch);}
    if(this.batchedEdges){for(let i=0;i<3;i++)edgeStyle(this.edgeBatches[i],i);this.paint();}
    this.placeLabels();
  }
  placeLabels(force=true){
    if(!this.network)return;
    const now=performance.now();if(!force&&this.batchedEdges&&now-(this.lastLabelTime||0)<80)return;this.lastLabelTime=now;
    const bounds=this.bounds||this.svg.getBoundingClientRect(),viewportScale=Math.min(bounds.width/1000,bounds.height/this.viewHeight)||1;
    const svgStyle=getComputedStyle(this.svg),family=svgStyle.fontFamily,weight=svgStyle.fontWeight,fontScale=(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--font-size'))||13)/13*(this.appearance?.labelScale||1),measureText=(text,font)=>{const key=font.toFixed(4)+'|'+text;if(!this.labelWidths.has(key)){this.labelCanvas.font=`${weight} ${font}px ${family}`;this.labelWidths.set(key,this.labelCanvas.measureText(text).width);}return this.labelWidths.get(key);};
    if(this.labelWidths.size>10000)this.labelWidths.clear();
    const positions=placeNodeLabels(this.network.nodes.map(node=>({...node,radius:node.visualRadius??node.radius})),{scale:this.scale,viewportScale,measureText,fontScale,panX:this.x,panY:this.y,activeId:this.activeId,relatedIds:this.relatedIds,showLabels:this.options?.showLabels!==false,threshold:this.naturalOverview?Math.min(this.preferences.labelThreshold,this.scale*.9):this.preferences.labelThreshold,viewHeight:this.viewHeight,previous:this.labelPositions});this.labelPositions=positions;
    const hitScale=this.scale*viewportScale;if(this.hitScale!==hitScale){this.hitScale=hitScale;for(const item of this.nodes)item.hit.setAttribute('r',Math.max((item.node.visualRadius??item.node.radius)+5,11/hitScale));}
    for(const item of this.nodes){const placed=positions.get(item.node.id);item.label.style.opacity=placed?String(placed.opacity):'0';item.label.setAttribute('aria-hidden',String(!placed));if(!placed)continue;item.label.setAttribute('x',placed.x);item.label.setAttribute('y',placed.y);item.label.setAttribute('text-anchor','start');item.label.style.fontSize=placed.font+'px';const text=placed.lines.join('|');if(item.label.dataset.lines!==text){item.label.replaceChildren(...placed.lines.map((line,index)=>el('tspan',{x:placed.x,dy:index?placed.font*1.35:0},line)));item.label.dataset.lines=text;}else for(const [index,span]of [...item.label.children].entries()){span.setAttribute('x',placed.x);span.setAttribute('dy',index?placed.font*1.35:0);}}
  }
  point(event) { const matrix = this.svg.getScreenCTM(); return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : { x: 500, y: 300 }; }
  scenePoint(event) { const p = this.point(event); return { x: (p.x - this.x) / this.scale, y: (p.y - this.y) / this.scale }; }
  bindInput() {
    this.svg.addEventListener('wheel', event => { event.preventDefault(); this.zoom(event.deltaY > 0 ? 1 / 1.12 : 1.12, this.point(event)); this.onHover(null); }, { passive: false });
    this.svg.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      this.cancelNaturalLayout();
      clearTimeout(this.clickTimer);
      const key = event.target.closest('[data-node-id]')?.dataset.nodeId, node = this.network?.byId.get(key);
      const capture=event.target.closest('[data-node-id]')||this.svg;
      this.drag = { pointer: event.pointerId, capture, origin: this.point(event), scene: this.scenePoint(event), node, x: node?.x ?? this.x, y: node?.y ?? this.y,pinned:node?.pinned, moved: false };
      if(node){node.dragging=true;node.vx=0;node.vy=0;this.start(.3);}
      capture.setPointerCapture(event.pointerId); this.svg.classList.add('dragging'); this.onHover(null);
    });
    this.svg.addEventListener('pointermove', event => {
      const drag = this.drag; if (!drag || drag.pointer !== event.pointerId) return;
      const point = this.point(event), dx = point.x - drag.origin.x, dy = point.y - drag.origin.y;
      if(!drag.moved&&Math.hypot(dx,dy)>3)drag.moved=true;
      if (!drag.moved) return;
      if (drag.node) { drag.node.x = drag.x + dx / this.scale; drag.node.y = drag.y + dy / this.scale; drag.node.vx = 0; drag.node.vy = 0; this.paint(); }
      else { this.x = drag.x + dx; this.y = drag.y + dy; this.transform(); }
    });
    const finish = (event, cancel = false) => {
      const drag = this.drag; if (!drag || event.pointerId !== drag.pointer) return;
      this.drag = null; this.svg.classList.remove('dragging');
      if (drag.capture.hasPointerCapture(event.pointerId)) drag.capture.releasePointerCapture(event.pointerId);
      if (drag.node) {
        drag.node.dragging=false;drag.node.fx=null;drag.node.fy=null;
        if(cancel){drag.node.x=drag.x;drag.node.y=drag.y;drag.node.pinned=drag.pinned;drag.node.vx=0;drag.node.vy=0;this.paint();this.start(.2);}
        else if (drag.moved) { drag.node.pinned = Boolean(drag.pinned||event.shiftKey); this.paint();this.saveLayout();this.start(.3); }
        else if (!cancel) this.clickTimer = setTimeout(() => drag.node.type === 'relation' ? this.onRelation?.(drag.node.id) : this.onSelect(drag.node.paper.id), 260);
      }
    };
    this.svg.addEventListener('pointerup', event => finish(event));
    this.svg.addEventListener('pointercancel', event => finish(event, true));
    this.svg.addEventListener('lostpointercapture', event => finish(event, true));
  }
  zoom(factor, point = { x: 500, y: this.viewHeight/2 }) {
    this.cancelNaturalLayout();
    const next = Math.max(.12, Math.min(3.5, this.scale * factor)), ratio = next / this.scale;
    this.x = point.x - (point.x - this.x) * ratio; this.y = point.y - (point.y - this.y) * ratio; this.scale = next; this.transform();
  }
  fit() {this.cancelNaturalLayout();Object.assign(this,fitGraphViewport(this.network?.nodes||[],1000,this.viewHeight));this.transform();}
  transform() { this.viewport?.setAttribute('transform', `translate(${this.x} ${this.y}) scale(${this.scale})`); this.onZoom?.(Math.round(this.scale * 100)); this.placeLabels(); }
}
