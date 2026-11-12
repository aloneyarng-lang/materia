const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.USERPROFILE,
  '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));

(async () => {
  const { createPreviewServer } = await import('../server.mjs');
  const server = createPreviewServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForFunction(() => document.querySelector('.import-main')?.disabled === false);
    await page.evaluate(async () => {
      const { putPapers, setSetting } = await import('./storage.js');
      const tags = ['合金', '薄膜', '界面'];
      await putPapers(Array.from({ length: 18 }, (_, i) => ({
        id: 'flow-' + i, title: tags[i % 3] + '材料研究 ' + (i + 1),
        tags: [tags[i % 3], ...(i % 4 === 0 ? [tags[(i + 1) % 3], '材料表征'] : [])],
      })));
      await setSetting('themePreferences', { selected: 'paper', mode: 'dark' });
      await setSetting('graphPreferences', { labelThreshold: .75 });
    });
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('.paper-node').length === 18);
    const baseEdges = page.locator('.network-edges path');
    const pulses = page.locator('.network-flow path');
    const first = pulses.first();
    const appearance = page.locator('[data-graph-setting="appearance"]');
    const edgeCount = await baseEdges.count();
    assert.ok(edgeCount > 0 && edgeCount < 72);

    await page.locator('#filter-button').click();
    await appearance.selectOption('flow');
    assert.equal(await pulses.count(), edgeCount);
    assert.equal(await page.locator('.flow-node-halo').count(), 18);
    assert.equal(await page.locator('.node-core').first().evaluate(node => getComputedStyle(node).fillOpacity), '0.76');
    assert.equal(await page.locator('.flow-node-halo').first().evaluate(node => getComputedStyle(node).fillOpacity), '0.16');
    assert.deepEqual(await pulses.evaluateAll(nodes => nodes.map(node => node.getAttribute('d'))),
      await baseEdges.evaluateAll(nodes => nodes.map(node => node.getAttribute('d'))));
    assert.equal(await first.isVisible(), false);

    const closeFilters = () => page.locator('#advanced-filter-dialog .filter-drawer-footer [data-action="close-filters"]').click();
    await closeFilters();
    await page.locator('#graph-arrange').click();
    await page.waitForFunction(() => document.querySelector('#star-map').dataset.naturalLayout === 'settled');
    await page.mouse.move(0, 0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const offset = await first.evaluate(node => getComputedStyle(node).strokeDashoffset);
    await page.waitForFunction(before => getComputedStyle(document.querySelector('.network-flow path')).strokeDashoffset !== before, offset);
    await page.locator('#star-map').screenshot({ path: '.local/graph-flow.png' });

    await page.locator('#filter-button').click();
    await page.locator('.graph-setting-section > summary').filter({ hasText: '力学布局' }).click();
    await page.locator('#graph-motion').click();
    assert.equal(await first.evaluate(node => getComputedStyle(node).animationPlayState), 'paused');
    await page.locator('.graph-setting-section > summary').filter({ hasText: '显示与文字' }).click();
    await page.locator('#show-edges').uncheck();
    assert.equal(await pulses.count(), 0);
    await page.locator('#show-edges').check();
    assert.equal(await pulses.count(), edgeCount);
    await appearance.selectOption('classic');
    assert.equal(await pulses.count(), 0);
    assert.equal(await page.locator('.flow-node-halo').count(), 0);
    await appearance.selectOption('flow');
    await closeFilters();
    await page.waitForFunction(async () => (await (await import('./storage.js')).getSetting('graphPreferences'))?.appearance === 'flow');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(async () => {
      const { putPapers } = await import('./storage.js');
      await putPapers(Array.from({ length: 205 }, (_, i) => ({
        id: 'dense-flow-' + i, title: '合金薄膜界面 ' + (i + 1), tags: ['合金'],
      })));
    });
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('.paper-node').length === 223);
    assert.equal(await page.locator('#star-map').getAttribute('data-graph-appearance'), 'flow');
    assert.equal(await page.locator('#star-map').getAttribute('data-graph-density'), 'dense');
    assert.equal(await baseEdges.count(), 3);
    assert.equal(await pulses.count(), 72);
    assert.deepEqual(errors, []);
    console.log('PASS translucent nodes, edge geometry and animation, pause, reduced motion, visibility, persistence, dense cap');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
