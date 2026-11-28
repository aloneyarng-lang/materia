import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILTIN_THEMES,resolveTheme,themePackage,parseThemePackage,importThemeFiles,themeCSS,parseThemeCSS} from '../dist/theme-model.js';
import {validateThemeDesign} from '../scripts/validate-theme-design.mjs';
import {icon,setIconTheme} from '../dist/icons.js';
import {setGraphThemeOptions,graphAppearance} from '../dist/graph-appearance.js';
import {getGraphSymbols,setGraphSymbols} from '../dist/graph-symbols.js';

test('Liquid Chrome built-in theme provides light and dark glass palettes with bespoke starburst graph symbols',()=>{
  assert.ok(BUILTIN_THEMES.some(t=>t.id==='liquid-chrome'&&t.name==='液态铂金'));
  for(const mode of ['light','dark']){
    const theme=resolveTheme({selected:'liquid-chrome',mode});
    assert.equal(theme.id,'liquid-chrome');
    assert.equal(theme.name,'液态铂金');
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
    assert.ok(theme.assets.graphSymbols.node.length>=9);
    assert.ok(theme.assets.graphSymbols.relation.length>=8);
    assert.ok(theme.assets.graphSymbols.background.length>=16);
    validateThemeDesign(themePackage(theme));

    const imported=resolveTheme(importThemeFiles({mode},[{name:'liquid-chrome-copy.mtheme.json',text:themePackage(theme)}],()=> 'custom-liquid-chrome'));
    assert.deepEqual(imported.variants,theme.variants);
    assert.deepEqual(imported.assets,theme.assets);
    assert.deepEqual(imported.icons,theme.icons);
    assert.deepEqual(imported.graph,theme.graph);
  }

  const light=resolveTheme({selected:'liquid-chrome',mode:'light'});
  const dark=resolveTheme({selected:'liquid-chrome',mode:'dark'});
  assert.notEqual(light.tokens['--paper'],dark.tokens['--paper']);
  assert.notEqual(light.tokens['--teal'],dark.tokens['--teal']);
  assert.notEqual(light.tokens['--ink'],dark.tokens['--ink']);

  const css=parseThemeCSS(themeCSS(light.name,light.tokens));
  assert.equal(css.tokens['--graph-node-shape'],'square');
  assert.equal(css.tokens['--graph-relation-shape'],'circle');
  assert.equal(css.tokens['--graph-background'],'plain');
});

test('Liquid Chrome supports independent star-map selection and bespoke semantic icons',()=>{
  const theme=resolveTheme({selected:'liquid-chrome',mode:'dark'});
  const pack=parseThemePackage(themePackage(theme));
  assert.equal(pack.assets.fonts.length,0);

  setGraphSymbols({});
  setGraphThemeOptions(BUILTIN_THEMES);
  const preset='theme:liquid-chrome';
  assert.equal(graphAppearance(resolveTheme({selected:'paper'}).tokens,preset).nodeShape,'symbol');
  assert.deepEqual(getGraphSymbols(preset),theme.assets.graphSymbols);

  setIconTheme(theme.icons);
  for(const name of ['assistant','orbit','network','star','library','folder','chart','palette','settings','flask']){
    assert.match(icon(name),/<svg[^>]+data-icon-name="/);
  }
  setIconTheme({style:'outline'});
});
