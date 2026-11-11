// Uses synthetic workbooks, an isolated library and hidden desktop windows.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {crc32} = require('node:zlib');
const {createServer} = require('node:http');
const runtime = path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const {chromium, _electron} = require(path.join(runtime,'playwright'));
const {PDFDocument} = require(path.join(runtime,'pdf-lib'));
const root = path.resolve(__dirname,'..');
const output = process.env.MATERIA_FIGURA_TEST_OUTPUT || path.join(root,'.local/figura-verification');
let app, page, browser, server, networkProbe;
const errors = [];
const ui = key => page.locator('#figura-workspace [data-fig="'+key+'"]');
const action = async key => {
  if(['choose-data','sample','style-sample'].includes(key)&&!await page.locator('#figura-data-source').isVisible())await page.locator('[data-menu-toggle="figura-data-source"]').click();
  await page.locator('#figura-workspace [data-fig-action="'+key+'"]:visible').click();
};
const template = id => page.locator('#figura-workspace [data-id="'+id+'"]');
const montage = key => page.locator('[data-fig=montage] [data-montage="'+key+'"]');
const montageAction = key => page.locator('[data-fig=montage] [data-montage-action="'+key+'"]:visible').click();
const montageMenu = key => page.locator('[data-fig=montage] [data-menu-toggle="montage-'+key+'"]').click();
const waitText = (selector, text) => page.waitForFunction(({selector,text})=>document.querySelector(selector)?.textContent.includes(text),{selector,text});
const ready = () => page.locator('.import-main:not([disabled])').waitFor({state:'attached'});
const updated = () => waitText('[data-fig=plot-status]', '预览已更新');

function zip(entries) {
  const local = [], directory = [];
  let offset = 0, directoryLength = 0;
  for (const [name, value] of Object.entries(entries)) {
    const filename = Buffer.from(name), data = Buffer.from(value);
    const entry = Buffer.alloc(30), central = Buffer.alloc(46), crc = crc32(data);
    entry.writeUInt32LE(0x04034b50); entry.writeUInt16LE(20,4); entry.writeUInt32LE(crc,14);
    entry.writeUInt32LE(data.length,18); entry.writeUInt32LE(data.length,22); entry.writeUInt16LE(filename.length,26);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20,4); central.writeUInt16LE(20,6); central.writeUInt32LE(crc,16);
    central.writeUInt32LE(data.length,20); central.writeUInt32LE(data.length,24); central.writeUInt16LE(filename.length,28); central.writeUInt32LE(offset,42);
    local.push(entry,filename,data); directory.push(central,filename);
    offset += entry.length + filename.length + data.length;
    directoryLength += central.length + filename.length;
  }
  const end = Buffer.alloc(22), count = Object.keys(entries).length;
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(count,8); end.writeUInt16LE(count,10);
  end.writeUInt32LE(directoryLength,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,...directory,end]);
}

