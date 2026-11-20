export const montageLimit = 12;
const maxStoredSVG = 22 * 1024 * 1024;
export const positionLimit = 30000;

export const emptyMontage = () => ({name:'', columns:0, gap:20, labels:true, panels:[]});
export const clampWeight = value => Math.round(Math.max(.25,Math.min(3,value))*100)/100;
export const clampPosition = value => Math.round(Math.max(-positionLimit,Math.min(positionLimit,value)));

export function readMontage(value) {
  if (!value || !Array.isArray(value.panels) || value.panels.length > montageLimit
      || typeof value.name !== 'string' || value.name.length > 250
      || ![0,1,2,3,4].includes(value.columns) || ![12,20,32].includes(value.gap) || typeof value.labels !== 'boolean') {
    throw Error('拼版布局格式无效。');
  }
  let total = 0;
  const panels = value.panels.map(panel => {
    if (!panel || typeof panel.name !== 'string' || panel.name.length > 250 || typeof panel.svg !== 'string'
        || [panel.width,panel.height].some(size => !Number.isInteger(size) || size < 1 || size > 4000)
        || panel.weight != null && (!Number.isFinite(panel.weight) || panel.weight < .25 || panel.weight > 3)) throw Error('拼版中的图稿格式无效。');
    const positioned=panel.x!=null||panel.y!=null;
    if(positioned&&[panel.x,panel.y].some(value=>!Number.isFinite(value)||Math.abs(value)>positionLimit))throw Error('拼版图稿的位置无效。');
    total += panel.svg.length;
    return {name:panel.name,svg:panel.svg,width:panel.width,height:panel.height,weight:panel.weight??1,
      ...(positioned?{x:panel.x,y:panel.y}:{})};
  });
  if (total > maxStoredSVG) throw Error('拼版图稿合计过大，请减少图稿或精简内容。');
  const layout={name:value.name,columns:value.columns,gap:value.gap,labels:value.labels,panels};
  const missing=panels.filter(panel=>panel.x==null);
  if(missing.length){
    const positioned=panels.filter(panel=>panel.x!=null);
    const added=appendPanels({...layout,panels:positioned},missing).slice(positioned.length);
    let index=0;
    layout.panels=panels.map(panel=>panel.x==null?added[index++]:panel);
  }
  return layout;
}

export function panelBox(panel,labels) {
  const scale=Math.min(968/panel.width,440/panel.height)*(panel.weight??1);
  const labelHeight=labels?26:0;
  return {x:panel.x??0,y:panel.y??0,width:panel.width*scale,height:panel.height*scale+labelHeight,labelHeight};
}

export function arrangePanels({panels,columns,gap,labels}) {
  const count = panels.length;
  if (!count) return [];
  const perRow = Math.min(count, columns || (count <= 4 ? 2 : count <= 9 ? 3 : 4));
  const rows = Math.ceil(count / perRow);
  const rowSizes = Array.from({length:rows}, (_,row) => columns
    ? Math.min(perRow,count-row*perRow)
    : Math.floor(count/rows)+Number(row<count%rows));
  const tiles=panels.map(panel=>({...panelBox(panel,labels),panel}));
  let start=0;
  const lanes=rowSizes.map(length => {
    const items=tiles.slice(start,start+length);
    start+=length;
    return {items,natural:items.reduce((total,tile)=>total+tile.width,0),spacing:gap*(length-1)};
  });
  const width=Math.max(...lanes.map(row=>row.natural+row.spacing));
  let top=0;
  return lanes.flatMap(row=>{
    const height=Math.max(...row.items.map(tile=>tile.height));
    let x=(width-row.natural-row.spacing)/2;
    const result=row.items.map(tile=>{
      const panel={...tile.panel,x:clampPosition(x),y:clampPosition(top+(height-tile.height)/2)};
      x+=tile.width+gap;
      return panel;
    });
    top+=height+gap;
    return result;
  });
}

