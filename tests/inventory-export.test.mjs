import assert from 'node:assert/strict';
import test from 'node:test';

import { inventoryExportFilename, isNewerInventory, serializeInventory } from '../inventory-export.js';

test('names the export by the local calendar date', () => {
  const late = new Date(2026, 10, 11, 23, 30);
  assert.equal(inventoryExportFilename(late), 'plant-inventory-2026-11-11.json');
  assert.match(inventoryExportFilename(), /^plant-inventory-\d{4}-\d{2}-\d{2}\.json$/);
});

test('serializes the inventory as readable JSON that round-trips', () => {
  const inventory = { version: 1, updatedAt: '2026-11-11T10:00:00.000Z', plants: [{ id: 'a', notes: [{ text: 'é' }] }] };
  const text = serializeInventory(inventory);
  assert.ok(text.endsWith('}\n'));
  assert.ok(text.includes('\n  "plants": ['));
  assert.deepEqual(JSON.parse(text), inventory);
});

test('detects when the synchronized copy is newer than the page', () => {
  const older = { updatedAt: '2026-11-11T09:00:00.000Z' };
  const newer = { updatedAt: '2026-11-11T10:00:00.000Z' };
  assert.equal(isNewerInventory(newer, older), true);
  assert.equal(isNewerInventory(older, newer), false);
  assert.equal(isNewerInventory(newer, newer), false);
  assert.equal(isNewerInventory(newer, { updatedAt: null }), true);
  assert.equal(isNewerInventory({ updatedAt: null }, newer), false);
  assert.equal(isNewerInventory(null, newer), false);
});
