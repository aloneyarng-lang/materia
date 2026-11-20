export const MARK_COLORS={yellow:'#d5a83d',teal:'#348c84',blue:'#507db8',rose:'#b66781'};
export function normalizeAnchor(value){
  if(value==null)return null;
  const {page}=value,kind=value.kind;
  if(kind!==undefined&&!['region','text','arrow','highlight','underline'].includes(kind))throw new Error('标注类型不正确。');
  const point=p=>p&&['x','y'].every(key=>typeof p[key]==='number'&&Number.isFinite(p[key])&&p[key]>=0&&p[key]<=1);
  if(kind==='arrow'&&(!point(value.start)||!point(value.end)||Math.hypot(value.start.x-value.end.x,value.start.y-value.end.y)<.002))throw new Error('箭头需要两个有效且不同的端点。');
  const rect=kind==='arrow'?rectFromPoints(value.start,value.end):value.rect;
  if(!Number.isInteger(page)||page<1||page>100000||!rect||!['x','y','width','height'].every(key=>typeof rect[key]==='number'&&Number.isFinite(rect[key]))||rect.x<0||rect.y<0||rect.width<=0||rect.height<=0||rect.x+rect.width>1.000001||rect.y+rect.height>1.000001)throw new Error('PDF 标记位置不正确，请重新框选。');
  const extra={};if(kind!==undefined)extra.kind=kind;
  if(kind==='highlight'||kind==='underline'){
    if(!Array.isArray(value.rects)||!value.rects.length||value.rects.length>2000)throw new Error('文字标记位置不正确，请重新选择文字。');
    extra.rects=value.rects.map(part=>normalizeAnchor({page,rect:part}).rect);
    if(extra.rects.some(part=>part.x<rect.x-.000002||part.y<rect.y-.000002||part.x+part.width>rect.x+rect.width+.000002||part.y+part.height>rect.y+rect.height+.000002))throw new Error('文字标记超出选文范围。');
  }
  if(value.label!==undefined){if(typeof value.label!=='string'||value.label.length>500)throw new Error('页内标注文字最多 500 字。');extra.label=value.label;}
  if(value.fontSize!==undefined){if(!Number.isFinite(value.fontSize)||value.fontSize<10||value.fontSize>32)throw new Error('标注字号需要在 10–32 之间。');extra.fontSize=value.fontSize;}
  if(kind==='arrow')for(const key of ['start','end'])extra[key]={x:Math.round(value[key].x*1e6)/1e6,y:Math.round(value[key].y*1e6)/1e6};
  return{page,rect:Object.fromEntries(['x','y','width','height'].map(key=>[key,Math.round(rect[key]*1e6)/1e6])),color:Object.hasOwn(MARK_COLORS,value.color)?value.color:'yellow',fingerprint:/^[a-f\d]{64}$/i.test(value.fingerprint||'')?value.fingerprint:'',...extra};
}
export function rectFromPoints(start,end){
  const clamp=v=>Math.min(1,Math.max(0,v));let x=Math.min(clamp(start.x),clamp(end.x)),y=Math.min(clamp(start.y),clamp(end.y)),width=Math.abs(clamp(end.x)-clamp(start.x)),height=Math.abs(clamp(end.y)-clamp(start.y));
  if(width<.006&&height<.006){width=.035;height=.025;x=clamp(start.x-width/2);y=clamp(start.y-height/2);}
  width=Math.max(.003,Math.min(1,width));height=Math.max(.003,Math.min(1,height));return{x:Math.min(x,1-width),y:Math.min(y,1-height),width,height};
}
export const anchorMatchesPaper=(anchor,paper)=>!anchor?.fingerprint||!paper.fingerprint||anchor.fingerprint===paper.fingerprint;
export function normalizeAttachments(value=[]){
  if(!Array.isArray(value)||value.length>6)throw new Error('每条笔记最多保留 6 张图片。');
  let total=0;const ids=new Set();
  return value.map(image=>{
    if(!image||typeof image.id!=='string'||!image.id||ids.has(image.id)||typeof image.dataUrl!=='string')throw new Error('批注图片格式不正确。');ids.add(image.id);
    const match=image.dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z\d+/]+={0,2})$/);if(!match||match[2].length>1400000)throw new Error('批注图片需为 PNG、JPEG 或 WebP，压缩后每张不超过 1 MB。');
    let binary;try{binary=atob(match[2]);}catch{throw new Error('批注图片已损坏。');}
    const signature=match[1]==='png'?binary.startsWith('\x89PNG\r\n\x1a\n'):match[1]==='jpeg'?binary.startsWith('\xff\xd8\xff'):binary.startsWith('RIFF')&&binary.slice(8,12)==='WEBP';
    if(!signature)throw new Error('批注图片内容与格式不一致。');
    total+=binary.length;if(total>6*1024*1024)throw new Error('这条笔记的图片总量超过 6 MB。');
    return{id:image.id.slice(0,120),name:String(image.name||'批注图片').slice(0,200),dataUrl:image.dataUrl,width:Number(image.width)||0,height:Number(image.height)||0};
  });
}
export function normalizeNotes(value={}){
  const result={};
  for(const[key,list]of Object.entries(value||{})){
    if((!key.startsWith('paper:')&&!key.startsWith('tag:'))||key.length>1500||!Array.isArray(list))continue;
    result[key]=list.filter(n=>n&&typeof n.id==='string'&&typeof n.body==='string').map(n=>{const anchor=normalizeAnchor(n.anchor??null),attachments=normalizeAttachments(n.attachments??[]);return{id:n.id.slice(0,120),body:n.body.slice(0,40000),createdAt:Number(n.createdAt)||Date.now(),updatedAt:Number(n.updatedAt)||Date.now(),...(anchor?{anchor}:{}),...(attachments.length?{attachments}:{})};});
  }
  return result;
}
export function cleanReaderState(value={}){
  return Object.fromEntries(Object.entries(value||{}).slice(-3000).filter(([id,row])=>/^[\w-]{1,120}$/.test(id)&&row&&Number.isInteger(row.page)&&row.page>0&&row.page<=100000).map(([id,row])=>[id,{page:row.page,zoom:['fit','page'].includes(row.zoom)?row.zoom:Math.max(.4,Math.min(3,Number(row.zoom)||1)),...(['paged','vertical','horizontal'].includes(row.flow)?{flow:row.flow}:{}),...(['single','spread','book'].includes(row.layout)?{layout:row.layout}:{}),...(typeof row.sidebarOpen==='boolean'?{sidebarOpen:row.sidebarOpen}:{}),...(Number.isFinite(row.sidebarWidth)?{sidebarWidth:Math.min(520,Math.max(270,row.sidebarWidth))}:{}),...(typeof row.wheelTurn==='boolean'?{wheelTurn:row.wheelTurn}:{})}]));
}
export function cleanReaderDrafts(value=[]){
  if(!Array.isArray(value)||value.length>200)throw new Error('本地草稿格式不正确或超过 200 条，请保存或清理一些草稿。');
  const unique=new Map();
  for(const row of value){if(!row||!/^[\w-]{1,120}$/.test(row.paperId)||!row.note||typeof row.note.id!=='string'||typeof row.note.body!=='string')continue;const note=normalizeNotes({['paper:'+row.paperId]:[row.note]})['paper:'+row.paperId][0];if(!note.id)continue;unique.set(row.paperId+'\n'+note.id,{paperId:row.paperId,note,baseUpdatedAt:Number(row.baseUpdatedAt)||0,savedAt:Number(row.savedAt)||Date.now()});}
  return[...unique.values()];
}
