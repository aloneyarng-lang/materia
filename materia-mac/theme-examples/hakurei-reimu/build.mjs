// Built-in artwork and portable imports use the same presets and public parser.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {REIMU_PRESETS} from '../../dist/reimu-presets.js';
import {parseThemePackage,themeCSS,parseThemeCSS} from '../../dist/theme-model.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),output=fileURLToPath(new URL('./',import.meta.url));
await mkdir(path.join(output,'字体许可'),{recursive:true});
const specs=[
 {id:'reimu-han',family:'Reimu Han Sans',file:'SourceHanSansCN-VF.otf.woff2',format:'woff2',weight:'300 700',licenseFile:'SourceHanSans-LICENSE.txt',source:'Adobe Source Han Sans CN, unmodified. https://github.com/adobe-fonts/source-han-sans'},
 {id:'reimu-inter',family:'Reimu Inter',file:'InterVariable.woff2',format:'woff2',weight:'300 700',licenseFile:'Inter-LICENSE.txt',source:'Inter v4.1, unmodified. https://github.com/rsms/inter/tree/v4.1'},
 {id:'reimu-mono',family:'Reimu Mono',file:'SourceCodePro-Regular.ttf',format:'ttf',weight:'400',licenseFile:'SourceCodePro-LICENSE.md',source:'Adobe Source Code Pro, unmodified. https://github.com/adobe-fonts/source-code-pro'},
];
const fonts=[];
for(const {file,licenseFile,...spec}of specs){
 fonts.push({...spec,style:'normal',data:(await readFile(path.join(root,'dist/fonts',file))).toString('base64'),license:await readFile(path.join(root,'dist/fonts',licenseFile),'utf8')});
 await copyFile(path.join(root,'dist/fonts',licenseFile),path.join(output,'字体许可',licenseFile));
}
const filenames=['01-博丽灵梦-朱白结界-浅色','02-博丽灵梦-梦想封印-深色'];
const aliases={'Materia Inter':'Reimu Inter','Materia Source Han Sans':'Reimu Han Sans','Materia Source Code Pro':'Reimu Mono'};
const design={name:'博丽灵梦 · Hakurei Reimu',graphThemeVersion:3,artwork:'原创折角御札、朱印符线、红白阴阳玉与鸟居结界底纹',variants:[]};
for(const[index,preset]of REIMU_PRESETS.entries()){
 const{id,...source}=preset,tokens={...source.tokens};
 for(const key of ['--sans','--serif','--numeric','--mono'])for(const[from,to]of Object.entries(aliases))tokens[key]=tokens[key].replaceAll(from,to);
 const pack=parseThemePackage({format:'materia-theme',schemaVersion:2,...source,tokens,assets:{fonts,graphSymbols:source.assets.graphSymbols}});
 await writeFile(path.join(output,filenames[index]+'.mtheme.json'),JSON.stringify(pack,null,2)+'\n');
 const css=themeCSS(pack.name+' · 基础形状兼容版',pack.tokens);parseThemeCSS(css);await writeFile(path.join(output,filenames[index]+'-精简.css'),css);
 design.variants.push({builtinId:id,file:filenames[index]+'.mtheme.json',name:pack.name,description:pack.description,tokens:pack.tokens,graph:pack.graph,ui:pack.ui,icons:pack.icons,graphSymbols:pack.assets.graphSymbols});
 console.log(`${pack.name}: ${(Buffer.byteLength(JSON.stringify(pack))/1024/1024).toFixed(2)} MiB, original graph symbols`);
}
await writeFile(path.join(output,'主题设计.json'),JSON.stringify(design,null,2)+'\n');
