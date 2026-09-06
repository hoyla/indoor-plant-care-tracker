import assert from 'node:assert/strict';
import test from 'node:test';

import { handleInventoryRequest, validateInventory } from '../edge-functions/api/inventory.js';

class MemoryStore {
  value = null;

  async get(key, options) {
    assert.equal(key, 'plant_inventory_v1');
    return this.value && options?.type === 'json' ? JSON.parse(this.value) : this.value;
  }

  async put(key, value) {
    assert.equal(key, 'plant_inventory_v1');
    this.value = value;
  }
}

function request(method = 'GET', body, headers = {}) {
  return new Request('https://plants.example/api/inventory', {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function validInventory() {
  return {
    version: 1,
    updatedAt: null,
    plants: [{
      id: 'sample-plant',
      profileId: 'aloe-vera',
      name: 'Sample Plant',
      room: 'Bright room',
      placement: 'Beside the window',
      image: 'images/sample-plant.jpg',
      imageAlt: 'Sample Plant in the kitchen',
      photos: [{
        id: 'photo-1234',
        url: '/api/photos/plants/sample-plant/6c5ee754-6f29-4f0b-a866-08354ad4e13c.jpg',
        capturedOn: '2026-07-19',
        addedAt: '2026-07-20T08:00:00.000Z',
        note: 'New leaf unfurled',
      }],
      status: 'New',
      condition: '',
      history: [],
      moistureReadings: [{
        id: 'reading-1234',
        value: 7,
        checkedAt: '2026-07-21T10:30:00.000Z',
        note: 'Recently flushed',
        nextCheckDays: 3,
      }],
      notes: [{
        id: 'note-1234',
        createdAt: '2026-07-20T09:00:00.000Z',
        eventDate: '2026-07-27',
        type: 'future-action',
        text: 'Feed at half strength',
      }],
    }],
  };
}

test('returns a clear error until a KV namespace is bound', async () => {
  const response = await handleInventoryRequest({ request: request() }, null);
  assert.equal(response.status, 503);
  assert.match(await response.text(), /not configured/i);
});

test('returns null when synchronized inventory has not been initialized', async () => {
  const response = await handleInventoryRequest({ request: request() }, new MemoryStore());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { inventory: null });
  assert.match(response.headers.get('cache-control'), /no-store/);
});

test('validates and persists an inventory update', async () => {
  const store = new MemoryStore();
  const response = await handleInventoryRequest({
    request: request('PUT', validInventory(), {
      'content-type': 'application/json',
      origin: 'https://plants.example',
    }),
  }, store);

  assert.equal(response.status, 200);
  const saved = (await response.json()).inventory;
  assert.equal(saved.plants[0].room, 'Bright room');
  assert.equal(saved.plants[0].moistureReadings[0].value, 7);
  assert.equal(saved.plants[0].moistureReadings[0].nextCheckDays, 3);
  assert.equal(saved.plants[0].notes[0].text, 'Feed at half strength');
  assert.equal(saved.plants[0].notes[0].type, 'future-action');
  assert.equal(saved.plants[0].notes[0].eventDate, '2026-07-27');
  assert.equal(saved.plants[0].photos[0].capturedOn, '2026-07-19');
  assert.equal(saved.plants[0].photos[0].note, 'New leaf unfurled');
  assert.match(saved.updatedAt, /^\d{4}-\d{2}-\d{2}T/);

  const getResponse = await handleInventoryRequest({ request: request() }, store);
  assert.deepEqual((await getResponse.json()).inventory, saved);
});

test('rejects cross-origin updates', async () => {
  const response = await handleInventoryRequest({
    request: request('PUT', validInventory(), {
      'content-type': 'application/json',
      origin: 'https://attacker.example',
    }),
  }, new MemoryStore());
  assert.equal(response.status, 403);
});

test('rejects duplicate plant ids and unsafe image paths', () => {
  const duplicate = validInventory();
  duplicate.plants.push({ ...duplicate.plants[0] });
  assert.throws(() => validateInventory(duplicate), /unique id/i);

  const externalImage = validInventory();
  externalImage.plants[0].image = 'https://example.com/plant.jpg';
  assert.throws(() => validateInventory(externalImage), /approved photo path/i);
});

test('allows an authenticated uploaded-photo route', () => {
  const uploaded = validInventory();
  uploaded.plants[0].image = '/api/photos/plants/sample-plant/6c5ee754-6f29-4f0b-a866-08354ad4e13c.jpg';
  assert.equal(validateInventory(uploaded).plants[0].image, uploaded.plants[0].image);
});

test('allows a new species with a pending care profile', () => {
  const pending = validInventory();
  pending.plants[0] = {
    ...pending.plants[0],
    id: 'mystery-plant-1234',
    profileId: null,
    name: 'Mystery plant',
    image: 'images/placeholder.svg',
    photos: [],
  };
  assert.equal(validateInventory(pending).plants[0].profileId, null);
});

test('supports recovery status and a bounded recovery log', () => {
  const recovery = validInventory();
  recovery.plants[0].status = 'Needs attention';
  assert.equal(validateInventory(recovery).plants[0].status, 'Needs attention');

  recovery.plants[0].notes = Array.from({ length: 101 }, (_, index) => ({
    id: `entry-${index}`,
    createdAt: '2026-07-28T12:00:00.000Z',
    eventDate: '2026-07-28',
    type: 'observation',
    text: `Observation ${index}`,
  }));
  assert.throws(() => validateInventory(recovery), /notes are invalid/i);
});

test('keeps old inventories compatible and validates care-log entries', () => {
  const oldInventory = validInventory();
  delete oldInventory.plants[0].moistureReadings;
  delete oldInventory.plants[0].notes;
  delete oldInventory.plants[0].photos;
  const normalized = validateInventory(oldInventory);
  assert.deepEqual(normalized.plants[0].moistureReadings, []);
  assert.deepEqual(normalized.plants[0].notes, []);
  assert.deepEqual(normalized.plants[0].photos, []);

  const oldNote = validInventory();
  delete oldNote.plants[0].notes[0].type;
  delete oldNote.plants[0].notes[0].eventDate;
  const normalizedOldNote = validateInventory(oldNote).plants[0].notes[0];
  assert.equal(normalizedOldNote.type, 'note');
  assert.equal(normalizedOldNote.eventDate, '2026-07-20');

  const invalidReading = validInventory();
  invalidReading.plants[0].moistureReadings[0].value = 11;
  assert.throws(() => validateInventory(invalidReading), /0 to 10/i);

  const invalidNextCheck = validInventory();
  invalidNextCheck.plants[0].moistureReadings[0].nextCheckDays = 0;
  assert.throws(() => validateInventory(invalidNextCheck), /1 to 365 days/i);

  const legacyReading = validInventory();
  delete legacyReading.plants[0].moistureReadings[0].nextCheckDays;
  assert.equal('nextCheckDays' in validateInventory(legacyReading).plants[0].moistureReadings[0], false);

  const invalidNote = validInventory();
  invalidNote.plants[0].notes[0].createdAt = 'not-a-date';
  assert.throws(() => validateInventory(invalidNote), /valid date/i);

  const invalidType = validInventory();
  invalidType.plants[0].notes[0].type = 'fertilising';
  assert.throws(() => validateInventory(invalidType), /unsupported type/i);

  const invalidEventDate = validInventory();
  invalidEventDate.plants[0].notes[0].eventDate = '2026-02-30';
  assert.throws(() => validateInventory(invalidEventDate), /valid date/i);

  const completedAction = validInventory();
  completedAction.plants[0].notes[0].completedAt = '2026-07-27T10:00:00.000Z';
  assert.equal(validateInventory(completedAction).plants[0].notes[0].completedAt, '2026-07-27T10:00:00.000Z');

  const completedObservation = validInventory();
  completedObservation.plants[0].notes[0].type = 'observation';
  completedObservation.plants[0].notes[0].completedAt = '2026-07-27T10:00:00.000Z';
  assert.throws(() => validateInventory(completedObservation), /unless it is a future action/i);
});

test('validates bounded dated photo histories', () => {
  const undated = validInventory();
  undated.plants[0].photos[0].capturedOn = null;
  assert.equal(validateInventory(undated).plants[0].photos[0].capturedOn, null);

  const invalidDate = validInventory();
  invalidDate.plants[0].photos[0].capturedOn = '2026-02-30';
  assert.throws(() => validateInventory(invalidDate), /capture date must be a valid date/i);

  const invalidDateType = validInventory();
  invalidDateType.plants[0].photos[0].capturedOn = 0;
  assert.throws(() => validateInventory(invalidDateType), /capture date must be text/i);

  const duplicateIds = validInventory();
  duplicateIds.plants[0].photos.push({ ...duplicateIds.plants[0].photos[0] });
  assert.throws(() => validateInventory(duplicateIds), /photo ids must be unique/i);

  const unsafePath = validInventory();
  unsafePath.plants[0].photos[0].url = 'https://example.com/tracker.jpg';
  assert.throws(() => validateInventory(unsafePath), /approved photo path/i);

  const wrongSpecimen = validInventory();
  wrongSpecimen.plants[0].photos[0].url = '/api/photos/plants/another-plant/6c5ee754-6f29-4f0b-a866-08354ad4e13c.jpg';
  assert.throws(() => validateInventory(wrongSpecimen), /belong to the same plant/i);

  const tooMany = validInventory();
  tooMany.plants[0].photos = Array.from({ length: 101 }, (_, index) => ({
    ...tooMany.plants[0].photos[0],
    id: `photo-${index}`,
  }));
  assert.throws(() => validateInventory(tooMany), /photos are invalid/i);
});

test('migrates legacy follow-up dates into standalone future actions', () => {
  const legacy = validInventory();
  legacy.plants[0].notes[0] = {
    id: 'treatment-1234',
    createdAt: '2026-07-20T09:00:00.000Z',
    eventDate: '2026-07-19',
    type: 'treatment',
    followUpDate: '2026-07-27',
    completedAt: '2026-07-27T10:00:00.000Z',
    text: 'Repeat the treatment',
  };

  const notes = validateInventory(legacy).plants[0].notes;
  assert.equal(notes.length, 2);
  assert.deepEqual(notes[0], {
    id: 'treatment-1234',
    createdAt: '2026-07-20T09:00:00.000Z',
    eventDate: '2026-07-19',
    type: 'treatment',
    text: 'Repeat the treatment',
  });
  assert.deepEqual(notes[1], {
    id: 'future-action-treatment-1234',
    createdAt: '2026-07-20T09:00:00.000Z',
    eventDate: '2026-07-27',
    type: 'future-action',
    text: 'Repeat the treatment',
    completedAt: '2026-07-27T10:00:00.000Z',
  });
});
