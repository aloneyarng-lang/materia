import {t as tr,html,msg} from './i18n.js';
import {createMaterialPicker} from './material-picker.js';
import {materialMatrixHTML} from './material-selection.js';
import { paperMeasurements } from './materials.js';
import {icon} from './icons.js';
import {actionMenu} from './action-menus.js';
import { parameterOptions, parameterKey, measurementsCSV } from './parameters.js';
import { parameterInventory, parameterCards, parameterNameKey } from './parameter-index.js';
import { figureDataCSV, PLOT_REASONS } from './chart-data.js';
import { buildFigure, FIGURE_DEFAULTS, FIGURE_SIZES, cleanFigureSettings, validateFigureSettings } from './figure.js';

export function comparisonMatrix(papers,options,esc) {
  if(!options.length)return tr('<div class="comparison-no-data"><h3>所选文献没有性能记录</h3><p>可按性能参数重新找文献，或先导入 Markdown 性能表。</p><button class="outline-button" data-comparison-action="find-parameter">按性能参数找文献</button></div>');
  return html`<table class="comparison-table"><thead><tr><th>性能参数 / 单位</th>${papers.map(p=>`<th><strong>${esc(p.title)}</strong><small>${esc(p.year||tr('年份未填'))}</small></th>`).join('')}</tr></thead><tbody>${options.slice(0,100).map(option=>html`<tr><th><button class="matrix-parameter-link" data-parameter-name="${esc(parameterNameKey(option.name))}" data-parameter-unit="*" title="查看全库录入此参数的文献">${esc(option.name)} ↗</button><small>${esc(option.unit||tr('单位未填'))} · ${option.paperCount} 篇</small></th>${papers.map(p=>`<td>${paperMeasurements(p).filter(m=>parameterKey(m.name,m.unit)===option.key).map(m=>`<div class="measurement-cell"><strong>${esc(m.qualifier)}${esc(m.value)}${m.uncertainty!=null&&m.uncertainty!==''?` ± ${esc(m.uncertainty)}`:''}</strong><span>${esc(m.materialName)}${m.sample&&m.sample!==m.materialName?' · '+esc(m.sample):''}</span><small>${esc(m.conditions||tr('条件未填'))}</small>${m.source?`<small class="measurement-source">${esc(m.source)}</small>`:''}</div>`).join('')||'<span class="missing-value">—</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table>${options.length>100?tr('<p class="chart-footnote">预览前 100 个参数，完整测量 CSV 包含全部记录。</p>'):''}`;
}

export function participationHTML(data,esc) {
  const s=data.summary;
  if(s.selectedSubjects!==undefined)return '<div class="figure-coverage"><strong>'+s.plottedSubjects+' / '+s.selectedSubjects+tr(' 项材料 / 样品参与绘图</strong><span>',false)+s.plottedPapers+tr(' 篇来源 · ',false)+s.plottedPoints+tr(' 个原始观测点</span></div><details class="figure-audit" open><summary>逐项核对数据与未绘制原因</summary><div>',false)+data.paperStatus.map(row=>'<article><strong>'+esc(row.materialName)+'</strong><span class="'+(row.plottedPoints?'included':'excluded')+'">'+(row.plottedPoints?row.plottedPoints+tr(' 点已绘制',false):tr('未绘制'))+tr('</span><small>样品：',false)+esc(row.sample||tr('未填写'))+tr(' · 条件：',false)+esc(row.conditions||tr('未填写'))+tr('</small><small>来源文献：<button class="material-source-link" data-material-open-paper="',false)+esc(row.paperId)+'">'+esc(row.title)+tr('</button></small><small>录入 ',false)+row.recordedRecords+tr(' 条 · 当前单位 ',false)+row.matchingRecords+tr(' 条',false)+(Object.keys(row.reasons).length?' · '+Object.entries(row.reasons).map(([reason,count])=>esc(PLOT_REASONS[reason]+' '+count+tr(' 条',false))).join('；'):'')+'</small></article>').join('')+'</div></details>';
  return html`<div class="figure-coverage"><strong>${s.plottedPapers} / ${s.selectedPapers} 篇参与绘图</strong><span>${s.plottedPoints} 个观测点${s.excludedPapers?msg` · ${s.excludedPapers} 篇未绘制`:''}</span></div><details class="figure-audit" ${s.excludedPapers?'open':''}><summary>逐篇核对单位、数据及未绘制原因</summary><div>${data.paperStatus.map(row=>html`<article><strong>${esc(row.title)}</strong><span class="${row.plottedPoints?'included':'excluded'}">${row.plottedPoints?msg`${row.plottedPoints} 点已绘制`:tr('未绘制')}</span><small>录入 ${row.recordedRecords} 条 · 当前单位 ${row.matchingRecords} 条${Object.keys(row.reasons).length?' · '+Object.entries(row.reasons).map(([reason,count])=>msg`${PLOT_REASONS[reason]} ${count} 条`).map(esc).join('；'):''}</small></article>`).join('')}</div></details>`;
}

export function participationCSV(data) {
  const quote=value=>'"'+String(value??'').replace(/^[=+\-@]/,"'$&").replaceAll('"','""')+'"';
  return '\uFEFF'+[[tr('文献标题'),tr('文献ID'),tr('录入记录'),tr('当前单位记录'),tr('已绘制点数'),tr('说明'),tr('材料ID'),tr('材料名称'),tr('样品'),tr('测试条件'),tr('选择项ID')],...data.paperStatus.map(row=>[row.title,row.paperId,row.recordedRecords,row.matchingRecords,row.plottedPoints,Object.entries(row.reasons).map(([reason,count])=>msg`${PLOT_REASONS[reason]} ${count} 条`).join('；')||tr('已参与绘图'),row.materialId||'',row.materialName||'',row.sample||'',row.conditions||'',row.subjectKey||''])].map(row=>row.map(quote).join(',')).join('\r\n');
}

export function createComparison(config) {
  const esc=config.escape,$=selector=>document.querySelector(selector);
  let chart=null,observer=null,tab='table',settings={...FIGURE_DEFAULTS},chartLoad,revision=0,inputTimer,preferenceTimer;
  const paperSelected=()=>config.getPapers().filter(p=>config.getSelection().has(p.id)).sort((a,b)=>(Number(a.year)||9999)-(Number(b.year)||9999)||a.title.localeCompare(b.title));
  const picker=createMaterialPicker({escape:esc,showModal:config.showModal,toast:config.toast,getPapers:config.getPapers,canPersist:config.canSaveMaterialSelection,canPersistGroups:config.canSaveMaterialGroups,persist:value=>config.saveMaterialSelection(value),changed:()=>refreshBar(),onPaper:()=>open(tab),onMaterialMode:()=>{settings.group='material';},onDone:(next,preferred)=>open(next,preferred),openPaper:config.openSourcePaper});
  const selected=()=>picker.mode()==='material'?picker.subjects().sort((a,b)=>(Number(a.year)||9999)-(Number(b.year)||9999)||a.title.localeCompare(b.title)):paperSelected();
  function dispose(){revision++;observer?.disconnect();observer=null;chart?.dispose();chart=null;clearTimeout(inputTimer);}
  async function selectIds(ids){await config.setSelection(new Set(ids));refreshBar();}
  async function toggle(id){const ids=new Set(config.getSelection());ids.has(id)?ids.delete(id):ids.add(id);await selectIds(ids);}
  function refreshBar(){
    const count=config.getSelection().size;
    $('#comparison-count').textContent=count;$('#comparison-bar').hidden=!count||Boolean(config.isMaterialList?.());
    document.querySelectorAll('[data-compare-id]').forEach(input=>input.checked=config.getSelection().has(input.dataset.compareId));
    document.querySelectorAll('.paper-row[data-select]').forEach(row=>{
      const selected=config.getSelection().has(row.dataset.select);
      row.classList.toggle('batch-selected',selected);
      row.setAttribute('aria-pressed',String(selected));
    });
    document.querySelectorAll('[data-selected-count]').forEach(node=>node.textContent=count);
    document.querySelectorAll('[data-action="batch-remove"],[data-action="bulk-edit"],[data-selection-required]').forEach(button=>button.disabled=!count);
    const badge=$('#comparison-nav-count');if(badge)badge.textContent=picker.mode()==='material'?(picker.resolved().selected.length?picker.resolved().selected.length+tr(' 材料',false):''):count||'';
    config.materialSelectionChanged?.();
  }
  async function selectFiltered(){const ids=new Set(config.getSelection());for(const p of config.getFiltered())ids.add(p.id);await selectIds(ids);}
  function axes(){
    const counts=new Map(parameterOptions(selected()).map(option=>[option.key,option.paperCount]));
    return [{key:'year',label:tr('发表年份')},{key:'impactFactor',label:tr('期刊影响因子 IF')},...parameterOptions(config.getPapers()).map(option=>({key:'m:'+option.key,label:msg`${option.name} · ${option.unit||tr('单位未填')}（已选 ${counts.get(option.key)||0} / 全库 ${option.paperCount} 篇）`}))];
  }
  function axisOptions(axis,query=''){
    const q=query.trim().toLocaleLowerCase();
    return axes().filter(item=>!q||!item.key.startsWith('m:')||item.key===settings[axis]||item.label.toLocaleLowerCase().includes(q)).map(item=>`<option value="${esc(item.key)}" ${item.key===settings[axis]?'selected':''}>${esc(item.label)}</option>`).join('');
  }
  function preferredAxis(preferred){
    const current=parameterOptions(selected()),global=parameterOptions(config.getPapers());
    const candidates=global.filter(option=>parameterNameKey(option.name)===parameterNameKey(preferred.name)&&(preferred.unit==='*'||preferred.unit==null||option.unit===preferred.unit)).sort((a,b)=>(current.find(item=>item.key===b.key)?.paperCount||0)-(current.find(item=>item.key===a.key)?.paperCount||0));
    if(candidates.length){settings.y='m:'+candidates[0].key;settings.x='year';settings.condition='*';settings.sample='';settings.xMin='';settings.xMax='';settings.yMin='';settings.yMax='';settings.xScale='linear';settings.yScale='linear';}
  }
  function open(nextTab='table',preferred=null,forcedMode=null){
    if(forcedMode&&picker.mode()!==forcedMode)picker.setMode(forcedMode);picker.workspace(nextTab);
    if(picker.mode()==='material'&&!picker.resolved().selected.length){picker.open(preferred,nextTab);return;}
    tab=nextTab;
    if(preferred)preferredAxis(preferred);
    const papers=selected(),available=axes();
    if(!available.some(item=>item.key===settings.x))settings.x='year';
    if(!available.some(item=>item.key===settings.y))settings.y=parameterOptions(papers)[0]?'m:'+parameterOptions(papers)[0].key:available.find(item=>item.key.startsWith('m:'))?.key||'impactFactor';
    if(!papers.length){
      const inventory=parameterInventory(config.getPapers());
      config.showModal(tr('从性能参数开始绘图'),tr('点击参数找到全库相关文献，再选择要比较的数据。'),html`${picker.modeBar()}<div class="figure-start"><h3>先找参数，再选文献。</h3><p>单篇文献的参数也会列出，所有单位均可找到。</p><button class="primary" data-comparison-action="find-parameter">搜索全部 ${inventory.length} 个性能参数</button></div><div class="parameter-directory compact">${parameterCards(inventory.slice(0,8),'',esc)}</div>`,'comparison');return;
    }
    const materialMode=picker.mode()==='material',r=materialMode?picker.resolved():null;
    const years=[...new Set(config.getMetrics().map(row=>row.year))].sort().reverse();
    config.showModal(tr('性能对比与科研绘图'),materialMode?msg`${r.selected.length} 项材料 / 样品 · ${r.papers} 篇独立来源文献`:msg`${papers.length} 篇选中文献 · 参数数值、单位与测试条件独立核对`,html`
      ${picker.modeBar()}<div class="figure-workflow"><span><b>1</b>${materialMode?tr('选择材料 / 样品'):tr('选择文献')}</span><span><b>2</b>选择参数与单位</span><span><b>3</b>预览与导出</span></div>
      ${materialMode?picker.selectionHTML():html`<details class="figure-paper-selection"><summary>已选择 ${papers.length} 篇文献，点击查看或调整</summary><div class="compare-selected">${papers.map(p=>html`<button title="从选中集合移除 ${esc(p.title)}" data-comparison-remove="${esc(p.id)}">${esc(p.title)} <span>×</span></button>`).join('')}</div><div class="ui-selection-tools"><button class="outline-button" data-comparison-action="find-parameter">按参数补选文献</button><button class="text-button" data-comparison-action="pick-list">返回列表勾选</button><button class="text-button" data-comparison-action="find-y">在全库找当前 Y 参数</button></div></details>`}
      <div class="comparison-tabs"><button data-comparison-tab="table" class="${tab==='table'?'active':''}">参数对照表</button><button data-comparison-tab="chart" class="${tab==='chart'?'active':''}">科研绘图</button><button id="comparison-table-export" class="text-button" data-comparison-action="export-csv" ${tab==='table'?'':'hidden'}>导出测量 CSV</button></div>
      <div id="comparison-table-panel" ${tab==='table'?'':'hidden'}><div class="comparison-table-scroll">${materialMode?materialMatrixHTML(papers,parameterOptions(papers),esc):comparisonMatrix(papers,parameterOptions(papers),esc)}</div><p class="chart-footnote">${materialMode?tr('每列对应独立的材料、样品和测试条件；来源文献单独列出，原始材料名称保持不变。'):tr('点击参数名称即可查找全库文献。')}同名不同单位独立分行，记录保留样品、条件、来源和误差。</p></div>
      <div id="comparison-chart-panel" ${tab==='chart'?'':'hidden'}><div class="figure-workspace"><aside class="figure-settings">
      <label>搜索坐标参数<input id="chart-axis-query" type="search" placeholder="输入参数名称或单位…"></label>
      <label>图像类型<select data-chart-setting="type">${[['line',tr('年份 / 参数折线图')],['scatter',tr('性能关联散点图')],['bar',tr('文献 / 样品柱状对比')]].map(([value,label])=>`<option value="${value}" ${settings.type===value?'selected':''}>${label}</option>`).join('')}</select></label>
      <label>横坐标 X<select data-chart-setting="x">${axisOptions('x')}</select></label><button class="text-button figure-swap" data-comparison-action="swap" title="交换横纵坐标" aria-label="交换横纵坐标">${icon('swap')}</button>
      <label>纵坐标 Y · 名称 / 单位<select data-chart-setting="y">${axisOptions('y')}</select></label><p id="figure-unit-note" class="figure-unit-note"></p>
      <label>数据分组<select data-chart-setting="group">${[['condition',tr('按测试条件')],['all',tr('全部选中观测')],['paper',tr('按文献')],['material',tr('按材料')],['sample',tr('按样品')],['journal',tr('按期刊')],['firstTag',tr('按第一个标签')]].map(([value,label])=>`<option value="${value}" ${settings.group===value?'selected':''}>${label}</option>`).join('')}</select></label>
      <label>测试条件<select data-chart-setting="condition"></select></label><label>材料 / 样品筛选<input data-chart-setting="sample" value="${esc(settings.sample)}" placeholder="材料或样品名称包含…"></label>
      <label>图像标题<input data-chart-setting="title" value="${esc(settings.title)}" placeholder="自动使用参数名称与单位"></label>
      <details class="figure-advanced"><summary>高级绘图设置</summary><div class="figure-axis-grid"><label>X 坐标<select data-chart-setting="xScale"><option value="linear" ${settings.xScale==='linear'?'selected':''}>线性</option><option value="log" ${settings.xScale==='log'?'selected':''}>对数</option></select></label><label>Y 坐标<select data-chart-setting="yScale"><option value="linear" ${settings.yScale==='linear'?'selected':''}>线性</option><option value="log" ${settings.yScale==='log'?'selected':''}>对数</option></select></label>${[['xMin',tr('X 最小')],['xMax',tr('X 最大')],['yMin',tr('Y 最小')],['yMax',tr('Y 最大')]].map(([key,label])=>html`<label>${label}<input data-chart-setting="${key}" value="${esc(settings[key])}" inputmode="decimal" placeholder="自动"></label>`).join('')}</div>
      <label>IF 指标年份<select data-chart-setting="impactYear"><option value="">各刊最新 / 文献指定</option>${years.map(year=>`<option value="${esc(year)}" ${settings.impactYear===year?'selected':''}>${esc(year)}</option>`).join('')}</select></label>
      <label class="figure-check"><input type="checkbox" data-chart-setting="errorBars" ${settings.errorBars?'checked':''}>显示原始误差棒</label><label class="figure-check"><input type="checkbox" data-chart-setting="pointLabels" ${settings.pointLabels?'checked':''}>显示点数值</label><label class="figure-check"><input type="checkbox" data-chart-setting="includeQualified" ${settings.includeQualified?'checked':''}>包含约数 / 界限值</label>
      <label>自定义参考值 Y<input data-chart-setting="referenceY" value="${esc(settings.referenceY)}" inputmode="decimal" placeholder="不显示"></label><label>参考线名称<input data-chart-setting="referenceLabel" value="${esc(settings.referenceLabel)}"></label>
      <label>导出画布<select data-chart-setting="size">${[['landscape',tr('横版 4800 × 3000 PNG')],['wide',tr('宽屏 4800 × 2700 PNG')],['square',tr('方形 3600 × 3600 PNG')]].map(([value,label])=>`<option value="${value}" ${settings.size===value?'selected':''}>${label}</option>`).join('')}</select></label><button class="text-button" data-comparison-action="reset-settings">恢复默认绘图设置</button></details></aside>
      <div class="figure-preview-column"><div class="figure-preview-toolbar"><span id="chart-point-count"></span>${actionMenu('figure-export-options',tr('导出'),html`<button type="button" data-comparison-action="export-png">${icon('image')}图片 PNG</button><button type="button" data-comparison-action="export-svg">${icon('image')}矢量图 SVG</button><hr><button type="button" data-comparison-action="export-figure-csv">${icon('table')}当前图数据 CSV</button><button type="button" data-comparison-action="export-audit">${icon('table')}参与清单 CSV</button><button type="button" data-comparison-action="export-csv">${icon('table')}完整测量 CSV</button>`,{iconName:'download'})}</div><div class="figure-stage"><div id="comparison-chart" class="comparison-chart" aria-label="科研性能对比图"></div><div id="figure-empty" class="figure-empty" hidden><strong>当前条件没有可绘制的数据</strong><p>所选项目仍保留在选中集合。请核对单位、年份和条件，并查看下方逐篇说明。</p></div></div><div id="chart-warnings" class="chart-warnings" role="status"></div><div id="figure-participation"></div><p class="chart-footnote">保留每条原始观测，不平均、不拟合。柱状图按文献、材料与样品逐条显示，无需发表年份；${materialMode?tr('默认按材料分组时，不跨样品或条件连线；也可明确按测试条件或全部观测跨来源对照，原始材料记录不会合并。'):tr('折线仅连接组内原始点。')}误差棒使用录入的原始 ± 误差。</p></div></div></div>`,'comparison');
    picker.status();refreshConditions();if(tab==='chart')draw().catch(error=>showError(error));
  }
  function refreshConditions(){
    const host=$('[data-chart-setting="condition"]');if(!host)return;
    const key=settings.y.startsWith('m:')?settings.y.slice(2):'';
    const conditions=[...new Set(selected().flatMap(p=>paperMeasurements(p).filter(m=>!key||parameterKey(m.name,m.unit)===key).map(m=>m.conditions||'')))];
    if(settings.condition!=='*'&&!conditions.includes(settings.condition))settings.condition='*';
    host.innerHTML=tr('<option value="*">全部测试条件</option>',false)+conditions.map(condition=>`<option value="${esc(condition)}" ${condition===settings.condition?'selected':''}>${esc(condition||tr('条件未填'))}</option>`).join('');
    const axis=$('[data-chart-setting="x"]');axis.disabled=settings.type==='bar';
    const option=parameterOptions(config.getPapers()).find(item=>'m:'+item.key===settings.y),sameName=option?parameterInventory(config.getPapers()).find(item=>item.key===parameterNameKey(option.name)):null;
    $('#figure-unit-note').textContent=option?msg`当前单位：${option.unit||tr('未填写')}。${sameName?.units.length>1?msg`同名参数有 ${sameName.units.length} 种单位；其他单位的文献保留在选中集合，未绘制原因会逐篇列出。`:tr('同名同单位的数据一起比较。')}`:tr('请按需选择性能参数或期刊指标。');
  }
  function showError(error){chart?.clear();const host=$('#chart-warnings');if(host)host.textContent=error.message;const empty=$('#figure-empty');if(empty)empty.hidden=false;const audit=$('#figure-participation');if(audit)audit.replaceChildren();const count=$('#chart-point-count');if(count)count.textContent=tr('请先修正绘图设置');document.querySelectorAll('[data-comparison-action="export-png"],[data-comparison-action="export-svg"]').forEach(button=>button.disabled=true);}
  async function ensureCharts(){if(!globalThis.echarts){chartLoad ||= import('./vendor/echarts.min.js');await chartLoad;}if(!globalThis.echarts)throw new Error(tr('本地图表组件未加载，请重开程序。'));}
  function persist(){clearTimeout(preferenceTimer);preferenceTimer=setTimeout(()=>{try{validateFigureSettings(settings);Promise.resolve(config.savePreferences?.(cleanFigureSettings(settings))).catch(error=>config.toast(msg`绘图设置未保存：${error.message}`,true));}catch{}},400);}
  function figureResult(dimensions={}){const result=buildFigure(selected(),settings,config.getMetrics(),dimensions);if(picker.mode()==='material')result.data=picker.audit(result.data);return result;}
  async function draw(){
    const ticket=++revision;await ensureCharts();if(ticket!==revision||!$('#comparison-chart')||$('#comparison-chart-panel').hidden||!$('#comparison-chart').closest('dialog').open)return;
    const target=$('#comparison-chart'),result=figureResult({width:target.clientWidth,height:target.clientHeight});
    if(!chart){chart=globalThis.echarts.init($('#comparison-chart'),null,{renderer:'canvas'});observer=new ResizeObserver(()=>chart?.resize());observer.observe($('#comparison-chart'));}
    chart.setOption(result.option,true);$('#figure-empty').hidden=result.data.points.length>0;
    $('#chart-point-count').textContent=picker.mode()==='material'?msg`${result.data.summary.plottedSubjects} 项材料 / 样品 · ${result.data.summary.plottedPapers} 篇来源 · ${result.data.points.length} 个观测点`:msg`${result.data.summary.plottedPapers} 篇 · ${result.data.points.length} 个观测点`;
    $('#chart-warnings').textContent=result.data.warnings.join('；')+(settings.type==='line'&&result.data.points.length===1?tr(' 仅一个点，不能形成折线。'):'');
    $('#figure-participation').innerHTML=participationHTML(result.data,esc);
    document.querySelectorAll('[data-comparison-action="export-png"],[data-comparison-action="export-svg"]').forEach(button=>button.disabled=!result.data.points.length);persist();
  }
  async function exportChart(type){
    await ensureCharts();const [width,height]=FIGURE_SIZES[settings.size]||FIGURE_SIZES.landscape,result=figureResult({width,height});
    if(!result.data.points.length)throw new Error(tr('没有可导出的数据，请查看逐篇参与清单。'));
    const element=document.createElement('div');element.style.cssText=`position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;`;document.body.append(element);
    const output=globalThis.echarts.init(element,null,{renderer:type==='svg'?'svg':'canvas',width,height});
    try{output.setOption(result.option,true);await config.saveDataURL(output.getDataURL({type,pixelRatio:3,backgroundColor:'#fff'}),`materia-performance-${settings.type}.${type}`,type);}finally{output.dispose();element.remove();}
  }
  document.addEventListener('change',async event=>{try{if(event.target.dataset.compareId){await toggle(event.target.dataset.compareId);return;}const key=event.target.dataset.chartSetting;if(key){settings[key]=event.target.type==='checkbox'?event.target.checked:event.target.value;if(['x','y','type'].includes(key))refreshConditions();await draw();}}catch(error){showError(error);}});
  document.addEventListener('input',event=>{
    if(event.target.id==='chart-axis-query'){for(const axis of ['x','y'])$(`[data-chart-setting="${axis}"]`).innerHTML=axisOptions(axis,event.target.value);return;}
    if(event.target.matches('input[data-chart-setting]:not([type=checkbox])')){settings[event.target.dataset.chartSetting]=event.target.value;clearTimeout(inputTimer);inputTimer=setTimeout(()=>draw().catch(showError),220);}
  });
  document.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button)return;
    try{
      if(button.dataset.comparisonTab){tab=button.dataset.comparisonTab;$('#comparison-table-panel').hidden=tab!=='table';$('#comparison-chart-panel').hidden=tab!=='chart';$('#comparison-table-export').hidden=tab!=='table';document.querySelectorAll('[data-comparison-tab]').forEach(item=>item.classList.toggle('active',item.dataset.comparisonTab===tab));if(tab==='chart')await draw();return;}
      if(button.dataset.comparisonRemove){await toggle(button.dataset.comparisonRemove);open(tab);return;}
      const action=button.dataset.comparisonAction;if(!action)return;
      if(action==='open')open('table',null,button.closest('#comparison-bar')?'paper':null);if(action==='chart' && !(picker.mode()==='paper'&&await config.plotActiveParameter?.()))open('chart');if(action==='select-filtered'){await selectFiltered();open();}if(action==='pick-list')config.pickList();if(action==='clear')await selectIds([]);
      if(action==='find-parameter')config.openParameterFinder();
      if(action==='find-y'){const option=parameterOptions(config.getPapers()).find(item=>'m:'+item.key===settings.y);option?await config.findParameter(option.name,'*'):config.openParameterFinder();}
      if(action==='export-csv')await config.saveText(measurementsCSV(selected()),'materia-performance-all-measurements.csv','csv');
      if(action==='export-figure-csv'||action==='export-audit'){const result=figureResult();await config.saveText(action==='export-audit'?participationCSV(result.data):figureDataCSV(result.data,result.xLabel,result.yLabel),action==='export-audit'?'materia-figure-participation.csv':'materia-figure-data.csv','csv');}
      if(action==='export-png'||action==='export-svg'){button.disabled=true;try{await exportChart(action.endsWith('png')?'png':'svg');}finally{button.disabled=false;}}
      if(action==='swap'&&settings.type!=='bar'){[settings.x,settings.y]=[settings.y,settings.x];[settings.xScale,settings.yScale]=[settings.yScale,settings.xScale];[settings.xMin,settings.yMin]=[settings.yMin,settings.xMin];[settings.xMax,settings.yMax]=[settings.yMax,settings.xMax];open('chart');}
      if(action==='reset-settings'){settings={...FIGURE_DEFAULTS,y:settings.y};open('chart');}
    }catch(error){button.disabled=false;config.toast(error.message,true);}
  });
  return {open,dispose,openMaterials:(preferred=null,next='table')=>picker.open(preferred,next),selectMaterials:picker.selectKeys,setMaterialGroups:picker.setGroups,flushSelection:picker.flush,loadSelectionPreferences:picker.load,getMaterialSelection:picker.getState,refreshBar,toggle,selectFiltered,selectIds,loadPreferences:value=>{settings=cleanFigureSettings(value);}};
}
