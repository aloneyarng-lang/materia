// Data-only research canvas format. Shared by browser, native storage and exports.
export const CANVAS_FORMAT='materia-canvas',CANVAS_VERSION=1;
export const CANVAS_LIMITS={boards:50,nodes:300,edges:700,assets:24,documentBytes:12582912,storeBytes:41943040,code:250000};
export const CANVAS_SHAPES=['roundrect','rect','ellipse','diamond','hexagon'];
export const CANVAS_COLORS=['accent','blue','purple','gold','green','red','gray'];
const identifier=/^[a-zA-Z_][\w-]{0,99}$/;
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const fail=message=>{throw Error(message);};
const text=(v,max,label,required=false)=>{if(typeof v!=='string'||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)||v.length>max||required&&!v.trim())fail(label+'格式不正确或过长。');return v;};
const coord=(v,fallback=0)=>v===undefined?fallback:typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=50000?v:fail('节点坐标需在 ±50000 范围内。');
const viewCoord=v=>v===undefined?0:typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=200000?v:fail('视图位置超出范围。');
const color=v=>CANVAS_COLORS.includes(v)||/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(v)?v:fail('颜色需为预设名称或十六进制颜色。');
export function newCanvas(id,name='未命名画布',now=Date.now()){
 return{id,name,layout:'mindmap',direction:'both',nodes:[{id:'root',text:'研究主题',x:0,y:0,shape:'roundrect',color:'accent',note:'',paperId:'',tag:'',image:'',group:''}],edges:[],assets:{},codeDraft:'',hasCodeDraft:false,createdAt:now,updatedAt:now,camera:{x:0,y:0,scale:1}};
}
export function cleanCanvas(input){
 if(!object(input))fail('画布需要是对象。');
 const id=text(input.id,120,'画布 ID',true),name=text(input.name,100,'画布名称',true);
 if(!['mindmap','free'].includes(input.layout)||!['both','right','left','down'].includes(input.direction))fail('画布布局或方向不正确。');
 if(!Array.isArray(input.nodes)||input.nodes.length>300||!Array.isArray(input.edges)||input.edges.length>700)fail('每张画布最多 300 个节点、700 条连线。');
 const ids=new Set(),nodes=input.nodes.map(row=>{
  if(!object(row)||!identifier.test(row.id)||ids.has(row.id))fail('节点 ID 必须唯一，使用字母、数字、下划线或短横线，以字母或下划线开头。');ids.add(row.id);
  if(!CANVAS_SHAPES.includes(row.shape||'roundrect'))fail('不支持的节点形状。');
  return{id:row.id,text:text(row.text,400,'节点文字',true),x:coord(row.x),y:coord(row.y),shape:row.shape||'roundrect',color:color(row.color||'accent'),note:text(row.note??'',10000,'节点说明'),paperId:text(row.paperId??'',200,'文献链接'),tag:text(row.tag??'',80,'标签链接'),image:text(row.image??'',100,'图片 ID'),group:text(row.group??'',80,'分组')};
 });
 const edgeIds=new Set(),pairs=new Set(),edges=input.edges.map(row=>{
  if(!object(row)||!identifier.test(row.id)||edgeIds.has(row.id)||!ids.has(row.source)||!ids.has(row.target)||row.source===row.target)fail('连线 ID 需唯一，两端必须是不同的已有节点。');const pair=row.source+'\0'+row.target;if(pairs.has(pair))fail('同一方向的节点之间只保留一条连线。');edgeIds.add(row.id);pairs.add(pair);
  return{id:row.id,source:row.source,target:row.target,label:text(row.label??'',160,'连线文字'),dashed:row.dashed===true,arrow:row.arrow!==false};
 });
 const assets={};let bytes=0;if(input.assets!==undefined&&!object(input.assets))fail('图片资源格式不正确。');
 const rows=Object.entries(input.assets||{});if(rows.length>24)fail('每张画布最多 24 张图片。');
 for(const[key,row]of rows){
  if(['__proto__','prototype','constructor'].includes(key)||!identifier.test(key)||!object(row)||typeof row.data!=='string'||row.data.length>2800000)fail('图片资源 ID 或大小不正确。');
  const m=row.data.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z\d+/]+={0,2})$/);if(!m||m[2].length%4)fail('图片仅支持内嵌 PNG、JPEG、WebP。');
  let header;try{header=atob(m[2].slice(0,48));}catch{fail('图片数据已损坏。');}
  if(m[1]==='png'&&!header.startsWith('\x89PNG\r\n\x1a\n')||m[1]==='jpeg'&&!header.startsWith('\xff\xd8\xff')||m[1]==='webp'&&!(header.startsWith('RIFF')&&header.slice(8,12)==='WEBP'))fail('图片格式与文件内容不一致。');
  bytes+=row.data.length;if(bytes>10485760)fail('单张画布图片合计不超过 10 MB。');assets[key]={name:text(row.name||'图片',200,'图片名称'),data:row.data};
 }
 for(const node of nodes)if(node.image&&!Object.hasOwn(assets,node.image))fail('图片资源不存在：'+node.image);
 const camera=input.camera||{},scale=Number(camera.scale),result={id,name,layout:input.layout,direction:input.direction,nodes,edges,assets,codeDraft:text(input.codeDraft??'',250000,'规则草稿'),hasCodeDraft:input.hasCodeDraft===true||Boolean(input.codeDraft),createdAt:Number.isFinite(input.createdAt)?input.createdAt:Date.now(),updatedAt:Number.isFinite(input.updatedAt)?input.updatedAt:Date.now(),camera:{x:viewCoord(camera.x),y:viewCoord(camera.y),scale:Number.isFinite(scale)?Math.max(.1,Math.min(3,scale)):1}};
 if(JSON.stringify(result).length>CANVAS_LIMITS.documentBytes)fail('单张画布文件超过 12 MB。');return result;
}
export function cleanCanvasStore(value){
 if(value==null)return{version:1,selected:'',boards:[]};if(!object(value)||value.version!==1||!Array.isArray(value.boards)||value.boards.length>50)fail('画布库格式不正确或超过 50 张画布。');
 const boards=value.boards.map(cleanCanvas),ids=new Set();for(const b of boards){if(ids.has(b.id))fail('画布 ID 重复。');ids.add(b.id);}const result={version:1,selected:ids.has(value.selected)?value.selected:boards[0]?.id||'',boards};if(JSON.stringify(result).length>CANVAS_LIMITS.storeBytes)fail('画布库超过 40 MB，请先导出归档部分画布。');return result;
}
export function wrapCanvasText(input,width=184,maxLines=6){
 const lines=[];let line='',size=0;for(const char of input){const w=char.charCodeAt(0)>255?16:8;if(char==='\n'||size+w>width){lines.push(line);line='';size=0;if(lines.length>=maxLines){lines[maxLines-1]=lines[maxLines-1].slice(0,-1)+'…';return lines;}}if(char!=='\n'){line+=char;size+=w;}}if(line||!lines.length)lines.push(line);return lines;
}
export function canvasNodeSize(node){const width=node.shape==='diamond'?260:node.shape==='ellipse'?240:216,lines=wrapCanvasText(node.text,width-(node.shape==='diamond'?100:node.shape==='ellipse'?70:32)),height=Math.max(node.shape==='diamond'?116:72,lines.length*22+34+(node.image?126:0)+(node.paperId||node.tag||node.note?20:0));return{width,height,lines};}
export function canvasBounds(board){if(!board.nodes.length)return{x:-200,y:-120,width:400,height:240};const boxes=board.nodes.map(n=>{const s=canvasNodeSize(n);return{x:n.x-s.width/2,y:n.y-s.height/2,right:n.x+s.width/2,bottom:n.y+s.height/2};});const x=Math.min(...boxes.map(b=>b.x))-70,y=Math.min(...boxes.map(b=>b.y))-70;return{x,y,width:Math.max(...boxes.map(b=>b.right))+70-x,height:Math.max(...boxes.map(b=>b.bottom))+70-y};}
export function canvasNodesInRect(nodes,rect){
 const left=Math.min(rect.x,rect.x+rect.width),right=Math.max(rect.x,rect.x+rect.width),top=Math.min(rect.y,rect.y+rect.height),bottom=Math.max(rect.y,rect.y+rect.height);
 return nodes.filter(n=>{const s=canvasNodeSize(n);return n.x+s.width/2>=left&&n.x-s.width/2<=right&&n.y+s.height/2>=top&&n.y-s.height/2<=bottom;}).map(n=>n.id);
}
export function canvasDescendants(board,id){
 const children=new Map(board.nodes.map(n=>[n.id,[]]));if(!children.has(id))return[];
 for(const edge of board.edges)children.get(edge.source)?.push(edge.target);
 const found=new Set([id]),queue=[id];for(let i=0;i<queue.length;i++)for(const child of children.get(queue[i])||[])if(!found.has(child)){found.add(child);queue.push(child);}return queue;
}
export function moveCanvasNodes(nodes,positions,dx,dy){
 const originals=[...positions.values()];if(!originals.length)return;
 dx=Math.max(-50000-Math.min(...originals.map(n=>n.x)),Math.min(50000-Math.max(...originals.map(n=>n.x)),dx));
 dy=Math.max(-50000-Math.min(...originals.map(n=>n.y)),Math.min(50000-Math.max(...originals.map(n=>n.y)),dy));
 for(const node of nodes){const original=positions.get(node.id);if(original){node.x=original.x+dx;node.y=original.y+dy;}}
}
export const CANVAS_ARRANGEMENTS={auto:'智能紧凑整理',both:'左右平衡树',right:'向右分层',left:'向左分层',down:'向下分层',grid:'整齐网格',selection:'仅整理所选节点'};
export function arrangeCanvasMode(board,mode='auto',{aspect=1.5,selection=[]}={}){
 if(!Object.hasOwn(CANVAS_ARRANGEMENTS,mode))throw Error('请选择有效的整理方式。');
 const ids=new Set(selection),scoped=mode==='selection',nodes=scoped?board.nodes.filter(n=>ids.has(n.id)):board.nodes;
 if(scoped&&nodes.length<2)throw Error('请先选择至少两个节点。');
 const original={...board,nodes,edges:scoped?board.edges.filter(e=>ids.has(e.source)&&ids.has(e.target)):board.edges};
 const tree=['both','left','right','down'].includes(mode),arranged=arrangeCanvas({...original,...(tree?{layout:'mindmap',direction:mode}:mode==='grid'?{layout:'free'}:{})},{compact:mode==='auto'||scoped,aspect});
 if(!scoped)return{...arranged,...(mode==='grid'?{layout:board.layout}:{} )};
 const a=canvasBounds(original),b=canvasBounds(arranged),dx=a.x+a.width/2-b.x-b.width/2,dy=a.y+a.height/2-b.y-b.height/2;
 const updates=new Map(arranged.nodes.map(n=>[n.id,{...n,x:n.x+dx,y:n.y+dy}]));
 return{...board,nodes:board.nodes.map(n=>updates.get(n.id)||{...n})};
}
export function findCanvasPosition(nodes,node){
 const size=canvasNodeSize(node),dx=size.width+90,dy=size.height+50,free=(x,y)=>Math.abs(x)<49000&&Math.abs(y)<49000&&nodes.every(other=>{const s=canvasNodeSize(other);return Math.abs(other.x-x)>(s.width+size.width)/2+24||Math.abs(other.y-y)>(s.height+size.height)/2+30;});
 for(let i=0;i<220;i++){const points=i?[[node.x,node.y+dy*i],[node.x,node.y-dy*i],[node.x+dx*i,node.y],[node.x-dx*i,node.y]]:[[node.x,node.y]];for(const[x,y]of points)if(free(x,y))return{x,y};}throw Error('节点附近过于拥挤，请移动视图后添加。');
}
// Build a stable breadth-first forest: cross links cannot make a node needlessly deep.
export function arrangeCanvas(board,{compact=false,aspect=1.5}={}){
 const result={...board,nodes:board.nodes.map(n=>({...n}))},nodes=result.nodes;if(!nodes.length)return result;
 const dimensions=new Map(nodes.map(n=>[n.id,canvasNodeSize(n)]));
 const pack=blocks=>{
  const gap=180,total=blocks.reduce((sum,b)=>sum+(b.width+gap)*(b.height+gap),0),limit=Math.max(...blocks.map(b=>b.width),Math.sqrt(total*Math.max(.6,Math.min(2.4,aspect))));
  let x=0,y=0,rowHeight=0;
  for(const block of blocks){if(x&&x+block.width>limit){x=0;y+=rowHeight+gap;rowHeight=0;}for(const n of block.nodes){n.x+=x-block.x;n.y+=y-block.y;}x+=block.width+gap;rowHeight=Math.max(rowHeight,block.height);}
 };
 const bounds=rows=>{const boxes=rows.map(n=>{const d=dimensions.get(n.id);return{x:n.x-d.width/2,y:n.y-d.height/2,right:n.x+d.width/2,bottom:n.y+d.height/2};}),x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));return{nodes:rows,x,y,width:Math.max(...boxes.map(b=>b.right))-x,height:Math.max(...boxes.map(b=>b.bottom))-y};};
 const grid=rows=>{
  const cols=Math.max(1,Math.ceil(Math.sqrt(rows.length*1.3))),w=Math.max(...rows.map(n=>dimensions.get(n.id).width))+64,h=Math.max(...rows.map(n=>dimensions.get(n.id).height))+48;
  rows.forEach((n,i)=>{const row=Math.floor(i/cols),col=i%cols;n.x=(row%2?cols-1-col:col)*w;n.y=row*h;});
 };
 const named=[...new Set(nodes.map(n=>n.group).filter(Boolean))];
 if(compact&&named.length>=3){
  // Pack existing semantic groups as separate blocks, rather than a 20+ column chain.
  const groups=new Map();for(const n of nodes){const key=n.group||'';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(n);}
  const blocks=[];
  for(const rows of groups.values()){
   const ids=new Set(rows.map(n=>n.id)),local=arrangeCanvas({...board,nodes:rows,edges:board.edges.filter(e=>ids.has(e.source)&&ids.has(e.target)),direction:'right'});
   const b=canvasBounds(local);
   if(b.width>Math.max(1200,b.height*2.4)||b.height>Math.max(1200,b.width*2.4))grid(rows);
   else{const positions=new Map(local.nodes.map(n=>[n.id,n]));for(const n of rows){n.x=positions.get(n.id).x;n.y=positions.get(n.id).y;}}
   blocks.push(bounds(rows));
  }
  pack(blocks);return result;
 }
 if(board.layout==='free'){grid(nodes);return result;}
 const byId=new Map(nodes.map(n=>[n.id,n])),out=new Map(nodes.map(n=>[n.id,[]])),incoming=new Map(nodes.map(n=>[n.id,0]));
 for(const e of board.edges)if(byId.has(e.source)&&byId.has(e.target)){out.get(e.source).push(e.target);incoming.set(e.target,incoming.get(e.target)+1);}
 const children=new Map(nodes.map(n=>[n.id,[]])),visited=new Set(),roots=[];
 const candidates=[...nodes.filter(n=>!incoming.get(n.id)),...nodes.filter(n=>n.id==='root'),...nodes];
 for(const root of candidates){if(visited.has(root.id))continue;roots.push(root);visited.add(root.id);const queue=[root.id];for(let i=0;i<queue.length;i++)for(const id of out.get(queue[i]))if(!visited.has(id)){visited.add(id);children.get(queue[i]).push(id);queue.push(id);}}
 const down=board.direction==='down',sideSize=id=>{const d=dimensions.get(id);return down?d.width:d.height;},depthSize=id=>{const d=dimensions.get(id);return down?d.height:d.width;};
 // Merge subtree contours; siblings need space only at depths they both occupy.
 const merge=trees=>{
  const positions=new Map(),contours=[];let first=0,last=0;
  for(const [index,tree] of trees.entries()){
   let shift=0;if(index)for(let depth=0;depth<tree.contours.length;depth++)if(contours[depth])shift=Math.max(shift,contours[depth][1]+40-tree.contours[depth][0]);
   for(const [id,p]of tree.positions)positions.set(id,{depth:p.depth,side:p.side+shift});
   tree.contours.forEach((c,d)=>{const lo=c[0]+shift,hi=c[1]+shift;contours[d]=contours[d]?[Math.min(contours[d][0],lo),Math.max(contours[d][1],hi)]:[lo,hi];});
   if(!index)first=shift;last=shift;
  }
  const center=(first+last)/2;for(const p of positions.values())p.side-=center;for(const c of contours){c[0]-=center;c[1]-=center;}return{positions,contours};
 };
 const cache=new Map(),tree=id=>{
  if(cache.has(id))return cache.get(id);const merged=merge(children.get(id).map(tree)),positions=new Map([[id,{depth:0,side:0}]]);
  for(const [child,p]of merged.positions)positions.set(child,{depth:p.depth+1,side:p.side});
  const result={positions,contours:[[-sideSize(id)/2,sideSize(id)/2],...merged.contours]};cache.set(id,result);return result;
 };
 const blocks=[];
 for(const root of roots){
  const branches=children.get(root.id),sides=board.direction==='both'&&branches.length>1?[[],[]]:[branches];
  if(sides.length===2){const height=[0,0];for(const id of branches){const t=tree(id),extent=Math.max(...t.contours.map(c=>c[1]))-Math.min(...t.contours.map(c=>c[0]))+40,side=height[0]<=height[1]?0:1;sides[side].push(id);height[side]+=extent;}}
  const component=[root];root.x=0;root.y=0;
  for(let side=0;side<sides.length;side++){
   const merged=merge(sides[side].map(tree)),widths=[depthSize(root.id)];for(const [id,p]of merged.positions)widths[p.depth+1]=Math.max(widths[p.depth+1]||0,depthSize(id));
   const offsets=[0];for(let depth=1;depth<widths.length;depth++)offsets[depth]=offsets[depth-1]+widths[depth-1]/2+80+widths[depth]/2;
   const sign=board.direction==='left'||side===1?-1:1;
   for(const [id,p]of merged.positions){const n=byId.get(id),depth=offsets[p.depth+1]*sign;n.x=down?p.side:depth;n.y=down?depth:p.side;component.push(n);}
  }
  blocks.push(bounds(component));
 }
 pack(blocks);
 if(compact){const b=bounds(nodes);if(b.width>Math.max(1800,b.height*3.2)||b.height>Math.max(1800,b.width*3.2))grid(nodes);}
 return result;
}
export function exportCanvasDocument(board){return JSON.stringify({format:CANVAS_FORMAT,version:1,board:cleanCanvas(board)},null,2)+'\n';}
export function importCanvasDocument(input){if(typeof input==='string'){if(input.length>CANVAS_LIMITS.documentBytes+10000)fail('画布文件超过 12 MB。');try{input=JSON.parse(input);}catch{fail('画布文件不是有效 JSON。');}}if(!object(input)||input.format!==CANVAS_FORMAT||input.version!==1)fail('请选择版本 1 的 Materia 画布文件。');return cleanCanvas(input.board);}
const Q='("(?:[^"\\\\]|\\\\.)*")',ID='([a-zA-Z_][\\w-]{0,99})';
const match=(line,pattern)=>line.match(new RegExp('^'+pattern+'$'));
const quoted=value=>{try{return JSON.parse(value);}catch{fail('请使用 JSON 双引号字符串和转义。');}};
function attrs(value,allowed){const result={};for(const part of value.trim().split(/\s+/).filter(Boolean)){const m=part.match(/^([a-z]+)=([^\s=]+)$/);if(!m||!allowed.includes(m[1])||Object.hasOwn(result,m[1]))fail('不支持或重复的属性：'+part);result[m[1]]=m[2];}return result;}
export function parseCanvasRules(source,previous=newCanvas('canvas-preview')){
 if(typeof source!=='string'||source.length>250000)fail('规则文本不超过 250 KB。');
 const reservedEdges=new Set(previous.edges.map(e=>e.id));
 const fenced=source.trim().match(/^```(?:materia-canvas|mcanvas|text)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/);if(fenced)source='\n'+fenced[1]+'\n';
 const board={...previous,layout:'mindmap',direction:'both',nodes:[],edges:[],assets:{...previous.assets},codeDraft:'',hasCodeDraft:false},commands=[],nodeIds=new Set(),pairs=new Set();let header=false;
 for(const[index,raw]of source.replace(/^\uFEFF/,'').split(/\r?\n/).entries()){
  const line=raw.trim();if(!line||line.startsWith('//')||line.startsWith('#'))continue;
  try{let m;
   if(m=match(line,'canvas\\s+'+Q)){if(header)fail('canvas 名称只能定义一次。');board.name=text(quoted(m[1]),100,'画布名称',true);header=true;}
   else if(m=match(line,'layout\\s+(mindmap|free)'))board.layout=m[1];
   else if(m=match(line,'direction\\s+(both|right|left|down)'))board.direction=m[1];
   else if(m=match(line,'node\\s+'+ID+'\\s+'+Q)){if(nodeIds.has(m[1]))fail('节点 ID 重复：'+m[1]);nodeIds.add(m[1]);board.nodes.push({id:m[1],text:text(quoted(m[2]),400,'节点文字',true),x:0,y:0,shape:'roundrect',color:'accent',note:'',paperId:'',tag:'',image:'',group:''});}
   else if(m=match(line,ID+'\\s*->\\s*'+ID+'(?:\\s*:\\s*'+Q+')?')){const pair=m[1]+'\0'+m[2];if(pairs.has(pair))fail('重复连线。');pairs.add(pair);const old=previous.edges.find(e=>e.source===m[1]&&e.target===m[2]);let edgeId=old?.id;if(!edgeId){const hash=[...pair].reduce((v,c)=>(Math.imul(v,31)+c.charCodeAt(0))>>>0,7),base='edge_'+hash.toString(36);edgeId=base;let suffix=1;while(reservedEdges.has(edgeId))edgeId=base+'_'+suffix++;reservedEdges.add(edgeId);}board.edges.push({id:edgeId,source:m[1],target:m[2],label:m[3]?quoted(m[3]):'',dashed:false,arrow:true,line:index+1});}
   else if(m=match(line,'group\\s+'+Q+'\\s*\\[([^\\]]*)\\]'))commands.push({kind:'group',name:quoted(m[1]),ids:m[2].split(/[\s,]+/).filter(Boolean),line:index+1});
   else if(m=match(line,'(note|image)\\s+'+ID+'\\s+'+Q))commands.push({kind:m[1],id:m[2],value:quoted(m[3]),line:index+1});
   else if(m=match(line,'link\\s+'+ID+'\\s+(paper|tag)='+Q))commands.push({kind:m[2],id:m[1],value:quoted(m[3]),line:index+1});
   else if(m=match(line,'style\\s+'+ID+'\\s+(.+)'))commands.push({kind:'style',id:m[1],attrs:attrs(m[2],['shape','color']),line:index+1});
   else if(m=match(line,'position\\s+'+ID+'\\s+(-?\\d+(?:\\.\\d+)?)\\s+(-?\\d+(?:\\.\\d+)?)'))commands.push({kind:'position',id:m[1],x:Number(m[2]),y:Number(m[3]),line:index+1});
   else if(m=match(line,'edge-style\\s+'+ID+'\\s+'+ID+'\\s+(.+)'))commands.push({kind:'edge-style',source:m[1],target:m[2],attrs:attrs(m[3],['dashed','arrow']),line:index+1});
   else fail('无法识别这条规则，请查看规则说明。');
  }catch(error){throw Error(`第 ${index+1} 行：${error.message}`);}
 }
 if(!board.nodes.length)fail('至少需要一条 node 规则。');
 const byId=new Map(board.nodes.map(n=>[n.id,n])),explicit=new Map();
 for(const e of board.edges)if(!byId.has(e.source)||!byId.has(e.target)||e.source===e.target)fail(`第 ${e.line} 行：连线两端必须是不同的已有节点。`);
 for(const c of commands)try{
  if(c.kind==='group'){for(const id of c.ids){if(!byId.has(id))fail('节点不存在：'+id);byId.get(id).group=c.name;}continue;}
  if(c.kind==='edge-style'){const edge=board.edges.find(e=>e.source===c.source&&e.target===c.target);if(!edge)fail('对应连线不存在。');for(const[k,v]of Object.entries(c.attrs)){if(!['true','false'].includes(v))fail(k+' 只能为 true 或 false。');edge[k]=v==='true';}continue;}
  const n=byId.get(c.id);if(!n)fail('节点不存在：'+c.id);
  if(c.kind==='style'){if(c.attrs.shape&&!CANVAS_SHAPES.includes(c.attrs.shape))fail('不支持的节点形状。');if(c.attrs.color)color(c.attrs.color);Object.assign(n,c.attrs);}else if(c.kind==='position')explicit.set(c.id,{x:coord(c.x),y:coord(c.y)});else if(c.kind==='paper')n.paperId=c.value;else if(c.kind==='tag')n.tag=c.value;else {const value=c.kind==='image'?c.value.replace(/^asset:/,''):c.value;if(c.kind==='image'&&!Object.hasOwn(board.assets,value))fail('图片资源不存在：'+value);n[c.kind]=value;}
 }catch(error){fail(`第 ${c.line} 行：${error.message}`);}
 const arranged=arrangeCanvas(board),old=new Map(previous.nodes.map(n=>[n.id,n]));for(const n of arranged.nodes){const p=explicit.get(n.id)||old.get(n.id);if(p){n.x=p.x;n.y=p.y;}}
 const parked=arranged.nodes.filter(n=>old.has(n.id)||explicit.has(n.id));for(const n of arranged.nodes)if(!old.has(n.id)&&!explicit.has(n.id)){Object.assign(n,findCanvasPosition(parked,n));parked.push(n);}
 const used=new Set(arranged.nodes.map(n=>n.image).filter(Boolean));arranged.assets=Object.fromEntries(Object.entries(arranged.assets).filter(([id])=>used.has(id)));return cleanCanvas(arranged);
}
export function serializeCanvasRules(board){
 const q=JSON.stringify,lines=[`canvas ${q(board.name)}`,`layout ${board.layout}`,`direction ${board.direction}`,''];
 for(const n of board.nodes)lines.push(`node ${n.id} ${q(n.text)}`);lines.push('');for(const e of board.edges){lines.push(`${e.source} -> ${e.target}${e.label?' : '+q(e.label):''}`);if(e.dashed||!e.arrow)lines.push(`edge-style ${e.source} ${e.target} dashed=${e.dashed} arrow=${e.arrow}`);}lines.push('');
 for(const n of board.nodes){if(n.shape!=='roundrect'||n.color!=='accent')lines.push(`style ${n.id} shape=${n.shape} color=${n.color}`);if(n.note)lines.push(`note ${n.id} ${q(n.note)}`);if(n.paperId)lines.push(`link ${n.id} paper=${q(n.paperId)}`);if(n.tag)lines.push(`link ${n.id} tag=${q(n.tag)}`);if(n.image)lines.push(`image ${n.id} ${q('asset:'+n.image)}`);}
 for(const group of new Set(board.nodes.map(n=>n.group).filter(Boolean)))lines.push(`group ${q(group)} [${board.nodes.filter(n=>n.group===group).map(n=>n.id).join(', ')}]`);
 lines.push('','// 坐标可省略；保留 ID 可延续手工布局。');for(const n of board.nodes)lines.push(`position ${n.id} ${Math.round(n.x*10)/10} ${Math.round(n.y*10)/10}`);return lines.join('\n')+'\n';
}
export const CANVAS_EXAMPLE=`canvas "成分—工艺—结构—性能"\nlayout mindmap\ndirection right\n\nnode root "材料设计"\nnode composition "成分设计"\nnode process "制备与热处理"\nnode structure "微观结构"\nnode performance "力学性能"\n\nroot -> composition\nroot -> process\nprocess -> structure : "调控"\nstructure -> performance : "影响"\n\nstyle structure shape=hexagon color=purple\nstyle performance shape=roundrect color=gold\nnote structure "补充证据、实验条件与待验证的问题。"\ngroup "实验变量" [composition, process]\n`;
