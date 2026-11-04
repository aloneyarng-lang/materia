import {visibleReaderPages,fitReaderScale,readerRasterPlan} from './reader-layout.js';

export function readerPageGroups(total,layout){
  const groups=[];
  for(let page=1;page<=total;){const pages=visibleReaderPages(page,total,layout);groups.push(pages);page=pages.at(-1)+1;}
  return groups;
}

// Keep lightweight page slots for navigation, and rasterize only nearby groups.
export function createContinuousReader({scroll,stage,doc,module,layout,flow,zoom,onPage,onPaint,onError}){
  const horizontal=flow==='horizontal',groups=readerPageGroups(doc.numPages,layout),records=new Map();
  let disposed=false,raf=0,current=0,jumping=false,queue=Promise.resolve();
  const track=document.createElement('div');track.className='reader-continuous-track';
  const width=Math.max(160,scroll.clientWidth-64),height=Math.max(160,scroll.clientHeight-64);
  track.style.padding='32px';
  if(!horizontal)track.style.width=width+64+'px';
  const slots=groups.map((pages,index)=>{
    const slot=document.createElement('section');slot.className='reader-page-slot';slot.dataset.group=index;
    slot.setAttribute('aria-label',`第 ${pages.join('、')} 页`);
    slot.style.width=width+'px';slot.style.height=height+'px';
    const label=document.createElement('span');label.className='reader-slot-loading';label.textContent=`第 ${pages.join('–')} 页`;slot.append(label);track.append(slot);return slot;
  });
  track.style.setProperty('--reader-slot-width',width+'px');track.style.setProperty('--reader-slot-height',height+'px');
  stage.replaceChildren(track);scroll.dataset.flow=flow;
  const selectionIn=slot=>{const selection=getSelection();return selection&&!selection.isCollapsed&&(slot.contains(selection.anchorNode)||slot.contains(selection.focusNode));};
  function release(index){
    const record=records.get(index);if(!record||selectionIn(slots[index]))return;
    record.cancelled=true;record.tasks.forEach(task=>task.cancel());record.layers.forEach(layer=>layer.cancel());
    slots[index].querySelectorAll('canvas').forEach(canvas=>{canvas.width=0;canvas.height=0;});
    slots[index].replaceChildren();delete slots[index].dataset.ready;records.delete(index);
  }
  function align(index,behavior='instant'){
    const slot=slots[index],r=slot.getBoundingClientRect(),s=scroll.getBoundingClientRect();
    const offset=horizontal?r.x+r.width/2-s.x-s.width/2:r.height>s.height-64?r.y-s.y-32:r.y+r.height/2-s.y-s.height/2;
    scroll.scrollTo(horizontal?{left:scroll.scrollLeft+offset,behavior}:{top:scroll.scrollTop+offset,behavior});
  }
  async function load(index){
    if(disposed||index<0||index>=groups.length)return;
    const existing=records.get(index);if(existing)return existing.promise;
    const slot=slots[index],record={tasks:[],layers:[],cancelled:false};records.set(index,record);
    record.promise=(async()=>{
      const pdfs=await Promise.all(groups[index].map(page=>doc.getPage(page)));
      if(disposed||record.cancelled)return;
      const sizes=pdfs.map(pdf=>pdf.getViewport({scale:1}));
      const scale=typeof zoom==='number'?zoom:fitReaderScale(sizes,width,height,zoom==='fit'?'fit':'page');
      const viewports=pdfs.map(pdf=>pdf.getViewport({scale}));
      // The three resident groups share the same canvas budget.
      const pixels=readerRasterPlan([...viewports,...viewports,...viewports],window.devicePixelRatio||1);
      const group=document.createElement('div');group.className='reader-spread';
      const before=slots[current].getBoundingClientRect();
      slot.style.width=Math.max(width,viewports.reduce((sum,v)=>sum+v.width,0)+18*(viewports.length-1))+'px';
      slot.style.height=Math.max(height,...viewports.map(v=>v.height))+'px';
      const after=slots[current].getBoundingClientRect();
      if(!jumping)scroll.scrollBy(horizontal?{left:after.x-before.x,behavior:'instant'}:{top:after.y-before.y,behavior:'instant'});
      slot.replaceChildren(group);
      for(let i=0;i<pdfs.length;i++){
        if(disposed||record.cancelled)return;
        const pdf=pdfs[i],viewport=viewports[i],number=groups[index][i],raster=pixels[i];
        const frame=document.createElement('div');frame.className='reader-page';frame.dataset.readerPage=number;frame.dataset.page=number;frame.dataset.rendered='loading';
        frame.style.width=viewport.width+'px';frame.style.height=viewport.height+'px';frame.style.setProperty('--total-scale-factor',String(scale*pdf.userUnit));
        frame.innerHTML=`<canvas aria-label="PDF 第 ${number} 页"></canvas><div class="textLayer"></div><div class="reader-mark-layer"></div><span class="reader-page-label">${number}</span>`;
        group.append(frame);const canvas=frame.querySelector('canvas');canvas.width=raster.width;canvas.height=raster.height;canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
        const task=pdf.render({canvasContext:canvas.getContext('2d'),viewport,transform:[raster.scaleX,0,0,raster.scaleY,0,0]});record.tasks.push(task);await task.promise;
        if(disposed||record.cancelled)return;
        const layer=new module.TextLayer({textContentSource:pdf.streamTextContent(),container:frame.querySelector('.textLayer'),viewport});record.layers.push(layer);await layer.render();frame.dataset.rendered='true';
      }
      if(disposed||record.cancelled)return;
      slot.dataset.ready='true';record.scale=scale;onPaint();
    })().catch(error=>{if(!disposed&&!record.cancelled){release(index);onError(error);}});
    return record.promise;
  }
  function highlight(index){slots[current]?.classList.remove('is-active');current=index;slots[current].classList.add('is-active');}
  function nearby(){
    for(const index of records.keys())if(Math.abs(index-current)>1)release(index);
    const target=current;
    queue=queue.catch(()=>{}).then(async()=>{
      for(const index of [target,target-1,target+1])if(!disposed&&Math.abs(index-current)<=1)await load(index);
    });
    return queue;
  }
  function sync(){
    raf=0;if(disposed||jumping)return;
    const bounds=scroll.getBoundingClientRect(),center=horizontal?bounds.x+bounds.width/2:bounds.y+bounds.height/2;
    // Slot centers are ordered; binary search avoids measuring every page per frame.
    let low=0,high=slots.length-1;
    const middle=index=>{const r=slots[index].getBoundingClientRect();return horizontal?r.x+r.width/2:r.y+r.height/2;};
    while(low<high){const mid=Math.floor((low+high)/2);if(middle(mid)<center)low=mid+1;else high=mid;}
    const nearest=low>0&&Math.abs(middle(low-1)-center)<Math.abs(middle(low)-center)?low-1:low;
    if(nearest!==current){highlight(nearest);onPage(groups[nearest][0],records.get(nearest)?.scale);nearby();}
  }
  function schedule(){if(!raf&&!disposed)raf=requestAnimationFrame(sync);}
  scroll.addEventListener('scroll',schedule,{passive:true});
  return{
    async go(page,{smooth=false}={}){
      const index=groups.findIndex(pages=>pages.includes(page));if(index<0||disposed)return;
      jumping=true;highlight(index);await nearby();if(disposed)return;
      onPage(page,records.get(index)?.scale);align(index,smooth&&!matchMedia('(prefers-reduced-motion:reduce)').matches?'smooth':'instant');
      jumping=false;
    },
    dispose(){disposed=true;cancelAnimationFrame(raf);scroll.removeEventListener('scroll',schedule);for(const record of records.values()){record.cancelled=true;record.tasks.forEach(task=>task.cancel());record.layers.forEach(layer=>layer.cancel());}stage.querySelectorAll('canvas').forEach(canvas=>{canvas.width=0;canvas.height=0;});records.clear();},
  };
}
