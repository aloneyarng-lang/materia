import {normalizeAnchor} from './note-model.js';

export const isTextMark=anchor=>['highlight','underline'].includes(anchor?.kind);

// Store separate line fragments in page coordinates, never a block across columns.
export function selectionFragments(rectangles,bounds){
  if(!(bounds.width>0&&bounds.height>0))return[];
  const fragments=[];
  for(const r of rectangles){
    const left=Math.max(bounds.left,r.left),top=Math.max(bounds.top,r.top);
    const right=Math.min(bounds.left+bounds.width,r.right),bottom=Math.min(bounds.top+bounds.height,r.bottom);
    if(right-left<.5||bottom-top<.5)continue;
    const part={x:(left-bounds.left)/bounds.width,y:(top-bounds.top)/bounds.height,width:(right-left)/bounds.width,height:(bottom-top)/bounds.height};
    if(fragments.some(p=>Math.abs(p.x-part.x)<.0001&&Math.abs(p.y-part.y)<.0001&&Math.abs(p.width-part.width)<.0001&&Math.abs(p.height-part.height)<.0001))continue;
    fragments.push(part);
  }
  return fragments;
}

export function textMarkAnchor({kind='highlight',page,rects,color='yellow',fingerprint=''}){
  if(!rects?.length||!['highlight','underline'].includes(kind))throw Error('请先选择同一页中的文字。');
  const x=Math.min(...rects.map(r=>r.x)),y=Math.min(...rects.map(r=>r.y));
  const right=Math.max(...rects.map(r=>r.x+r.width)),bottom=Math.max(...rects.map(r=>r.y+r.height));
  return normalizeAnchor({kind,page,rects,rect:{x,y,width:right-x,height:bottom-y},color,fingerprint});
}
