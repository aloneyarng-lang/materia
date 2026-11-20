export const NOTE_LIMIT=512*1024;

export function notePath(value){
  if(typeof value!=='string'||value.length>240)throw Error('笔记路径过长。');
  const parts=value.trim().normalize('NFC').split('/');
  if(parts.length>10||parts.some(part=>!part||part.length>120||part.startsWith('.')||/[<>:"\\|?*#\[\]\u0000-\u001f]/.test(part)||/[. ]$/.test(part)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))throw Error('请输入有效的笔记名称或相对路径，例如 研究/实验记录。');
  const clean=parts.join('/');
  return /\.md$/i.test(clean)?clean:clean+'.md';
}

export function noteBody(value){
  if(typeof value!=='string'||new TextEncoder().encode(value).length>NOTE_LIMIT||value.includes('\0'))throw Error('笔记须为 UTF-8 Markdown，每篇最多 512 KB。');
  return value;
}

export const noteName=id=>id.split('/').at(-1).replace(/\.md$/i,'');
