import {readdir,readFile,lstat} from 'node:fs/promises';
import path from 'node:path';
export async function walkFiles(root,relative=''){
  const result=[];
  for(const entry of await readdir(path.join(root,relative),{withFileTypes:true})){
    const name=path.join(relative,entry.name);if((await lstat(path.join(root,name))).isSymbolicLink())throw Error('程序资源不能包含符号链接：'+name);
    if(entry.isDirectory())result.push(...await walkFiles(root,name));else if(entry.isFile())result.push(name);
  }return result;
}
// Check the exact staged application, so a working source tree cannot hide missing release assets.
export async function validatePackagedAssets(root){
  const files=await walkFiles(root),known=new Set(files.map(p=>p.replaceAll('\\','/'))),missing=[];
  if(known.has('desktop/ml-engine.mjs'))for(const reference of ['ml/engine.py','ml/elemental-magpie.json','ml/elemental-magpie-LICENSE.txt','ml/runtime/python.exe','ml/runtime/python313.dll','ml/runtime/python313.zip','ml/runtime/python313._pth','ml/runtime/Lib/site-packages/sklearn/__init__.py','ml/runtime/Lib/site-packages/skops/__init__.py','ml/runtime/Lib/site-packages/numpy/__init__.py','ml/runtime/Lib/site-packages/scipy/__init__.py'])if(!known.has(reference))missing.push({file:'machine learning engine',reference});
  if(known.has('dist/offline-dictionary.js')){
    const manifestText=await readFile(path.join(root,'dist/dictionaries/manifest.js'),'utf8');
    const manifest=JSON.parse(manifestText.replace(/^export default /,'').trim().replace(/;$/,''));
    for(const name of [...manifest.shards.map(key=>key+'.js'),'ECDICT-LICENSE.txt','WORDNET-LICENSE.txt','README.md'])
      if(!known.has('dist/dictionaries/'+name))missing.push({file:'dictionary manifest',reference:name});
    const languageText=await readFile(path.join(root,'dist/language-dictionaries/manifest.js'),'utf8');
    const languages=JSON.parse(languageText.replace(/^export default /,'').trim().replace(/;$/,''));
    for(const name of [...languages.shards.map(key=>key+'.js'),'JMdict_e.gz','de-en.txt.gz','JMDICT-LICENSE.html','JMDICT-DOCUMENTATION.html','CC-BY-SA-4.0.txt','DING-COPYING.txt','DING-README.txt','README.md'])
      if(!known.has('dist/language-dictionaries/'+name))missing.push({file:'language dictionary manifest',reference:name});
  }
  for(const name of files){
    if(!/\.(?:js|mjs|cjs|css|html)$/.test(name))continue;
    const text=await readFile(path.join(root,name),'utf8'),refs=[];
    if(/\.(?:js|mjs)$/.test(name)){
      for(const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*|new\s+URL\s*\(\s*)['"](\.\.?\/[^'"\s]+)['"]/g))refs.push(m[1]);
    }else if(/\.html$/.test(name)){
      for(const m of text.matchAll(/(?:src|href)\s*=\s*['"](\.\.?\/[^'"\s]+)['"]/g))refs.push(m[1]);
    }else for(const m of text.matchAll(/url\(\s*['"]?(\.\.?\/[^\s)'"?#]+)['"]?\s*\)/g))refs.push(m[1]);
    for(const ref of refs){const target=path.posix.normalize(path.posix.join(path.dirname(name).replaceAll('\\','/'),ref.split(/[?#]/)[0]));
      if(ref.endsWith('/')){try{if((await lstat(path.join(root,target))).isDirectory())continue;}catch{}}
      // Optional private Apple resources have documented bundled open-font fallbacks.
      if(!known.has(target)&&!target.startsWith('dist/fonts/apple/'))missing.push({file:name,reference:ref});
    }
  }if(missing.length)throw Error('打包遗漏程序依赖：'+JSON.stringify(missing));return{files:files.length};
}
