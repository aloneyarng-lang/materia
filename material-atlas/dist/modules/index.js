// Add a feature here. Navigation, lazy loading, lifecycle and packaging use this registry.
import {predictionModule} from './prediction-module.js';
import {figuraModule} from './figura-module.js';
import {researchHubModule} from './research-hub/index.js';
import {literatureWorkbenchModule} from './literature-workbench/index.js';
import {timelineModules} from './innovation-timeline/index.js';
import {betaModule} from './beta/index.js';
import {citationAtlasModule} from './citation-atlas/index.js';
import {vocabularyModule} from './vocabulary-module.js';
export const WORKSPACE_MODULES = [
  {id:'graph',label:'星图',title:'研究星图',icon:'orbit',panelId:'graph-wrap',required:true,libraryView:true,create:context=>context.builtin('graph')},
  {id:'list',label:'文献',title:'文献列表',icon:'list',panelId:'paper-list',required:true,libraryView:true,create:context=>context.builtin('list')},
  {id:'materials',label:'材料',title:'材料列表',icon:'library',panelId:'material-list',navigation:'ribbon',create:context=>context.builtin('materials')},
  {id:'notes',label:'笔记',title:'研究笔记',icon:'notebook',panelId:'notes-library',navigation:'ribbon',libraryView:true,create:context=>context.builtin('notes')},
  vocabularyModule,
  predictionModule,
  researchHubModule,
  ...[['literature-workbench','逐图研读'], ['takeaway-card','速记卡'], ['paper-canvas','研究画布']].map(([id,label]) => ({
    ...literatureWorkbenchModule, id, label, title:label, panelId:id, parentView:'research',
  })),
  ...timelineModules,
  citationAtlasModule,
  figuraModule,
  betaModule,
  {id:'music', label:'音乐', title:'音乐工作台', icon:'music', panelId:'music-workspace',
    navigation:'ribbon', ribbonGroup:'bottom', styles:[new URL('../music.css', import.meta.url).href],
    create:async context => (await import('../music.js')).createMusicWorkspace(context)},
];

export function workspaceTab(view) {
  const module = WORKSPACE_MODULES.find(item => item.id === view);
  return module?.parentView ?? module?.id;
}
