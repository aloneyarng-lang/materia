import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {parseThemePackage,themePackage,importThemeFiles,resolveTheme,BUILTIN_THEMES,cleanThemePreferences,FONT_OPTIONS} from '../dist/theme-model.js';
import {icon,setIconTheme} from '../dist/icons.js';
import {LocalLibrary} from '../desktop/library.mjs';
const example=JSON.parse(await readFile('theme-examples/blueprint.mtheme.json','utf8'));
const file=pack=>({name:'test.mtheme.json',text:JSON.stringify(pack)});
test('curated themes share glass geometry, have two color modes and round trip their design',()=>{
 const profiles=BUILTIN_THEMES.map(row=>resolveTheme({selected:row.id}));assert.equal(profiles.length,10);assert.equal(new Set(profiles.map(p=>p.tokens['--teal'])).size,10);
 for(const profile of profiles){
  assert.equal(profile.ui.style,'glass');assert.equal(profile.ui.cardRadius,20);assert.equal(profile.ui.menuRadius,18);
  for(const mode of ['light','dark']){
   const design=resolveTheme({selected:profile.id,mode}),imported=resolveTheme(importThemeFiles({mode},[{name:'copy.mtheme.json',text:themePackage(design)}],()=> 'custom-copy'));
   assert.equal(design.tokens['--theme-mode'],mode);assert.deepEqual(imported.ui,design.ui);assert.deepEqual(imported.icons,design.icons);for(const [key,value]of Object.entries(design.tokens)){if(key.startsWith('--graph-')&&Number.isFinite(Number(value)))assert.equal(Number(imported.tokens[key]),Number(value));else assert.equal(imported.tokens[key],value,key);}assert.deepEqual(imported.variants,design.variants);
  }
 }
});
test('a standalone package round trips embedded font bytes, units, UI, semantic icon shapes and four font overrides',()=>{
 const parsed=parseThemePackage(example);assert.equal(parsed.assets.fonts[0].data,example.assets.fonts[0].data);assert.ok(parsed.assets.fonts[0].license.includes('OPEN FONT LICENSE'));
 const prefs=importThemeFiles({fonts:{body:'yahei',heading:'times',numeric:'consolas',mono:'georgia'}},[file(example)],()=> 'custom-blueprint');const resolved=resolveTheme(prefs);
 assert.equal(resolved.tokens['--mono'],FONT_OPTIONS.find(f=>f.id==='georgia').stack);assert.equal(resolved.tokens['--numeric'],FONT_OPTIONS.find(f=>f.id==='consolas').stack);
 const reimported=resolveTheme(importThemeFiles({},[{name:'again.mtheme.json',text:themePackage(resolved)}],()=> 'custom-again'));assert.deepEqual(reimported.tokens,resolved.tokens);assert.deepEqual(reimported.assets,resolved.assets);assert.deepEqual(reimported.icons,resolved.icons);
});
test('partial packages inherit defaults and missing icon overrides always fall back to a meaningful shape',()=>{
 const partial=parseThemePackage({format:'materia-theme',schemaVersion:2,name:'Minimal'});assert.equal(partial.ui.density,1);assert.equal(partial.icons.style,'outline');assert.deepEqual(partial.assets.fonts,[]);
 setIconTheme({style:'technical',overrides:{}});assert.match(icon('assistant'),/<rect/);assert.match(icon('not-registered'),/data-icon-name="files"/);assert.match(icon('folder'),/<path/);setIconTheme({style:'outline'});
});
test('unsafe fields, invalid versions, remote fonts and executable or unbounded SVG data fail before import changes state',()=>{
 const mutations=[p=>p.schemaVersion=3,p=>p.css='body{}',p=>p.ui.density=.1,p=>p.ui.shadow='url(x)',p=>p.icons.style='unknown',p=>p.icons.overrides.assistant=[{tag:'script',attrs:{d:'M0 0'}}],p=>p.icons.overrides.assistant=[{tag:'path',attrs:{d:'M0 0',onload:'x'}}],p=>p.icons.overrides.assistant=[{tag:'path',attrs:{d:'M0 0',fill:'url(x)'}}],p=>p.assets.fonts[0].data='http://example.com/font',p=>p.assets.fonts[0].format='woff2',p=>p.typography={body:{size:4}},p=>p.tokens['--sans']='Arial;display:none'];
 const prefs={selected:'academic-purple',themes:[]};for(const change of mutations){const bad=structuredClone(example);change(bad);assert.throws(()=>importThemeFiles(prefs,[file(example),{...file(bad),name:'bad.mtheme.json'}],()=> 'custom-x'));assert.deepEqual(prefs,{selected:'academic-purple',themes:[]});}
});
test('same-name package updates replace old resources and preserve IDs, personal fonts and other themes',()=>{
 let prefs=importThemeFiles({fonts:{body:'yahei'}},[file(example),{name:'other.css',text:':root{--teal:#123456;}'}],(()=>{let i=0;return()=> 'custom-'+(++i);})());const changed={...example,assets:{fonts:[]},icons:{style:'solid'},ui:{density:1.1}};
 prefs=importThemeFiles(prefs,[file(changed)],()=>{throw Error('must reuse id');});assert.equal(prefs.themes[0].id,'custom-1');assert.equal(prefs.themes.length,2);assert.equal(prefs.themes[0].package.assets.fonts.length,0);assert.equal(prefs.fonts.body,'yahei');assert.equal(prefs.selected,'custom-1');
 const corrupt=structuredClone(prefs);corrupt.themes[0].package.schemaVersion=999;assert.equal(cleanThemePreferences(corrupt).selected,'paper');
});
test('complete theme resources persist in a native library across reopening without modifying literature or notes',async()=>{
 await mkdir('.local/tests',{recursive:true});const root=await mkdtemp(path.resolve('.local/tests/theme-package-')),lib=await new LocalLibrary(root).init(),pdf=Buffer.from('%PDF-1.4\n% package test\n%%EOF');
 await lib.putPapers([{id:'p',title:'Preserved',tags:['Data'],measurements:[],fileBytes:pdf}]);await lib.setSetting('notes',{'paper:p':[{id:'n',body:'Keep this note',createdAt:1,updatedAt:1}]});const papers=structuredClone(lib.getPapers()),notes=structuredClone(lib.getSetting('notes')),prefs=importThemeFiles({selected:'academic-purple'},[file(example)],()=> 'custom-lab');await lib.setSetting('themePreferences',prefs);
 const reopened=await new LocalLibrary(root).init();assert.deepEqual(reopened.getSetting('themePreferences'),prefs);assert.deepEqual(reopened.getPapers(),papers);assert.deepEqual(reopened.getSetting('notes'),notes);assert.deepEqual(Buffer.from(await reopened.readPdf('p')),pdf);
});

test('missing saved font payloads retain the theme appearance and report fallback while new imports still reject them',()=>{const prefs=importThemeFiles({},[file(example)],()=> 'custom-missing');delete prefs.themes[0].package.assets.fonts[0].data;const recovered=cleanThemePreferences(prefs),theme=resolveTheme(recovered);assert.equal(recovered.selected,'custom-missing');assert.equal(theme.ui.style,'glass');assert.equal(theme.assets.fonts.length,0);assert.equal(theme.fontWarnings.length,1);assert.throws(()=>importThemeFiles({},[file(prefs.themes[0].package)],()=> 'custom-new'));});
