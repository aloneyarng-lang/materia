import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BUILTIN_THEMES,resolveTheme,themePackage,parseThemePackage,importThemeFiles,themeCSS,parseThemeCSS} from '../dist/theme-model.js';
import {validateThemeDesign} from '../scripts/validate-theme-design.mjs';
import {icon,setIconTheme} from '../dist/icons.js';
import {setGraphThemeOptions,graphAppearance} from '../dist/graph-appearance.js';
import {getGraphSymbols,setGraphSymbols} from '../dist/graph-symbols.js';

test('Qingming built-in theme provides light and dark glass palettes with bespoke armillary graph symbols',()=>{
  assert.ok(BUILTIN_THEMES.some(t=>t.id==='qingming'&&t.name==='青冥'));
  for(const mode of ['light','dark']){
    const theme=resolveTheme({selected:'qingming',mode});
    assert.equal(theme.id,'qingming');
    assert.equal(theme.name,'青冥');
    assert.equal(theme.custom,false);
    assert.equal(theme.tokens['--theme-mode'],mode);
    assert.equal(theme.ui.style,'glass');
    assert.ok(theme.tokens['--serif'].includes('Materia New York'));
    assert.ok(theme.tokens['--numeric'].includes('Materia SF Mono'));
    assert.equal(theme.assets.fonts.length,0);
    assert.equal(theme.graph.nodeShape,'symbol');
    assert.equal(theme.graph.relationShape,'symbol');
    assert.equal(theme.graph.background,'symbol');
    assert.equal(theme.graph.edgeStyle,'curve');
    assert.ok(theme.assets.graphSymbols.node.length>=8);
    assert.ok(theme.assets.graphSymbols.relation.length>=8);
    assert.ok(theme.assets.graphSymbols.background.length>=20);
    validateThemeDesign(themePackage(theme));

    const imported=resolveTheme(importThemeFiles({mode},[{name:'qingming-copy.mtheme.json',text:themePackage(theme)}],()=> 'custom-qingming'));
    assert.deepEqual(imported.variants,theme.variants);
    assert.deepEqual(imported.assets,theme.assets);
    assert.deepEqual(imported.icons,theme.icons);
    assert.deepEqual(imported.graph,theme.graph);
  }

  const light=resolveTheme({selected:'qingming',mode:'light'});
  const dark=resolveTheme({selected:'qingming',mode:'dark'});
  assert.notEqual(light.tokens['--paper'],dark.tokens['--paper']);
  assert.notEqual(light.tokens['--teal'],dark.tokens['--teal']);
  assert.notEqual(light.tokens['--ink'],dark.tokens['--ink']);

  const css=parseThemeCSS(themeCSS(light.name,light.tokens));
  assert.equal(css.tokens['--graph-node-shape'],'square');
  assert.equal(css.tokens['--graph-relation-shape'],'circle');
  assert.equal(css.tokens['--graph-background'],'plain');
});

test('Qingming standalone package matches the built-in theme and supports independent star-map selection',async()=>{
  const pack=validateThemeDesign(await readFile('theme-examples/qingming/青冥.mtheme.json','utf8'));
  const builtin=parseThemePackage(themePackage(resolveTheme({selected:'qingming'})));
  assert.deepEqual(pack,builtin);
  assert.equal(pack.assets.fonts.length,0);

  setGraphSymbols({});
  setGraphThemeOptions(BUILTIN_THEMES);
  const preset='theme:qingming';
  assert.equal(graphAppearance(resolveTheme({selected:'paper'}).tokens,preset).nodeShape,'symbol');
  assert.deepEqual(getGraphSymbols(preset),resolveTheme({selected:'qingming'}).assets.graphSymbols);

  setIconTheme(resolveTheme({selected:'qingming'}).icons);
  for(const name of ['assistant','orbit','network','star','library','folder','chart','palette','settings','flask']){
    assert.match(icon(name),/<svg[^>]+data-icon-name="/);
  }
  setIconTheme({style:'outline'});
});
