import {ModuleRegistry} from './module-runtime.js';
import {WORKSPACE_MODULES} from './modules/index.js';
import {t,html} from './i18n.js';
import {icon,hydrateIcons} from './icons.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createWorkspaceModules(config){
  const tabs=document.querySelector('.view-tabs'),container=document.querySelector('.visualization-column'),styles=new Map();let generation=0;
  function navigation(){
    tabs.replaceChildren();for(const definition of registry.list()){
      const button=document.createElement('button');button.className='view-tab';button.type='button';button.dataset.view=definition.id;button.dataset.panel=definition.panelId;button.setAttribute('role','tab');button.innerHTML=icon(definition.icon)+escape(t(definition.label));tabs.append(button);
      if(!document.getElementById(definition.panelId)){const host=document.createElement('section');host.id=definition.panelId;host.hidden=true;container.insertBefore(host,container.querySelector('.map-footer'));}
    }
    if(!registry.enabled.has(config.getView()))config.setView(registry.list()[0].id);hydrateIcons(tabs);
  }
  const registry=new ModuleRegistry(WORKSPACE_MODULES,definition=>{
    const host=document.getElementById(definition.panelId),links=[],scope=new AbortController();
    for(const url of definition.styles||[]){const link=document.createElement('link');link.rel='stylesheet';link.href=url;document.head.insertBefore(link,document.querySelector('link[href$="mac-workspace.css"]'));links.push(link);}styles.set(definition.id,links);
    const key=definition.storageKey||'module:'+definition.id;
    const services={load:async()=>{if(definition.desktopStorage&&config.native){if(!config.native.moduleLoad)throw Error(t('请重新启动 Materia。'));return config.native.moduleLoad(definition.id);}return{libraryKey:config.libraryKey(),state:await config.readSetting(key)};},
      save:async payload=>{if(definition.desktopStorage&&config.native)return config.native.moduleSave(definition.id,payload);if(payload.libraryKey!==config.libraryKey())throw Error(t('文献库已切换'));return config.writeSetting(key,payload.state);}};
    return{host,signal:scope.signal,on:(target,event,handler,options={})=>target.addEventListener(event,handler,{...options,signal:scope.signal}),isReady:config.isReady,toast:config.toast,saveText:config.saveText,services,builtin:id=>config.builtins[id],getPapers:()=>structuredClone(config.getPapers()),
      readData:()=>config.readSetting('module:'+definition.id),writeData:value=>config.writeSetting('module:'+definition.id,value),
      setCount:value=>{if(config.getView()===definition.id)document.getElementById('visible-count').textContent=value;},
      release:()=>{scope.abort();for(const link of links)link.remove();styles.delete(definition.id);if(definition.bodyClass)document.body.classList.remove(definition.bodyClass);if(!definition.required){host.replaceChildren();host.hidden=true;}}
    };
  },{onChange:navigation,persist:config.persistPreferences});
  navigation();
  async function render(){
    const token=++generation,id=config.getView(),definition=registry.definitions.get(id);if(!definition||!registry.enabled.has(id))return;
    for(const d of registry.definitions.values()){const host=document.getElementById(d.panelId);if(host)host.hidden=d.id!==id;if(d.bodyClass)document.body.classList.toggle(d.bodyClass,d.id===id);}
    try{const runtime=await registry.get(id);if(token===generation&&config.getView()===id)await runtime.render?.();}
    catch(error){if(token!==generation)return;const host=document.getElementById(definition.panelId);host.textContent=t('功能暂时无法打开')+'：'+error.message;config.toast(error.message,true);}
  }
  function settingsHTML(){return html`<div class="module-preferences"><p>关闭暂时不用的页面，数据仍然保留；重新开启即可继续。</p>${WORKSPACE_MODULES.filter(d=>!d.required).map(d=>`<label><span>${escape(t(d.label))}</span><input type="checkbox" data-workspace-module="${escape(d.id)}" ${registry.enabled.has(d.id)?'checked':''}></label>`).join('')}</div>`;}
  document.addEventListener('change',async event=>{const id=event.target.dataset.workspaceModule;if(!id)return;const input=event.target;input.disabled=true;try{await registry.setEnabled(id,input.checked);config.changed();}catch(error){input.checked=registry.enabled.has(id);config.toast(error.message,true);}finally{input.disabled=false;}});
  return{registry,render,settingsHTML,loadPreferences:value=>registry.loadPreferences(value),flush:()=>registry.flush(),reset:()=>{generation++;return registry.reset();},views:()=>registry.list(),current:()=>registry.definitions.get(config.getView()),title:()=>t(registry.definitions.get(config.getView())?.title||''),refreshNavigation:navigation};
}
