// Rebuild both self-contained packages with the same public validation as the app.
import {writeFile} from 'node:fs/promises';
import {parseThemePackage} from '../../dist/theme-model.js';
const shape=d=>({tag:'path',attrs:{d}});
const rect=(x,y,width,height,rx)=>({tag:'rect',attrs:{x,y,width,height,rx}});
const circle=(cx,cy,r)=>({tag:'circle',attrs:{cx,cy,r}});
const system="-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI Variable Text', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei UI', sans-serif";
const shared={
  format:'materia-theme',schemaVersion:2,
  typography:{body:{family:system,size:13,weight:400,lineHeight:1.7},heading:{family:system,scale:1.04,weight:600,lineHeight:1.5},numeric:{family:system},mono:{family:"'SF Mono', Menlo, Consolas, 'Microsoft YaHei', monospace"}},
  ui:{style:'glass',density:1.04,radius:16,buttonRadius:18,cardRadius:20,menuRadius:18,borderWidth:1,sidebarWidth:224,controlHeight:34,cardPadding:18,menuPadding:8,cardGap:12,buttonStyle:'solid',cardStyle:'elevated',sidebarStyle:'tinted',shadow:'lifted'},
  icons:{style:'rounded',strokeWidth:1.55,size:19,overrides:{
    library:[rect(3.5,4,17,16,3),shape('M9 4v16M13 8h4M13 12h4')],
    folder:[shape('M3 8a2.5 2.5 0 0 1 2.5-2.5h4L12 8h6.5a2.5 2.5 0 0 1 2.5 2.5V18a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18Z')],
    orbit:[circle(12,12,3),{tag:'ellipse',attrs:{cx:12,cy:12,rx:10,ry:6}},shape('M12 2v3M12 19v3')],
    assistant:[shape('M12 3c0 5-4 9-9 9 5 0 9 4 9 9 0-5 4-9 9-9-5 0-9-4-9-9Z'),shape('M20 2v4M18 4h4')],
    settings:[shape('M4 6h16M4 12h16M4 18h16'),circle(9,6,2),circle(15,12,2),circle(8,18,2)],
    chart:[rect(3,3,18,18,4),shape('M7 16v-3M12 16V8M17 16v-6')],
    network:[circle(6,6,2.5),circle(18,7,2.5),circle(10,18,2.5),shape('M8.5 6.2 15.5 7M7 8.5l2.2 7M16.7 9.2l-5.2 6.8')],
    palette:[circle(12,12,9),circle(8,9,1),circle(12,7,1),circle(16,9,1),shape('M7 15c2.5 3 7.5 3 10 0')],
    search:[circle(10.5,10.5,6.5),shape('m15.5 15.5 5 5')],
    files:[rect(6,3,14,18,3),shape('M3 7v12a4 4 0 0 0 4 4M10 8h6M10 12h6M10 16h4')],
    list:[shape('M8 6h12M8 12h12M8 18h12'),circle(4,6,.6),circle(4,12,.6),circle(4,18,.6)],
  }},assets:{fonts:[]},
  graph:{nodeShape:'circle',relationShape:'circle',nodeFill:'hollow',edgeStyle:'curve',edgeDash:'solid',background:'plain',colorMode:'accent',nodeScale:1.12,nodeStroke:1.6,edgeWidth:.85,edgeOpacity:.3,labelScale:1,labelHalo:3,glow:1.2,edgeColor:'auto',labelColor:'auto',twinkle:'off'},
};
const variants=[{
  filename:'01-澄璃-浅色.mtheme.json',name:'澄璃 · Liquid Glass',description:'Clear v2 · 中性纯色背景 · 高透明玻璃 · 按压与弹簧回弹',
  tokens:{'--paper':'#e6e8ec','--surface':'#ffffff','--canvas':'#f1f2f5','--panel':'#dedfe4','--sidebar':'#eceef2','--ink':'#1d1d1f','--muted':'#56565f','--line':'#3b3d451a','--teal':'#0071e3','--teal-light':'#007aff16','--on-accent':'#ffffff','--warning':'#865000','--warning-soft':'#fff0cb','--danger':'#c92b3e','--danger-soft':'#ffeaed','--shadow':'#0a12251a','--theme-mode':'light'},
},{
  filename:'02-澄璃-深色.mtheme.json',name:'澄璃 · Midnight Glass',description:'Clear v2 · 石墨纯色背景 · 通透深色玻璃 · 按压与弹簧回弹',
  tokens:{'--paper':'#15161a','--surface':'#25262b','--canvas':'#1c1d22','--panel':'#33343b','--sidebar':'#25262a','--ink':'#f5f5f7','--muted':'#bdbdc7','--line':'#ffffff20','--teal':'#67b5ff','--teal-light':'#0a84ff29','--on-accent':'#061a33','--warning':'#ffdc8a','--warning-soft':'#493b28','--danger':'#ffb4c0','--danger-soft':'#482a36','--shadow':'#00000050','--theme-mode':'dark'},
}];
for(const {filename,...variant} of variants){
  const pack=parseThemePackage({...shared,...variant});
  await writeFile(new URL(filename,import.meta.url),JSON.stringify(pack,null,2)+'\n');
  console.log(`${pack.name} → ${filename}`);
}
