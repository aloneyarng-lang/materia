import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = file => readFile(new URL('../' + file, import.meta.url), 'utf8');

const EXPECTED_STYLES = ['classic', 'drafting', 'obsidian', 'telemetry', 'aperture', 'diffraction', 'telescope', 'monolith', 'horology', 'prism', 'chrome'];

test('startup animation preference normalizes styles and keeps minimal mode skipping the splash', async () => {
  // startup.mjs imports electron only for BrowserWindow; the helpers are pure.
  const source = await read('desktop/startup.mjs');
  const values = source.match(/STARTUP_STYLES = \[([^\]]+)\]/)[1].match(/'([a-z]+)'/g).map(v => v.slice(1, -1));
  assert.deepEqual(values, EXPECTED_STYLES);
  assert.match(source, /config\.minimalMode === true \? 'off'/);
  assert.match(source, /style === 'off'\) return noop/);
});

test('every startup style has markup, styles and a settings option', async () => {
  const [html, css, js, app] = await Promise.all(['dist/startup.html', 'dist/startup.css', 'dist/startup.js', 'dist/app.js'].map(read));
  assert.match(html, /<script src="\.\/startup\.js"><\/script>/);
  assert.match(html, /<script src="\.\/startup-luxury\.js"><\/script>/);
  assert.match(html, /data-luxury-gl="prism"/);
  assert.match(html, /data-luxury-fx="prism"/);
  assert.match(html, /data-luxury-gl="chrome"/);
  assert.match(html, /data-luxury-fx="chrome"/);
  assert.doesNotMatch(html, /unsafe-inline|\sstyle="/, 'splash keeps a strict CSP without inline styles');
  for (const style of EXPECTED_STYLES) {
    assert.match(css, new RegExp(`\\.depart\\[data-style=${style}\\]`), 'departure for ' + style);
    assert.match(js, new RegExp(`'${style}'`), 'runtime accepts ' + style);
    assert.match(app, new RegExp(`\\['${style}',`), 'settings offers ' + style);
  }
  assert.match(app, /\['off','完全关闭'\]/);
  assert.equal((html.match(/class="ray"/g) || []).length, 8);
});
