import assert from 'node:assert/strict';
import test from 'node:test';

import { comparePlantOrder, ROOM_ORDER } from '../plant-sort.js';

const sort = (plants, needsCheck = false) => [...plants].sort((left, right) => comparePlantOrder(left, right, { needsCheck }));

test('plants sort by the example room order and then alphabetically', () => {
  assert.deepEqual(ROOM_ORDER, ['Bright room', 'Lower-light room']);
  const plants = [
    { room: 'Lower-light room', name: 'Spider Plant' },
    { room: 'Bright room', name: 'ZZ Plant' },
    { room: 'Unranked room', name: 'Jade Plant' },
    { room: 'Bright room', name: 'Palm' },
    { room: 'Lower-light room', name: 'Orchid' },
  ];

  assert.deepEqual(sort(plants).map((plant) => plant.name), [
    'Palm', 'ZZ Plant', 'Orchid', 'Spider Plant', 'Jade Plant',
  ]);
});

test('needs-checking order puts never checked and most overdue first', () => {
  const plants = [
    { room: 'Bright room', name: 'Due today', dueState: 'due', dueRemaining: 0 },
    { room: 'Lower-light room', name: 'Never checked', dueState: 'never', dueRemaining: Number.NEGATIVE_INFINITY },
    { room: 'Lower-light room', name: 'Overdue two days', dueState: 'overdue', dueRemaining: -2 },
    { room: 'Bright room', name: 'Overdue six days', dueState: 'overdue', dueRemaining: -6 },
    { room: 'Bright room', name: 'Check tomorrow', dueState: 'soon', dueRemaining: 1 },
  ];

  assert.deepEqual(sort(plants, true).map((plant) => plant.name), [
    'Never checked', 'Overdue six days', 'Overdue two days', 'Due today', 'Check tomorrow',
  ]);
});

test('room and plant name break equal-urgency ties', () => {
  const plants = [
    { room: 'Lower-light room', name: 'Spider Plant', dueState: 'due', dueRemaining: 0 },
    { room: 'Bright room', name: 'ZZ Plant', dueState: 'due', dueRemaining: 0 },
    { room: 'Bright room', name: 'Aloe', dueState: 'due', dueRemaining: 0 },
  ];

  assert.deepEqual(sort(plants, true).map((plant) => plant.name), ['Aloe', 'ZZ Plant', 'Spider Plant']);
});
