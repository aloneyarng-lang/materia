import {cleanIconShapes,ICON_DEFAULTS} from './theme-model.js';
const icons = {
  command:'<path d="M9 9H6a3 3 0 1 1 3-3v12a3 3 0 1 1-3-3h12a3 3 0 1 1-3 3V6a3 3 0 1 1 3 3H9Z"/>',
  dictionary:'<path d="M5 3h14v18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 14h14M6 3v14M9 12l2-6 2 6m-3.4-2h2.8M15 7h2m-2 3h2"/>',
  notebook:'<rect x="5" y="3" width="15" height="18" rx="2"/><path d="M3 7h4M3 12h4M3 17h4M10 8h6M10 12h6M10 16h4"/>',
  'natural-layout':'<path d="M4 18c1-9 4-10 8-10s6 3 8 8"/><circle cx="4" cy="18" r="2"/><circle cx="12" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M17 3v4M15 5h4"/>',
  redo:'<path d="M20 9H10a6 6 0 1 0 0 12M20 9l-5-5m5 5-5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  orbit: '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-35 12 12)"/><path d="M9 3a10 10 0 0 1 8 17"/>',
  library: '<path d="M4 4h4v16H4zM11 4h4v16h-4zM17 4l4-1 4 16-4 1z" transform="translate(-1 0) scale(.95 1)"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  folder: '<path d="M3 7V5h6l2 2h10v12H3z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7h.01"/>',
  settings: '<path d="m9 3-.6 2.1-2 .9-2-.5L2 9l1.6 1.6v2.8L2 15l2.4 3.5 2-.5 2 .9L9 21h5l.6-2.1 2-.9 2 .5L21 15l-1.6-1.6v-2.8L21 9l-2.4-3.5-2 .5-2-.9L14 3z"/><circle cx="11.5" cy="12" r="3"/>',
  home: '<path d="m3 10 9-7 9 7v10h-7v-6h-4v6H3z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 8.5a2.6 2.6 0 1 1 4.1 2.1c-1.5.8-1.7 1.4-1.7 2.4M12 17h.01"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/>',
  files: '<path d="M7 3h8l4 4v14H7zM15 3v5h4M3 7v13M10 12h6M10 16h6"/>',
  tag: '<path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="7.5" cy="7.5" r="1"/>',
  network: '<circle cx="5" cy="5" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="8" cy="18" r="2"/><circle cx="20" cy="18" r="2"/><path d="m7 5 9 1M6 7l2 9m2 2h8M17 8l-7 8m9-8 1 8"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  sliders: '<path d="M3 6h5m4 0h9M3 12h11m4 0h3M3 18h3m4 0h11"/><circle cx="10" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
  'chevron-down': '<path d="m7 9 5 5 5-5"/>', expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  mouse: '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 6v4"/>',
  external: '<path d="M14 3h7v7m0-7L10 14M9 3H3v18h18v-6"/>',
  edit: '<path d="m15 4 5 5M3 21l5-1L21 7l-5-5L3 15z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>', check: '<path d="m5 12 4 4L19 6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
};
Object.assign(icons, {'panel-left':'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>','panel-right':'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',chart:'<path d="M4 3v17h17M7 15l4-5 4 2 5-7"/>',table:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/>',ruler:'<path d="m3 16 13-13 5 5L8 21zM7 12l2 2m2-6 2 2m2-6 2 2"/>',eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>','eye-off':'<path d="m3 3 18 18M8 6a12 12 0 0 1 4-1c6 0 10 7 10 7a18 18 0 0 1-4 4M6 8a20 20 0 0 0-4 4s4 7 10 7a12 12 0 0 0 4-1"/>',overview:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',undo:'<path d="M4 10h10a6 6 0 1 1 0 12M4 10l5-5m-5 5 5 5"/>',local:'<circle cx="12" cy="12" r="3"/><circle cx="4" cy="5" r="2"/><circle cx="20" cy="5" r="2"/><circle cx="20" cy="19" r="2"/><path d="m6 6 4 4m4 0 4-4m-4 8 4 4"/>'});
icons.palette='<path d="M12 3a9 9 0 1 0 0 18h1.2a2 2 0 0 0 1.2-3.6 1.7 1.7 0 0 1 1-3.1H18a3 3 0 0 0 3-3A8.9 8.9 0 0 0 12 3Z"/><circle cx="7" cy="10" r=".8"/><circle cx="10" cy="6.8" r=".8"/><circle cx="15" cy="7.5" r=".8"/>';
Object.assign(icons,{
 swap:'<path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/>',
 more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
 assistant:'<path d="M21 12v4a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h5"/><path d="m17 2 1.3 3.7L22 7l-3.7 1.3L17 12l-1.3-3.7L12 7l3.7-1.3Z"/>',
 text:'<path d="M4 5h16M12 5v15M8 20h8"/>',
 area:'<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3"/>',
 'arrow-diagonal':'<path d="M5 19 19 5M8 5h11v11"/>',
 cursor:'<path d="m5 3 15 10-7 1-4 7Z"/>',
 image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m21 15-6-6L3 21"/>',
 'chevron-left':'<path d="m15 5-7 7 7 7"/>',
 'chevron-right':'<path d="m9 5 7 7-7 7"/>'
});

export const ICON_NAMES=Object.keys(icons);
let current={...ICON_DEFAULTS};
const variants={
 rounded:{assistant:'<path d="M7 4h10a4 4 0 0 1 4 4v7a4 4 0 0 1-4 4H9l-6 3V8a4 4 0 0 1 4-4Z"/><path d="m12 7 1.2 3.3L16.5 12l-3.3 1.2L12 16.5l-1.2-3.3L7.5 12l3.3-1.7Z"/>',folder:'<path d="M3 8a3 3 0 0 1 3-3h3l3 3h6a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3Z"/>',library:'<rect x="3" y="4" width="6" height="16" rx="2"/><rect x="12" y="4" width="6" height="16" rx="2"/><path d="m20 5 2 14"/>'},
 technical:{assistant:'<rect x="6" y="6" width="12" height="12"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4M18 9h4m-4 6h4M10 12h4m-2-2v4"/>',folder:'<path d="M3 5h6l3 3h9v12H3ZM3 11h18"/>',settings:'<path d="M3 6h18M3 12h18M3 18h18"/><rect x="7" y="4" width="4" height="4"/><rect x="14" y="10" width="4" height="4"/><rect x="5" y="16" width="4" height="4"/>'},
 solid:{assistant:'<path fill="currentColor" stroke="none" d="M5 3h14a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H9l-7 3V6a3 3 0 0 1 3-3Zm7 3-1.5 4.5L6 12l4.5 1.5L12 18l1.5-4.5L18 12l-4.5-1.5Z" fill-rule="evenodd"/>',folder:'<path fill="currentColor" stroke="none" d="M2 4h8l3 3h9v14H2Z"/>',star:'<path fill="currentColor" stroke="none" d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',library:'<path fill="currentColor" stroke="none" d="M2 3h5v18H2ZM9 3h5v18H9Zm7 1 4-1 4 17-4 1Z"/>'}
};
function markup(shapes){return shapes.map(shape=>'<'+shape.tag+' '+Object.entries(shape.attrs).map(([key,value])=>key+'="'+String(value).replaceAll('"','&quot;')+'"').join(' ')+'/>').join('');}
export function icon(name,settings=current){
 const key=Object.hasOwn(icons,name)?name:'files',style=['outline','rounded','technical','duotone','solid'].includes(settings?.style)?settings.style:'outline';let body;
 if(settings?.overrides?.[key]){try{body=markup(cleanIconShapes(settings.overrides[key]));}catch{}}
 body ||= variants[style]?.[key]||icons[key];
 const wash=style==='duotone'?'<rect x="1.5" y="1.5" width="21" height="21" rx="4" fill="currentColor" fill-opacity=".13" stroke="none"/>':'';
 return '<svg class="ui-icon" data-icon-name="'+key+'"'+(arguments.length>1?' data-icon-preview="true"':'')+' data-icon-style="'+style+'" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+wash+body+'</svg>';
}
export function setIconTheme(settings){
 current={...ICON_DEFAULTS,...settings};
 if(typeof document!=='undefined')for(const node of document.querySelectorAll('svg.ui-icon[data-icon-name]:not([data-icon-preview])'))node.outerHTML=icon(node.dataset.iconName);
}
export function hydrateIcons(root=document){root.querySelectorAll('[data-icon]').forEach(node=>{node.innerHTML=icon(node.dataset.icon);});}
