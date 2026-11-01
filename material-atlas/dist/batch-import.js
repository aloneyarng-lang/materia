import {t as tr,html,msg} from './i18n.js';
import { paperMaterials, paperMeasurements } from './materials.js';
import { parseMetadata, planBatch } from './import-plan.js';
import { markdownTemplate } from './markdown.js';

export function createBatchImporter(config) {
  const esc=config.escape, $=selector=>document.querySelector(selector);
  let files=[], metadataFiles=[], plan=null, busy=false, pasted='';
  const isOpen=()=>config.isOpen();
  function invalidate() { plan=null;$('#batch-preview')?.replaceChildren(); const b=$('#batch-submit');if(b)b.textContent=tr('预览匹配与去重'); }
  function open(initial=[]) {
    if (busy) return;
    files=[...initial];metadataFiles=[];pasted='';plan=null;
    config.showModal(tr('批量收录文献'), tr('多份 PDF + 规范 Markdown，一次匹配完整文献信息。'), html`
      <form id="batch-import-form">
        <div class="batch-lanes"><section class="batch-lane"><div class="batch-step"><b>01</b><h3>添加 PDF</h3></div><button type="button" class="upload-zone" data-batch-action="pdf"><span>＋</span><strong>多选 PDF，或拖入这一批文件</strong><small>自动去重 · 支持文件夹批量添加</small></button><button type="button" class="text-button" data-batch-action="folder">从文件夹添加 PDF ↗</button><div id="batch-files" class="batch-file-list"></div></section>
        <section class="batch-lane"><div class="batch-step"><b>02</b><h3>添加文献信息</h3></div><button type="button" class="upload-zone metadata-upload" data-batch-action="md"><span>MD</span><strong>选择 Markdown 元数据文件</strong><small>一份 MD 可包含多篇文献，也可多选 MD</small></button><button type="button" class="text-button" data-batch-action="template">按当前 PDF 文件名下载 MD 模板 ↗</button><div id="batch-metadata-files" class="batch-file-list"></div></section></div>
        <details class="batch-paste"><summary>或直接粘贴 Markdown / 兼容旧版 JSON</summary><textarea id="batch-metadata-text" spellcheck="false" placeholder="粘贴包含「## 文献」区块的 Markdown…"></textarea></details>
        <div class="batch-common"><label class="form-field">为本批文献追加标签<input id="batch-tags" placeholder="选填，用逗号分隔；保留每篇 MD 的独立标签"></label><label class="form-field">归入收藏夹<select id="batch-collection">${config.folderOptions()}</select></label></div>
        <div class="batch-format-note"><strong>文献 → 材料 → 性能参数：</strong>每篇可录入多个材料，各自保存名称、成分与参数。标签追加、笔记去重追加；非空材料区块替换该篇完整材料列表，空材料模板保留已有数据。兼容版本 1 的性能表，可稍后补充 MD。</div>
        <p id="batch-progress" class="batch-progress" aria-live="polite"></p><p id="batch-error" class="form-error" hidden></p><div id="batch-preview"></div>
        <div class="modal-footer"><button type="button" class="text-button" data-action="close-modal">取消</button><button type="submit" class="primary" id="batch-submit">预览匹配与去重</button></div>
      </form>`, 'import');refreshFiles();
  }
  function refreshFiles() {
    if (!$('#batch-files')) return;
    $('#batch-files').innerHTML=files.map((f,i)=>html`<div class="batch-file"><span title="${esc(f.webkitRelativePath || f.name)}">${esc(f.name)}</span><small>${config.bytesLabel(f.size)}</small><button type="button" data-batch-remove="${i}" aria-label="移除 ${esc(f.name)}">×</button></div>`).join('') || tr('<p class="batch-hint">尚未选择 PDF</p>');
    $('#batch-metadata-files').innerHTML=metadataFiles.map((f,i)=>html`<div class="batch-file"><span>${esc(f.name)}</span><small>${f.records.length} 篇</small><button type="button" data-batch-md-remove="${i}" aria-label="移除 ${esc(f.name)}">×</button></div>`).join('') || tr('<p class="batch-hint">可选，支持稍后补充</p>');
    invalidate();
  }
  async function addFiles(incoming) {
    if (busy) return;
    if (!isOpen()) open();
    const rejected=[];
    for (const file of incoming) {
      if (/\.(md|markdown|json)$/i.test(file.name)) {
        try {if(file.size>30*1024*1024)throw new Error(tr('文件超过 30 MB'));const records=parseMetadata(await file.text());metadataFiles=metadataFiles.filter(f=>f.name!==file.name);metadataFiles.push({name:file.name,records});}
        catch(error){config.toast(`${file.name}：${error.message}`,true);} continue;
      }
      if (!/\.pdf$/i.test(file.name)) {rejected.push(file.name);continue;}
      if (!(await file.slice(0,1024).text()).includes('%PDF-')) {rejected.push(file.name);continue;}
      if (!files.some(f=>f.name===file.name&&f.size===file.size&&f.lastModified===file.lastModified&&f.webkitRelativePath===file.webkitRelativePath)) files.push(file);
    }
    if(rejected.length)config.toast(msg`已跳过 ${rejected.length} 个非 PDF 或无效文件。`,true);
    refreshFiles();
  }
  function preview(result) {
    $('#batch-preview').innerHTML=html`<div class="batch-summary"><span><b>${result.added}</b> 新增</span><span><b>${result.updated}</b> 更新</span><span><b>${result.duplicates}</b> 重复文件</span><span><b>${result.unmatched.length}</b> 元数据未匹配</span></div><div class="batch-preview-scroll"><table><thead><tr><th>PDF / 匹配状态</th><th>标题（可修改）</th><th>标签 / 性能记录</th></tr></thead><tbody>${result.rows.map(row=>html`<tr><td><strong>${esc(row.filename)}</strong><small>${esc(row.status)}</small></td><td><input data-batch-title="${esc(row.paper.id)}" value="${esc(row.paper.title)}" maxlength="1000" ${result.updates.some(p=>p.id===row.paper.id)?'':'disabled'}></td><td><span>${esc(row.paper.tags.join(' · ') || tr('标签待补充'))}</span><small>${paperMaterials(row.paper).length} 个材料 · ${paperMeasurements(row.paper).length} 条性能参数</small></td></tr>`).join('')}</tbody></table></div>${result.unmatched.length?html`<p class="batch-unmatched">未匹配到 PDF：${esc(result.unmatched.join('；'))}。这些元数据将跳过。</p>`:''}`;
    $('#batch-submit').textContent=result.updates.length?msg`确认导入（${result.added} 新增 / ${result.updated} 更新）`:tr('没有待导入变更');
  }
  async function submit() {
    if(busy)return;
    const error=$('#batch-error'),button=$('#batch-submit');error.hidden=true;
    busy=true;button.disabled=true;
    const controls=[...$('#batch-import-form').querySelectorAll('button,input,select,textarea')];controls.forEach(c=>c.disabled=true);
    let committed=0;
    try {
      if (!plan) {
        const records=[...metadataFiles.flatMap(f=>f.records),...parseMetadata($('#batch-metadata-text').value)];
        if (!files.length&&!records.length)throw new Error(tr('请至少添加 PDF 或 Markdown 元数据。'));
        const tags=config.normalizeTags($('#batch-tags').value),collection=$('#batch-collection').value;
        plan=await planBatch(files,records,config.getPapers(),{tags,collection,onProgress:(i,total,name)=>{$('#batch-progress').textContent=msg`检查文件 ${i}/${total}：${name}`;}});
        $('#batch-progress').textContent=msg`已完成文件检查，确认下方匹配后导入。`;preview(plan);return;
      }
      if (!plan.updates.length)throw new Error(tr('没有待导入变更，请调整文件或元数据后重新预览。'));
      for (let i=0;i<plan.updates.length;i+=3) {
        const chunk=plan.updates.slice(i,i+3);
        $('#batch-progress').textContent=msg`正在保存 ${Math.min(i+3,plan.updates.length)}/${plan.updates.length} 篇…`;
        await config.putPapers(chunk);committed+=chunk.length;
      }
      await config.persistNotes(plan.notes);
      await config.reload();
      const message=msg`已新增 ${plan.added} 篇、更新 ${plan.updated} 篇；跳过 ${plan.duplicates} 个重复文件${plan.unmatched.length?msg`，${plan.unmatched.length} 条元数据未匹配`:''}。`;
      busy=false;config.onDone(plan.updates[0]?.id);config.toast(message);
    } catch(err) {
      if(committed)await config.reload();
      error.textContent=(committed?msg`已保存 ${committed} 篇，其余未完成。`:'')+err.message;error.hidden=false;$('#batch-progress').textContent='';
    } finally {
      busy=false;controls.filter(c=>c.isConnected).forEach(c=>c.disabled=false);
      if(button.isConnected)button.disabled=false;
    }
  }
  document.addEventListener('submit',event=>{if(event.target.id==='batch-import-form'){event.preventDefault();submit();}});
  document.addEventListener('input',event=>{
    if(event.target.dataset.batchTitle&&plan){const paper=plan.updates.find(p=>p.id===event.target.dataset.batchTitle);if(paper)paper.title=event.target.value.trim();return;}
    if(event.target.matches('#batch-metadata-text,#batch-tags'))invalidate();
  });
  document.addEventListener('change',event=>{if(event.target.id==='batch-collection')invalidate();});
  document.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button||busy)return;
    try {
      if(button.dataset.batchAction==='pdf')$('#pdf-input').click();
      if(button.dataset.batchAction==='folder')$('#folder-input').click();
      if(button.dataset.batchAction==='md')$('#md-input').click();
      if(button.dataset.batchAction==='template')await config.saveText(markdownTemplate(files.length?files.map(f=>f.name):undefined),'materia-metadata-template.md','md');
      if(button.dataset.batchRemove!==undefined){files.splice(Number(button.dataset.batchRemove),1);refreshFiles();}
      if(button.dataset.batchMdRemove!==undefined){metadataFiles.splice(Number(button.dataset.batchMdRemove),1);refreshFiles();}
    }catch(error){config.toast(error.message,true);}
  });
  for(const id of ['#folder-input','#md-input'])$(id).addEventListener('change',async event=>{await addFiles([...event.target.files]);event.target.value='';});
  return {open,addFiles,isBusy:()=>busy};
}
