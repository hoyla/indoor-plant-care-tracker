import { getStore } from '@edgeone/pages-blob';

const STORE_NAME = 'plant-photos';
const PHOTO_PATH_PREFIX = '/api/photos/';
const PHOTO_KEY_PATTERN = /^plants\/[a-z0-9-]{1,80}\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.jpg$/;

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

function photoKey(request) {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith(PHOTO_PATH_PREFIX)) return null;

  try {
    const key = pathname
      .slice(PHOTO_PATH_PREFIX.length)
      .split('/')
      .map((segment) => decodeURIComponent(segment))
      .join('/');
    return PHOTO_KEY_PATTERN.test(key) ? key : null;
  } catch {
    return null;
  }
}

function photoHeaders() {
  return {
    'Cache-Control': 'private, max-age=86400',
    'Content-Type': 'image/jpeg',
    'Referrer-Policy': 'no-referrer',
    'Vary': 'Cookie',
    'X-Content-Type-Options': 'nosniff',
  };
}

export async function handlePhotoObjectRequest(context, store = resolvePhotoStore()) {
  const { request } = context;
  if (!store || typeof store.get !== 'function' || typeof store.getMetadata !== 'function' || typeof store.delete !== 'function') {
    return jsonResponse({ error: 'Plant photo storage is not configured.' }, 503);
  }

  const key = photoKey(request);
  if (!key) return jsonResponse({ error: 'Photo not found.' }, 404);

  if (request.method === 'GET' || request.method === 'HEAD') {
    try {
      if (request.method === 'HEAD') {
        const metadata = await store.getMetadata(key, { consistency: 'strong' });
        if (metadata === null) return jsonResponse({ error: 'Photo not found.' }, 404);
        return new Response(null, { status: 200, headers: photoHeaders() });
      }
      const photo = await store.get(key, { type: 'arrayBuffer', consistency: 'strong' });
      if (photo === null) return jsonResponse({ error: 'Photo not found.' }, 404);
      return new Response(photo, { status: 200, headers: photoHeaders() });
    } catch (error) {
      console.error('Unable to read plant photo.', error);
      return jsonResponse({ error: 'Photo could not be loaded.' }, 502);
    }
  }

  if (request.method === 'DELETE') {
    const requestUrl = new URL(request.url);
    if (request.headers.get('origin') !== requestUrl.origin) {
      return jsonResponse({ error: 'Cross-origin deletions are not allowed.' }, 403);
    }
    try {
      await store.delete(key);
      return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      console.error('Unable to delete plant photo.', error);
      return jsonResponse({ error: 'Photo could not be deleted.' }, 502);
    }
  }

  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET, HEAD, DELETE' });
}

export default function onRequest(context) {
  return handlePhotoObjectRequest(context);
}
