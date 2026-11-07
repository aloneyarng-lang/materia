import assert from 'node:assert/strict';
import {cp, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {customFolder, installScheme, loadScheme, schemeCatalog} from '../desktop/figura/catalog.mjs';
import {FigureFile} from '../desktop/figura/store.mjs';
import {defaults, emptyWorkspace, mapColumns, normalizeTable, preparePlot, readDraft, readWorkspace} from '../dist/figura/model.js';
import {parseDelimited} from '../dist/prediction-import.js';
import {applyFigureTheme, FIGURE_THEMES, rampColor} from '../dist/figura/schemes/figure-themes.js';

const bundled = fileURLToPath(new URL('../dist/figura/schemes/', import.meta.url));
const temporary = async t => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'materia-figura-'));
  t.after(() => rm(folder, {recursive:true, force:true}));
  return folder;
};
const draftFor = (scheme, rows) => ({schemeId:scheme.id, schemeVersion:scheme.version, name:'Fixture', rows, mapping:mapColumns(scheme, rows[0]), params:defaults(scheme)});

test('all Figura schemes and publication styles render the original colors and each of the five themes', async t => {
  const root = await temporary(t);
  const catalog = await schemeCatalog(bundled, customFolder(root));
  const ids = JSON.parse(await readFile(path.join(bundled, 'catalog.json'), 'utf8'));
  assert.deepEqual(catalog.map(item => item.id), ids);
  assert.equal(catalog.length, 16);
  for (const item of catalog) {
    assert.equal(item.error, undefined, item.id);
    const {scheme, files} = await loadScheme(bundled, customFolder(root), item.id, item.version);
    const plot = await import(pathToFileURL(path.join(bundled, scheme.id, 'plot.js')).href);
    for (const variant of scheme.parameters.find(item => item.key === 'figureStyle')?.options ?? ['']) {
      const sample = variant && variant !== 'Figura 默认' && files.has('style-example.csv') ? 'style-example.csv' : 'example.csv';
      const rows = normalizeTable(parseDelimited(files.get(sample).toString('utf8')));
      const draft = draftFor(scheme, rows);
      if (variant) draft.params.figureStyle = variant;
      const samples=new Set();
      for (const theme of [null,...FIGURE_THEMES]) {
        draft.themeId=theme?.id;
        const svg=await plot.render(applyFigureTheme(preparePlot(scheme,draft)));
        assert.match(svg, /^<svg[^>]*viewBox="0 0 \d+ \d+"/, item.id);
        assert.doesNotMatch(svg, /(?:NaN|Infinity|undefined)(?=[", ])/);
        if(theme){
          assert.ok(svg.includes(theme.ink),item.id+' '+theme.id);
          const colors=item.id==='grid-contour' ? [rampColor(theme.ramp,.45)] : item.id==='heatmap' ? theme.ramp : theme.series;
          assert.ok(colors.some(color=>svg.includes(color)),item.id+' '+theme.id+' plot colors');
        }
        samples.add(svg);
      }
      assert.equal(samples.size,6,item.id+' '+variant);
    }
  }
});

test('themes round-trip without overwriting legacy colors, and ramps monotonically darken', async t => {
  const root=await temporary(t);
  const {scheme}=await loadScheme(bundled,customFolder(root),'grouped-line','1.0.0');
  const draft=draftFor(scheme,[['x','y','group'],['1','2','A']]);
  draft.params.color='#345678';
  const original=preparePlot(scheme,draft),theme=FIGURE_THEMES[2];
  const themed=readDraft({...draft,themeId:theme.id});
  const input=applyFigureTheme(preparePlot(scheme,themed));
  assert.equal(input.theme.id,theme.id);
  assert.equal(input.params.color,theme.series[0]);
  assert.equal(themed.params.color,'#345678');
  assert.deepEqual(Object.keys(input.params),Object.keys(original.params));
  assert.deepEqual(preparePlot(scheme,readDraft({...themed,themeId:'future'})),original);
  for(const {ramp} of FIGURE_THEMES){
    let previous=[256,256,256];
    for(let step=0;step<=30;step++){
      const rgb=rampColor(ramp,step/30).slice(1).match(/../g).map(hex=>Number.parseInt(hex,16));
      assert.ok(rgb.every((value,index)=>value<=previous[index]));
      previous=rgb;
    }
  }
});

test('installing an API 1 directory adds a category and rejects duplicates and invalid packages', async t => {
  const root = await temporary(t), installed = customFolder(root), source = path.join(root, 'custom-test');
  await cp(path.join(bundled, 'grouped-line'), source, {recursive:true});
  const manifest = path.join(source, 'manifest.json');
  const scheme = {...JSON.parse(await readFile(manifest, 'utf8')), id:'custom-test', category:'自定义测试'};
  await writeFile(manifest, JSON.stringify(scheme));
  assert.deepEqual(await installScheme(source, bundled, installed), {id:scheme.id, name:scheme.name});
  await assert.rejects(installScheme(source, bundled, installed), /已存在/);
  await writeFile(manifest, JSON.stringify({...scheme, cover:'../cover.svg'}));
  await assert.rejects(installScheme(source, bundled, installed), /封面/);
  assert.ok((await schemeCatalog(bundled, installed)).some(item => item.id === scheme.id && item.category === scheme.category && !item.error));
  await assert.rejects(loadScheme(bundled, installed, 'custom-test', '2.0.0'), /版本/);
});

test('legacy drafts preserve data, blank rows and numeric error locations', async t => {
  const root = await temporary(t);
  const {scheme} = await loadScheme(bundled, customFolder(root), 'grouped-line', '1.0.0');
  const rows = normalizeTable([[' X ','纵坐标','group'], [], [2, 'bad', 'A']]);
  const value = draftFor(scheme, rows);
  assert.equal(value.mapping.x, ' X ');
  assert.equal(value.mapping.y, '纵坐标');
  assert.throws(() => preparePlot(scheme, value), /第 3 行/);
  assert.deepEqual(readWorkspace({...emptyWorkspace(), draft:value}).draft, readDraft(value));
  assert.throws(() => readWorkspace({schemaVersion:2,projects:[],metadata:{}}), /格式/);
});

test('drawing workspaces are independent and preserve old bytes after an invalid save', async t => {
  const root = await temporary(t), other = path.join(root, 'other');
  const store = new FigureFile(root);
  const {scheme} = await loadScheme(bundled, customFolder(root), 'grouped-line', '1.0.0');
  const draft = draftFor(scheme, [['x','y','group'],['1','2','A']]);
  assert.deepEqual(await store.load(), emptyWorkspace());
  await store.save({...emptyWorkspace(), draft});
  const next = {...draft, name:'Second'};
  await store.save({...emptyWorkspace(), draft:next});
  assert.equal((await store.load()).draft.name, 'Second');
  assert.equal(JSON.parse(await readFile(path.join(root, 'figura-workspace.previous.json'),'utf8')).draft.name, 'Fixture');
  assert.throws(() => store.save({...emptyWorkspace(), draft:{...next, rows:[]}}), /工作表/);
  assert.equal((await store.load()).draft.name, 'Second');
  await mkdir(other);
  assert.deepEqual(await new FigureFile(other).load(), emptyWorkspace());
});
