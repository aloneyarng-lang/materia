import {t as tr,html,msg} from './i18n.js';
import {artworkURL} from './theme-artwork.js';
import {actionMenu} from './action-menus.js';
import {icon} from './icons.js';
import {createThemeRuntime,validateThemeResources} from './theme-runtime.js';
import {setGraphThemeOptions} from './graph-appearance.js';
import {THEME_TOKENS,BUILTIN_THEMES,FONT_OPTIONS,MAX_THEME_BYTES,themeCSS,themePackage,resolveTheme,cleanThemePreferences,cleanFontScale,importThemeFiles,removeTheme,parseThemeCSS} from './theme-model.js';
export * from './theme-model.js';
export function createThemeController(config){
 let preferences=cleanThemePreferences(),pending=null,busy=false,epoch=0,importRevision=0;const esc=config.escape,runtime=createThemeRuntime(()=>config.changed?.());
 const current=()=>pending||preferences;
 function applyFontScale(value){
  const percent=cleanFontScale(value);document.documentElement.style.setProperty('--ui-font-scale',String(percent/100));
  const output=document.querySelector('#theme-font-scale-value');if(output)output.textContent=`${percent}%`;
  const control=document.querySelector('[data-theme-font-scale]');if(control){control.value=String(percent);control.setAttribute('aria-valuetext',`${percent}%`);}
 }
 function apply(){
  const prefs=current();setGraphThemeOptions([...BUILTIN_THEMES,...prefs.themes.map(row=>({id:row.id,name:row.name,...(row.package||parseThemeCSS(row.css,row.name))}))]);
  const theme=runtime.apply(resolveTheme(prefs)),button=document.querySelector('#ribbon-theme');
  applyFontScale(current().fontScale);
  if(button){button.title=msg`主题：${theme.name}`;button.setAttribute('aria-label',msg`主题切换，当前${theme.name}`);}
  return theme;
 }
 function load(value){epoch++;pending=null;preferences=cleanThemePreferences(value);apply();}
 const swatches=theme=>{const t=theme.tokens;return `style="--preview-bg:${esc(t['--paper'])};--preview-surface:${esc(t['--surface'])};--preview-accent:${esc(t['--teal'])};--preview-ink:${esc(t['--ink'])};--preview-line:${esc(t['--line'])};--preview-radius:${theme.ui.cardRadius}px;--preview-stroke:${theme.icons.strokeWidth};--preview-font:${esc(t['--serif'])}"`;};
 function fontSettings(){
  const prefs=current(),options=role=>FONT_OPTIONS.map(font=>`<option value="${font.id}" ${(prefs.fonts?.[role]||'theme')===font.id?'selected':''}>${esc(tr(font.name))}</option>`).join(''),count=Object.values(prefs.fonts||{}).filter(value=>value!=='theme').length;
  const scale=prefs.fontScale||100;
  return html`<details class="theme-fonts"><summary>字体与字号 <small>${count?count+tr(' 项覆盖主题字体',false):tr('全部跟随主题')}</small></summary><div class="theme-fonts-heading"><strong>自定义字体</strong>${actionMenu('theme-font-menu',tr('字体操作'),html`<button type="button" data-theme-action="reset-fonts" ${pending?'disabled':''}>${icon('undo')}重置字体</button><button type="button" data-theme-action="reset-font-scale" ${pending?'disabled':''}>${icon('text')}恢复默认字号</button>`,{iconName:'more',iconOnly:true,className:'icon-button'})}</div><div class="theme-font-selects">${[['body',tr('界面与正文')],['heading',tr('文献与页面标题')],['numeric',tr('数字与指标')],['mono',tr('代码与等宽内容')]].map(([role,label])=>html`<label>${label}<select data-theme-font="${role}" aria-label="${label}字体" ${pending?'disabled':''}>${options(role)}</select></label>`).join('')}</div><div class="theme-font-size"><div class="theme-fonts-heading"><strong>界面字号</strong></div><label for="theme-font-scale">字号：<output id="theme-font-scale-value">${scale}%</output></label><input id="theme-font-scale" type="range" min="85" max="150" step="5" value="${scale}" data-theme-font-scale aria-label="界面字号" aria-valuetext="${scale}%" aria-describedby="theme-font-scale-help" ${pending?'disabled':''}><small id="theme-font-scale-help">拖动调整界面字号。</small></div><div class="theme-font-preview"><strong>材料的结构与性能 · Structure &amp; Properties</strong><p>在文献之间建立关联，记录你的研究思考。Materials connect ideas.</p><code>2026 · 1,250.00 MPa · sample_A</code></div><small>中文采用苹方或内置思源黑体；PDF 原文字体保持原样。</small><span id="theme-font-status" role="status"></span></details>`;
 }
 function open(){
  const prefs=current(),active=resolveTheme(prefs),mode=active.tokens['--theme-mode'],themes=[...BUILTIN_THEMES.map(theme=>resolveTheme({...prefs,selected:theme.id,mode})),...prefs.themes.map(row=>resolveTheme({...prefs,selected:row.id,mode}))];
  config.showModal(tr('主题与字体'),pending?tr('预览中，应用后保存。'):'',html`<div class="theme-intro"><div class="theme-mode-row"><div class="theme-mode-control" role="group" aria-label="明暗外观">${[['light',tr('浅色')],['dark',tr('深色')]].map(([id,label])=>`<button data-theme-mode-choice="${id}" aria-pressed="${mode===id}" class="${mode===id?'active':''}" ${busy||pending?'disabled':''}>${label}</button>`).join('')}</div>${actionMenu('theme-file-menu',tr('主题文件'),tr('<button type="button" data-theme-action="import">导入主题…</button><button type="button" data-theme-action="export">导出当前主题…</button><hr><button type="button" data-theme-action="template">下载主题模板</button><button type="button" data-theme-action="template-css">下载 CSS 模板</button><button type="button" data-theme-action="export-css">导出 CSS…</button>'),{iconName:'folder'})}</div></div><div class="theme-grid">${themes.map(theme=>html`<article class="theme-card ${prefs.selected===theme.id?'is-selected':''}"><button class="theme-choice" data-theme-id="${esc(theme.id)}" aria-pressed="${prefs.selected===theme.id}" ${busy||pending?'disabled':''}><span class="theme-preview" ${swatches(theme)} aria-hidden="true">${theme.assets?.artwork?.logo?`<span class="theme-official-preview"><img class="theme-preview-logo" src="${artworkURL(theme.assets.artwork.logo)}" alt="${esc(theme.assets.artwork.logo.alt)}">${theme.assets.artwork.portrait?`<img class="theme-preview-portrait" src="${artworkURL(theme.assets.artwork.portrait)}" alt="">`:""}</span>`:""}<i class="theme-preview-rail"></i><i class="theme-preview-panel"><b></b><b></b><b></b></i><span class="theme-preview-sample"><strong>材料研究</strong><small>结构与研究记录</small><span>${icon('assistant',theme.icons)}${icon('folder',theme.icons)}${icon('chart',theme.icons)}</span></span></span><span class="theme-card-name"><strong>${esc(theme.custom?theme.name:tr(theme.name))}</strong><small>${prefs.selected===theme.id?pending?tr('预览中'):'✓':''}</small></span><span class="theme-card-description">${esc(theme.custom?theme.description:tr(theme.description))}</span></button>${theme.custom&&!pending?html`<button class="theme-delete" data-theme-remove="${esc(theme.id)}" aria-label="删除主题 ${esc(theme.name)}" title="删除主题">${icon('close')}</button>`:''}</article>`).join('')}</div>${fontSettings()}<details class="theme-resource-details"><summary>字体状态</summary><p id="theme-resource-status" role="status">${esc(tr(runtime.status()))}</p></details><div class="modal-footer">${pending?tr('<button class="text-button" data-theme-action="cancel-preview">取消</button><button class="primary" data-theme-action="apply-import">应用主题</button>'):tr('<button class="text-button" data-theme-action="reset">恢复默认</button><button class="primary" data-action="close-modal">完成</button>')}</div>`,'themes');
  requestAnimationFrame(()=>document.querySelector('.theme-grid .is-selected')?.scrollIntoView({block:'nearest'}));
 }
 async function save(next){if(busy)return false;busy=true;const ticket=epoch;try{const clean=cleanThemePreferences(next);await config.persist(clean);if(ticket!==epoch)return false;preferences=clean;pending=null;apply();return true;}finally{busy=false;}}
 function cancelPreview(){if(!pending)return;pending=null;apply();}
 async function importFiles(files){
  if(!files.length||busy)return;busy=true;const ticket=epoch,revision=++importRevision;
  try{const rows=[];for(const file of files){if(!/\.(css|json)$/i.test(file.name))throw new Error(tr('请选择 .mtheme.json 或 .css 主题文件。'));if(file.size>(/\.css$/i.test(file.name)?32768:MAX_THEME_BYTES))throw new Error(msg`${file.name} 超过允许大小。`);rows.push({name:file.name,text:await file.text()});}
   const next=importThemeFiles(preferences,rows,()=>`custom-${crypto.randomUUID()}`);
   // Decode every supplied font before displaying or persisting any theme in the batch.
   for(const row of rows){const imported=importThemeFiles({},[row],()=> 'custom-validation');await validateThemeResources(resolveTheme(imported));}
   if(ticket!==epoch||revision!==importRevision)return;pending=next;apply();open();
  }finally{busy=false;}
 }
 document.querySelector('#theme-input').addEventListener('change',async event=>{const files=[...event.target.files];event.target.value='';try{await importFiles(files);}catch(error){config.toast(msg`主题未导入：${error.message}`,true);}});
 document.querySelector('#modal').addEventListener('close',()=>{importRevision++;cancelPreview();});
 document.addEventListener('input',event=>{if(event.target.matches('[data-theme-font-scale]')&&!busy&&!pending)applyFontScale(Number(event.target.value));});
 document.addEventListener('change',async event=>{
  if(event.target.matches('[data-theme-font-scale]')){
   if(busy||pending){applyFontScale(current().fontScale);return;}
   const controls=[...document.querySelectorAll('[data-theme-font],[data-theme-font-scale]')];controls.forEach(control=>control.disabled=true);
   try{if(await save({...preferences,fontScale:Number(event.target.value)})){const status=document.querySelector('#theme-font-status');if(status)status.textContent=tr('字号已保存');}}
   catch(error){applyFontScale(preferences.fontScale);config.toast(msg`字号未更改：${error.message}`,true);}
   finally{controls.forEach(control=>control.disabled=false);}return;
  }
  const role=event.target.dataset.themeFont;if(!['body','heading','mono','numeric'].includes(role))return;if(busy||pending){event.target.value=preferences.fonts?.[role]||'theme';return;}
  const controls=[...document.querySelectorAll('[data-theme-font],[data-theme-font-scale]')];controls.forEach(control=>control.disabled=true);
  try{if(await save({...preferences,fonts:{...preferences.fonts,[role]:event.target.value}})){const status=document.querySelector('#theme-font-status');if(status)status.textContent=tr('个人字体覆盖已保存');}}
  catch(error){event.target.value=preferences.fonts?.[role]||'theme';config.toast(msg`字体未更改：${error.message}`,true);}finally{controls.forEach(control=>control.disabled=false);}
 });
 document.addEventListener('click',async event=>{const button=event.target.closest('[data-theme-id],[data-theme-action],[data-theme-remove],[data-theme-mode-choice]');if(!button||button.disabled||busy)return;try{
  if(button.dataset.themeModeChoice){if(await save({...preferences,mode:button.dataset.themeModeChoice}))open();}
  if(button.dataset.themeId){cancelPreview();if(await save({...preferences,selected:button.dataset.themeId,mode:resolveTheme(preferences).tokens['--theme-mode']}))open();}
  if(button.dataset.themeRemove){if(await save(removeTheme(preferences,button.dataset.themeRemove)))open();}
  const action=button.dataset.themeAction;
  if(action==='import')document.querySelector('#theme-input').click();
  if(action==='template')await config.saveText(themePackage(resolveTheme({selected:'ocean'})),'materia-theme-template.mtheme.json','json');
  if(action==='template-css')await config.saveText(themeCSS(tr('我的学术主题'),THEME_TOKENS),'materia-theme-template.css','css');
  if(action==='export'){const theme=resolveTheme(current());await config.saveText(themePackage(theme),`materia-theme-${theme.id}.mtheme.json`,'json');}
  if(action==='export-css'){const theme=resolveTheme(current());await config.saveText(themeCSS(theme.name,theme.tokens),`materia-theme-${theme.id}.css`,'css');}
  if(action==='reset'){cancelPreview();if(await save({...preferences,selected:'paper'})){open();config.toast(tr('已恢复默认主题。'));}}
  if(action==='reset-fonts'){if(await save({...preferences,fonts:{body:'theme',heading:'theme',mono:'theme',numeric:'theme'}})){open();document.querySelector('.theme-fonts').open=true;config.toast(tr('字体已恢复跟随主题。'));}}
  if(action==='reset-font-scale'){if(await save({...preferences,fontScale:100})){open();document.querySelector('.theme-fonts').open=true;config.toast(tr('字号已恢复为 100%。'));}}
  if(action==='cancel-preview'){cancelPreview();open();}
  if(action==='apply-import'&&pending){if(await save(pending)){open();config.toast(tr('主题已应用并保存在本地文献库。'));}}
 }catch(error){cancelPreview();open();config.toast(msg`主题未更改：${error.message}`,true);}});
 return{load,open,importFiles,getPreferences:()=>cleanThemePreferences(preferences),isBusy:()=>busy,ready:runtime.ready};
}
