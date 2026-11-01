import {t as tr,html,msg} from './i18n.js';
import {normalizeAttachments} from './note-model.js';
export function openNoteImage(image){
  let dialog=document.querySelector('#note-image-viewer');if(!dialog){dialog=document.createElement('dialog');dialog.id='note-image-viewer';dialog.className='note-image-viewer';dialog.innerHTML=tr('<button aria-label="关闭图片">×</button><img alt=""><p></p>');dialog.querySelector('button').onclick=()=>dialog.close();document.body.append(dialog);}
  dialog.querySelector('img').src=image.dataUrl;dialog.querySelector('img').alt=image.name;dialog.querySelector('p').textContent=image.name;if(!dialog.open)dialog.showModal();
}
export function noteImagesHTML(images=[],esc,editable=false){return images.length?`<div class="note-image-grid">${images.map(image=>html`<figure><a href="${esc(image.dataUrl)}" data-reader-image="${esc(image.id)}" title="查看 ${esc(image.name)}"><img src="${esc(image.dataUrl)}" alt="${esc(image.name)}" loading="lazy"></a><figcaption>${esc(image.name)}${editable?html`<button type="button" data-reader-remove-image="${esc(image.id)}" aria-label="移除图片 ${esc(image.name)}">×</button>`:''}</figcaption></figure>`).join('')}</div>`:'';}
export async function compressNoteImages(files,existing=[]){
  if(existing.length+files.length>6)throw new Error(tr('每条批注最多 6 张图片。'));
  const added=[];
  for(const file of files){
    if(!['image/png','image/jpeg','image/webp','image/gif','image/bmp'].includes(file.type))throw new Error(tr('请添加 PNG、JPEG、WebP、GIF 或 BMP 图片。'));
    if(file.size>15*1024*1024)throw new Error(tr('单张原始图片请小于 15 MB。'));
    const bitmap=await createImageBitmap(file);
    try{
      if(bitmap.width*bitmap.height>64000000)throw new Error(tr('图片尺寸过大，请先裁剪。'));
      const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      let dataUrl=canvas.toDataURL('image/png');
      if(dataUrl.length>1400000){ctx.globalCompositeOperation='destination-over';ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);dataUrl=canvas.toDataURL('image/jpeg',.85);}
      if(dataUrl.length>1400000)dataUrl=canvas.toDataURL('image/jpeg',.65);
      added.push({id:`img-${crypto.randomUUID()}`,name:file.name||'粘贴图片.png',dataUrl,width:canvas.width,height:canvas.height});
    }finally{bitmap.close();}
  }
  return normalizeAttachments([...existing,...added]);
}
