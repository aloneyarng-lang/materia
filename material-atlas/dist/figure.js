import {t as tr,html,msg} from './i18n.js';
import { axisLabel, parameterOptions, strictNumber } from './parameters.js';
import { chartDataset } from './chart-data.js';
import { PALETTE } from './palette.js';

export const FIGURE_DEFAULTS = {x:'year',y:'',type:'line',group:'condition',condition:'*',sample:'',title:'',includeQualified:false,impactYear:'',xScale:'linear',yScale:'linear',xMin:'',xMax:'',yMin:'',yMax:'',errorBars:true,pointLabels:false,referenceY:'',get referenceLabel(){return tr('参考值');},size:'landscape'};
export const FIGURE_SIZES = {landscape:[1600,1000],wide:[1600,900],square:[1200,1200]};
const esc = value => String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const shorten = (value,length) => value.length > length ? value.slice(0,length-1)+'…' : value;
const parse = value => value === '' || value == null ? undefined : strictNumber(value,tr('坐标范围'));

export function cleanFigureSettings(value = {}) {
  const output = {...FIGURE_DEFAULTS};
  for (const key of Object.keys(output)) if (value[key] !== undefined) output[key] = typeof output[key] === 'boolean' ? Boolean(value[key]) : String(value[key]).slice(0,key==='title'?500:key==='condition'?3000:2000);
  for (const [key,allowed] of Object.entries({type:['line','scatter','bar'],group:['condition','all','paper','material','sample','journal','firstTag'],xScale:['linear','log'],yScale:['linear','log'],size:Object.keys(FIGURE_SIZES)})) if (!allowed.includes(output[key])) output[key]=FIGURE_DEFAULTS[key];
  return output;
}

export function validateFigureSettings(settings) {
  if (!settings.x || !settings.y) throw new Error(tr('请选择横纵坐标。'));
  for (const axis of ['x','y']) {
    if (axis==='x' && settings.type==='bar') continue;
    const min=parse(settings[axis+'Min']),max=parse(settings[axis+'Max']);
    if (min!==undefined && !Number.isFinite(min) || max!==undefined && !Number.isFinite(max)) throw new Error(msg`${axis.toUpperCase()} 轴范围需要填写有效数字。`);
    if (min!==undefined && max!==undefined && min>=max) throw new Error(msg`${axis.toUpperCase()} 轴最小值必须小于最大值。`);
    if (settings[axis+'Scale']==='log' && (min!==undefined && min<=0 || max!==undefined && max<=0)) throw new Error(tr('对数轴的范围必须大于 0。'));
  }
  const reference=settings.referenceY===''?undefined:strictNumber(settings.referenceY,tr('参考值'));
  if (settings.yScale==='log' && reference!==undefined && reference<=0) throw new Error(tr('对数轴参考值必须大于 0。'));
}

function errorRenderer(horizontal, color) {
  return (_params,api) => {
    const x=api.value(0),y=api.value(1),start=api.coord(horizontal?[api.value(2),y]:[x,api.value(2)]),end=api.coord(horizontal?[api.value(3),y]:[x,api.value(3)]),cap=4;
    return {type:'group',children:[{type:'line',shape:{x1:start[0],y1:start[1],x2:end[0],y2:end[1]}},{type:'line',shape:horizontal?{x1:start[0],y1:start[1]-cap,x2:start[0],y2:start[1]+cap}:{x1:start[0]-cap,y1:start[1],x2:start[0]+cap,y2:start[1]}},{type:'line',shape:horizontal?{x1:end[0],y1:end[1]-cap,x2:end[0],y2:end[1]+cap}:{x1:end[0]-cap,y1:end[1],x2:end[0]+cap,y2:end[1]}}].map(child=>({...child,style:{stroke:color,lineWidth:1.3,opacity:.8}}))};
  };
}

