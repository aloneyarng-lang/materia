// The real desktop executable, an isolated library/profile, and a hidden window.
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict'), {spawn} = require('node:child_process'), {pathToFileURL} = require('node:url');
const {chromium} = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async () => {
  const root = path.resolve(__dirname, '..'), output = path.join(root, '.local/material-list-desktop'); await fs.mkdir(output, {recursive: true});
  const run = await fs.mkdtemp(path.join(output, 'run-')), library = path.join(run, 'library'), profile = path.join(run, 'profile');
  const {version} = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const executable = process.env.MATERIA_RELEASE_EXE || path.join(root, `release/v${version}/Materia-win32-x64/Materia.exe`);
  const env = {...process.env, MATERIA_HEADLESS: '1', MATERIA_PROFILE_DIR: profile, MATERIA_LIBRARY_DIR: library}; delete env.ELECTRON_RUN_AS_NODE;
  const {LocalLibrary} = await import(pathToFileURL(path.join(path.dirname(executable), 'resources/app/desktop/library.mjs')).href), lib = await new LocalLibrary(library).init();
  const pdf = Buffer.from('%PDF-1.4\n% isolated material list fixture\n%%EOF');
  const original = [1, 2].map(i => ({id: 'p' + i, title: '桌面验证来源 ' + i, year: String(2023 + i), tags: [], filename: `p${i}.pdf`, fileBytes: pdf, materials: [{id: 'a', name: '同名合金', composition: i === 1 ? 'FeCo' : 'FeNi', measurements: [{id: 's' + i, name: 'Strength', value: i * 100, unit: 'MPa', sample: 'S1', conditions: 'RT'}]}]}));
  await lib.putPapers(original); await lib.setSetting('comparisonSelection', ['p1', 'p2']); await lib.setSetting('themePreferences', {selected: 'liquid-glass-dark'});
  const before = structuredClone(lib.getPapers()); let child, browser, page, logs = ''; const errors = [];
  async function start() {
    await fs.unlink(path.join(profile, 'DevToolsActivePort')).catch(error => {if (error.code !== 'ENOENT') throw error;});
    child = spawn(executable, ['--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1'], {env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe']}); child.stderr.on('data', data => logs += data);
    let port;
    for (let i = 0; i < 150; i++) {try {port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); if (port) break;} catch {} if (child.exitCode !== null) throw Error(logs); await new Promise(resolve => setTimeout(resolve, 100));}
    assert.ok(port, 'No isolated desktop debugging port'); browser = await chromium.connectOverCDP('http://127.0.0.1:' + port); page = browser.contexts()[0].pages()[0]; page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => document.querySelector('.import-main')?.disabled === false);
    const info = await page.evaluate(() => materiaDesktop.info()); assert.equal(path.resolve(info.path), path.resolve(library));
  }
  async function stop() {
    const exit = new Promise(resolve => child.once('exit', resolve)); await page.evaluate(() => window.close()).catch(() => {});
    await Promise.race([exit, new Promise((_, reject) => {const timer = setTimeout(() => reject(Error('Desktop close/save timed out')), 15000); timer.unref();})]);
    await browser.close().catch(() => {}); browser = null; child = null;
  }
  async function materialAction(name){const button=page.locator(`[data-material-list-action="${name}"]`);if(!await button.isVisible())await page.locator('[data-menu-toggle="material-organize-menu"]').click();await button.click();}
  try {
    await start(); await page.locator('[data-view="list"]').click(); await page.locator('#clear-paper-selection').click();
    await page.waitForFunction(async () => (await materiaDesktop.getSetting('comparisonSelection')).length === 0);
    await page.locator('[data-view="materials"]').click(); assert.equal(await page.locator('[data-material-list-choice]').count(), 2);
    await materialAction('select-results');
    await materialAction('create-group'); await page.locator('#material-group-form [name="name"]').fill('跨来源合金组'); await page.locator('#material-group-form [type="submit"]').click(); await page.waitForFunction(() => !document.querySelector('#modal').open);
    let saved = await page.evaluate(() => materiaDesktop.getSetting('comparisonState')); assert.equal(saved.groups.length, 1); assert.equal(saved.groups[0].members.length, 2); assert.equal(saved.keys.length, 2);
    await materialAction('chart'); await page.locator('[data-comparison-tab="table"]').click(); assert.equal(await page.locator('.material-matrix thead strong').count(), 2); assert.equal(await page.locator('.material-source-row td').count(), 2); await page.locator('#modal [data-action="close-modal"]').last().click();
    await page.locator('[data-material-list-action="chart"]').click(); await page.waitForFunction(() => document.querySelector('#chart-point-count')?.textContent.includes('2 个观测点')); await page.locator('#modal [data-action="close-modal"]').last().click();
    await page.screenshot({path: path.join(output, 'desktop-material-list.png'), timeout: 3000}).catch(() => {}); await stop();
    await start(); await page.locator('[data-view="materials"]').click(); saved = await page.evaluate(() => materiaDesktop.getSetting('comparisonState')); assert.equal(saved.groups[0].name, '跨来源合金组'); assert.equal(saved.keys.length, 2);
    assert.equal(await page.locator('[data-material-list-choice]:checked').count(), 2); assert.deepEqual(await page.evaluate(() => materiaDesktop.getSetting('comparisonSelection')), []);
    const after = await page.evaluate(() => materiaDesktop.getPapers()); assert.deepEqual(after, before);
    await materialAction('clear'); await stop();
    const disk = JSON.parse(await fs.readFile(path.join(library, 'library.json'), 'utf8')); assert.deepEqual(disk.settings.comparisonState.keys, []); assert.equal(disk.settings.comparisonState.groups[0].members.length, 2); assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({passed: true, executable, actualProcessRestart: true, groupsPersisted: true, tableAndChart: true, independentSelections: true, originalMaterialsAndPdfUntouched: true, isolatedLibrary: true, visibleWindow: false, errors}, null, 2)); console.log('PASS actual desktop material list, grouping, clearing, comparisons and process restart');
  } catch(error) {await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({error: error.stack, errors, logs}, null, 2)); await page?.screenshot({path: path.join(output, 'failure.png'), timeout: 3000}).catch(() => {}); throw error;
  } finally {if (child?.exitCode === null) child.kill(); await browser?.close().catch(() => {});}
})().catch(error => {console.error(error); process.exitCode = 1;});
