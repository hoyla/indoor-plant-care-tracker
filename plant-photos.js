export function orderedPlantPhotos(photos = []) {
  return [...photos].sort((left, right) => {
    const captured = String(right.capturedOn || '').localeCompare(String(left.capturedOn || ''));
    return captured || String(right.addedAt).localeCompare(String(left.addedAt));
  });
}

// Private deployments can populate these maps when migrating older repository
// photographs into the timeline. The public template deliberately ships empty.
const originalSpecimenPhotos = new Map();
const legacyPhotoCaptureDates = new Map();

export function legacyPhotoCaptureSuggestion(url) {
  return legacyPhotoCaptureDates.get(url) || null;
}

export function originalPhotoForSpecimen(specimenId) {
  return originalSpecimenPhotos.get(specimenId) || null;
}

export function withPreservedMainPhoto(photos, currentImage, { id, addedAt }) {
  const existing = [...(photos || [])];
  if (!currentImage
    || currentImage === 'images/placeholder.svg'
    || existing.some((photo) => photo.url === currentImage)) return existing;
  return [...existing, {
    id,
    url: currentImage,
    capturedOn: null,
    addedAt,
    note: '',
  }];
}

export function suggestMainPhoto(specimen, capturedOn, today) {
  const current = (specimen.photos || []).find((photo) => photo.url === specimen.image);
  if (current?.capturedOn) return capturedOn >= current.capturedOn;
  return capturedOn >= today;
}

export function uploadedPhotoPaths(specimen) {
  return new Set([specimen.image, ...(specimen.photos || []).map((photo) => photo.url)]
    .filter((path) => typeof path === 'string' && path.startsWith('/api/photos/plants/')));
}
