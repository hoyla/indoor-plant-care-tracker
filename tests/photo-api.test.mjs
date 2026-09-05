import assert from 'node:assert/strict';
import test from 'node:test';

import { handlePhotoUploadRequest } from '../edge-functions/api/photos/index.js';
import { handlePhotoObjectRequest } from '../edge-functions/api/photos/[[key]].js';

const origin = 'https://plants.example';
const photoKey = 'plants/sample-plant/6c5ee754-6f29-4f0b-a866-08354ad4e13c.jpg';

class MemoryPhotoStore {
  photos = new Map([[photoKey, new TextEncoder().encode('jpeg bytes').buffer]]);
  saved = null;
  deleted = [];

  async set(key, photo, options) {
    this.saved = { key, photo, options };
    this.photos.set(key, photo);
  }

  async get(key, options) {
    assert.deepEqual(options, { type: 'arrayBuffer', consistency: 'strong' });
    return this.photos.get(key) ?? null;
  }

  async getMetadata(key, options) {
    assert.deepEqual(options, { consistency: 'strong' });
    return this.photos.has(key) ? { contentType: 'image/jpeg' } : null;
  }

  async delete(key) {
    this.deleted.push(key);
    this.photos.delete(key);
  }
}

function jpegBytes(extraBytes = []) {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xdb, ...extraBytes]);
}

function uploadRequest(plantId = 'sample-plant', body = jpegBytes(), headers = {}) {
  return new Request(`${origin}/api/photos?plantId=${encodeURIComponent(plantId)}`, {
    method: 'POST',
    headers: { 'content-type': 'image/jpeg', origin, ...headers },
    body,
  });
}

function objectRequest(method = 'GET', key = photoKey, headers = {}) {
  return new Request(`${origin}/api/photos/${key}`, {
    method,
    headers: { ...(method === 'DELETE' ? { origin } : {}), ...headers },
  });
}

test('returns a clear error until Blob storage is available', async () => {
  const response = await handlePhotoUploadRequest({
    request: uploadRequest(),
  }, null);
  assert.equal(response.status, 503);
  assert.match(await response.text(), /not configured/i);
});

test('stores a small JPEG through the authenticated application route', async () => {
  const store = new MemoryPhotoStore();
  const response = await handlePhotoUploadRequest({
    request: uploadRequest(),
  }, store);

  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.match(payload.url, /^\/api\/photos\/plants\/sample-plant\/[a-f0-9-]+\.jpg$/);
  assert.match(store.saved.key, /^plants\/sample-plant\/[a-f0-9-]+\.jpg$/);
  assert.deepEqual(store.saved.options, { onlyIfNew: true });
  assert.deepEqual(new Uint8Array(store.saved.photo), jpegBytes());
});

test('rejects unsafe or cross-origin upload requests', async () => {
  const store = new MemoryPhotoStore();
  const crossOrigin = await handlePhotoUploadRequest({
    request: uploadRequest('sample-plant', jpegBytes(), { origin: 'https://attacker.example' }),
  }, store);
  assert.equal(crossOrigin.status, 403);

  const badPlant = await handlePhotoUploadRequest({
    request: uploadRequest('../inventory'),
  }, store);
  assert.equal(badPlant.status, 400);

  const wrongType = await handlePhotoUploadRequest({
    request: uploadRequest('sample-plant', jpegBytes(), { 'content-type': 'image/png' }),
  }, store);
  assert.equal(wrongType.status, 415);

  const disguisedFile = await handlePhotoUploadRequest({
    request: uploadRequest('sample-plant', new TextEncoder().encode('not a jpeg')),
  }, store);
  assert.equal(disguisedFile.status, 415);

  const oversized = await handlePhotoUploadRequest({
    request: uploadRequest('sample-plant', jpegBytes(), { 'content-length': String(901 * 1024) }),
  }, store);
  assert.equal(oversized.status, 413);
});

test('serves uploaded photos through the private application route', async () => {
  const store = new MemoryPhotoStore();
  const response = await handlePhotoObjectRequest({ request: objectRequest() }, store);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.match(response.headers.get('cache-control'), /private/);
  assert.equal(response.headers.get('vary'), 'Cookie');
  assert.equal(new TextDecoder().decode(await response.arrayBuffer()), 'jpeg bytes');

  const head = await handlePhotoObjectRequest({ request: objectRequest('HEAD') }, store);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('deletes only valid same-origin photo paths', async () => {
  const store = new MemoryPhotoStore();
  const crossOrigin = await handlePhotoObjectRequest({
    request: objectRequest('DELETE', photoKey, { origin: 'https://attacker.example' }),
  }, store);
  assert.equal(crossOrigin.status, 403);
  assert.deepEqual(store.deleted, []);

  const invalid = await handlePhotoObjectRequest({ request: objectRequest('DELETE', 'plants/../inventory.json') }, store);
  assert.equal(invalid.status, 404);

  const response = await handlePhotoObjectRequest({ request: objectRequest('DELETE') }, store);
  assert.equal(response.status, 204);
  assert.deepEqual(store.deleted, [photoKey]);
});

test('returns 404 for missing photos and 405 for unsupported methods', async () => {
  const store = new MemoryPhotoStore();
  const missing = await handlePhotoObjectRequest({
    request: objectRequest('GET', 'plants/sample-plant/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg'),
  }, store);
  assert.equal(missing.status, 404);

  const unsupported = await handlePhotoObjectRequest({ request: objectRequest('PUT') }, store);
  assert.equal(unsupported.status, 405);
  assert.equal(unsupported.headers.get('allow'), 'GET, HEAD, DELETE');
});
