import {t as tr,html,msg} from './i18n.js';
import {readStudy,updateStudy,translationKey} from './study-client.js';
import {TRANSLATION_LANGUAGES,translationChunks} from './study-model.js';
import {createVocabularyView,vocabularyShell} from './vocabulary-ui.js';
import {lookupOfflineDictionary} from './offline-dictionary.js';
import {MARK_COLORS} from './note-model.js';
const languageOptions=()=>Object.entries(TRANSLATION_LANGUAGES).map(([key,label])=>`<option value="${key}">${tr(label)}</option>`).join('');
export function readerStudyHTML(){return html`<section id="reader-translation-panel" hidden><div class="study-language"><label>译成 <select id="reader-translation-language">${Object.entries(TRANSLATION_LANGUAGES).map(([key,label])=>`<option value="${key}">${tr(label)}</option>`).join('')}</select></label><span id="reader-manual-translation">选文后点击“翻译”才发送</span></div><p class="study-notice">翻译沿用 AI 服务。选文或待翻译页的文字会发送给该服务，PDF 文件留在本地。</p><div class="study-actions"><button type="button" data-study-action="page">翻译当前页</button><button type="button" data-study-action="all">翻译整篇</button><button type="button" data-study-action="stop" hidden>停止</button><button type="button" data-study-action="settings">AI 服务设置</button></div><p id="reader-translation-progress" role="status"></p><h3 id="reader-translation-heading">原文与译文对照</h3><div id="reader-page-translation" class="study-translation"></div></section><section id="reader-vocabulary-panel" hidden>${vocabularyShell()}</section>`;}
export function createReaderStudy(host,options){
  const esc=options.escape,$=selector=>host.querySelector(selector);
  let epoch=0,study=null,ready=false,selection=null,selectionRun=null,pageRun=null,selectionVersion=0,displayVersion=0,vocabulary=null,savingLanguage=false;
  let markColor='yellow';
  const progress=text=>{if($('#reader-translation-progress'))$('#reader-translation-progress').textContent=text;};
  const selectedLanguage=()=>study?.preferences.targetLanguage||'zh-CN';
  function dispose(){epoch++;selectionRun?.abort();pageRun?.abort();selectionRun=null;pageRun=null;selection=null;selectionVersion++;displayVersion++;study=null;ready=false;savingLanguage=false;vocabulary?.dispose();vocabulary=null;$('#reader-selection-translation')?.remove();}
  function popup(){let panel=$('#reader-selection-translation');if(!panel){panel=document.createElement('section');panel.id='reader-selection-translation';panel.className='selection-translation';panel.setAttribute('aria-label',tr('划词翻译'));host.append(panel);}return panel;}
  function positionPopup(rect){
    const panel=popup(),bounds=host.getBoundingClientRect(),frame=selection&&host.querySelector(`[data-reader-page="${selection.page}"]`),scroll=$('#reader-scroll');
    if(frame&&selection.selectionRect){const f=frame.getBoundingClientRect(),r=selection.selectionRect;rect={left:f.left+r.x*f.width,top:f.top+r.y*f.height,bottom:f.top+(r.y+r.height)*f.height};const s=scroll.getBoundingClientRect();panel.hidden=rect.bottom<s.top||rect.top>s.bottom;if(panel.hidden)return;}
    const below=rect.bottom-bounds.top+10,above=(rect.top??rect.bottom)-bounds.top-panel.offsetHeight-10;
    panel.style.left=Math.max(8,Math.min(host.clientWidth-panel.offsetWidth-12,rect.left-bounds.left))+'px';
    panel.style.top=Math.max(8,Math.min(host.clientHeight-panel.offsetHeight-12,below+panel.offsetHeight>host.clientHeight-12&&above>=8?above:below))+'px';
  }
  function selectionHTML(message,{save=false}={}){
    const panel=popup();panel.hidden=false;
    if(!panel.querySelector('.selection-action-status'))panel.innerHTML=html`<header><strong></strong><button type="button" data-study-action="dismiss" aria-label="关闭划词翻译">×</button></header><div class="selection-mark-tools"><div class="selection-mark-actions"><button type="button" data-study-action="highlight" title="选择文字后按 H 高亮">高亮 <kbd>H</kbd></button><button type="button" data-study-action="underline" title="选择文字后按 U 添加下划线">下划线 <kbd>U</kbd></button><button type="button" data-study-action="copy-selection">复制</button><button type="button" data-study-action="expand-selection">翻译与查词</button></div><div class="reader-color-swatches" role="group" aria-label="标记颜色">${Object.entries(MARK_COLORS).map(([key,value],i)=>`<button type="button" data-study-color="${key}" style="--swatch:${value}" aria-label="${[tr('暖黄'),tr('青绿'),tr('海蓝'),tr('玫瑰')][i]}" aria-pressed="${key===markColor}"></button>`).join('')}</div></div><div class="study-language selection-target-language"><label>译成 <select id="reader-selection-language" aria-label="目标语言">${languageOptions()}</select></label></div><small class="selection-text-count"></small><div class="study-translation" role="status"></div><footer><button type="button" class="primary" data-study-action="selection">AI 翻译</button><button type="button" data-study-action="annotate">添加批注</button><button type="button" data-study-action="save-word" hidden>加入生词本</button><button type="button" data-study-action="stop-selection" hidden>停止翻译</button><button type="button" data-study-action="settings">服务设置</button></footer><p class="selection-action-status" role="status"></p>`;
    syncLanguageControls();
    const text=selection?.text||'',translated=Boolean(selection?.translatedText),loading=Boolean(selection?.loading),overLimit=text.length>4000;
    panel.classList.toggle('selection-compact',text.length>160&&!translated&&!loading&&!selection?.expanded);
    panel.querySelector('[data-study-action=expand-selection]').setAttribute('aria-expanded',String(!panel.classList.contains('selection-compact')));
    panel.querySelectorAll('[data-study-action=highlight],[data-study-action=underline]').forEach(button=>button.disabled=Boolean(selection?.markPending)||!selection?.rects?.length);
    panel.querySelector('header strong').textContent=text.length>300?text.slice(0,300)+'…':text||tr('划词翻译');
    panel.querySelector('.selection-text-count').textContent=msg`已选 ${text.length.toLocaleString()} 字 · 离线查词不发送文字，AI 翻译仅在点击后发送`;
    panel.querySelector('.study-translation').textContent=message;
    const translate=panel.querySelector('[data-study-action="selection"]');translate.textContent=loading?tr('正在翻译…'):translated&&!selection?.offline?tr('重新用 AI 翻译'):tr('AI 翻译');translate.disabled=loading||overLimit||!study||!ready||savingLanguage;translate.setAttribute('aria-disabled',String(translate.disabled));
    const annotate=panel.querySelector('[data-study-action="annotate"]');annotate.disabled=!translated||!selection?.selectionRect||loading;annotate.textContent=tr('添加批注');annotate.removeAttribute('aria-disabled');annotate.title=!translated?tr('先点击“翻译”，译文出现后可添加批注'):!selection?.selectionRect?tr('无法定位选文，请重新选择 PDF 文字'):tr('把译文贴到选文附近，并保存为文献批注');
    const word=panel.querySelector('[data-study-action="save-word"]');word.hidden=!save;word.disabled=savingLanguage;word.textContent=tr('加入生词本');
    if(savingLanguage)annotate.disabled=true;
    panel.querySelector('[data-study-action="stop-selection"]').hidden=!loading;
    panel.querySelector('.selection-action-status').textContent='';if(selection?.rect)positionPopup(selection.rect);
  }
  const selectionPrompt=()=>selection?.text.length>4000?tr('选文超过 4,000 字，请缩小范围或使用页面翻译。'):ready?tr('选词自动显示本地释义；点击“AI 翻译”才会发送所选文字。'):tr('选词自动显示本地释义；AI 翻译需先配置服务。');
  async function initialize(){
    const ticket=epoch;
    try{const [data,service]=await Promise.all([readStudy(),options.serviceStatus()]);if(ticket!==epoch)return;
      study=data;ready=service.ready;syncLanguageControls();
      vocabulary=createVocabularyView($('#reader-vocabulary-panel'),{escape:esc,paperId:options.context().paper.id,saveText:options.saveText,openSource:options.openSource});
      await vocabulary.refresh();if(ticket!==epoch)return;progress(ready?tr('选词自动显示本地释义；AI 翻译仅在点击后发送。'):service.message||tr('请先配置 AI 服务的地址、模型及密钥。'));if(selection){selectionHTML(selectionPrompt());void lookupSelectionOffline();}await pageChanged();
    }catch(error){if(ticket===epoch){progress(error.message);$('#reader-page-translation').textContent=error.message;}}
  }
  async function pageChanged(){
    const version=++displayVersion,ticket=epoch,context=options.context();if(!study||!context.loaded)return;
    $('#reader-translation-heading').textContent=msg`第 ${context.page} 页 · ${tr(TRANSLATION_LANGUAGES[selectedLanguage()])}`;
    try{
      const text=await options.pageText(context.page);if(ticket!==epoch||version!==displayVersion)return;
      const key=await translationKey(context.paper,context.page,selectedLanguage(),text);if(ticket!==epoch||version!==displayVersion)return;
      const cached=study.cache.find(row=>row.key===key),panel=$('#reader-page-translation');
      panel.replaceChildren();
      if(cached){const output=document.createElement('div');output.className='study-translated-text';output.textContent=cached.translatedText;panel.append(output);
        const details=document.createElement('details'),summary=document.createElement('summary'),source=document.createElement('p');summary.textContent=tr('提取的原文');source.textContent=cached.sourceText;details.append(summary,source);panel.append(details);
      }else panel.textContent=text?tr('此页尚无译文，点击“翻译当前页”。'):tr('此页没有可提取文字。扫描版 PDF 需先进行 OCR，再导入翻译。');
    }catch(error){if(ticket===epoch&&version===displayVersion)$('#reader-page-translation').textContent=error.message;}
  }
  function selectionChanged(value,{force=false}={}){
    if(!force&&selection?.annotationPending&&(!value?.text||value.page===selection.page&&value.text===selection.text&&JSON.stringify(value.selectionRect)===JSON.stringify(selection.selectionRect)))return;
    if(value?.text&&selection&&value.page===selection.page&&value.text===selection.text&&JSON.stringify(value.selectionRect)===JSON.stringify(selection.selectionRect))return;
    selectionRun?.abort();selectionRun=null;selectionVersion++;
    if(!value?.text){selection=null;$('#reader-selection-translation')?.remove();return;}
    const context=options.context();selection={...value,paperId:context.paper.id,fingerprint:context.paper.fingerprint||'',translatedText:'',targetLanguage:selectedLanguage(),offline:false};
    selectionHTML(selectionPrompt());
    void lookupSelectionOffline();
  }
  async function markSelection(kind){
    const current=selection,ticket=epoch;
    if(!current?.rects?.length){options.toast(tr('请先选择同一页中的文字。'));return;}
    if(current.markPending)return;
    current.markPending=true;selectionHTML(current.translatedText||selectionPrompt());
    try{if(await options.markSelection({...current,kind,color:markColor})&&ticket===epoch&&selection===current)selectionChanged(null,{force:true});}
    finally{current.markPending=false;if(ticket===epoch&&selection===current)selectionHTML(current.translatedText||selectionPrompt());}
  }
  host.addEventListener('scroll',event=>{if(event.target.id==='reader-scroll'&&selection?.rect)positionPopup(selection.rect);},true);
  async function translateSelection(){
    if(!selection||selection.loading||savingLanguage)return;const current=selection,ticket=epoch,version=++selectionVersion;selectionRun?.abort();const run=new AbortController();selectionRun=run;
    try{
      if(!study)throw new Error(tr('阅读辅助存储尚未就绪，请重新打开阅读器。'));
      if(current.text.length>4000)throw new Error(tr('选文超过 4,000 字，请缩小范围后再翻译。'));
      current.targetLanguage=selectedLanguage();current.offline=false;current.loading=true;current.translatedText='';current.annotationId='';selectionHTML(tr('正在翻译…'));const context=options.context();
      const result=await options.translate({mode:'selection',text:current.text,targetLanguage:current.targetLanguage,title:context.paper.title.slice(0,1000),context:current.quote?.slice(0,1200)||''},{signal:run.signal});
      if(ticket!==epoch||version!==selectionVersion||run.signal.aborted)return;current.loading=false;current.translatedText=result.text;selectionHTML(result.text,{save:current.text.length<=160});
    }catch(error){if(ticket===epoch&&version===selectionVersion&&!run.signal.aborted){current.loading=false;selectionHTML(error.message);}}
    finally{if(selectionRun===run)selectionRun=null;}
  }
  async function lookupSelectionOffline(){
    if(!selection||selection.loading||savingLanguage||selection.text.length>160)return;const current=selection;current.targetLanguage=selectedLanguage();current.annotationId='';
    const ticket=epoch,version=selectionVersion,language=current.targetLanguage;selectionHTML(tr('正在读取本地词典…'));
    let result;try{result=await lookupOfflineDictionary(current.text,language);}catch(error){if(ticket===epoch&&selection===current&&version===selectionVersion)selectionHTML('词典文件读取失败：'+error.message);return;}
    if(ticket!==epoch||selection!==current||version!==selectionVersion||language!==selectedLanguage())return;
    current.loading=false;
    if(result.unsupported){current.translatedText='';current.offline=false;selectionHTML(tr('离线词典目前支持中文、英语、日语和德语。'));return;}
    if(!result.found){current.translatedText='';current.offline=false;selectionHTML(tr('本地词典暂无此词条，可缩短选文或使用 AI 翻译。'));return;}
    current.translatedText=result.translation;current.offline=true;selectionHTML(result.translation,{save:true});
    const status=popup().querySelector('.selection-action-status');if(status)status.textContent=result.sources.join(' · ')+tr(' · 未连接网络');
  }
  async function saveWord(){
    if(!study||!selection?.translatedText||savingLanguage)return;const current=selection,ticket=epoch,context=options.context(),button=$('[data-study-action="save-word"]');if(button)button.disabled=true;
    try{
      const rows=await updateStudy(study.libraryKey,{kind:'vocabulary',operation:{type:'add',word:{id:'word-'+crypto.randomUUID(),term:current.text,translation:current.translatedText,targetLanguage:current.targetLanguage,sources:[{paperId:context.paper.id,title:context.paper.title.slice(0,1000),page:current.page,fingerprint:context.paper.fingerprint||'',quote:(current.quote||current.text).slice(0,1200)}]}}});
      if(ticket!==epoch)return;study.vocabulary=rows;if(selection===current&&button?.isConnected){button.textContent=tr('已加入生词本');button.disabled=true;}await vocabulary?.refresh();
    }catch(error){if(ticket===epoch){options.toast(error.message,true);if(button?.isConnected)button.disabled=false;}}
  }
  async function annotateSelection(){
    const current=selection,ticket=epoch;if(!current?.translatedText||!current.selectionRect||current.annotationPending||savingLanguage)return;
    current.annotationPending=true;syncLanguageControls();current.annotationId||='note-'+crypto.randomUUID();const button=$('[data-study-action="annotate"]'),status=popup().querySelector('.selection-action-status');if(button){button.setAttribute('aria-disabled','true');button.textContent=tr('正在添加…');}status.textContent=tr('正在保存译文批注…');
    try{await options.addAnnotation({...current,selectionRect:{...current.selectionRect}});if(ticket===epoch&&selection===current)selectionChanged(null,{force:true});}
    catch(error){if(ticket===epoch&&selection===current){if(button?.isConnected){button.removeAttribute('aria-disabled');button.textContent=tr('添加批注');}if(status.isConnected)status.textContent=msg`批注未添加：${error.message}`;}}
    finally{current.annotationPending=false;if(ticket===epoch)syncLanguageControls();}
  }
  function syncLanguageControls(){for(const selector of ['#reader-translation-language','#reader-selection-language']){const control=$(selector);if(control){control.value=selectedLanguage();control.disabled=!study||savingLanguage||Boolean(pageRun)||Boolean(selection?.annotationPending);}}}
  function busyButtons(value){host.querySelectorAll('[data-study-action="page"],[data-study-action="all"]').forEach(button=>button.disabled=value||!study||savingLanguage);syncLanguageControls();const stop=$('[data-study-action="stop"]');if(stop)stop.hidden=!value;}
  async function translatePages(all=false){
    if(pageRun||savingLanguage)return;if(!study)throw new Error(tr('请重新打开新版阅读器以启用本地翻译存储。'));
    const ticket=epoch,context=options.context();if(!context.loaded)throw new Error(tr('PDF 尚未加载。'));
    await options.showTranslation();if(ticket!==epoch)return;
    const run=new AbortController();pageRun=run;busyButtons(true);const language=selectedLanguage(),pages=all?Array.from({length:context.total},(_,i)=>i+1):[context.page];let completed=0,empty=0,cachedCount=0;
    try{
      for(const page of pages){
        run.signal.throwIfAborted();progress(msg`正在处理第 ${page} 页 · ${completed} 页已完成${empty?msg` · ${empty} 页无文字`:''}`);
        const sourceText=await options.pageText(page);run.signal.throwIfAborted();if(ticket!==epoch)return;
        if(!sourceText.trim()){empty++;continue;}
        const key=await translationKey(context.paper,page,language,sourceText);run.signal.throwIfAborted();if(ticket!==epoch)return;
        if(study.cache.some(row=>row.key===key)){completed++;cachedCount++;continue;}
        const chunks=translationChunks(sourceText),translated=[];
        for(const [index,text] of chunks.entries()){
          progress(msg`正在翻译第 ${page} 页${chunks.length>1?msg`（${index+1}/${chunks.length} 段）`:''} · 已完成 ${completed}/${pages.length} 页`);
          const result=await options.translate({mode:'page',text,targetLanguage:language,title:context.paper.title.slice(0,1000),context:''},{signal:run.signal});run.signal.throwIfAborted();if(ticket!==epoch)return;translated.push(result.text);
        }
        const entry={key,paperId:context.paper.id,fingerprint:context.paper.fingerprint||'',page,targetLanguage:language,sourceText,translatedText:translated.join('\n\n'),updatedAt:Date.now()};
        study.cache=await updateStudy(study.libraryKey,{kind:'cache',entry});if(ticket!==epoch)return;completed++;if(options.context().page===page)await pageChanged();
      }
      if(ticket===epoch){progress(msg`已完成 ${completed}/${pages.length} 页${cachedCount?msg`（${cachedCount} 页复用本地译文）`:''}${empty?msg`；${empty} 页无文字，未翻译。扫描页需先 OCR`:'。'}`);await pageChanged();}
    }catch(error){if(ticket===epoch)progress(run.signal.aborted?msg`已停止 · ${completed} 页已保存${empty?msg` · ${empty} 页无文字`:''}；未完成的页面可重新翻译。`:msg`翻译未完成：${error.message} 已保存 ${completed} 页，可重试。`);}
    finally{if(pageRun===run){pageRun=null;busyButtons(false);}}
  }
  host.addEventListener('click',event=>{const swatch=event.target.closest('[data-study-color]');if(swatch){markColor=swatch.dataset.studyColor;popup().querySelectorAll('[data-study-color]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.studyColor===markColor)));return;}const action=event.target.closest('[data-study-action]')?.dataset.studyAction;if(!action)return;
    Promise.resolve().then(async()=>{
      if(action==='highlight'||action==='underline'){await markSelection(action);return;}
      if(action==='copy-selection'&&selection){await navigator.clipboard.writeText(selection.text);popup().querySelector('.selection-action-status').textContent=tr('已复制选文');return;}
      if(action==='expand-selection'&&selection){selection.expanded=!selection.expanded;selectionHTML(selection.translatedText||selectionPrompt(),{save:Boolean(selection.translatedText)&&selection.text.length<=160});return;}
      if(action==='dismiss'){selectionChanged(null,{force:true});return;}if(action==='stop'){pageRun?.abort();return;}
      if(action==='stop-selection'){const current=selection;selectionVersion++;selectionRun?.abort();selectionRun=null;if(current){current.loading=false;selectionHTML(tr('已停止翻译，可点击“翻译”重试。'));}return;}
      if(action==='settings'){await options.configure();return;}
      if(action==='selection')await translateSelection();if(action==='save-word')await saveWord();if(action==='page'||action==='all')await translatePages(action==='all');
      if(action==='annotate')await annotateSelection();
    }).catch(error=>{progress(error.message);options.toast(error.message,true);});
  });
  host.addEventListener('change',async event=>{
    if(!['reader-translation-language','reader-selection-language'].includes(event.target.id)||!study)return;
    const language=event.target.value;
    if(savingLanguage||pageRun||selection?.annotationPending||!Object.hasOwn(TRANSLATION_LANGUAGES,language)||language===selectedLanguage()){syncLanguageControls();return;}
    const ticket=epoch,preferences={targetLanguage:language,instant:false};savingLanguage=true;selectionVersion++;selectionRun?.abort();selectionRun=null;if(selection)selection.loading=false;
    busyButtons(false);if(selection)selectionHTML(selection.translatedText||selectionPrompt(),{save:Boolean(selection.translatedText)&&selection.text.length<=160});
    try{
      await updateStudy(study.libraryKey,{kind:'preferences',preferences});if(ticket!==epoch)return;
      study.preferences=preferences;
      if(selection){selection.translatedText='';selection.targetLanguage=language;selection.annotationId='';selection.offline=false;}
      await pageChanged();
    }catch(error){if(ticket===epoch){progress(msg`设置未保存：${error.message}`);options.toast(error.message,true);}}
    finally{if(ticket===epoch){savingLanguage=false;busyButtons(Boolean(pageRun));if(selection){selectionHTML(selection.translatedText||selectionPrompt(),{save:Boolean(selection.translatedText)&&selection.text.length<=160});void lookupSelectionOffline();}}}
  });
  return{initialize,dispose,pageChanged,selectionChanged,markSelection,tabChanged(next){if(next==='translation')pageChanged();if(next==='vocabulary')vocabulary?.refresh();},dismiss(){selectionChanged(null,{force:true});}};
}