export function appendPanels(montage, additions) {
  if(!montage.panels.length)return arrangePanels({...montage,panels:additions});
  const {gap,labels}=montage, next=[...montage.panels];
  const occupied=next.map(panel=>panelBox(panel,labels));
  const startX=Math.min(...occupied.map(box=>box.x)),startY=Math.min(...occupied.map(box=>box.y));
  const right=Math.max(startX+2150,...occupied.map(box=>box.x+box.width));
  for(const panel of additions){
    const box=panelBox(panel,labels);
    const xs=[startX,...occupied.map(other=>Math.ceil(other.x+other.width+gap))].sort((a,b)=>a-b);
    const ys=[startY,...occupied.map(other=>Math.ceil(other.y+other.height+gap))].sort((a,b)=>a-b);
    const free=(left,top)=>occupied.every(other=>
      left+box.width+gap<=other.x||left>=other.x+other.width+gap||
      top+box.height+gap<=other.y||top>=other.y+other.height+gap);
    // If the area below existing panels reaches the coordinate limit, start in a clear lane above.
    let x=startX,y=Math.floor(startY-box.height-gap);
    for(const candidate of ys){
      if(candidate>positionLimit)break;
      const found=xs.find(left=>left<=positionLimit&&left+box.width<=right&&free(left,candidate));
      if(found!=null){x=found;y=candidate;break;}
    }
    const added={...panel,x:clampPosition(x),y:clampPosition(y)};
    occupied.push(panelBox(added,labels));
    next.push(added);
  }
  return next;
}

export function autoSizePanels(montage) {
  const {panels,gap,labels}=montage;
  if(panels.length<2)return [...panels];
  const tiles=panels.map((panel,index)=>{
    const box=panelBox(panel,labels),base=panelBox({...panel,weight:1},labels);
    return {index,box,base,area:box.width*(box.height-box.labelHeight)};
  });
  function partition(items) {
    if(items.length===1){
      const tile=items[0];
      return {tile,area:tile.area,width:tile.box.width,height:tile.box.height,minWidth:tile.base.width*.25,
        minHeight:(tile.base.height-tile.base.labelHeight)*.25+tile.base.labelHeight};
    }
    let choice;
    for(const [axis,size] of [['x','width'],['y','height']]){
      const ordered=[...items].sort((a,b)=>a.box[axis]+a.box[size]/2-b.box[axis]-b.box[size]/2);
      const span=Math.max(...items.map(tile=>tile.box[axis]+tile.box[size]))-Math.min(...items.map(tile=>tile.box[axis]));
      for(let cut=1;cut<ordered.length;cut++){
        const first=ordered.slice(0,cut),second=ordered.slice(cut);
        const clearance=Math.min(...second.map(tile=>tile.box[axis]))-Math.max(...first.map(tile=>tile.box[axis]+tile.box[size]));
        const centerGap=second[0].box[axis]+second[0].box[size]/2-first.at(-1).box[axis]-first.at(-1).box[size]/2;
        const score=(clearance+centerGap*.25)/span;
        const balance=Math.abs(first.length-second.length);
        if(!choice||score>choice.score+1e-8||Math.abs(score-choice.score)<1e-8&&balance<choice.balance){
          choice={axis,first,second,score,balance};
        }
      }
    }
    const first=partition(choice.first),second=partition(choice.second);
    const cross=choice.axis==='x'?'y':'x',crossSize=cross==='x'?'width':'height';
    const center=group=>(Math.min(...group.map(({box})=>box[cross]))+
      Math.max(...group.map(({box})=>box[cross]+box[crossSize])))/2;
    return {axis:choice.axis,first,second,area:first.area+second.area,offset:center(choice.second)-center(choice.first),
      width:choice.axis==='x'?first.width+gap+second.width:Math.max(first.width,second.width),
      height:choice.axis==='y'?first.height+gap+second.height:Math.max(first.height,second.height),
      minWidth:choice.axis==='x'?first.minWidth+gap+second.minWidth:Math.max(first.minWidth,second.minWidth),
      minHeight:choice.axis==='y'?first.minHeight+gap+second.minHeight:Math.max(first.minHeight,second.minHeight)};
  }
  const tree=partition(tiles);
  // The sketch determines the split directions, not the amount of blank space
  // left between panels. Size against the compact arrangement instead.
  const naturalWidth=tree.width,naturalHeight=tree.height;
  const scale=Math.min(1,3200/naturalWidth,3200/naturalHeight);
  const width=Math.max(tree.minWidth,naturalWidth*scale),height=Math.max(tree.minHeight,naturalHeight*scale);
  const result=new Array(panels.length);
  function fit(node,width,height) {
    if(node.tile){
      const {index,base}=node.tile;
      const imageHeight=base.height-base.labelHeight;
      const fittedWeight=Math.min(width/base.width,(height-base.labelHeight)/imageHeight);
      // Round down so panels remain inside their regions even at the minimum spacing.
      const weight=clampWeight(Math.floor((fittedWeight+1e-9)*100)/100);
      const panel={...panels[index],weight},box=panelBox(panel,labels);
      return {index,panel,width:box.width,height:box.height};
    }
    const horizontal=node.axis==='x',extent=horizontal?'width':'height',minimum=horizontal?'minWidth':'minHeight';
    const available=(horizontal?width:height)-gap;
    const preferred=node.first[extent]/(node.first[extent]+node.second[extent]);
    const fraction=.85*preferred+.15*node.first.area/node.area;
    const firstSize=Math.max(node.first[minimum],Math.min(available-node.second[minimum],available*fraction));
    const first=horizontal?fit(node.first,firstSize,height):fit(node.first,width,firstSize);
    const second=horizontal?fit(node.second,available-firstSize,height):fit(node.second,width,available-firstSize);
    const cross=horizontal?'height':'width',a=first[cross],b=second[cross];
    // Align small deviations, but retain deliberate staggering without letting
    // a stray drag leave a large empty band in the output.
    const limit=Math.max(a,b)*.8;
    const offset=Math.abs(node.offset)<Math.min(a,b)*.12?0:Math.max(-limit,Math.min(limit,node.offset));
    const secondStart=(a-b)/2+offset;
    const firstCross=Math.max(0,-secondStart),secondCross=Math.max(0,secondStart);
    const span=Math.max(firstCross+a,secondCross+b);
    return {horizontal,first,second,firstCross,secondCross,
      width:horizontal?first.width+gap+second.width:span,
      height:horizontal?span:first.height+gap+second.height};
  }
  function place(node,x,y) {
    if(node.panel){
      result[node.index]={...node.panel,x:clampPosition(x),y:clampPosition(y)};
      return;
    }
    const {first,second,firstCross,secondCross}=node;
    if(node.horizontal){
      place(first,x,y+firstCross);
      place(second,x+first.width+gap,y+secondCross);
    }else{
      place(first,x+firstCross,y);
      place(second,x+secondCross,y+first.height+gap);
    }
  }
  place(fit(tree,width,height),0,0);
  return result;
}

