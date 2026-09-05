const INVENTORY_KEY = 'plant_inventory_v1';
const MAX_BODY_BYTES = 250_000;
const MAX_PLANTS = 200;
const STATUSES = new Set(['Established', 'New', 'Needs attention', 'Recovering', 'Seasonal', 'Monitoring']);
const NOTE_TYPES = new Set(['note', 'observation', 'pest-check', 'treatment', 'growth', 'repotting', 'future-action']);
const encoder = new TextEncoder();

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

function text(value, field, maximum, { required = false } = {}) {
  if (value == null && !required) return '';
  if (typeof value !== 'string') throw new Error(`${field} must be text.`);
  const normalized = value.trim();
  if (required && !normalized) throw new Error(`${field} is required.`);
  if (normalized.length > maximum) throw new Error(`${field} is too long.`);
  return normalized;
}

function timestamp(value, field) {
  const normalized = text(value, field, 40, { required: true });
  if (Number.isNaN(Date.parse(normalized))) throw new Error(`${field} must be a valid date.`);
  return normalized;
}

function calendarDate(value, field) {
  const normalized = text(value, field, 10, { required: true });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error(`${field} must be a valid date.`);
  const [year, month, day] = normalized.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new Error(`${field} must be a valid date.`);
  }
  return normalized;
}

function activityId(value, field) {
  const normalized = text(value, field, 80, { required: true });
  if (!/^[a-z0-9-]+$/.test(normalized)) throw new Error(`${field} contains unsupported characters.`);
  return normalized;
}

function photoPath(value, field, plantId = '') {
  const path = text(value, field, 300, { required: true });
  const isRepositoryImage = /^images\/[a-zA-Z0-9._/-]+$/.test(path);
  const isUploadedPhoto = /^\/api\/photos\/plants\/[a-z0-9-]+\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.jpg$/.test(path);
  if (!isRepositoryImage && !isUploadedPhoto) throw new Error(`${field} must be an approved photo path.`);
  if (isUploadedPhoto && plantId && !path.startsWith(`/api/photos/plants/${plantId}/`)) {
    throw new Error(`${field} must belong to the same plant.`);
  }
  return path;
}

