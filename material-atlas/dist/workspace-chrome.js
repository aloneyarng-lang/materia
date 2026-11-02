import {t,html} from './i18n.js';
import {icon} from './icons.js';
import {WORKSPACE_MODULES} from './modules/index.js';
const VIEWS=WORKSPACE_MODULES.map(module=>module.id);
export function cleanWorkspaceLayout(input={}){
 const result={};if(!input||typeof input!=='object')return result;
 if(VIEWS.includes(input.view))result.view=input.view;
 for(const key of ['leftPanelOpen','detailOpen','focusGraph'])if(typeof input[key]==='boolean')result[key]=input[key];
 return result;
}
export const workspaceLayoutKey=library=>'materia.workspace-layout.v1:'+String(library||'browser');
export function readWorkspaceLayout(storage,library){try{return cleanWorkspaceLayout(JSON.parse(storage.getItem(workspaceLayoutKey(library))||'{}'));}catch{return{};}}
export function writeWorkspaceLayout(storage,library,state){try{storage.setItem(workspaceLayoutKey(library),JSON.stringify(cleanWorkspaceLayout(state)));return true;}catch{return false;}}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createWorkspaceChrome(config){
 const {$,getState,getPapers,canOpen,runAction,selectPaper,clearSearch}=config;
 let returnFocus=null,items=[],active=0,executing=false;
 let storage=null;try{storage=globalThis.localStorage;}catch{}
 const dialog=document.createElement('dialog');dialog.id='workspace-command-dialog';dialog.className='workspace-command-dialog';dialog.setAttribute('aria-label',t('快速操作'));document.body.append(dialog);
 const mac=/Mac|iPhone|iPad/.test(navigator.platform),modifier=mac?'⌘':'Ctrl';
 function commands(){return[
  ...(config.getViews?.()||WORKSPACE_MODULES).map((module,i)=>({id:'view:'+module.id,label:t(module.label),image:module.icon,detail:t('切换视图'),hint:i<9?modifier+' '+(i+1):'',keywords:[module.id],run:()=>openView(module.id)})),
  ...[['import','导入文献','plus'],['module-settings','功能管理','sliders'],['research-canvas','研究画布','network'],['ai-agent','AI 研究助手','assistant'],['parameter-index','性能参数目录','ruler'],['themes','主题与字体','palette'],['settings','设置','settings']].map(([id,label,image])=>({id,label:t(label),image,detail:t('常用操作'),keywords:[id],run:()=>runAction(id)})),
 ];}
 function openView(view){const button=document.querySelector(`.view-tabs [data-view="${view}"]`);button?.click();button?.focus();}
 function renderResults(){const query=$('#workspace-command-input').value.trim().toLocaleLowerCase(),tokens=query.split(/\s+/).filter(Boolean);
  items=commands().filter(c=>tokens.every(token=>[c.label,c.detail,...(c.keywords||[])].join(' ').toLocaleLowerCase().includes(token)));
  if(query)items.push(...getPapers().filter(p=>tokens.every(token=>[p.title,p.authors,p.year,...(p.tags||[])].join(' ').toLocaleLowerCase().includes(token))).slice(0,7).map(p=>({id:'paper:'+p.id,label:p.title,image:'files',detail:[t('文献'),p.journal,p.year].filter(Boolean).join(' · '),run:()=>selectPaper(p.id)})));
  active=0;$('#workspace-command-results').innerHTML=items.length?items.map((item,i)=>`<button type="button" id="workspace-command-result-${i}" role="option" aria-selected="${i===0}" tabindex="-1" data-workspace-command-id="${esc(item.id)}" data-command-index="${i}">${icon(item.image)}<span><strong>${esc(item.label)}</strong><small>${esc(item.detail)}</small></span>${item.hint?`<kbd>${esc(item.hint)}</kbd>`:''}</button>`).join(''):`<div class="workspace-command-empty">${esc(t('没有匹配的操作或文献'))}</div>`;
  $('#workspace-command-input').setAttribute('aria-activedescendant',items.length?'workspace-command-result-0':'');
 }
 function highlight(index){if(!items.length)return;active=(index+items.length)%items.length;dialog.querySelectorAll('[data-command-index]').forEach((button,i)=>button.setAttribute('aria-selected',String(i===active)));$('#workspace-command-input').setAttribute('aria-activedescendant','workspace-command-result-'+active);$('#workspace-command-result-'+active)?.scrollIntoView({block:'nearest'});}
 function open(){if(!canOpen()||executing)return;returnFocus=document.activeElement;
  dialog.setAttribute('aria-label',t('快速操作'));
  dialog.innerHTML=html`<div class="workspace-command-search">${icon('search')}<input id="workspace-command-input" placeholder="搜索操作、视图或文献…" aria-label="搜索操作、视图或文献" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="workspace-command-results" autocomplete="off"><button type="button" class="icon-button" data-command-close aria-label="关闭快速操作">${icon('close')}</button></div><div id="workspace-command-results" role="listbox" aria-label="快速操作结果"></div><footer><span>↑ ↓ 选择</span><span>↵ 打开</span><span>Esc 关闭</span></footer>`;
  if(!dialog.open)dialog.showModal();renderResults();$('#workspace-command-input').focus();
 }
 async function execute(index){if(executing||!items[index])return;const command=items[index];returnFocus=null;dialog.close();executing=true;try{await command.run();}catch(e){config.toast(e.message,true);}finally{executing=false;}}
 dialog.addEventListener('input',e=>{if(e.target.id==='workspace-command-input')renderResults();});
 dialog.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();highlight(active+(e.key==='ArrowDown'?1:-1));}if(e.key==='Enter'){e.preventDefault();execute(active);}});
 dialog.addEventListener('pointerdown',e=>{if(e.target.closest('[data-command-index]'))e.preventDefault();});
 dialog.addEventListener('click',e=>{const result=e.target.closest('[data-command-index]');if(result)execute(Number(result.dataset.commandIndex));if(e.target.closest('[data-command-close]'))dialog.close();if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dialog.close();}});
 dialog.addEventListener('close',()=>{if(returnFocus?.isConnected)returnFocus.focus();returnFocus=null;});
 $('#workspace-command').addEventListener('click',open);
 $('#clear-workspace-search').addEventListener('click',()=>{clearSearch();$('#search').focus();});
 document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='k'){if(canOpen()&&!dialog.open){e.preventDefault();open();}return;}
  if(dialog.open||!canOpen())return;
  if(e.key==='Escape'&&e.target.id==='search'&&e.target.value){e.preventDefault();clearSearch();return;}
  const editing=e.target.matches('input,textarea,select')||e.target.isContentEditable;
  const views=(config.getViews?.()||WORKSPACE_MODULES).map(module=>module.id);
  if(!editing&&(e.ctrlKey||e.metaKey)&&!e.altKey&&/^[1-9]$/.test(e.key)&&views[Number(e.key)-1]){e.preventDefault();openView(views[Number(e.key)-1]);return;}
  const tab=e.target.closest('.view-tabs [data-view]');if(!tab||e.ctrlKey||e.metaKey||e.altKey)return;
  let index=views.indexOf(tab.dataset.view);if(e.key==='ArrowLeft')index--;else if(e.key==='ArrowRight')index++;else if(e.key==='Home')index=0;else if(e.key==='End')index=views.length-1;else return;
  e.preventDefault();openView(views[(index+views.length)%views.length]);
 });
 return{sync(){const state=getState();
  document.querySelectorAll('.view-tabs [data-view]').forEach(button=>{button.disabled=!state.ready||state.storageError;button.tabIndex=button.dataset.view===state.view?0:-1;button.id='workspace-tab-'+button.dataset.view;const id=button.dataset.panel;button.setAttribute('aria-controls',id);const panel=$('#'+id);panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);});
  $('#clear-workspace-search').hidden=!state.query;$('#workspace-details').hidden=!['graph','list'].includes(state.view);$('#workspace-details').setAttribute('aria-pressed',String(state.detailOpen));
  $('#ribbon-import').hidden=!config.getViews?.().find(view=>view.id===state.view)?.libraryView;
  $('#workspace-command').title=t('快速操作')+' · '+modifier+' K';
  $('#workspace-command').disabled=!state.ready||state.storageError;
  if(state.ready)writeWorkspaceLayout(storage,state.desktopInfo?.path||'browser',state);
 },restore(library){Object.assign(getState(),{view:'graph',leftPanelOpen:false,detailOpen:true,focusGraph:true},readWorkspaceLayout(storage,library));},open};
}
