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
import {appendPanels,arrangePanels,autoSizePanels,emptyMontage,montageBoard,montageLayout,panelBox,readMontage} from '../dist/figura/montage-layout.js';
import {plotMarkdownExample,readPlotMarkdown} from '../dist/figura/markdown-plot.js';

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

const montagePanels=Array.from({length:4},(_,index)=>({name:String(index),svg:'<svg/>',width:900,height:600,weight:1}));

test('montage migrates older drafts and can explicitly arrange four figures in one row', () => {
  const state=readMontage({...emptyMontage(),panels:montagePanels});
  assert.equal(new Set(state.panels.map(panel=>panel.y)).size,2);
  const row=arrangePanels({...state,columns:4});
  assert.equal(new Set(row.map(panel=>panel.y)).size,1);
  assert.ok(row.every((panel,i)=>i===0||panel.x>row[i-1].x+panelBox(row[i-1],true).width));
  const large=montageLayout(readMontage({...state,columns:1,panels:[...montagePanels,...montagePanels,...montagePanels]}));
  assert.ok(large.width<=4000&&large.height<=4000&&large.width*large.height<6500000);
});

test('montage keeps free positions, relative sizes and original proportions in the rectangular export', () => {
  const coordinates=[[-180,-40],[955,-150],[690,400],[1360,610]];
  const panels=montagePanels.map((panel,i)=>({...panel,x:coordinates[i][0],y:coordinates[i][1],weight:i===0?1.6:.75}));
  const state=readMontage({...emptyMontage(),panels});
  assert.deepEqual(readWorkspace({...emptyWorkspace(),montage:state}).montage,state);
  assert.deepEqual(montageBoard(state).placements.map(({x,y})=>[x,y]),coordinates);
  const {width,height,placements}=montageLayout(state);
  const left=Math.min(...coordinates.map(pair=>pair[0])),top=Math.min(...coordinates.map(pair=>pair[1]));
  for(const [i,tile] of placements.entries()){
    assert.equal(tile.x,coordinates[i][0]-left+state.gap);
    assert.equal(tile.y,coordinates[i][1]-top+state.gap);
    assert.ok(Math.abs(tile.width/(tile.height-tile.labelHeight)-1.5)<1e-10);
    assert.ok(tile.x>0&&tile.y>0&&tile.x+tile.width<width&&tile.y+tile.height<height);
  }
  assert.ok(Math.abs(placements[0].width/placements[1].width-1.6/.75)<1e-10);
});

test('montage bulk addition finds open space while preserving previously placed figures', () => {
  const first={...montagePanels[0],x:215,y:460};
  const state=readMontage({...emptyMontage(),panels:[first]});
  const panels=appendPanels(state,montagePanels.slice(1));
  assert.deepEqual(panels[0],first);
  assert.equal(panels.length,4);
  const boxes=panels.map(panel=>panelBox(panel,true));
  for(const [index,box] of boxes.entries()){
    for(const other of boxes.slice(index+1)){
      assert.ok(box.x+box.width<=other.x||other.x+other.width<=box.x||box.y+box.height<=other.y||other.y+other.height<=box.y);
    }
  }
  assert.deepEqual(readMontage({...state,panels:[first,...montagePanels.slice(1)]}).panels,panels);
});

