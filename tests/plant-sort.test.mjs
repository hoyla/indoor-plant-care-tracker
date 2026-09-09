import assert from 'node:assert/strict';
import test from 'node:test';

import { comparePlantOrder, ROOM_ORDER } from '../plant-sort.js';

const sort = (plants, needsCheck = false) => [...plants].sort((left, right) => comparePlantOrder(left, right, { needsCheck }));

test('plants sort by the configured room order and then alphabetically', () => {
  assert.deepEqual(ROOM_ORDER, ['Living Room', 'Kitchen', 'Bedroom', 'Study', 'Bathroom', 'Porch']);
  const plants = [
    { room: 'Kitchen', name: 'Spider Plant' },
    { room: 'Living Room', name: 'ZZ Plant' },
    { room: 'Unranked room', name: 'Jade Plant' },
    { room: 'Living Room', name: 'Palm' },
    { room: 'Kitchen', name: 'Orchid' },
  ];

  assert.deepEqual(sort(plants).map((plant) => plant.name), [
    'Palm', 'ZZ Plant', 'Orchid', 'Spider Plant', 'Jade Plant',
  ]);
});

test('needs-checking order puts never checked and most overdue first', () => {
  const plants = [
    { room: 'Living Room', name: 'Due today', dueState: 'due', dueRemaining: 0 },
    { room: 'Kitchen', name: 'Never checked', dueState: 'never', dueRemaining: Number.NEGATIVE_INFINITY },
    { room: 'Kitchen', name: 'Overdue two days', dueState: 'overdue', dueRemaining: -2 },
    { room: 'Living Room', name: 'Overdue six days', dueState: 'overdue', dueRemaining: -6 },
    { room: 'Living Room', name: 'Check tomorrow', dueState: 'soon', dueRemaining: 1 },
  ];

  assert.deepEqual(sort(plants, true).map((plant) => plant.name), [
    'Never checked', 'Overdue six days', 'Overdue two days', 'Due today', 'Check tomorrow',
  ]);
});

test('room and plant name break equal-urgency ties', () => {
  const plants = [
    { room: 'Kitchen', name: 'Spider Plant', dueState: 'due', dueRemaining: 0 },
    { room: 'Living Room', name: 'ZZ Plant', dueState: 'due', dueRemaining: 0 },
    { room: 'Living Room', name: 'Aloe', dueState: 'due', dueRemaining: 0 },
  ];

  assert.deepEqual(sort(plants, true).map((plant) => plant.name), ['Aloe', 'ZZ Plant', 'Spider Plant']);
});
