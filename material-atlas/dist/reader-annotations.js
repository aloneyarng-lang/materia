import {t as tr,html,msg} from './i18n.js';
import {MARK_COLORS,normalizeAnchor,rectFromPoints} from './note-model.js';
import {TRANSLATION_LANGUAGES} from './study-model.js';
export const annotationName=anchor=>({text:tr('文字标注'),arrow:tr('箭头标注'),region:tr('区域标记')}[anchor?.kind]||tr('区域标记'));
const clamp=value=>Math.min(1,Math.max(0,value));
export function translationAnnotation({page,selectionRect,text,translatedText,targetLanguage='zh-CN',fingerprint='',pageAspect=792/612}){
  if(typeof text!=='string'||!text.trim()||text.length>4000||typeof translatedText!=='string'||!translatedText.trim())throw new Error(tr('选文或译文无效，请重新划词翻译。'));
  const source=normalizeAnchor({page,rect:selectionRect,fingerprint,color:'teal'}),translation=translatedText.trim();
  const body=msg`译文（${TRANSLATION_LANGUAGES[targetLanguage]||tr('目标语言')}）\n${translation}\n\n原文（第 ${page} 页）\n${text.trim()}`;
  if(body.length>40000)throw new Error(tr('译文过长，无法完整保存到一条批注，请缩小选文后重试。'));
  const width=Math.min(.48,Math.max(.4,source.rect.width)),lineWidth=width*612-20,aspect=Number.isFinite(pageAspect)&&pageAspect>.1&&pageAspect<10?pageAspect:792/612;
  const lineCount=label=>label.split('\n').reduce((sum,line)=>sum+Math.max(1,Math.ceil([...line].reduce((total,char)=>total+(char.charCodeAt(0)<128?6.6:12),0)/lineWidth)),0);
  let preview=translation.slice(0,240).replace(/[\uD800-\uDBFF]$/,''),label;
  do{label=tr('译文：',false)+preview+(preview.length<translation.length?tr('…（完整译文见详细批注）'):'');if((lineCount(label)*17.4+22)/(612*aspect)<=.34||preview.length<=20)break;preview=preview.slice(0,-1).replace(/[\uD800-\uDBFF]$/,'');}while(preview);
  const height=Math.max(.06,Math.min(.34,(lineCount(label)*17.4+22)/(612*aspect)));
  const x=Math.min(source.rect.x,1-width),below=source.rect.y+source.rect.height+.012,y=below+height<=1?below:Math.max(0,source.rect.y-height-.012);
  return{body,anchor:normalizeAnchor({kind:'text',page,rect:{x,y,width,height},color:'teal',fingerprint,label,fontSize:12})};
}
export function gestureAnnotation(tool,page,start,end,color='teal',fingerprint=''){
  start={x:clamp(start.x),y:clamp(start.y)};end={x:clamp(end.x),y:clamp(end.y)};
  if(tool==='arrow'){
    if(Math.hypot(start.x-end.x,start.y-end.y)<.008)end={x:clamp(start.x+.12),y:clamp(start.y+.06)};
    if(Math.hypot(start.x-end.x,start.y-end.y)<.008)end={x:clamp(start.x-.12),y:clamp(start.y-.06)};
    return normalizeAnchor({kind:'arrow',page,start,end,color,fingerprint,label:'',fontSize:14});
  }
  let rect=rectFromPoints(start,end);
  if(tool==='text'){
    if(Math.abs(start.x-end.x)<.025&&Math.abs(start.y-end.y)<.025)rect={x:Math.min(start.x,.72),y:Math.min(start.y,.91),width:.28,height:.09};
    else rect={...rect,width:Math.max(.12,rect.width),height:Math.max(.05,rect.height)};
    rect.x=Math.min(rect.x,1-rect.width);rect.y=Math.min(rect.y,1-rect.height);
  }
  return normalizeAnchor({kind:tool==='text'?'text':'region',page,rect,color,fingerprint,...(tool==='text'?{label:'',fontSize:14}:{})});
}
export function transformAnnotation(anchor,dx,dy,handle='move'){
  const next=structuredClone(anchor);
  if(next.kind==='arrow'){
    if(handle==='start'||handle==='end'){next[handle]={x:clamp(next[handle].x+dx),y:clamp(next[handle].y+dy)};if(Math.hypot(next.start.x-next.end.x,next.start.y-next.end.y)<.002)return anchor;}
    else{dx=Math.max(-Math.min(next.start.x,next.end.x),Math.min(1-Math.max(next.start.x,next.end.x),dx));dy=Math.max(-Math.min(next.start.y,next.end.y),Math.min(1-Math.max(next.start.y,next.end.y),dy));for(const key of ['start','end']){next[key].x+=dx;next[key].y+=dy;}}
  }else if(handle==='resize'){
    next.rect.width=Math.max(.04,Math.min(1-next.rect.x,next.rect.width+dx));next.rect.height=Math.max(.025,Math.min(1-next.rect.y,next.rect.height+dy));
  }else{next.rect.x=Math.max(0,Math.min(1-next.rect.width,next.rect.x+dx));next.rect.y=Math.max(0,Math.min(1-next.rect.height,next.rect.y+dy));}
  return normalizeAnchor(next);
}
export function annotationHTML(anchor,id,{escape:esc,selected=false,draft=false,width=1000,height=1000}={}){
  const r=anchor.rect,kind=anchor.kind||'region',color=MARK_COLORS[anchor.color]||MARK_COLORS.yellow,attrs=`data-reader-mark="${esc(id)}"`,state=`${selected?' selected':''}${draft?' draft':''}`,title=esc(anchor.label||annotationName(anchor)+tr(' · 点击添加详细批注',false)),font=Math.max(11,Math.min(28,(anchor.fontSize||14)*width/612));
  if(kind==='arrow'){
    const a={x:anchor.start.x*width,y:anchor.start.y*height},b={x:anchor.end.x*width,y:anchor.end.y*height},angle=Math.atan2(b.y-a.y,b.x-a.x),head=10;
    const wing1={x:b.x-head*Math.cos(angle-.42),y:b.y-head*Math.sin(angle-.42)},wing2={x:b.x-head*Math.cos(angle+.42),y:b.y-head*Math.sin(angle+.42)};
    const path=`M${a.x} ${a.y}L${b.x} ${b.y}`,labelWidth=Math.min(width*.29,260),left=Math.max(2,Math.min(width-labelWidth-2,a.x)),top=Math.max(2,a.y-48);
    return `<svg class="reader-arrow${state}" viewBox="0 0 ${width} ${height}" style="--mark-color:${color}" aria-hidden="true"><path class="reader-arrow-hit" ${attrs} data-annotation-drag="move" d="${path}"/><path class="reader-arrow-line" d="${path}"/><path class="reader-arrow-head" d="M${wing1.x} ${wing1.y}L${b.x} ${b.y}L${wing2.x} ${wing2.y}"/><circle class="reader-arrow-tail" cx="${a.x}" cy="${a.y}" r="3"/></svg>${anchor.label?`<button class="reader-arrow-caption${state}" ${attrs} data-annotation-drag="start" style="left:${left}px;top:${top}px;width:${labelWidth}px;--mark-color:${color};font-size:${font}px" title="${title}">${esc(anchor.label)}</button>`:''}${selected?['start','end'].map(key=>html`<button class="reader-annotation-handle" ${attrs} data-annotation-handle="${key}" style="left:${anchor[key].x*100}%;top:${anchor[key].y*100}%;--mark-color:${color}" aria-label="拖动箭头${key==='start'?tr('起点'):tr('终点')}"></button>`).join(''):''}`;
  }
  const geometry=`left:${r.x*100}%;top:${r.y*100}%;width:${r.width*100}%;height:${r.height*100}%;--mark-color:${color};font-size:${font}px`;
  return `<button class="reader-mark reader-${kind}-annotation${state}" ${attrs} data-annotation-drag="move" style="${geometry}" title="${title}" aria-label="${title}">${kind==='text'?`<span class="reader-callout-text">${esc(anchor.label||tr('双击输入标注文字'))}</span>`:anchor.label?`<span class="reader-region-caption">${esc(anchor.label)}</span>`:'<span class="reader-region-badge" aria-hidden="true">✎</span>'}</button>${selected?html`<button class="reader-annotation-handle reader-resize-handle" ${attrs} data-annotation-handle="resize" style="left:${(r.x+r.width)*100}%;top:${(r.y+r.height)*100}%;--mark-color:${color}" aria-label="拖动调整标注尺寸"></button>`:''}`;
}