function workbook() {
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const sheet = value => `<worksheet xmlns="${ns}"><sheetData><row r="1">${['x','y','group'].map((name,i)=>`<c r="${'ABC'[i]}1" t="inlineStr"><is><t>${name}</t></is></c>`).join('')}</row><row r="2"><c r="A2"><v>1</v></c><c r="B2"><f>1+1</f><v>${value}</v></c><c r="C2" t="inlineStr"><is><t>Fixture</t></is></c></row></sheetData></worksheet>`;
  return zip({
    'xl/workbook.xml':`<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets><sheet name="First" r:id="rId1"/><sheet name="Second" r:id="rId2"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml':sheet(2), 'xl/worksheets/sheet2.xml':sheet(8),
  });
}

async function desktop(testRoot) {
  const exe = process.env.MATERIA_VERIFY_DESKTOP || path.join(root,'node_modules/electron/dist/electron.exe');
  const library = path.join(testRoot,'library'), profile = path.join(testRoot,'profile'), install = path.join(testRoot,'fixture-plot');
  const env = {...process.env, MATERIA_HEADLESS:'1', MATERIA_PROFILE_DIR:profile, MATERIA_LIBRARY_DIR:library};
  delete env.ELECTRON_RUN_AS_NODE;
  const start = async () => {
    app = await _electron.launch({executablePath:exe,args:process.env.MATERIA_VERIFY_DESKTOP?[]:[root],env,timeout:35000});
    const main = candidate => candidate.url().endsWith('/dist/index.html');
    page = app.windows().find(main) || await app.waitForEvent('window',{predicate:main,timeout:25000});
    page.on('pageerror', error=>errors.push(error.message));
    await ready();
    await page.locator('[data-view=figura]').click();
    await ui('schemes').waitFor();
    await app.evaluate(({dialog}, {install,testRoot}) => {
      dialog.showOpenDialog = async (_window,options) => ({canceled:false,filePaths:options.title==='导入到图片库'
        ? [testRoot+'/Fixture project.png',testRoot+'/导入乙.svg'] : [install]});
      dialog.showSaveDialog = async (_window, options) => {
        globalThis.fixtureSaveDefault=options.defaultPath;
        return {canceled:false,filePath:testRoot+'/'+options.defaultPath.split(/[\\/]/).at(-1)};
      };
    },{install,testRoot});
  };
  await fs.cp(path.join(root,'dist/figura/schemes/grouped-line'),install,{recursive:true});
  const manifestPath = path.join(install,'manifest.json'), manifest = JSON.parse(await fs.readFile(manifestPath,'utf8'));
  await fs.writeFile(manifestPath,JSON.stringify({...manifest,id:'fixture-plot',name:'测试扩展图型',category:'测试分类'}));
  let networkRequests = 0;
  networkProbe = createServer((_, response) => { networkRequests++; response.end('fixture'); });
  await new Promise(resolve => networkProbe.listen(0, '127.0.0.1', resolve));
  await fs.writeFile(path.join(install,'plot.js'),`import {esc} from '../shared.js';
export async function render({params}) {
  let blocked = false;
  try {await fetch('http://127.0.0.1:${networkProbe.address().port}/forbidden',{mode:'no-cors'});} catch {blocked = true;}
  if (!blocked || typeof process !== 'undefined') throw Error('Sandbox escape');
  return '<svg xmlns="http://www.w3.org/2000/svg" width="'+params.width+'" height="'+params.height+'" viewBox="0 0 '+params.width+' '+params.height+'"><text x="30" y="40" fill="'+params.color+'">'+esc('Fixture plot')+'</text></svg>';
}`);
  await start();
  assert.deepEqual(await page.locator('.view-tabs .view-tab').evaluateAll(nodes=>nodes.map(node=>node.dataset.view)),['graph','list','materials','notes','figura']);
  assert.equal(await page.locator('.figura-scheme').count(),16);
  await template('grouped-line').click();
  await updated();
  assert.equal(await ui('theme').locator('option').count(),6);
  assert.equal(await ui('theme').inputValue(),'');
  await ui('theme').selectOption('ocean-copper');
  await page.waitForFunction(()=>decodeURIComponent(document.querySelector('[data-fig=image]')?.src || '').includes('#225883'));
  assert.equal(await ui('theme-swatches').locator('i').count(),4);
  await action('data-tab');
  await ui('file').setInputFiles({name:'synthetic.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:workbook()});
  await ui('sheet').waitFor();
  await ui('sheet').selectOption({label:'Second'});
  await action('apply-sheet');
  assert.equal(await page.locator('[data-fig-row="1"][data-fig-column="1"]').inputValue(),'8');
  assert.match(await ui('notice').textContent(),/公式/);
  await ui('name').fill('Fixture project');
  await action('save');
  await waitText('[data-fig=notice]', '项目已保存');
  console.log('PASS plotting tab, multi-sheet XLSX, formula cache and project save');

  await action('export');
  for (const type of ['svg','png','pdf']) {
    await ui('export-format').selectOption(type);
    assert.equal(await ui('dpi-field').isVisible(),type==='png');
    await action('export-file');
    await waitText('[data-fig="export-dialog"] [data-fig-dialog-status]', type.toUpperCase()+' 已导出').catch(async error => {
      throw Error(type + ': ' + await page.locator('[data-fig="export-dialog"] [data-fig-dialog-status]').textContent(), {cause:error});
    });
  }
  const svg = await fs.readFile(path.join(testRoot,'Fixture project.svg'),'utf8');
  assert.match(svg,/stroke="#225883"/);
  const png = await fs.readFile(path.join(testRoot,'Fixture project.png'));
  assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],[2813,1750]);
  assert.equal(png.toString('ascii',37,41),'pHYs');
  assert.equal(png.readUInt32BE(41),11811);
  const pdf = await PDFDocument.load(await fs.readFile(path.join(testRoot,'Fixture project.pdf')));
  assert.equal(pdf.getPageCount(),1);
  const size = pdf.getPage(0).getSize();
  assert.ok(Math.abs(size.width-675)<1 && Math.abs(size.height-420)<1,JSON.stringify(size));
  assert.match((await fs.readFile(path.join(testRoot,'Fixture project.pdf'))).toString('latin1'), /\/Subtype \/Type0/);
  assert.equal(path.dirname(await app.evaluate(()=>globalThis.fixtureSaveDefault)),path.join(testRoot,'图片库'));
  await action('done');
  console.log('PASS SVG, 300 DPI PNG metadata and vector PDF with matching physical size');

  await action('schemes');
  await action('install');
  await waitText('[data-fig="schemes-dialog"] [data-fig-dialog-status]', '已安装');
  await action('done');
  await ui('category').selectOption({label:'测试分类'});
  await template('fixture-plot').click();
  await page.waitForFunction(()=>decodeURIComponent(document.querySelector('[data-fig=image]')?.src || '').includes('Fixture plot'));
  assert.equal(networkRequests,0);
  assert.match(decodeURIComponent(await ui('image').getAttribute('src')),/fill="#225883">Fixture plot/);
  await ui('category').selectOption('');
  const legacy = {schemeId:'grouped-line',schemeVersion:'1.0.0',name:'Legacy Figura',rows:[['x','y','group'],['1','2','A']],mapping:{x:'x',y:'y',group:'group'},params:{}};
  await action('projects');
  await ui('project-file').setInputFiles({name:'legacy.figura.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});
  await page.waitForFunction(()=>document.querySelector('[data-fig=name]').value==='Legacy Figura');
  await updated();
  await page.evaluate(()=>window.close()).catch(()=>{});
  const exit = new Promise(resolve => app.process().exitCode === null ? app.process().once('exit',resolve) : resolve());
  const timeout = new Promise((_, reject) => setTimeout(() => reject(Error('Desktop close/save timed out')), 15000).unref());
  await Promise.race([exit, timeout]);
  await start();
  assert.equal(await ui('name').inputValue(),'Legacy Figura');
  assert.equal(await ui('theme').inputValue(),'');
  assert.equal(await template('fixture-plot').count(),1);
  await action('projects');
  assert.match(await ui('projects-list').textContent(),/Fixture project/);
  await ui('projects-list').selectOption({label:'Fixture project'});
  await action('open-project');
  await action('confirm');
  await page.waitForFunction(()=>document.querySelector('[data-fig=name]').value==='Fixture project');
  assert.equal(await ui('theme').inputValue(),'ocean-copper');
  console.log('PASS custom scheme installation, isolated execution, legacy import and desktop restart');

  await action('quick-import');
  const projectOption=await ui('markdown-template').locator('option[value^="project:"]').first().getAttribute('value');
  await ui('markdown-template').selectOption(projectOption);
  await action('markdown-template');
  const reference=path.join(testRoot,'Materia-Fixture project-绘图参考.md');
  let markdown;
  for(let i=0;i<50&&!markdown;i++){
    markdown=await fs.readFile(reference,'utf8').catch(()=>null);
    if(!markdown)await new Promise(resolve=>setTimeout(resolve,80));
  }
  assert.ok(markdown?.includes('project: '+projectOption.slice(8)));
  const imported=markdown.replace(/name: [^\r\n]+/,'name: Imported Markdown')
    .replace(/~~~csv[\s\S]*?~~~/,'~~~csv\nx,y,group\n1,9,Test\n2,13,Test\n~~~');
  await ui('markdown-file').setInputFiles({name:'fixture.md',mimeType:'text/markdown',buffer:Buffer.from(imported)});
  await waitText('[data-fig=notice]','Markdown 已导入');
  assert.equal(await ui('name').inputValue(),'Imported Markdown');
  assert.equal(await ui('theme').inputValue(),'ocean-copper');
  await action('data-tab');
  assert.equal(await page.locator('[data-fig-row="1"][data-fig-column="1"]').inputValue(),'9');
  console.log('PASS downloadable project-specific Markdown and one-step rendering with the saved theme');

  const imageRoot=path.join(testRoot,'图片库');
  await fs.mkdir(imageRoot,{recursive:true});
  const gradient=name=>`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="420" viewBox="0 0 600 420"><defs><linearGradient id="same"><stop offset="0" stop-color="white"/><stop offset="1" stop-color="blue"/></linearGradient></defs><rect width="600" height="420" fill="url(#same)"/><text x="30" y="50">${name}</text></svg>`;
  for(const name of ['矢量甲','矢量乙'])await fs.writeFile(path.join(imageRoot,name+'.svg'),gradient(name));
  await fs.writeFile(path.join(testRoot,'导入乙.svg'),gradient('导入乙'));
  await action('montage');
  await montage('name').fill('Test montage');
  await montageMenu('add');
  await montageAction('import-images');
  const cards=page.locator('[data-montage-card]');
  await cards.nth(1).waitFor();
  assert.deepEqual(await cards.locator('img').evaluateAll(nodes=>nodes.map(node=>node.alt)),['Fixture project','导入乙']);
  await montageMenu('add');
  await montageAction('choose-images');
  await montage('images').selectOption(['矢量甲.svg','矢量乙.svg']);
  await montageAction('image');
  await cards.nth(3).waitFor();
  assert.equal(await cards.count(),4);
  assert.equal(await page.locator('[data-montage-action="arrange"],[data-montage-action="auto-size"]').count(),0);
  await montageMenu('add');
  await montageAction('choose-images');

  const readMontage=async ready=>{
    for(let attempt=0;attempt<50;attempt++){
      const state=JSON.parse(await fs.readFile(path.join(library,'figura-workspace.json'),'utf8')).montage;
      if(!ready||ready(state))return state;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw Error('Montage save timed out');
  };
  const before=await readMontage(state=>state.panels.length===4);
  const first=await cards.first().boundingBox();
  await page.mouse.move(first.x+first.width*.4,first.y+first.height*.5);
  await page.mouse.down();
  await page.mouse.move(first.x+first.width*.4+96,first.y+first.height*.5+78,{steps:6});
  await page.mouse.up();

  await page.evaluate(files=>{
    const dataTransfer=new DataTransfer();
    for(const [name,contents] of files)dataTransfer.items.add(new File([contents],name+'.svg',{type:'image/svg+xml'}));
    document.querySelector('[data-montage=board]').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer}));
  },['拖入甲','拖入乙'].map(name=>[name,gradient(name)]));
  await cards.nth(5).waitFor();
  assert.equal(await cards.count(),6);
  for(const file of ['拖入甲.svg','拖入乙.svg'])assert.ok((await fs.stat(path.join(imageRoot,file))).isFile());
  const handle=cards.first().locator('[data-montage-resize]'), point=await handle.boundingBox();
  await page.mouse.move(point.x+point.width/2,point.y+point.height/2);
  await page.mouse.down();
  await page.mouse.move(point.x+62,point.y+38,{steps:6});
  await page.mouse.up();
  const after=await readMontage(state=>state.panels.length===6&&state.panels[0].weight>1);
  await montageAction('generate');
  await waitText('[data-fig=montage] [data-fig-dialog-status]','已保存到图片库');
  const composed=await fs.readFile(path.join(imageRoot,'Test montage.svg'),'utf8');
  assert.match(composed,/<image href="data:image\/png;base64,/);
  const ids=[...composed.matchAll(/id="(panel-[^"]+)"/g)].map(match=>match[1]);
  assert.ok(ids.length>=5);
  assert.equal(new Set(ids).size,ids.length);
  assert.doesNotMatch(composed,/url\(#same\)/);
  await montageMenu('export');
  await montageAction('pdf');
  await waitText('[data-fig=montage] [data-fig-dialog-status]','PDF 已导出').catch(async error=>{
    throw Error(await page.locator('[data-fig=montage] [data-fig-dialog-status]').textContent(),{cause:error});
  });
  assert.match((await fs.readFile(path.join(testRoot,'Test montage.pdf'))).toString('latin1'),/\/Subtype \/Image/);
  assert.deepEqual(await readMontage(),after,'generation must not replace the editable draft');
  assert.equal(after.panels.length,6);
  assert.ok(after.panels[0].weight>1);
  assert.ok(after.panels[0].x>before.panels[0].x&&after.panels[0].y>before.panels[0].y);
  assert.deepEqual(after.panels.slice(1,4),before.panels.slice(1,4));
  const exported=await page.evaluate(svg=>[...new DOMParser().parseFromString(svg,'image/svg+xml').documentElement.children]
    .filter(node=>node.localName==='svg').map(node=>['x','y','width','height'].map(attr=>Number(node.getAttribute(attr)))),composed);
  assert.equal(exported.length,6);
  for(const [[x,y,w,h],i] of exported.map((box,i)=>[box,i])){
    assert.ok(Math.abs(w/h-after.panels[i].width/after.panels[i].height)<.01);
    for(const [ox,oy,ow,oh] of exported.slice(i+1))assert.ok(x+w<=ox||ox+ow<=x||y+h<=oy||oy+oh<=y);
  }
  await montageAction('edit');
  assert.equal(await cards.count(),6);
  await montageAction('generate');
  await waitText('[data-fig=montage] [data-fig-dialog-status]','Test montage (2).svg');
  assert.equal(await fs.readFile(path.join(imageRoot,'Test montage (2).svg'),'utf8'),composed);
  await montageAction('close');
  console.log('PASS bulk imports, free positioning, automatic sizing, vector composition and mixed PDF');
  await app.close();
  app = null;
}

async function visual(testRoot) {
  const {createPreviewServer} = await import(pathToFileURL(path.join(root,'server.mjs')));
  server = createPreviewServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser = await chromium.launch({headless:true,executablePath:process.env.MATERIA_CHROME || path.join(process.env.ProgramFiles,'Google/Chrome/Application/chrome.exe')});
  page = await browser.newPage({viewport:{width:1440,height:940}});
  page.on('pageerror', error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await ready();
  const rendered = await page.evaluate(async () => {
    const {browserCatalog,browserSample,browserPlot} = await import('./figura/browser.js');
    const {normalizeTable,defaults,mapColumns} = await import('./figura/model.js');
    const {sanitizeSVG} = await import('./figura/svg.js');
    const {FIGURE_THEMES} = await import('./figura/schemes/figure-themes.js');
    const {parseDelimited} = await import('./prediction-import.js');
    const schemes = await browserCatalog();
    for (const scheme of schemes) {
      const rows = normalizeTable(parseDelimited(await browserSample(scheme,'example.csv')));
      const params = defaults(scheme);
      for(const theme of [null,...FIGURE_THEMES]){
        const svg = await browserPlot(scheme,{rows,params,mapping:mapColumns(scheme,rows[0]),themeId:theme?.id});
        sanitizeSVG(svg,params);
      }
    }
    return schemes.length;
  });
  assert.equal(rendered,16);
  await page.locator('[data-view=figura]').click();
  await template('interval-trend').click();
  await updated();
  await ui('theme').selectOption('mineral-violet');
  await page.waitForFunction(()=>decodeURIComponent(document.querySelector('[data-fig=image]')?.src || '').includes('#206C62'));
  await page.screenshot({path:path.join(testRoot,'figura-light.png'),animations:'disabled'});
  await action('data-tab');
  await ui('file').setInputFiles({name:'renamed.csv',mimeType:'text/csv',buffer:Buffer.from('时间,响应,下限,上限,系列\n1,3,2,4,A\n2,5,4,6,A\n')});
  await waitText('[data-fig=notice]', '已导入表格');
  for (const [key,label] of [['x','时间'],['y','响应'],['lower','下限'],['upper','上限'],['group','系列']]) await page.locator('[data-fig-map="'+key+'"]').selectOption(label);
  await updated();
  assert.equal(await ui('table').locator('thead th').count(),6);
  assert.deepEqual(await ui('table').locator('tbody tr').evaluateAll(rows=>rows.map(row=>row.cells.length)),[6,6]);
  await page.screenshot({path:path.join(testRoot,'figura-data.png'),animations:'disabled'});
  await page.evaluate(async()=>{const {setSetting}=await import('./storage.js');await setSetting('themePreferences',{selected:'liquid-glass',mode:'dark'});});
  await page.reload();
  await ready();
  await page.locator('[data-view=figura]').click();
  await updated();
  await page.setViewportSize({width:1000,height:760});
  await page.screenshot({path:path.join(testRoot,'figura-dark.png'),animations:'disabled'});
  assert.equal(await page.locator('html').getAttribute('data-theme-mode'),'dark');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
  await template('heatmap').click();
  await action('confirm');
  await page.waitForFunction(()=>decodeURIComponent(document.querySelector('[data-fig=image]')?.src || '').includes('heatmap-scale'));
  await page.screenshot({path:path.join(testRoot,'figura-themed-heatmap.png'),animations:'disabled'});
  console.log('PASS light/dark layout, CSV import and field remapping');
}

(async () => {
  await fs.mkdir(output,{recursive:true});
  const testRoot = await fs.mkdtemp(path.join(output,'run-'));
  console.log(testRoot);
  await desktop(testRoot);
  await visual(testRoot);
  assert.deepEqual(errors,[]);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  await app?.close().catch(()=>{});
  await browser?.close().catch(()=>{});
  if (server) await new Promise(resolve=>server.close(resolve));
  if (networkProbe) await new Promise(resolve=>networkProbe.close(resolve));
});