test('automatic montage sizing keeps a single row and the spatial hierarchy of a large panel beside three small panels', () => {
  const row=readMontage({...emptyMontage(),columns:4,panels:montagePanels.map((panel,i)=>({...panel,weight:i===1?.5:1}))});
  const resized=autoSizePanels(row);
  assert.ok(resized.some((panel,i)=>panel.weight!==row.panels[i].weight));
  const rowBoxes=resized.map(panel=>panelBox(panel,true));
  assert.ok(rowBoxes.every((box,i)=>i===0||box.x>=rowBoxes[i-1].x+rowBoxes[i-1].width));
  assert.ok(rowBoxes.every(box=>Math.abs(box.y+box.height/2-rowBoxes[0].y-rowBoxes[0].height/2)<=1));
  const staggered={...row,panels:row.panels.map((panel,i)=>({...panel,y:panel.y+(i===0?350:0)}))};
  const staggeredBoxes=autoSizePanels(staggered).map(panel=>panelBox(panel,true));
  assert.ok(staggeredBoxes[0].y>staggeredBoxes[2].y+150);
  const panels=montagePanels.map((panel,i)=>({...panel,width:i===0?900:1000,height:i===0?1200:400,
    weight:i===0?2:.7,x:i===0?-500:200,y:i===0?-200:-200+(i-1)*340}));
  const original=readMontage({...emptyMontage(),panels});
  const result=autoSizePanels(original);
  const boxes=result.map(panel=>panelBox(panel,true));
  for(const [i,box] of boxes.entries()){
    assert.ok(Math.abs(box.width/(box.height-box.labelHeight)-panels[i].width/panels[i].height)<1e-10);
    assert.equal(result[i].svg,panels[i].svg);
    for(const other of boxes.slice(i+1))assert.ok(box.x+box.width<=other.x||other.x+other.width<=box.x||box.y+box.height<=other.y||other.y+other.height<=box.y);
  }
  assert.ok(boxes.slice(1).every(box=>box.x>=boxes[0].x+boxes[0].width));
  assert.ok(boxes[1].y<boxes[2].y&&boxes[2].y<boxes[3].y);
  assert.deepEqual(readMontage({...original,panels:result}).panels,result);
  assert.deepEqual(original.panels,panels);
});

test('automatic montage sizing handles overlapping figures, extreme aspect ratios and coordinate limits', () => {
  assert.deepEqual(autoSizePanels(emptyMontage()),[]);
  for(const labels of [false,true]){
    const state=readMontage({...emptyMontage(),gap:12,labels,panels:Array.from({length:12},(_,i)=>({
      ...montagePanels[0],width:i%2?1:4000,height:i%2?4000:1,weight:i%3?.25:3,x:29990,y:-29990,
    }))});
    const result=autoSizePanels(state),boxes=result.map(panel=>panelBox(panel,labels));
    assert.doesNotThrow(()=>readMontage({...state,panels:result}));
    for(const [i,box] of boxes.entries()){
      assert.ok(Number.isFinite(box.width)&&Number.isFinite(box.height));
      for(const other of boxes.slice(i+1))assert.ok(box.x+box.width<=other.x||other.x+other.width<=box.x||box.y+box.height<=other.y||other.y+other.height<=box.y);
    }
  }
});

test('one-click arrangement removes large blank bands from a sparse draft',()=>{
  const state=readMontage({...emptyMontage(),panels:montagePanels.slice(0,2).map((panel,i)=>({...panel,x:i*8000,y:0}))});
  const [left,right]=autoSizePanels(state).map(panel=>panelBox(panel,state.labels));
  assert.ok(Math.abs(right.x-left.x-left.width-state.gap)<=1);
  assert.equal(state.panels[1].x,8000);
});

test('Markdown reference templates round-trip and support both plot scheme and project IDs', () => {
  const template=plotMarkdownExample({scheme:'grouped-line',name:'Example',csv:'x,y,group\n1,2,A\n3,4,B'});
  assert.deepEqual(readPlotMarkdown(template),{scheme:'grouped-line',name:'Example',rows:[['x','y','group'],['1','2','A'],['3','4','B']]});
  const project='---\n项目编号: abc-123\n---\n| x | y | group |\n| --- | ---: | --- |\n| 1 | 7 | A\\|B |';
  assert.deepEqual(readPlotMarkdown(project),{project:'abc-123',rows:[['x','y','group'],['1','7','A|B']]});
  assert.throws(()=>readPlotMarkdown(template.replace('scheme: grouped-line','scheme: grouped-line\nproject: other')),/只填写一个/);
  assert.throws(()=>readPlotMarkdown('---\nscheme: x\n---\n~~~csv\nx,y\n1,2'),/结束标记/);
});
