import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('generates build information from the checked-out commit', async () => {
  execFileSync(process.execPath, ['scripts/write-build-info.mjs'], { cwd: root, stdio: 'pipe' });
  const generated = await readFile(new URL('../build-info.js', import.meta.url), 'utf8');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim().toLowerCase();

  assert.equal(generated, `window.__MYPLANTS_BUILD__ = Object.freeze(${JSON.stringify({ commit })});\n`);
});

test('shows the deployed commit unobtrusively in the page footer', async () => {
  const [html, app, css] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../app.js', import.meta.url), 'utf8'),
    readFile(new URL('../styles.css', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /<footer class="site-footer">[\s\S]*id="build-commit"/);
  assert.ok(html.indexOf('src="build-info.js"') < html.indexOf('src="app.js"'));
  assert.match(app, /Commit \$\{commit\.slice\(0, 7\)\}/);
  assert.match(app, /indoor-plant-care-tracker\/commit\/\$\{commit\}/);
  assert.match(css, /\.site-footer \{[^}]*font-size: \.7rem;/);
});
