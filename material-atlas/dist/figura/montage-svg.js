import {montageLayout} from './montage-layout.js';
import {parseSVG, parseStaticSVG, sanitizeSVG} from './svg.js';

const ns = 'http://www.w3.org/2000/svg';
const localPaint = /^url\(#([a-z_][\w.-]*)\)$/i;
const coordinate = value => Number(value.toFixed(3));

function scopeIDs(panel, prefix) {
  const elements = [panel,...panel.querySelectorAll('*')], ids = new Map();
  for (const element of elements) {
    const original = element.getAttribute('id');
    if (!original) continue;
    const id = prefix + 'id-' + (ids.size+1);
    // In a source with duplicate IDs, references normally resolve to the first one.
    if (ids.has(original)) element.removeAttribute('id');
    else {
      ids.set(original,id);
      element.setAttribute('id',id);
    }
  }
  for (const element of elements) {
    for (const attr of element.attributes) {
      const reference = localPaint.exec(attr.value);
      if (reference) element.setAttribute(attr.name,'url(#'+(ids.get(reference[1]) || prefix+'missing')+')');
      if (attr.name === 'aria-labelledby' || attr.name === 'aria-describedby') {
        element.setAttribute(attr.name,attr.value.trim().split(/\s+/).map(value=>ids.get(value) || prefix+'missing').join(' '));
      }
    }
  }
}

function newFigure({width,height}) {
  const svg=document.createElementNS(ns,'svg');
  svg.setAttribute('width',width);
  svg.setAttribute('height',height);
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  return svg;
}

function fitSize(width,height) {
  if (!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0) throw Error('图片缺少有效尺寸。');
  const scale=Math.min(1,4000/width,4000/height);
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}

const length = value => {
  const number=/^([\d.]+)\s*(px|pt|mm|cm|in)?$/i.exec(value?.trim());
  return number ? Number(number[1])*({px:1,pt:4/3,mm:96/25.4,cm:96/2.54,in:96}[number[2]?.toLowerCase()||'px']) : NaN;
};

export async function figureFromImage({name,format,content}) {
  let size,panel;
  if (format==='svg') {
    panel=document.importNode(parseStaticSVG(content,true),true);
    const viewBox=panel.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
    const valid=viewBox?.length===4&&viewBox.every(Number.isFinite)&&viewBox[2]>0&&viewBox[3]>0;
    const width=length(panel.getAttribute('width')),height=length(panel.getAttribute('height'));
    size=Number.isFinite(width)&&Number.isFinite(height)?fitSize(width,height):fitSize(viewBox?.[2],viewBox?.[3]);
    if(!valid)panel.setAttribute('viewBox',`0 0 ${width} ${height}`);
    for(const key of ['x','y'])panel.removeAttribute(key);
  } else {
    if(!['png','jpeg'].includes(format))throw Error('仅支持 PNG、JPEG 和 SVG。');
    const url='data:image/'+format+';base64,'+content;
    const source=new Image();
    source.src=url;
    await source.decode().catch(()=>{throw Error('图片无法解码。');});
    size=fitSize(source.naturalWidth,source.naturalHeight);
    panel=document.createElementNS(ns,'image');
    panel.setAttribute('href',url);
  }
  panel.setAttribute('width',size.width);
  panel.setAttribute('height',size.height);
  panel.setAttribute('preserveAspectRatio','xMidYMid meet');
  const svg=newFigure(size);
  svg.append(panel);
  return {name:name.replace(/\.[^.]+$/,'').slice(0,250),svg:sanitizeSVG(new XMLSerializer().serializeToString(svg),size,true),...size};
}

export function composeMontage(montage) {
  const layout = montageLayout(montage);
  if (!layout) throw Error('请先加入至少一张图稿。');
  const size = {width:layout.width,height:layout.height};
  const root = newFigure(size);
  function set(node, attrs) {
    for (const [key,value] of Object.entries(attrs)) node.setAttribute(key,String(value));
    return node;
  }
  function append(tag, attrs, text) {
    const node = set(document.createElementNS(ns,tag),attrs);
    if (text) node.textContent = text;
    root.append(node);
  }
  append('title',{},montage.name.trim() || 'Figure panels');
  append('rect',{width:size.width,height:size.height,fill:'white'});
  montage.panels.forEach((figure,index) => {
    const {x,y,width,height,labelHeight,labelY,letter} = layout.placements[index];
    const panel = document.importNode(parseSVG(figure.svg,figure,true),true);
    scopeIDs(panel,'panel-'+(index+1)+'-');
    set(panel,{x:coordinate(x),y:coordinate(y+labelHeight),width:coordinate(width),height:coordinate(height-labelHeight),preserveAspectRatio:'xMidYMid meet',overflow:'hidden'});
    root.append(panel);
    if (labelHeight) append('text',{
      x:coordinate(x+labelHeight*.2), y:coordinate(labelY+labelHeight*.76),
      'font-family':'Arial, sans-serif','font-size':coordinate(labelHeight*.74),'font-weight':'700',fill:'#202124',
    },letter);
  });
  return {svg:sanitizeSVG(new XMLSerializer().serializeToString(root),size,true),size,montage:true};
}
