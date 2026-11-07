// Isolated UI fixture; never connects to the user's open app or actual library.
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict'), {pathToFileURL} = require('node:url');
const {chromium} = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root = path.resolve(__dirname, '..'), output = path.join(root, '.local/material-list-verification');
const key = (p, m, s = 'S1', c = 'RT') => JSON.stringify([p, m, s, c]), ref = (p, m) => JSON.stringify([p, m]);
const measurement = (id, value, sample = 'S1', conditions = 'RT') => ({id, name: 'Strength', value, unit: 'MPa', sample, conditions});
const papers = [{id: 'p1', title: '材料来源文献一', year: '2024', tags: [], materials: [{id: 'a', name: '合金 A', composition: 'FeCoNi', measurements: [measurement('m1', 100), measurement('m2', 130, 'S2', 'HT')]}, {id: 'b', name: '合金 B', measurements: [measurement('m3', 90)]}]}, {id: 'p2', title: '材料来源文献二', year: '2025', tags: [], materials: [{id: 'a', name: '合金 A', composition: 'FeNi', measurements: [measurement('m4', 150)]}, {id: 'empty', name: '尚未测量', measurements: []}]}];
const settings = {comparisonSelection: ['p1', 'p2'], notes: {}, collections: [], themePreferences: {selected: 'academic-purple'}};
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
let browser, page, failSave = false; const errors = [], checks = [];
async function check(name, run) {await run(); checks.push(name); console.log('PASS ' + name);}
async function choose(reference, selected = true) {const inputs = page.locator('[data-material-list-choice]'), refs = await inputs.evaluateAll(nodes => nodes.map(node => node.dataset.materialListChoice)); const index = refs.indexOf(reference); assert.ok(index >= 0, reference); await inputs.nth(index).setChecked(selected);}
async function action(name) {
  const target = page.locator(`[data-material-list-action="${name}"]`);
  if (!await target.isVisible() && !await page.locator('#material-list-filter-dialog').isVisible()) {
    const toggle = page.locator('[data-menu-toggle="material-organize-menu"]');
    if (await toggle.isVisible()) await toggle.click();
  }
  await target.click();
}
async function group(value) {
  await action('filters');
  await page.locator('#material-list-group').selectOption(value);
  await action('close-filters');
}
(async () => {
  await fs.mkdir(output, {recursive: true}); const stage = await fs.mkdtemp(path.join(output, 'stage-'));
  await fs.cp(path.join(root, 'dist'), path.join(stage, 'dist'), {recursive: true});
  await fs.appendFile(path.join(stage, 'dist/app.js'), '\nglobalThis.__listTest={state,comparison,materialList,render};\n');
  browser = await chromium.launch({headless: true, executablePath: process.env.MATERIA_CHROME || path.join(process.env.ProgramFiles, 'Google/Chrome/Application/chrome.exe'), args: ['--allow-file-access-from-files']});
  page = await browser.newPage({viewport: {width: 1440, height: 940}}); page.on('pageerror', error => errors.push(error.message));
  await page.exposeFunction('__listAPI', (method, ...args) => {
    if (method === 'getPapers') return clone(papers);
    if (method === 'getSetting') return clone(settings[args[0]]);
    if (method === 'setSetting') {if (failSave && args[0] === 'comparisonState') throw Error('模拟磁盘写入失败'); settings[args[0]] = clone(args[1]); return true;}
    if (method === 'info') return {path: 'ISOLATED MATERIAL LIST', materialsVersion: 1, materialSelectionVersion: 1, materialGroupsVersion: 1, themeSchemaVersion: 2, graphThemeVersion: 2, researchCanvasVersion: 1};
    if (method === 'canvasReady' || method === 'canvasConfirmClose') return true;
    throw Error('Unexpected fixture API ' + method);
  });
  await page.addInitScript(() => {globalThis.materiaDesktop = Object.fromEntries(['getPapers', 'getSetting', 'setSetting', 'info', 'canvasReady', 'canvasConfirmClose'].map(name => [name, (...args) => __listAPI(name, ...args)])); materiaDesktop.onCanvasClose = callback => {globalThis.__closeList = callback; return () => {};};});
  await page.goto(pathToFileURL(path.join(stage, 'dist/index.html')).href); await page.waitForFunction(() => __listTest.state.ready);
  await check('one-click paper clearing includes filtered-out selections and updates every checkbox', async () => {
    await page.locator('[data-view="list"]').click(); await page.locator('#search').fill('来源文献一'); await page.waitForFunction(() => document.querySelectorAll('.paper-row').length === 1);
    assert.equal(await page.locator('#clear-paper-selection').isVisible(), true); await page.locator('#clear-paper-selection').click();
    await page.waitForFunction(() => __listTest.state.compareIds.size === 0); assert.deepEqual(settings.comparisonSelection, []);
    assert.equal(await page.locator('[data-compare-id]:checked').count(), 0);
  });
  await check('main material list shows distinct materials, source papers, empty materials and mixed sample selection', async () => {
    await page.locator('[data-view="materials"]').click(); assert.equal(await page.locator('[data-material-list-row]').count(), 4);
    const first = page.locator('[data-material-list-details]').first();
    assert.equal(await first.locator('.material-library-citation').textContent(), 'FeCoNi · 材料来源文献一');
    assert.equal(await first.locator('.material-library-detail').isVisible(), false);
    assert.equal(await page.locator('#material-list-selected-count').isVisible(), false);
    await choose(ref('p1', 'a')); assert.equal((await page.evaluate(() => __listTest.comparison.getMaterialSelection())).keys.length, 2);
    await first.locator('summary').click();
    assert.equal(await first.getByRole('button', {name: '材料来源文献一'}).isVisible(), true);
    const cohort = page.locator('[data-material-list-cohort]').first(); await cohort.uncheck();
    assert.equal(await page.locator('[data-material-list-choice]').first().evaluate(node => node.indeterminate), true);
    assert.equal((await page.evaluate(() => __listTest.comparison.getMaterialSelection())).keys.length, 1);
    await choose(ref('p2', 'a')); await page.screenshot({path: path.join(output, 'material-list-selection.png')});
  });
  await check('create, filter, rename, move and remove groups keep source identities and hidden selections', async () => {
    await action('create-group'); await page.locator('#material-group-form [name="name"]').fill('高熵合金'); await page.locator('#material-group-form [type="submit"]').click(); await page.waitForFunction(() => !document.querySelector('#modal').open);
    assert.equal(settings.comparisonState.groups[0].members.length, 2); assert.equal(await page.locator('[data-material-list-row]').count(), 2);
    await action('edit-group'); await page.locator('#material-group-form [name="name"]').fill('性能对比组'); await page.locator('#material-group-form [type="submit"]').click(); await page.waitForFunction(() => !document.querySelector('#modal').open);
    assert.equal(settings.comparisonState.groups[0].name, '性能对比组');
    await group('ungrouped'); assert.equal(await page.locator('[data-material-list-row]').count(), 2);
    assert.equal(await page.locator('#material-list-filter-count').textContent(), '1');
    assert.ok((await page.locator('#material-list-selected-count').textContent()).includes('筛选外选择'));
    await choose(ref('p1', 'b')); await action('assign-group'); await page.locator('#material-group-assign-form [name="group"]').selectOption(settings.comparisonState.groups[0].id); await page.locator('#material-group-assign-form [type="submit"]').click(); await page.waitForFunction(() => !document.querySelector('#modal').open);
    assert.equal(settings.comparisonState.groups[0].members.length, 3);
    await group(''); await page.screenshot({path: path.join(output, 'material-list-groups.png')});
  });
  await check('table and chart consume only selected cohorts and leave paper selection independent', async () => {
    await action('chart'); await page.locator('[data-comparison-tab="table"]').click(); await page.locator('.material-matrix').waitFor(); assert.equal(await page.locator('.material-matrix thead strong').count(), 3);
    const table = await page.locator('.material-matrix').textContent(); assert.ok(table.includes('130')); assert.ok(!table.includes('100'));
    assert.deepEqual(settings.comparisonSelection, []); await page.locator('#modal [data-action="close-modal"]').last().click();
    await action('chart'); await page.waitForFunction(() => document.querySelector('#chart-point-count')?.textContent.includes('3 个观测点'));
    await page.locator('#modal [data-action="close-modal"]').last().click();
  });
  await check('selection and grouping survive page reload, disk failure retry and close flush', async () => {
    await page.evaluate(() => __listTest.comparison.flushSelection()); const before = clone(settings.comparisonState);
    await page.reload(); await page.waitForFunction(() => __listTest.state.ready); await page.locator('[data-view="materials"]').click();
    assert.deepEqual(await page.evaluate(() => __listTest.comparison.getMaterialSelection()), before);
    failSave = true; await choose(ref('p2', 'empty')); await page.waitForFunction(() => document.querySelector('.material-library-status [data-material-save-status]')?.textContent.includes('未保存'));
    assert.equal(settings.comparisonState.keys.length, 3); failSave = false; await page.locator('.material-library-status [data-material-retry]').click();
    await page.evaluate(() => __closeList()); assert.equal(settings.comparisonState.keys.length, 4);
    await group(settings.comparisonState.groups[0].id); await action('edit-group'); await action('delete-group'); await action('confirm-delete-group'); await page.waitForFunction(() => !document.querySelector('#modal').open);
    assert.equal(settings.comparisonState.groups.length, 0); assert.equal(await page.locator('[data-material-list-row]').count(), 4);
  });
  await check('select-all spans more than 100 results, preserves hidden choices, and clear empties the complete material set', async () => {
    const more = Array.from({length: 105}, (_, i) => ({id: 'bulk' + i, name: '批量材料 ' + i, measurements: [measurement('bm' + i, i)]})); papers[1].materials.push(...more);
    await page.reload(); await page.waitForFunction(() => __listTest.state.ready); await page.locator('[data-view="materials"]').click();
    await page.locator('#material-list-query').fill('批量材料'); await page.waitForFunction(() => document.querySelectorAll('[data-material-list-row]').length === 100);
    await action('select-results'); assert.equal((await page.evaluate(() => __listTest.comparison.getMaterialSelection())).keys.length, 109);
    await action('clear'); assert.deepEqual((await page.evaluate(() => __listTest.comparison.getMaterialSelection())).keys, []);
    await action('filters');
    await page.locator('#material-list-only-selected').check();
    assert.equal(await page.locator('[data-material-list-row]').count(), 0);
    await page.locator('#material-list-filter-dialog [data-material-list-action="reset-filters"]').click();
    assert.equal(await page.locator('#material-list-query').inputValue(), '');
    assert.equal(await page.locator('#material-list-only-selected').isChecked(), false);
    await page.keyboard.press('Escape');
    await page.locator('#material-list-filter-button[aria-expanded="false"]').waitFor();
    await page.locator('#material-list-query').fill('尚未测量'); await page.waitForFunction(() => document.querySelectorAll('[data-material-list-row]').length === 1);
    await page.setViewportSize({width: 1000, height: 760}); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({path: path.join(output, 'material-list-narrow.png')});
    await page.locator('[data-material-list-details] summary').click();
    await page.locator('[data-material-open-paper="p2"]').click();
    await page.locator('#detail-panel .paper-title').waitFor();
    assert.equal(await page.locator('#detail-panel .paper-title').textContent(), '材料来源文献二');
  });
  assert.deepEqual(errors, []); await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({passed: checks.length, checks, errors}, null, 2)); await browser.close();
})().catch(async error => {console.error(error); process.exitCode = 1; await fs.mkdir(output, {recursive: true}); await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({error: error.stack, checks, errors}, null, 2)); await page?.screenshot({path: path.join(output, 'failure.png')}).catch(() => {}); await browser?.close();});
