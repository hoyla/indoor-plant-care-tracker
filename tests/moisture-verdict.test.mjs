import assert from 'node:assert/strict';
import test from 'node:test';

import { formatMeterTarget, moistureVerdict } from '../moisture-verdict.js';

const prayerPlant = { waterAt: [4, 5], avoidAbove: 8 };
const fern = { dryBelow: 2, waterAt: [4, 5], avoidAbove: 8 };
const succulent = { waterAt: [1, 2] };
const reading = (value, daysAgo = 0) => ({ value, checkedAt: new Date(Date.now() - (daysAgo * 86_400_000)).toISOString() });

test('formats single and ranged meter targets', () => {
  assert.equal(formatMeterTarget(prayerPlant), '4–5/10');
  assert.equal(formatMeterTarget({ waterAt: [3, 3] }), '3/10');
  assert.equal(formatMeterTarget(null), '');
});

test('profiles without a dependable meter target say so instead of guessing', () => {
  assert.equal(moistureVerdict(null, [reading(2)]).state, 'unmetered');
  assert.equal(moistureVerdict(undefined, []).state, 'unmetered');
});

test('a plant with a target but no reading reports the target', () => {
  const verdict = moistureVerdict(prayerPlant, []);
  assert.equal(verdict.state, 'unread');
  assert.match(verdict.detail, /4–5\/10/);
});

test('readings at or below the target call for water', () => {
  assert.equal(moistureVerdict(prayerPlant, [reading(5)]).state, 'water');
  assert.equal(moistureVerdict(prayerPlant, [reading(4)]).label, 'Water now');
  assert.match(moistureVerdict(prayerPlant, [reading(4)]).detail, /At the 4–5\/10 target/);
  assert.match(moistureVerdict(prayerPlant, [reading(1)]).detail, /Drier than/);
  assert.match(moistureVerdict(succulent, [reading(0)]).detail, /At the 1–2\/10 target/);
});

test('a range plant below its named dry bound is a fault, not just a trigger', () => {
  assert.equal(moistureVerdict(fern, [reading(1)]).state, 'dry');
  assert.equal(moistureVerdict(fern, [reading(0)]).label, 'Too dry. Water now');
  assert.match(moistureVerdict(fern, [reading(1)]).detail, /Below 2\/10/);
  assert.equal(moistureVerdict(fern, [reading(2)]).state, 'water');
  assert.match(moistureVerdict(fern, [reading(2)]).detail, /Drier than/);
  assert.equal(moistureVerdict(fern, [reading(5)]).state, 'water');
  assert.equal(moistureVerdict(fern, [reading(6)]).state, 'hold');
  assert.equal(moistureVerdict(fern, [reading(9)]).state, 'wet');
});

test('a cycle plant with no dry bound is never too dry, only ready for water', () => {
  assert.equal(moistureVerdict(succulent, [reading(0)]).state, 'water');
  assert.equal(moistureVerdict(prayerPlant, [reading(0)]).state, 'water');
});

test('readings above the target but below a named wet band need no water', () => {
  assert.equal(moistureVerdict(prayerPlant, [reading(6)]).state, 'hold');
  assert.equal(moistureVerdict(prayerPlant, [reading(7)]).state, 'hold');
});

test('without a named wet band, a thorough soak is simply no water needed', () => {
  for (const value of [3, 6, 9, 10]) {
    const verdict = moistureVerdict(succulent, [reading(value)]);
    assert.equal(verdict.state, 'hold', `a reading of ${value} should not be flagged as wet`);
    assert.match(verdict.detail, /Above the 1–2\/10 target/);
  }
  assert.equal(moistureVerdict(succulent, [reading(10, 5), reading(10)]).state, 'hold');
});

test('a single reading in a named wet band is a hold, not an alarm', () => {
  const verdict = moistureVerdict(prayerPlant, [reading(9)]);
  assert.equal(verdict.state, 'wet');
  assert.match(verdict.detail, /avoid sustained readings of 8–10/);
});

test('two wet-band readings several days apart flag sustained wetness', () => {
  const verdict = moistureVerdict(prayerPlant, [reading(8, 4), reading(9)]);
  assert.equal(verdict.state, 'sustained');
  assert.match(verdict.detail, /after 4 days/);
});

test('wet-band readings close together or after a dry one are not sustained', () => {
  assert.equal(moistureVerdict(prayerPlant, [reading(9, 1), reading(9)]).state, 'wet');
  assert.equal(moistureVerdict(prayerPlant, [reading(2, 5), reading(9)]).state, 'wet');
});

test('uses the most recent reading regardless of array order', () => {
  assert.equal(moistureVerdict(prayerPlant, [reading(9), reading(2, 3)]).state, 'wet');
  assert.equal(moistureVerdict(prayerPlant, [reading(2, 3), reading(9)]).state, 'wet');
  assert.equal(moistureVerdict(prayerPlant, [reading(9, 3), reading(2)]).state, 'water');
});
