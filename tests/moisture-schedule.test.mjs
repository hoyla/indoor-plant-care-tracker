import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { effectiveCheckIntervalDays } from '../moisture-schedule.js';

test('uses the automatic care interval when a reading has no override', () => {
  assert.equal(effectiveCheckIntervalDays({ value: 5 }, 7), 7);
  assert.equal(effectiveCheckIntervalDays(null, 14), 14);
});

test('uses a valid per-reading next-check override', () => {
  assert.equal(effectiveCheckIntervalDays({ nextCheckDays: 3 }, 7), 3);
  assert.equal(effectiveCheckIntervalDays({ nextCheckDays: 21 }, 14), 21);
});

test('ignores malformed overrides defensively', () => {
  assert.equal(effectiveCheckIntervalDays({ nextCheckDays: 0 }, 7), 7);
  assert.equal(effectiveCheckIntervalDays({ nextCheckDays: '3' }, 7), 7);
});

test('the moisture form offers an editable interval and closes after saving', async () => {
  const [html, app] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../app.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="moisture-next-check"[^>]+type="number"[^>]+min="1"[^>]+max="365"/);
  assert.match(app, /nextCheckDays === automaticDays \? \{\} : \{ nextCheckDays \}/);
  assert.match(app, /saveJournalChange\(specimen, previous, 'Moisture reading saved\.'\)\) \{\s*elements\.journalDialog\.close\(\)/);
});
