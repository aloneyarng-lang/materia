export function parseDelimited(text) {
 text=String(text).replace(/^\uFEFF/,'');
 const first=text.split(/\r?\n/)[0],delimiter=first.includes('\t')?'\t':',';
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted||!cell)quoted=!quoted;else cell+=c;}
  else if(c===delimiter&&!quoted){row.push(cell);cell='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';}
  else cell+=c;
 }
 if(quoted)throw Error('CSV 引号未闭合。');row.push(cell);if(row.some(v=>v.trim()))rows.push(row);return rows;
}
const decode=bytes=>new TextDecoder().decode(bytes);
async function unzip(buffer) {
 const bytes=new Uint8Array(buffer),view=new DataView(buffer);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0)throw Error('不是有效的 XLSX 文件。');
 const count=view.getUint16(end+10,true);if(count>3000)throw Error('工作簿内容过多，请拆分文件。');
 let pos=view.getUint32(end+16,true),total=0;const entries=new Map();
 for(let n=0;n<count;n++){
  if(view.getUint32(pos,true)!==0x02014b50)throw Error('工作簿目录损坏。');
  const flags=view.getUint16(pos+8,true),method=view.getUint16(pos+10,true),size=view.getUint32(pos+20,true),rawSize=view.getUint32(pos+24,true),length=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true),offset=view.getUint32(pos+42,true);
  if(flags&1)throw Error('不支持加密工作簿，请另存为未加密的 XLSX。');
  total+=rawSize;if(total>80*1024*1024)throw Error('工作簿解压后超过 80 MB，请拆分。');
  entries.set(decode(bytes.subarray(pos+46,pos+46+length)),{method,size,rawSize,offset});pos+=46+length+extra+comment;
 }
 return async name=>{
  const e=entries.get(name);if(!e)return null;
  const at=e.offset;if(view.getUint32(at,true)!==0x04034b50)throw Error('工作簿内容损坏。');
  const start=at+30+view.getUint16(at+26,true)+view.getUint16(at+28,true),data=bytes.subarray(start,start+e.size);
  let output;if(e.method===0)output=data;else if(e.method===8)output=new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());else throw Error('不支持此工作簿的压缩格式。');
  if(output.length!==e.rawSize)throw Error('工作簿解压校验失败。');return decode(output);
 };
}
const xml=text=>{const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw Error('工作簿 XML 损坏。');return doc;};
const nodes=(root,name)=>Array.from(root.getElementsByTagNameNS('*',name));
function normalizePath(path){const parts=[];for(const p of path.replace(/^\//,'').split('/')){if(p==='..')parts.pop();else if(p!=='.')parts.push(p);}return parts.join('/');}
export async function readPredictionFile(file) {
 if(file.size>20*1024*1024)throw Error('单个文件最多 20 MB。');
 if(/\.(csv|tsv)$/i.test(file.name))return{sheets:[{name:'数据',rows:parseDelimited(await file.text()),formulaCount:0}],filename:file.name};
 if(!/\.xlsx$/i.test(file.name))throw Error('请选择 .xlsx、.csv 或 .tsv 文件。旧版 .xls 请先另存为 .xlsx。');
 const read=await unzip(await file.arrayBuffer()),book=await read('xl/workbook.xml'),rels=await read('xl/_rels/workbook.xml.rels');if(!book||!rels)throw Error('缺少工作簿定义。');
 const shared=await read('xl/sharedStrings.xml'),strings=shared?nodes(xml(shared),'si').map(si=>nodes(si,'t').map(t=>t.textContent).join('')):[];
 const relationships=new Map(nodes(xml(rels),'Relationship').map(r=>[r.getAttribute('Id'),r.getAttribute('Target')]));const sheets=[];
 for(const sheet of nodes(xml(book),'sheet')){
  const rel=sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'),target=relationships.get(rel);if(!target)continue;
  const content=await read(normalizePath(target.startsWith('/')?target:'xl/'+target));if(!content)continue;
  const doc=xml(content),rows=[];let formulaCount=0;
  for(const row of nodes(doc,'row')){
   const rowIndex=Number(row.getAttribute('r'))-1;if(rowIndex>30000)throw Error('每个工作表最多 30,000 行。');const values=[];
   for(const c of nodes(row,'c')){
    const letters=(c.getAttribute('r')||'').match(/^[A-Z]+/)?.[0];if(!letters)continue;let col=0;for(const ch of letters)col=col*26+ch.charCodeAt(0)-64;if(col>250)throw Error('每个工作表最多 250 列。');
    const t=c.getAttribute('t');let v=nodes(c,'v')[0]?.textContent??'';
    if(nodes(c,'f').length)formulaCount++;
    if(t==='s')v=strings[Number(v)]??'';else if(t==='inlineStr')v=nodes(c,'t').map(n=>n.textContent).join('');else if(t==='e')v='';
    values[col-1]=v;
   }rows[rowIndex]=values;
  }sheets.push({name:sheet.getAttribute('name'),rows:Array.from(rows,r=>r||[]),formulaCount});
 }
 if(!sheets.length)throw Error('工作簿没有可读取的工作表。');return{sheets,filename:file.name};
}
export const csvCell=v=>{const s=String(v??'');return /[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;};
export const toCSV=rows=>'\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
