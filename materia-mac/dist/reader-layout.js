export const READER_LAYOUTS={single:'单页',spread:'双页并排',book:'双页 · 封面独立'};
// Supersample small text while bounding both the new spread and individual canvases.
export const READER_RASTER_PIXEL_LIMIT=32000000;
export function readerRasterPlan(viewports,density=1){
  if(!viewports.length||viewports.some(v=>!Number.isFinite(v.width)||!Number.isFinite(v.height)||v.width<=0||v.height<=0))throw Error('PDF 页面尺寸异常。');
  const area=viewports.reduce((sum,v)=>sum+v.width*v.height,0);if(!Number.isFinite(area))throw Error('PDF 页面尺寸异常。');
  const dpr=Number.isFinite(density)&&density>0?density:1;
  const ratio=Math.min(Math.max(2,dpr*1.5),4,Math.sqrt(READER_RASTER_PIXEL_LIMIT/area),8192/Math.max(...viewports.flatMap(v=>[v.width,v.height])));
  return viewports.map(v=>{const width=Math.max(1,Math.floor(v.width*ratio)),height=Math.max(1,Math.floor(v.height*ratio));return{width,height,scaleX:width/v.width,scaleY:height/v.height};});
}
export function visibleReaderPages(page,total,layout='single'){
  total=Math.max(1,Math.floor(Number(total)||1));page=Math.min(total,Math.max(1,Math.floor(Number(page)||1)));
  if(layout==='single'||layout==='book'&&page===1)return[page];
  const start=layout==='book'?2+Math.floor((page-2)/2)*2:1+Math.floor((page-1)/2)*2;
  return[start,...(start<total?[start+1]:[])];
}
export function turnReaderPage(page,total,layout,direction){
  const pages=visibleReaderPages(page,total,layout);
  return direction>0?Math.min(total,pages.at(-1)+1):Math.max(1,pages[0]-1);
}
export function fitReaderScale(sizes,width,height,fit='fit',gap=18){
  const pageWidth=sizes.reduce((sum,size)=>sum+size.width,0),pageHeight=Math.max(...sizes.map(size=>size.height));
  const fitWidth=Math.max(100,width-gap*(sizes.length-1))/pageWidth;
  return Math.max(.05,fit==='page'?Math.min(fitWidth,Math.max(100,height)/pageHeight):fitWidth);
}
export function readerNoteContent(note){return Boolean(note.body?.trim()||note.anchor||note.attachments?.length);}
export function sameReaderNote(a,b){return Boolean(a&&b&&a.body===b.body&&JSON.stringify(a.anchor||null)===JSON.stringify(b.anchor||null)&&JSON.stringify(a.attachments||[])===JSON.stringify(b.attachments||[]));}
