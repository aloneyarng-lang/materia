export function cleanThemeArtwork(value){
 if(value===undefined)return undefined;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['logo','portrait'].includes(k)))throw Error('主题图片仅支持 logo 和 portrait。');
 let total=0;const result={};
 for(const [role,asset]of Object.entries(value)){
  if(!asset||typeof asset!=='object'||Object.keys(asset).some(k=>!['mime','data','source','credit','alt'].includes(k)))throw Error('主题图片格式不正确。');
  if(!['image/png','image/jpeg','image/webp'].includes(asset.mime)||typeof asset.data!=='string'||asset.data.length>4*1024*1024||!/^[A-Za-z\d+/]+={0,2}$/.test(asset.data)||asset.data.length%4)throw Error('主题图片需为 PNG、JPEG 或 WebP 的 Base64 数据。');
  const bytes=atob(asset.data);total+=bytes.length;if(bytes.length<32||bytes.length>3*1024*1024||total>6*1024*1024)throw Error('主题图片单张限 3 MB，合计限 6 MB。');
  const valid=asset.mime==='image/png'?bytes.slice(0,8)==='\x89PNG\r\n\x1a\n':asset.mime==='image/jpeg'?bytes.charCodeAt(0)===255&&bytes.charCodeAt(1)===216:bytes.startsWith('RIFF')&&bytes.slice(8,12)==='WEBP';if(!valid)throw Error('主题图片文件头不匹配。');
  if(typeof asset.source!=='string'||!/^https:\/\//.test(asset.source)||typeof asset.credit!=='string'||!asset.credit.trim())throw Error('主题图片必须注明来源和版权。');
  result[role]={mime:asset.mime,data:asset.data,source:asset.source.slice(0,1000),credit:asset.credit.slice(0,300),alt:String(asset.alt||'主题图片').slice(0,100)};
 }return result;
}
export const artworkURL=asset=>'data:'+asset.mime+';base64,'+asset.data;
export function applyThemeArtwork(theme){
 const host=document.querySelector('#theme-artwork');if(!host)return;host.replaceChildren();const art=theme.assets?.artwork;host.hidden=!art?.logo;if(host.hidden)return;
 const logo=document.createElement('img');logo.className='theme-official-logo';logo.src=artworkURL(art.logo);logo.alt=art.logo.alt;logo.title=art.logo.credit;host.append(logo);
 const caption=document.createElement('div');caption.className='theme-artwork-caption';const title=document.createElement('strong');title.textContent=theme.name;const source=document.createElement('small');source.textContent=art.logo.credit;caption.append(title,source);host.append(caption);
 if(art.portrait){const portrait=document.createElement('img');portrait.className='theme-official-portrait';portrait.src=artworkURL(art.portrait);portrait.alt=art.portrait.alt;portrait.title=art.portrait.credit;host.append(portrait);}
}
