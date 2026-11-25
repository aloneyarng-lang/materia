import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BUILTIN_THEMES,resolveTheme,themePackage,parseThemePackage,importThemeFiles,themeCSS,parseThemeCSS} from '../dist/theme-model.js';
import {validateThemeDesign} from '../scripts/validate-theme-design.mjs';
import {icon,setIconTheme} from '../dist/icons.js';
import {setGraphThemeOptions,graphAppearance} from '../dist/graph-appearance.js';
import {getGraphSymbols,setGraphSymbols} from '../dist/graph-symbols.js';

test('GEMINI built-in theme provides light and dark glass palettes with bespoke twin-star graph symbols',()=>{
  assert.ok(BUILTIN_THEMES.some(t=>t.id==='gemini'&&t.name==='GEMINI'));
  for(const mode of ['light','dark']){
    const theme=resolveTheme({selected:'gemini',mode});
    assert.equal(theme.id,'gemini');
    assert.equal(theme.name,'GEMINI');
    assert.equal(theme.custom,false);
    assert.equal(theme.tokens['--theme-mode'],mode);
    assert.equal(theme.ui.style,'glass');
    assert.ok(theme.tokens['--numeric'].includes('Materia SF Mono'));
    assert.equal(theme.assets.fonts.length,0);
    assert.equal(theme.graph.nodeShape,'symbol');
    assert.equal(theme.graph.relationShape,'symbol');
    assert.equal(theme.graph.background,'symbol');
    assert.equal(theme.graph.edgeStyle,'curve');
    assert.ok(theme.assets.graphSymbols.node.length>=6);
    assert.ok(theme.assets.graphSymbols.relation.length>=6);
    assert.ok(theme.assets.graphSymbols.background.length>=10);
    validateThemeDesign(themePackage(theme));

    const imported=resolveTheme(importThemeFiles({mode},[{name:'gemini-copy.mtheme.json',text:themePackage(theme)}],()=> 'custom-gemini'));
    assert.deepEqual(imported.variants,theme.variants);
    assert.deepEqual(imported.assets,theme.assets);
    assert.deepEqual(imported.icons,theme.icons);
    assert.deepEqual(imported.graph,theme.graph);
  }

  const light=resolveTheme({selected:'gemini',mode:'light'});
  const dark=resolveTheme({selected:'gemini',mode:'dark'});
  assert.notEqual(light.tokens['--paper'],dark.tokens['--paper']);
  assert.notEqual(light.tokens['--teal'],dark.tokens['--teal']);
  assert.notEqual(light.tokens['--ink'],dark.tokens['--ink']);

  const css=parseThemeCSS(themeCSS(light.name,light.tokens));
  assert.equal(css.tokens['--graph-node-shape'],'square');
  assert.equal(css.tokens['--graph-relation-shape'],'circle');
  assert.equal(css.tokens['--graph-background'],'plain');
});

test('GEMINI standalone package matches the built-in theme and supports independent star-map selection',async()=>{
  const pack=validateThemeDesign(await readFile('theme-examples/gemini/GEMINI.mtheme.json','utf8'));
  const builtin=parseThemePackage(themePackage(resolveTheme({selected:'gemini'})));
  assert.deepEqual(pack,builtin);
  assert.equal(pack.assets.fonts.length,0);

  setGraphSymbols({});
  setGraphThemeOptions(BUILTIN_THEMES);
  const preset='theme:gemini';
  assert.equal(graphAppearance(resolveTheme({selected:'paper'}).tokens,preset).nodeShape,'symbol');
  assert.deepEqual(getGraphSymbols(preset),resolveTheme({selected:'gemini'}).assets.graphSymbols);

  setIconTheme(resolveTheme({selected:'gemini'}).icons);
  for(const name of ['assistant','orbit','network','star','library','folder','chart']){
    assert.match(icon(name),/<svg[^>]+data-icon-name="/);
  }
  setIconTheme({style:'outline'});
});