function boxesOf({panels,labels}) {
  const boxes=panels.map(panel=>panelBox(panel,labels));
  const pending=boxes.map((box,index)=>({box,index})).sort((a,b)=>a.box.y-b.box.y||a.box.x-b.box.x);
  let letter=0;
  while(pending.length){
    const start=pending[0].box.y;
    const end=pending.findIndex(item=>item.box.y>start+32);
    const row=pending.splice(0,end<0?pending.length:end).sort((a,b)=>a.box.x-b.box.x);
    for(const {index} of row)boxes[index].letter=String.fromCharCode(65+letter++);
  }
  return boxes;
}

export function montageBoard(montage) {
  const placements=boxesOf(montage);
  if(!placements.length)return null;
  const x=Math.min(0,...placements.map(box=>box.x))-250,y=Math.min(0,...placements.map(box=>box.y))-180;
  const width=Math.max(2500,...placements.map(box=>box.x+box.width-x+250));
  const height=Math.max(1520,...placements.map(box=>box.y+box.height-y+180));
  return {x,y,width,height,placements};
}

export function montageLayout(montage) {
  const placements=boxesOf(montage);
  if(!placements.length)return null;
  const margin=montage.gap;
  const x=Math.min(...placements.map(box=>box.x))-margin,y=Math.min(...placements.map(box=>box.y))-margin;
  const width=Math.max(100,...placements.map(box=>box.x+box.width-x+margin));
  const height=Math.max(100,...placements.map(box=>box.y+box.height-y+margin));
  // Leave enough headroom for the usual 300 DPI PNG export even on large layouts.
  const scale = Math.min(1,4000/width,4000/height,Math.sqrt(6400000/(width*height)));
  return {
    width:Math.ceil(width*scale), height:Math.ceil(height*scale),
    placements:placements.map(cell=>({
      x:(cell.x-x)*scale,y:(cell.y-y)*scale,width:cell.width*scale,height:cell.height*scale,
      labelHeight:cell.labelHeight*scale,labelY:(cell.y-y)*scale,letter:cell.letter,
    })),
  };
}
