import {readFile,writeFile,access,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
let runtime=new URL('../../',import.meta.url);try{await access(new URL('dist/theme-model.js',runtime));}catch(error){if(error.code!=='ENOENT')throw error;runtime=new URL('../../resources/app/',import.meta.url);}
const {themePackage,resolveTheme}=await import(new URL('dist/theme-model.js',runtime));
const {validateThemeDesign}=await import(new URL('../../scripts/validate-theme-design.mjs',import.meta.url));
const template=JSON.parse(await readFile(new URL('../../theme-template.mtheme.json',import.meta.url),'utf8'));
const theme=JSON.parse(themePackage(resolveTheme({selected:'steins-gate'})));
const pack={...template,...theme};validateThemeDesign(pack);
const target=new URL('./命运石之门-世界线.mtheme.json',import.meta.url),content=JSON.stringify(pack,null,2)+'\n';let previous='';try{previous=await readFile(target,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
if(previous!==content){const temp=new URL('./.steins-'+randomUUID()+'.tmp',import.meta.url);await writeFile(temp,content,{flag:'wx'});await rename(temp,target);}console.log(fileURLToPath(target));
