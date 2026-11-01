import {t as tr,html,msg} from './i18n.js';
import { paperMaterials, normalizeMaterials } from './materials.js';
export function createPerformanceEditor(config) {
  let paperId='',materials=[],busy=false; const esc=config.escape;
  const fields=[['sample','样品 / 批次'],['name','参数名称'],['value','数值'],['unit','单位'],['conditions','测试条件'],['source','来源'],['qualifier','限定符'],['uncertainty','误差']];
  function render(){
    const host=document.querySelector('#material-editor-list');if(!host)return;
    host.innerHTML=materials.map((material,index)=>html`<section class="material-editor-card" data-material-card="${index}">
      <header><strong>材料 ${index+1}</strong><button type="button" class="text-button" data-material-remove="${index}">移除材料${material.measurements.length?msg`（含 ${material.measurements.length} 条参数）`:''}</button></header>
      <div class="material-editor-fields"><label>材料名称<input data-material-index="${index}" data-material-field="name" value="${esc(material.name)}" maxlength="300" placeholder="例如：合金 A、复合材料 B" required></label><label>成分 / 配方<input data-material-index="${index}" data-material-field="composition" value="${esc(material.composition||'')}" maxlength="2000" placeholder="按原文填写，可留空"></label><label class="material-description">材料说明<textarea data-material-index="${index}" data-material-field="description" maxlength="6000" rows="2" placeholder="制备方法、结构等，可留空">${esc(material.description||'')}</textarea></label></div>
      <div class="performance-editor-scroll"><table class="performance-editor-table"><thead><tr>${fields.map(([,label])=>`<th>${tr(label)}</th>`).join('')}<th></th></tr></thead><tbody>${material.measurements.map((m,row)=>html`<tr>${fields.map(([field,label])=>html`<td><input data-material-index="${index}" data-performance-row="${row}" data-performance-field="${field}" value="${esc(m[field]??'')}" ${['value','uncertainty'].includes(field)?'inputmode="decimal"':''} aria-label="材料 ${index+1} 第 ${row+1} 条 ${tr(label)}"></td>`).join('')}<td><button type="button" data-material-index="${index}" data-performance-remove="${row}" aria-label="移除材料 ${index+1} 的性能记录 ${row+1}">×</button></td></tr>`).join('')}</tbody></table>${material.measurements.length?'':tr('<p class="help-inline">这个材料尚未录入性能参数，可稍后补充。</p>')}</div>
      <button class="outline-button" type="button" data-performance-add="${index}">＋ 添加性能记录</button></section>`).join('')||tr('<p class="help-inline">一篇文献可以有多个材料。先添加材料，再填写各自的性能参数。</p>');
  }
  function open(id){
    const paper=config.getPapers().find(p=>p.id===id);if(!paper)return;
    paperId=id;materials=structuredClone(paperMaterials(paper));busy=false;
    config.showModal(tr('管理材料与性能参数'),esc(paper.title),html`<form id="performance-editor-form"><fieldset id="material-editor-fields"><p class="chart-footnote">每个材料独立保存名称、成分与性能参数。不同材料的同名参数不会混在一起；数值、单位、条件和来源分列填写。修改在保存后生效，取消可保留原数据。</p><div id="material-editor-list"></div><button class="outline-button" type="button" data-material-add>＋ 添加材料</button><p class="form-error" id="performance-error" role="alert" hidden></p><div class="modal-footer"><button type="button" class="text-button" data-action="close-modal">取消</button><button class="primary" type="submit">保存材料与参数</button></div></fieldset></form>`,'performance-editor');render();
  }
  document.addEventListener('input',event=>{
    const target=event.target,index=Number(target.dataset.materialIndex);if(busy||!materials[index])return;
    if(target.dataset.materialField)materials[index][target.dataset.materialField]=target.value;
    if(target.dataset.performanceField)materials[index].measurements[Number(target.dataset.performanceRow)][target.dataset.performanceField]=target.value;
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||busy||!button.closest('#performance-editor-form'))return;
    if(button.hasAttribute('data-material-add')){materials.push({id:`material-${crypto.randomUUID()}`,name:'',composition:'',description:'',measurements:[]});render();document.querySelector('[data-material-card]:last-child [data-material-field=name]')?.focus();}
    if(button.dataset.materialRemove!==undefined){materials.splice(Number(button.dataset.materialRemove),1);render();}
    if(button.dataset.performanceAdd!==undefined){materials[Number(button.dataset.performanceAdd)].measurements.push({id:`m-${crypto.randomUUID()}`});render();}
    if(button.dataset.performanceRemove!==undefined){materials[Number(button.dataset.materialIndex)].measurements.splice(Number(button.dataset.performanceRemove),1);render();}
  });
  document.addEventListener('submit',async event=>{
    if(event.target.id!=='performance-editor-form')return;event.preventDefault();if(busy)return;
    const fieldset=event.target.querySelector('fieldset');busy=true;fieldset.disabled=true;
    try{
      const clean=normalizeMaterials(materials.map(material=>({...material,measurements:material.measurements.filter(row=>fields.some(([field])=>row[field]!==''&&row[field]!=null))})));
      await config.save(paperId,clean);busy=false;config.close();config.toast(tr('材料与性能参数已保存。'));
    }catch(error){const node=document.querySelector('#performance-error');if(node){node.textContent=error.message;node.hidden=false;}}
    finally{busy=false;fieldset.disabled=false;}
  });
  return {open,isBusy:()=>busy};
}
