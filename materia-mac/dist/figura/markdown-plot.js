import {parseDelimited} from '../prediction-import.js';
import {normalizeTable} from './model.js';

const optionKeys = new Map([
  ['scheme','scheme'],['方案编号','scheme'],['project','project'],['项目编号','project'],['name','name'],['名称','name'],
]);

function tableLine(line) {
  const text=line.trim().replace(/^\|/,'').replace(/(?<!\\)\|$/,'');
  return text.split(/(?<!\\)\|/).map(cell=>cell.replace(/\\\|/g,'|').trim());
}

function markdownTable(lines) {
  const tables=[];
  for(let i=1;i<lines.length;i++){
    if(!lines[i-1].includes('|')||!lines[i].includes('|'))continue;
    const separator=tableLine(lines[i]);
    if(!separator.every(cell=>/^:?-{3,}:?$/.test(cell)))continue;
    const headers=tableLine(lines[i-1]);
    if(headers.length!==separator.length)throw Error('Markdown 表格的表头与分隔行列数不同。');
    const rows=[headers];
    while(i+1<lines.length&&lines[i+1].trim()&&lines[i+1].includes('|')){
      const row=tableLine(lines[++i]);
      if(row.length!==headers.length)throw Error('Markdown 表格的数据行列数与表头不同。');
      rows.push(row);
    }
    tables.push(rows);
  }
  if(tables.length!==1)throw Error('请提供一个 CSV／TSV 代码块或一张 Markdown 数据表。');
  return tables[0];
}

export function readPlotMarkdown(text) {
  const lines=String(text).replace(/^\uFEFF/,'').trimStart().split(/\r?\n/);
  if(lines[0]?.trim()!=='---')throw Error('Markdown 须以含绘图编号的 --- 配置区开头。');
  const end=lines.findIndex((line,index)=>index>0&&line.trim()==='---');
  if(end<0)throw Error('Markdown 配置区缺少结束的 ---。');
  const config={};
  for(const line of lines.slice(1,end)){
    if(!line.trim()||line.trimStart().startsWith('#'))continue;
    const entry=/^\s*([^:：]+?)\s*[:：]\s*(.*?)\s*$/.exec(line), key=optionKeys.get(entry?.[1]);
    if(!key||Object.hasOwn(config,key))throw Error('Markdown 配置有未知或重复字段：'+line);
    config[key]=entry[2].replace(/^(['"])(.*)\1$/,'$2');
  }
  if(Boolean(config.scheme)===Boolean(config.project))throw Error('请只填写一个方案编号（scheme）或项目编号（project）。');
  if(config.name?.length>250)throw Error('绘图名称最多 250 字。');
  const body=lines.slice(end+1);
  const blocks=[];
  for(let i=0;i<body.length;i++){
    const opening=/^\s*(`{3,}|~{3,})\s*(csv|tsv)\s*$/i.exec(body[i]);
    if(!opening)continue;
    const fence=opening[1], data=[];
    const closing=new RegExp('^\\s*'+fence[0]+'{'+fence.length+',}\\s*$');
    while(++i<body.length&&!closing.test(body[i]))data.push(body[i]);
    if(i===body.length)throw Error('数据代码块缺少结束标记。');
    blocks.push(data.join('\n'));
  }
  if(blocks.length>1)throw Error('一次导入只读取一个数据表。');
  const rows=normalizeTable(blocks.length?parseDelimited(blocks[0]):markdownTable(body));
  if(rows.length<2)throw Error('请至少提供一行数据。');
  return {...config,rows};
}

export function plotMarkdownExample({scheme,project,name,csv}) {
  const safeName=name.replace(/[\r\n]+/g,' ').slice(0,240);
  return `---\n${project?'project: '+project:'scheme: '+scheme}\nname: ${safeName}\n---\n\n# Materia 绘图导入示例\n\n~~~csv\n${csv.trimEnd()}\n~~~\n\n将代码块里的示例数据替换为你的数据。第一行是表头。\n可以改用 TSV 代码块或一张带表头的 Markdown 数据表。\n项目编号会复用保存时的参数和主题，导入的数据会成为独立草稿。\n`;
}