function normalizePlant(plant, index) {
  if (!plant || typeof plant !== 'object' || Array.isArray(plant)) throw new Error(`Plant ${index + 1} is invalid.`);

  const id = text(plant.id, `Plant ${index + 1} id`, 80, { required: true });
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Plant ${index + 1} id contains unsupported characters.`);

  const profileId = plant.profileId == null ? null : text(plant.profileId, `Plant ${index + 1} profile`, 80, { required: true });
  if (profileId && !/^[a-z0-9-]+$/.test(profileId)) throw new Error(`Plant ${index + 1} profile is invalid.`);

  const status = text(plant.status || 'New', `Plant ${index + 1} status`, 30, { required: true });
  if (!STATUSES.has(status)) throw new Error(`Plant ${index + 1} has an unsupported status.`);

  const image = photoPath(plant.image || 'images/placeholder.svg', `Plant ${index + 1} image`, id);

  const history = plant.history == null ? [] : plant.history;
  if (!Array.isArray(history) || history.length > 20) throw new Error(`Plant ${index + 1} history is invalid.`);
  const moistureReadings = plant.moistureReadings == null ? [] : plant.moistureReadings;
  if (!Array.isArray(moistureReadings) || moistureReadings.length > 30) throw new Error(`Plant ${index + 1} moisture readings are invalid.`);
  const notes = plant.notes == null ? [] : plant.notes;
  if (!Array.isArray(notes) || notes.length > 100) throw new Error(`Plant ${index + 1} notes are invalid.`);
  const photos = plant.photos == null ? [] : plant.photos;
  if (!Array.isArray(photos) || photos.length > 100) throw new Error(`Plant ${index + 1} photos are invalid.`);
  const photoIds = new Set();

  return {
    id,
    profileId,
    name: text(plant.name, `Plant ${index + 1} name`, 100, { required: true }),
    room: text(plant.room, `Plant ${index + 1} room`, 80, { required: true }),
    placement: text(plant.placement, `Plant ${index + 1} placement`, 500),
    image,
    imageAlt: text(plant.imageAlt, `Plant ${index + 1} image description`, 300),
    photos: photos.map((photo, photoIndex) => {
      if (!photo || typeof photo !== 'object' || Array.isArray(photo)) throw new Error(`Plant ${index + 1} photo ${photoIndex + 1} is invalid.`);
      const photoId = activityId(photo.id, `Plant ${index + 1} photo ${photoIndex + 1} id`);
      if (photoIds.has(photoId)) throw new Error(`Plant ${index + 1} photo ids must be unique.`);
      photoIds.add(photoId);
      return {
        id: photoId,
        url: photoPath(photo.url, `Plant ${index + 1} photo ${photoIndex + 1} url`, id),
        capturedOn: photo.capturedOn == null || photo.capturedOn === ''
          ? null
          : calendarDate(photo.capturedOn, `Plant ${index + 1} photo ${photoIndex + 1} capture date`),
        addedAt: timestamp(photo.addedAt, `Plant ${index + 1} photo ${photoIndex + 1} added date`),
        note: text(photo.note, `Plant ${index + 1} photo ${photoIndex + 1} note`, 500),
      };
    }),
    status,
    condition: text(plant.condition, `Plant ${index + 1} condition`, 2_000),
    history: history.map((entry, historyIndex) => text(entry, `Plant ${index + 1} history item ${historyIndex + 1}`, 500, { required: true })),
    moistureReadings: moistureReadings.map((entry, readingIndex) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`Plant ${index + 1} moisture reading ${readingIndex + 1} is invalid.`);
      if (!Number.isInteger(entry.value) || entry.value < 0 || entry.value > 10) throw new Error(`Plant ${index + 1} moisture reading ${readingIndex + 1} must be from 0 to 10.`);
      return {
        id: activityId(entry.id, `Plant ${index + 1} moisture reading ${readingIndex + 1} id`),
        value: entry.value,
        checkedAt: timestamp(entry.checkedAt, `Plant ${index + 1} moisture reading ${readingIndex + 1} date`),
        note: text(entry.note, `Plant ${index + 1} moisture reading ${readingIndex + 1} note`, 500),
      };
    }),
    notes: (() => {
      const usedIds = new Set(notes.map((entry) => entry?.id).filter(Boolean));
      const normalized = notes.flatMap((entry, noteIndex) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`Plant ${index + 1} note ${noteIndex + 1} is invalid.`);
        const id = activityId(entry.id, `Plant ${index + 1} note ${noteIndex + 1} id`);
        const createdAt = timestamp(entry.createdAt, `Plant ${index + 1} note ${noteIndex + 1} date`);
        const type = text(entry.type || 'note', `Plant ${index + 1} note ${noteIndex + 1} type`, 20, { required: true });
        if (!NOTE_TYPES.has(type)) throw new Error(`Plant ${index + 1} note ${noteIndex + 1} has an unsupported type.`);
        const eventDate = entry.eventDate
          ? calendarDate(entry.eventDate, `Plant ${index + 1} note ${noteIndex + 1} event date`)
          : createdAt.slice(0, 10);
        const entryText = text(entry.text, `Plant ${index + 1} note ${noteIndex + 1} text`, 500, { required: true });
        const completedAt = entry.completedAt
          ? timestamp(entry.completedAt, `Plant ${index + 1} note ${noteIndex + 1} completion date`)
          : '';
        const legacyFollowUpDate = entry.followUpDate
          ? calendarDate(entry.followUpDate, `Plant ${index + 1} note ${noteIndex + 1} follow-up date`)
          : '';
        if (completedAt && type !== 'future-action' && !legacyFollowUpDate) {
          throw new Error(`Plant ${index + 1} note ${noteIndex + 1} cannot be completed unless it is a future action.`);
        }
        const normalizedEntry = {
          id,
          createdAt,
          eventDate,
          type,
          text: entryText,
          ...(entry.updatedAt ? { updatedAt: timestamp(entry.updatedAt, `Plant ${index + 1} note ${noteIndex + 1} update date`) } : {}),
          ...(completedAt && type === 'future-action' ? { completedAt } : {}),
        };
        if (!legacyFollowUpDate) return [normalizedEntry];

        let actionId = `future-action-${id}`.slice(0, 80).replace(/-+$/, '');
        let suffix = 2;
        while (usedIds.has(actionId)) {
          actionId = `${`future-action-${id}`.slice(0, 77)}-${suffix}`.slice(0, 80).replace(/-+$/, '');
          suffix += 1;
        }
        usedIds.add(actionId);
        return [normalizedEntry, {
          id: actionId,
          createdAt,
          eventDate: legacyFollowUpDate,
          type: 'future-action',
          text: entryText,
          ...(completedAt ? { completedAt } : {}),
        }];
      });
      if (normalized.length > 100) throw new Error(`Plant ${index + 1} notes are invalid after migrating follow-up dates.`);
      return normalized;
    })(),
    ...(plant.createdAt ? { createdAt: text(plant.createdAt, `Plant ${index + 1} creation date`, 40) } : {}),
  };
}

export function validateInventory(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Inventory must be an object.');
  if (payload.version !== 1) throw new Error('Unsupported inventory version.');
  if (!Array.isArray(payload.plants)) throw new Error('Inventory plants must be a list.');
  if (payload.plants.length > MAX_PLANTS) throw new Error(`Inventory cannot contain more than ${MAX_PLANTS} plants.`);

  const plants = payload.plants.map(normalizePlant);
  const ids = new Set(plants.map((plant) => plant.id));
  if (ids.size !== plants.length) throw new Error('Every plant must have a unique id.');

  return { version: 1, updatedAt: new Date().toISOString(), plants };
}

function resolveInventoryStore() {
  try {
    return plant_inventory;
  } catch {
    return null;
  }
}

export async function handleInventoryRequest(context, store = resolveInventoryStore()) {
  const { request } = context;
  if (!store || typeof store.get !== 'function' || typeof store.put !== 'function') {
    return jsonResponse({ error: 'Plant inventory storage is not configured.' }, 503);
  }

  if (request.method === 'GET' || request.method === 'HEAD') {
    const inventory = await store.get(INVENTORY_KEY, { type: 'json' });
    const response = jsonResponse({ inventory: inventory || null });
    return request.method === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response;
  }

  if (request.method !== 'PUT') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET, HEAD, PUT' });
  }

  const origin = request.headers.get('origin');
  if (origin !== new URL(request.url).origin) return jsonResponse({ error: 'Cross-origin updates are not allowed.' }, 403);
  if (!request.headers.get('content-type')?.toLocaleLowerCase().startsWith('application/json')) {
    return jsonResponse({ error: 'Content-Type must be application/json.' }, 415);
  }

  const body = await request.text();
  if (encoder.encode(body).byteLength > MAX_BODY_BYTES) return jsonResponse({ error: 'Inventory update is too large.' }, 413);

  let inventory;
  try {
    inventory = validateInventory(JSON.parse(body));
  } catch (error) {
    return jsonResponse({ error: error instanceof SyntaxError ? 'Inventory JSON is invalid.' : error.message }, 400);
  }

  await store.put(INVENTORY_KEY, JSON.stringify(inventory));
  return jsonResponse({ inventory });
}

export default function onRequest(context) {
  return handleInventoryRequest(context);
}
