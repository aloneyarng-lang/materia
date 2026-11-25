// Add a feature here. Navigation, lazy loading, lifecycle and packaging use this registry.
import {predictionModule} from './prediction-module.js';
import {figuraModule} from './figura-module.js';
import {literatureWorkbenchModule} from './literature-workbench/index.js';
import {timelineModules} from './innovation-timeline/index.js';
import {betaModule} from './beta/index.js';
export const WORKSPACE_MODULES = [
  {id:'graph',label:'星图',title:'研究星图',icon:'orbit',panelId:'graph-wrap',required:true,libraryView:true,create:context=>context.builtin('graph')},
  {id:'list',label:'文献',title:'文献列表',icon:'list',panelId:'paper-list',required:true,libraryView:true,create:context=>context.builtin('list')},
  {id:'materials',label:'材料',title:'材料列表',icon:'library',panelId:'material-list',navigation:'ribbon',create:context=>context.builtin('materials')},
  {id:'notes',label:'笔记',title:'研究笔记',icon:'notebook',panelId:'notes-library',navigation:'ribbon',libraryView:true,create:context=>context.builtin('notes')},
  predictionModule,
  {id:'research',label:'研读',title:'研读',icon:'files',panelId:'research-workspace',navigation:'ribbon',create:({setCount})=>({render:()=>setCount('')})},
  ...[['literature-workbench','逐图研读'], ['takeaway-card','速记卡'], ['paper-canvas','研究画布']].map(([id,label]) => ({
    ...literatureWorkbenchModule, id, label, title:label, panelId:id, parentView:'research',
  })),
  ...timelineModules,
  figuraModule,
  betaModule,
];

export function workspaceTab(view) {
  const module = WORKSPACE_MODULES.find(item => item.id === view);
  return module?.parentView ?? module?.id;
}
