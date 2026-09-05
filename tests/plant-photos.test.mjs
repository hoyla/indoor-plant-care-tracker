import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  legacyPhotoCaptureSuggestion,
  originalPhotoForSpecimen,
  orderedPlantPhotos,
  suggestMainPhoto,
  uploadedPhotoPaths,
  withPreservedMainPhoto,
} from '../plant-photos.js';

const inventory = JSON.parse(await readFile(new URL('../data/inventory.json', import.meta.url), 'utf8'));

test('orders a specimen photo timeline newest first with stable same-day ordering', () => {
  const photos = [
    { id: 'old', capturedOn: '2024-01-10', addedAt: '2024-01-11T10:00:00.000Z' },
    { id: 'newer-upload', capturedOn: '2024-02-10', addedAt: '2024-03-02T10:00:00.000Z' },
    { id: 'older-upload', capturedOn: '2024-02-10', addedAt: '2024-03-01T10:00:00.000Z' },
  ];
  assert.deepEqual(orderedPlantPhotos(photos).map((photo) => photo.id), ['newer-upload', 'older-upload', 'old']);
  assert.deepEqual(photos.map((photo) => photo.id), ['old', 'newer-upload', 'older-upload']);
});

test('keeps undated preserved photos after dated timeline entries', () => {
  const photos = [
    { id: 'undated', capturedOn: null, addedAt: '2026-09-04T12:00:00.000Z' },
    { id: 'dated', capturedOn: '2026-07-20', addedAt: '2026-07-20T12:00:00.000Z' },
  ];
  assert.deepEqual(orderedPlantPhotos(photos).map((photo) => photo.id), ['dated', 'undated']);
});

test('preserves an unrecorded main image once before it is replaced', () => {
  const preserved = withPreservedMainPhoto([], 'images/original.jpg', {
    id: 'photo-original',
    addedAt: '2026-09-04T12:00:00.000Z',
  });
  assert.deepEqual(preserved, [{
    id: 'photo-original',
    url: 'images/original.jpg',
    capturedOn: null,
    addedAt: '2026-09-04T12:00:00.000Z',
    note: '',
  }]);
  assert.equal(withPreservedMainPhoto(preserved, 'images/original.jpg', {
    id: 'duplicate',
    addedAt: '2026-09-04T13:00:00.000Z',
  }).length, 1);
  assert.deepEqual(withPreservedMainPhoto([], 'images/placeholder.svg', {
    id: 'placeholder',
    addedAt: '2026-09-04T13:00:00.000Z',
  }), []);
});

test('only suggests replacing an unknown-date legacy main image with a current photo', () => {
  const legacy = { image: 'images/plant.jpg', photos: [] };
  assert.equal(suggestMainPhoto(legacy, '2024-01-01', '2024-02-01'), false);
  assert.equal(suggestMainPhoto(legacy, '2024-02-01', '2024-02-01'), true);

  const dated = { image: '/api/photos/plants/plant/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg', photos: [{
    url: '/api/photos/plants/plant/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg',
    capturedOn: '2024-01-10',
  }] };
  assert.equal(suggestMainPhoto(dated, '2024-01-09', '2024-02-01'), false);
  assert.equal(suggestMainPhoto(dated, '2024-01-11', '2024-02-01'), true);
});

test('collects each uploaded object once for specimen deletion', () => {
  const main = '/api/photos/plants/plant/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg';
  const historical = '/api/photos/plants/plant/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg';
  assert.deepEqual([...uploadedPhotoPaths({ image: main, photos: [{ url: main }, { url: historical }, { url: 'images/plant.jpg' }] })], [main, historical]);
});

test('the public template contains no private legacy-photo dates', () => {
  assert.equal(legacyPhotoCaptureSuggestion('images/private-photo.jpg'), null);
});

test('sample specimens contain no recoverable private originals', () => {
  assert.ok(inventory.plants.every((specimen) => specimen.image === 'images/placeholder.svg'));
  assert.ok(inventory.plants.every((specimen) => originalPhotoForSpecimen(specimen.id) === null));
});