export function buildFigure(papers, suppliedSettings, metrics = [], dimensions = {}) {
  const settings=cleanFigureSettings(suppliedSettings);validateFigureSettings(settings);
  const width=dimensions.width || 1200,height=dimensions.height || 700,large=width>=1500,font=large?18:12;
  const materialMode=papers.some(p=>p.comparisonSubject);
  const options=parameterOptions(papers),data=chartDataset(papers,settings,metrics),isBar=settings.type==='bar';
  const xLabel=isBar?(materialMode?tr('材料 / 样品'):tr('文献 / 材料 / 样品')):axisLabel(settings.x,options),yLabel=axisLabel(settings.y,options),groups=new Map();
  data.points.forEach((point,index)=>{
    if(isBar&&materialMode)point.category=`${index+1}. ${point.materialName}${point.sample?' / '+point.sample:''}${point.conditions?' / '+point.conditions:''}`;
    else if(isBar)point.category=`${index+1}. ${point.title}${point.materialName?' / '+point.materialName:''}${point.sample&&point.sample!==point.materialName?' / '+point.sample:''}`;
    const key=point.groupKey || point.group;if(!groups.has(key))groups.set(key,{label:point.group,points:[]});groups.get(key).points.push({...point,index});
  });
  const labels=new Map(),series=[],warnings=[...data.warnings];
  let errorSkipped=0;
  [...groups].forEach(([key,group],index)=>{
    const name=labels.has(group.label)?`${group.label} (${index+1})`:group.label;labels.set(name,key);
    const color=PALETTE[index%PALETTE.length];
    const items=isBar?data.points.map((point,i)=>group.points.some(item=>item.index===i)?{...point,value:[i,point.y]}:{value:[i,null]}):group.points.map(point=>({...point,value:[point.x,point.y]}));
    series.push({name,type:settings.type,data:items,encode:{x:0,y:1},smooth:false,connectNulls:false,symbol:'circle',symbolSize:large?10:7,barMaxWidth:large?48:28,barGap:'-100%',lineStyle:{width:large?3:2},itemStyle:{color,borderColor:'#fff',borderWidth:1},label:{show:settings.pointLabels,position:'top',fontSize:font-2,color:'#53635e',formatter:params=>params.data?.value?.[1]??''},emphasis:{focus:'series'}});
    if(materialMode&&settings.type==='line'&&settings.group!=='material'&&new Set(group.points.map(point=>point.paperId+'|'+point.materialId)).size>1)warnings.push('「'+shorten(group.label,30)+tr('」包含多个独立材料 / 来源；当前连线用于观测对照，未合并原始材料。可改为按材料分组。',false));
    if(settings.type==='line' && new Set(group.points.map(point=>point.conditions)).size>1)warnings.push(msg`「${shorten(group.label,30)}」含不同测试条件；可按测试条件分组后比较。`);
    if(settings.errorBars)for(const axis of ['x','y']){
      if(isBar&&axis==='x')continue;
      const errors=[];
      for(const point of group.points){const value=point[axis],error=point[axis+'Uncertainty'];if(error==null||error===0)continue;if(!Number.isFinite(error)||error<0||(settings[axis+'Scale']==='log'&&value-error<=0)){errorSkipped++;continue;}errors.push([isBar?point.index:point.x,point.y,value-error,value+error]);}
      if(errors.length)series.push({name,type:'custom',renderItem:errorRenderer(axis==='x',color),data:errors,silent:true,z:5,clip:true,tooltip:{show:false},encode:{x:axis==='x'?[2,3]:0,y:axis==='y'?[2,3]:1}});
    }
  });
  if(errorSkipped)warnings.push(msg`${errorSkipped} 条误差范围无法在当前坐标中显示；原始误差仍保留在图数据 CSV 中。`);
  if(settings.referenceY!=='' && series.length)series[0].markLine={silent:true,symbol:'none',lineStyle:{type:'dashed',color:'#af8d56',width:1.5},label:{formatter:settings.referenceLabel||tr('参考值'),fontSize:font-1,color:'#9a7b4f'},data:[{yAxis:strictNumber(settings.referenceY)}]};
  const yearBounds=axis=>{if(settings[axis]!=='year'||!data.points.length)return{};const values=data.points.map(point=>point[axis]);return{min:Math.min(...values)-1,max:Math.max(...values)+1};};
  const numericAxis=axis=>({type:settings[axis+'Scale']==='log'?'log':'value',name:axis==='x'?xLabel:yLabel,nameLocation:'middle',nameGap:axis==='x'?(large?70:50):(large?105:75),nameRotate:axis==='y'?90:0,nameTextStyle:{fontSize:font+1},scale:true,min:parse(settings[axis+'Min'])??yearBounds(axis).min,max:parse(settings[axis+'Max'])??yearBounds(axis).max,minInterval:settings[axis]==='year'?1:undefined,axisLine:{show:true,lineStyle:{color:'#4e605a',width:1.1}},axisTick:{show:true},axisLabel:{fontSize:font,color:'#5d6d66',hideOverlap:true,formatter:settings[axis]==='year'?value=>String(Math.round(value)):undefined},splitLine:{lineStyle:{color:'#e8ede8',type:'dashed'}}});
  const title=settings.title || (isBar?msg`${yLabel} · ${materialMode?tr('材料'):tr('文献')}对比`:msg`${yLabel} 与 ${xLabel}`);
  const option={animation:false,backgroundColor:'#fff',color:PALETTE,textStyle:{fontFamily:'Arial, Microsoft YaHei, sans-serif',fontSize:font,color:'#354b42'},title:{text:title.length>80?title.slice(0,80)+'\n'+title.slice(80):title,left:'center',top:large?26:20,textStyle:{fontSize:large?26:18,fontWeight:500,color:'#34594b',lineHeight:large?34:25}},legend:{data:[...labels.keys()],bottom:large?26:12,type:'scroll',textStyle:{fontSize:font-1,color:'#647269'},formatter:name=>shorten(name,42)},grid:{left:large?165:115,right:large?105:65,top:title.length>80?(large?140:110):(large?110:88),bottom:isBar?(large?180:150):(large?145:110)},tooltip:{trigger:'item',confine:true,backgroundColor:'#fffefa',borderColor:'#dce5d7',textStyle:{fontSize:12,color:'#46604c'},formatter:params=>{const p=params.data;if(!p?.title)return'';return html`<strong>${esc(p.materialName||tr('材料未填'))}</strong>${p.sample?tr('<br>样品：',false)+esc(p.sample):''}<br><span>来源文献：${esc(p.title)}</span><br>${esc([p.year,p.journal].filter(Boolean).join(' · '))}${p.doi?'<br>DOI: '+esc(p.doi):''}<br>${esc(yLabel)}: ${esc(p.qualifier)}${p.y}${p.yUncertainty!=null?' ± '+p.yUncertainty:''}${isBar?'':`<br>${esc(xLabel)}: ${esc(p.xQualifier)}${p.x}${p.xUncertainty!=null?' ± '+p.xUncertainty:''}`}<br>条件：${esc(p.conditions||tr('未填写'))}${p.source?tr('<br>数据位置：',false)+esc(p.source):''}`;}},xAxis:isBar?{type:'category',name:xLabel,nameLocation:'middle',nameGap:large?115:100,data:data.points.map((point,index)=>materialMode?`${index+1}. ${shorten(point.materialName,22)}${point.sample?'\n'+shorten(point.sample,18):''}`:`${index+1}. ${shorten(point.title,21)}${point.materialName?'\n'+shorten(point.materialName,17):''}${point.sample&&point.sample!==point.materialName?' / '+shorten(point.sample,17):''}`),axisLabel:{fontSize:font-2,color:'#6b796e',rotate:data.points.length>6?30:0,interval:data.points.length>12?Math.ceil(data.points.length/12)-1:0,hideOverlap:true},axisLine:{lineStyle:{color:'#4e605a'}},axisTick:{alignWithLabel:true}}:numericAxis('x'),yAxis:numericAxis('y'),series};
  return {option,data:{...data,warnings:[...new Set(warnings)]},settings,xLabel,yLabel,width,height};
}
