import { normalizeMeasurements } from './parameters.js';
import { normalizeMaterials } from './materials.js';

const fieldNames = { '文件名':'filename', filename:'filename', file:'filename', '文献id':'id', id:'id', '标题':'title', title:'title', '期刊':'journal', journal:'journal', '发表年份':'year', year:'year', doi:'doi', '标签':'tags', tags:'tags', '影响因子':'impactFactor', impactfactor:'impactFactor', '指标年份':'impactYear', impactyear:'impactYear' };
const headerKey = v => v.replace(/[`*]/g, '').trim().toLocaleLowerCase().replace(/[ _-]/g, '');
function cells(line) {
  let text = line.trim(); if (text.startsWith('|')) text = text.slice(1); if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);
  const cells = []; let value = '';
  for (let i = 0; i < text.length; i++) { if (text[i] === '\\' && text[i + 1] === '|') { value += '|'; i++; } else if (text[i] === '|') { cells.push(value.trim()); value = ''; } else value += text[i]; }
  cells.push(value.trim()); return cells;
}
function tables(lines) {
  const rows = lines.filter(l => l.trim().startsWith('|')).map(cells);
  if (!rows.length) return [];
  const headers = rows.shift().map(headerKey);
  return rows.filter(row => !row.every(cell => /^:?-{2,}:?$/.test(cell.replace(/\s/g,'')))).map(row => Object.fromEntries(headers.map((h,i)=>[h,row[i] || ''])));
}
function measurementRows(lines, label) {
  const rows=tables(lines).filter(row=>Object.values(row).some(Boolean));
  if(rows.some(row=>!('参数名称' in row||'name' in row||'parameter' in row)||!('数值' in row||'value' in row)))throw new Error(`${label}的性能表必须分开包含「参数名称」与「数值」列。`);
  return normalizeMeasurements(rows.map(row=>({id:row.记录id||row.id,sample:row.样品||row['样品/批次']||row.sample,name:row.参数名称||row.name||row.parameter,value:row.数值??row.value,unit:row.单位||row.unit,conditions:row.测试条件||row.conditions,source:row.来源||row.source,qualifier:row.限定符||row.qualifier,uncertainty:row.误差??row.uncertainty})));
}
function materialBlocks(lines,label){
  const starts=lines.map((line,index)=>/^####\s+(?:材料|material)(?:\s|[:：]|$)/i.test(line)?index:-1).filter(index=>index>=0);
  if(!starts.length&&lines.some(line=>/^\s*[-*]\s*(?:名称|材料名称|name)\s*[:：]\s*\S|^\|.*\d/.test(line)))throw new Error(`${label}请用「#### 材料 1」区块分别填写材料。`);
  const fields={'材料id':'id',id:'id','名称':'name','材料名称':'name',name:'name','成分':'composition','配方':'composition','成分/配方':'composition',composition:'composition','说明':'description','材料说明':'description',description:'description'};
  const materials=[];
  for(let index=0;index<starts.length;index++){
    const block=lines.slice(starts[index]+1,starts[index+1]??lines.length),material={};
    for(const line of block){const match=line.match(/^\s*[-*]\s+([^:：]+)[:：]\s*(.*?)\s*$/);if(!match)continue;const key=fields[headerKey(match[1])],value=match[2].replace(/^`(.*)`$/,'$1').trim();if(key&&value)material[key]=value;}
    const measurements=measurementRows(block,`${label}第 ${index+1} 个材料`);
    // An untouched downloaded template must never clear existing material data.
    if(!measurements.length&&!Object.values(material).some(Boolean))continue;
    materials.push({...material,id:material.id||`material-${index+1}`,measurements});
  }
  return normalizeMaterials(materials);
}
export function parseMarkdown(text) {
  if (typeof text !== 'string' || text.length > 30 * 1024 * 1024) throw new Error('Markdown 文件过大或格式不正确。');
  const lines = text.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n');
  const version=text.match(/格式版本\s*[:：]\s*(\d+)/);if(version&&!['1','2'].includes(version[1]))throw new Error('暂不支持该 Markdown 格式版本，请使用版本 2 模板。');
  const starts = lines.map((line, i) => /^##\s+(?:文献|paper)(?:\s|[:：]|$)/i.test(line) ? i : -1).filter(i=>i>=0);
  if (!starts.length) throw new Error('未找到「## 文献」区块，请使用下载的 Markdown 规范模板。');
  const papers = [];
  for (let bi = 0; bi < starts.length; bi++) {
    const block = lines.slice(starts[bi] + 1, starts[bi+1] ?? lines.length), paper = {}, sections = new Map();
    let section = 'fields', current = [];
    const flush = () => { if (!sections.has(section)) sections.set(section, []); sections.get(section).push(...current); current = []; };
    for (const line of block) { const match = line.match(/^###\s+(.+?)\s*$/); if (match) { flush(); section = match[1].trim(); } else current.push(line); } flush();
    for (const line of sections.get('fields') || []) {
      const match = line.match(/^\s*[-*]\s+([^:：]+)[:：]\s*(.*?)\s*$/); if (!match) continue;
      const field = fieldNames[headerKey(match[1])]; if (!field) continue;
      let value = match[2].replace(/^`(.*)`$/, '$1').trim();
      if (field === 'tags') { if(value)paper.tags = [...new Set(value.split(/[,，;；]/).map(v=>v.trim()).filter(Boolean))]; }
      else if (field === 'impactFactor') { if (value) paper.impactFactor = value; }
      else if (value) paper[field] = value;
    }
    if (!paper.filename && !paper.id && !paper.doi && !paper.title) throw new Error(`第 ${bi+1} 个文献区块缺少文件名或标题等匹配信息。`);
    for (const [name, lines] of sections) {
      if (/^(作者与机构|作者|authors)$/i.test(name)) {
        const authors=tables(lines).filter(r=>r.作者||r.name||r.author).map(r=>({ name:r.作者||r.name||r.author, affiliations:(r.机构||r.affiliations||r.institutions||'').split(/[;；]/).map(v=>v.trim()).filter(Boolean) }));
        if(authors.length)paper.authors=authors;
      } else if (/^(性能参数|性能数据|measurements|parameters)$/i.test(name)) {
        if(version?.[1]==='2'&&tables(lines).some(row=>Object.values(row).some(Boolean)))throw new Error('版本 2 的性能参数必须放在对应材料区块内。');
        const rows=measurementRows(lines,`第 ${bi+1} 篇文献`);
        if(rows.length)paper.measurements=rows;
      } else if (/^(材料|材料列表|materials)$/i.test(name)) {
        const materials=materialBlocks(lines,`第 ${bi+1} 篇文献`);if(materials.length)paper.materials=materials;
      } else if (/^(文献笔记|notes)$/i.test(name)) {
        paper.paperNotes = noteBlocks(lines, false);
      } else if (/^(标签笔记|tagnotes)$/i.test(name)) {
        paper.tagNotes = noteBlocks(lines, true);
      }
    }
    if(paper.materials&&paper.measurements)throw new Error('同一文献请使用材料区块，不要混用文献级性能表。');
    papers.push(paper);
  }
  return papers;
}
function noteBlocks(lines, tagged) {
  const result = []; let name = '', body = [];
  const flush = () => { const text = body.join('\n').trim(); if (text) { if (tagged && !name) throw new Error('标签笔记需要用「#### #标签名称」标记归属。'); result.push(tagged ? { tag:name.replace(/^#/, '').trim(), body:text } : { body:text }); } body=[]; };
  for (const line of lines) { const m = line.match(/^####\s+(.+)$/); if (m) { flush(); name=m[1].trim(); } else body.push(line); } flush();
  return result;
}
export function paperTagsMarkdown(papers) {
  const line = value => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
  return '# Materia 文献与标签\n\n格式版本: 2\n\n' + papers.map((paper, index) =>
    `## 文献 ${index + 1}\n\n- 文献ID: ${line(paper.id)}\n- 文件名: ${line(paper.filename)}\n- 标题: ${line(paper.title)}\n- 标签: ${(paper.tags || []).map(line).join('；')}\n`
  ).join('\n');
}

export function markdownTemplate(filenames = ['请替换为实际文件名.pdf']) {
  const material=index=>`#### 材料 ${index}\n\n- 名称: \n- 成分 / 配方: \n- 说明: \n\n##### 性能参数\n\n| 样品 / 批次 | 参数名称 | 数值 | 单位 | 测试条件 | 来源 | 限定符 | 误差 |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n\n`;
  return '# Materia 文献批量元数据\n\n格式版本: 2\n\n每个「## 文献」对应一个 PDF；每篇可有多个「#### 材料」区块。先填写材料名称，再填写其性能表；可复制或删除材料区块。数值、单位与条件分列填写。空材料模板保留已有数据，非空材料列表会整体替换该篇的材料与参数，请包含所有需要保留的材料。\n\n' + filenames.map((filename, i)=>`## 文献 ${i+1}\n\n- 文件名: ${filename}\n- 标题: \n- 发表年份: \n- 期刊: \n- DOI: \n- 标签: \n- 影响因子: \n- 指标年份: \n\n### 作者与机构\n\n| 作者 | 机构 |\n| --- | --- |\n\n### 材料\n\n${material(1)}${material(2)}### 文献笔记\n\n#### 笔记 1\n\n### 标签笔记\n\n`).join('\n');
}
