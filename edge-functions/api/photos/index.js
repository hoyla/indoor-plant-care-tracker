import { getStore } from '@edgeone/pages-blob';

const STORE_NAME = 'plant-photos';
const CONTENT_TYPE = 'image/jpeg';
const MAX_UPLOAD_BYTES = 900 * 1024;

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'application/json; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

function resolvePhotoStore() {
  try {
    return getStore(STORE_NAME);
  } catch {
    return null;
  }
}

export async function handlePhotoUploadRequest(context, store = resolvePhotoStore()) {
  const { request } = context;

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
  }

  if (!store || typeof store.set !== 'function') {
    return jsonResponse({ error: 'Plant photo storage is not configured.' }, 503);
  }

  const requestUrl = new URL(request.url);
  if (request.headers.get('origin') !== requestUrl.origin) {
    return jsonResponse({ error: 'Cross-origin uploads are not allowed.' }, 403);
  }

  if (request.headers.get('content-type')?.toLocaleLowerCase() !== CONTENT_TYPE) {
    return jsonResponse({ error: 'Plant photos must be JPEG images.' }, 415);
  }

  const declaredSize = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_UPLOAD_BYTES) {
    return jsonResponse({ error: 'The prepared photo is too large. Crop it more tightly and try again.' }, 413);
  }

  const plantId = requestUrl.searchParams.get('plantId')?.trim() || '';
  if (!/^[a-z0-9-]{1,80}$/.test(plantId)) {
    return jsonResponse({ error: 'Plant id is invalid.' }, 400);
  }

  let photo;
  try {
    photo = await request.arrayBuffer();
  } catch {
    return jsonResponse({ error: 'The prepared photo could not be read.' }, 400);
  }
  if (!photo.byteLength || photo.byteLength > MAX_UPLOAD_BYTES) {
    return jsonResponse({ error: photo.byteLength ? 'The prepared photo is too large. Crop it more tightly and try again.' : 'The prepared photo is empty.' }, photo.byteLength ? 413 : 400);
  }
  const signature = new Uint8Array(photo, 0, Math.min(photo.byteLength, 3));
  if (signature.length < 3 || signature[0] !== 0xff || signature[1] !== 0xd8 || signature[2] !== 0xff) {
    return jsonResponse({ error: 'The prepared photo is not a valid JPEG image.' }, 415);
  }

  const key = `plants/${plantId}/${crypto.randomUUID()}.jpg`;
  try {
    await store.set(key, photo, { onlyIfNew: true });
    return jsonResponse({ url: `/api/photos/${key}` }, 201);
  } catch (error) {
    console.error('Unable to store plant photo.', error);
    return jsonResponse({ error: 'Photo could not be stored. Please try again.' }, 502);
  }
}

export default function onRequest(context) {
  return handlePhotoUploadRequest(context);
}
