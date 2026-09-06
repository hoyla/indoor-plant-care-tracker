import { createPlantPhotoUploader } from './vendor/photo-uploader.js?v=20260904-2';
import { comparePlantOrder } from './plant-sort.js';
import { effectiveCheckIntervalDays } from './moisture-schedule.js';
import {
  legacyPhotoCaptureSuggestion,
  originalPhotoForSpecimen,
  orderedPlantPhotos,
  suggestMainPhoto,
  uploadedPhotoPaths,
  withPreservedMainPhoto,
} from './plant-photos.js';

const state = {
  profiles: [],
  profileMap: new Map(),
  inventory: { version: 1, updatedAt: null, plants: [] },
  rooms: {},
  season: 'summer',
  query: '',
  room: 'all',
  status: 'all',
  needsCheck: false,
  managing: false,
  journalPlantId: null,
  editingNoteId: null,
  editDrafts: new Map(),
  pendingDeleteId: null,
  pendingNewPlantId: null,
  pendingNewPhotoImage: '',
  pendingNewPhotoCaptureInfo: { capturedOn: '', source: '' },
  preservePlantDialogOnClose: false,
  photoPlantId: null,
  pendingTimelinePhotoImage: '',
  pendingExistingPhotoUrl: '',
  pendingExistingPhotoId: '',
  timelinePhotoSelected: false,
  timelinePreviewObjectUrl: '',
  highlightedPhotoId: '',
  photoDateTouched: false,
  preservePhotoDialogOnClose: false,
  syncAvailable: false,
  localPreview: ['localhost', '127.0.0.1', '::1'].includes(location.hostname),
};

function showBuildCommit() {
  const link = document.querySelector('#build-commit');
  if (!link) return;

  const commit = String(window.__MYPLANTS_BUILD__?.commit || '').toLowerCase();
  if (!/^[a-f0-9]{7,40}$/.test(commit)) return;

  link.textContent = `Commit ${commit.slice(0, 7)}`;
  link.href = `https://github.com/hoyla/indoor-plant-care-tracker/commit/${commit}`;
}

showBuildCommit();

const elements = {
  list: document.querySelector('#plant-list'),
  empty: document.querySelector('#empty-state'),
  summary: document.querySelector('#results-summary'),
  search: document.querySelector('#search'),
  room: document.querySelector('#room-filter'),
  status: document.querySelector('#status-filter'),
  needsCheck: document.querySelector('#needs-check-filter'),
  template: document.querySelector('#plant-card-template'),
  seasons: [...document.querySelectorAll('.season-button')],
  manage: document.querySelector('#manage-plants'),
  add: document.querySelector('#add-plant'),
  browseCatalogue: document.querySelector('#browse-catalogue'),
  syncStatus: document.querySelector('#inventory-status'),
  catalogueDialog: document.querySelector('#catalogue-dialog'),
  closeCatalogue: document.querySelector('#close-catalogue'),
  catalogueSearch: document.querySelector('#catalogue-search'),
  catalogueCategory: document.querySelector('#catalogue-category'),
  catalogueSummary: document.querySelector('#catalogue-summary'),
  catalogueList: document.querySelector('#catalogue-list'),
  catalogueEmpty: document.querySelector('#catalogue-empty'),
  dialog: document.querySelector('#plant-dialog'),
  form: document.querySelector('#plant-form'),
  cancelDialog: document.querySelector('#cancel-plant'),
  profileSearch: document.querySelector('#new-profile-search'),
  profileResults: document.querySelector('#new-profile-results'),
  profileInput: document.querySelector('#new-profile'),
  nameInput: document.querySelector('#new-name'),
  roomInput: document.querySelector('#new-room'),
  newPhoto: document.querySelector('#new-photo'),
  newPhotoStatus: document.querySelector('#new-photo-status'),
  deleteDialog: document.querySelector('#delete-dialog'),
  deleteSummary: document.querySelector('#delete-summary'),
  cancelDelete: document.querySelector('#cancel-delete'),
  confirmDelete: document.querySelector('#confirm-delete'),
  journalDialog: document.querySelector('#journal-dialog'),
  closeJournal: document.querySelector('#close-journal'),
  journalHeading: document.querySelector('#journal-heading'),
  journalGuidance: document.querySelector('#journal-guidance'),
  moistureForm: document.querySelector('#moisture-form'),
  moistureValue: document.querySelector('#moisture-value'),
  moistureOutput: document.querySelector('#moisture-output'),
  moistureNextCheck: document.querySelector('#moisture-next-check'),
  moistureNextCheckHelp: document.querySelector('#moisture-next-check-help'),
  moistureNote: document.querySelector('#moisture-note'),
  noteForm: document.querySelector('#plant-note-form'),
  noteInput: document.querySelector('#plant-note'),
  noteType: document.querySelector('#plant-note-type'),
  noteDate: document.querySelector('#plant-note-date'),
  noteDateLabel: document.querySelector('#plant-note-date-label'),
  noteTextLabel: document.querySelector('#plant-note-text-label'),
  saveNote: document.querySelector('#save-note'),
  cancelNoteEdit: document.querySelector('#cancel-note-edit'),
  journalList: document.querySelector('#journal-list'),
  journalEmpty: document.querySelector('#journal-empty'),
  journalStatus: document.querySelector('#journal-status'),
  photoDialog: document.querySelector('#photo-dialog'),
  closePhotos: document.querySelector('#close-photos'),
  photoHeading: document.querySelector('#photo-heading'),
  photoSummary: document.querySelector('#photo-summary'),
  photoForm: document.querySelector('#photo-form'),
  timelinePhoto: document.querySelector('#timeline-photo'),
  timelinePhotoStatus: document.querySelector('#timeline-photo-status'),
  timelinePhotoPreview: document.querySelector('#timeline-photo-preview'),
  timelinePhotoPreviewImage: document.querySelector('#timeline-photo-preview-image'),
  timelinePhotoPreviewTitle: document.querySelector('#timeline-photo-preview-title'),
  timelinePhotoPreviewDetail: document.querySelector('#timeline-photo-preview-detail'),
  photoCapturedOn: document.querySelector('#photo-captured-on'),
  photoUseMain: document.querySelector('#photo-use-main'),
  photoNote: document.querySelector('#photo-note'),
  saveTimelinePhoto: document.querySelector('#save-timeline-photo'),
  photoList: document.querySelector('#photo-list'),
  photoEmpty: document.querySelector('#photo-empty'),
  photoStatus: document.querySelector('#photo-status'),
};

const detailLabels = {
  humidity: 'Humidity',
  misting: 'Misting',
  temperature: 'Temperature',
  repotting: 'Repotting',
  soil: 'Soil',
  petSafety: 'Pet safety',
  warningSigns: 'Watch for',
  notes: 'Notes',
};

const statusOptions = ['Established', 'New', 'Needs attention', 'Recovering', 'Seasonal', 'Monitoring'];
const recoveryStatuses = new Set(['Needs attention', 'Recovering', 'Monitoring']);
const noteTypeLabels = {
  note: 'Other note',
  observation: 'Observation',
  'pest-check': 'Pest check',
  treatment: 'Treatment',
  growth: 'Growth',
  repotting: 'Repotting',
  'future-action': 'Future action',
};
const UPLOADED_PHOTO_PREFIX = '/api/photos/plants/';

function setInventoryStatus(message, tone = '') {
  elements.syncStatus.textContent = message;
  elements.syncStatus.dataset.tone = tone;
}

function isUploadedPhoto(path) {
  return typeof path === 'string' && path.startsWith(UPLOADED_PHOTO_PREFIX);
}

async function deleteUploadedPhoto(path) {
  if (!isUploadedPhoto(path)) return true;
  try {
    const response = await fetch(path, { method: 'DELETE', credentials: 'same-origin' });
    if (!response.ok && response.status !== 404) throw new Error(`Photo deletion returned ${response.status}.`);
    return true;
  } catch (error) {
    console.warn('The old uploaded photo could not be removed.', error);
    return false;
  }
}

const photoUploader = createPlantPhotoUploader();

function appendDetail(list, label, value) {
  if (!value || (Array.isArray(value) && !value.length)) return;
  const dt = document.createElement('dt');
  const dd = document.createElement('dd');
  dt.textContent = label;
  dd.textContent = Array.isArray(value) ? value.join(' • ') : value;
  list.append(dt, dd);
}

function formatDliRange(range) {
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) return '';
  return `${range.min.toLocaleString()}–${range.max.toLocaleString()} mol/m²/day`;
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[‘’]/g, "'")
    .toLocaleLowerCase();
}

function profileSearchText(profile) {
  return normalizeSearch([profile.commonName, profile.scientificName, ...(profile.aliases || []), profile.category]
    .filter(Boolean)
    .join(' '));
}

function makeCatalogueItem(profile) {
  const item = document.createElement('article');
  item.className = 'catalogue-item';

  const heading = document.createElement('div');
  const commonName = document.createElement('h3');
  const scientificName = document.createElement('p');
  commonName.textContent = profile.commonName;
  scientificName.textContent = profile.scientificName;
  heading.append(commonName, scientificName);

  const badges = document.createElement('div');
  badges.className = 'catalogue-item__badges';
  const category = document.createElement('span');
  const difficulty = document.createElement('span');
  category.textContent = profile.category;
  difficulty.textContent = profile.difficulty;
  badges.append(category, difficulty);
  item.append(heading, badges);

  if (profile.aliases?.length) {
    const aliases = document.createElement('p');
    aliases.className = 'catalogue-item__aliases';
    aliases.textContent = `Also known as ${profile.aliases.join(', ')}`;
    item.append(aliases);
  }

  return item;
}

function renderCatalogue() {
  const query = normalizeSearch(elements.catalogueSearch.value.trim());
  const category = elements.catalogueCategory.value;
  const profiles = state.profiles
    .filter((profile) => (category === 'all' || profile.category === category) && (!query || profileSearchText(profile).includes(query)))
    .sort((a, b) => a.commonName.localeCompare(b.commonName));

  elements.catalogueList.replaceChildren(...profiles.map(makeCatalogueItem));
  elements.catalogueList.hidden = profiles.length === 0;
  elements.catalogueEmpty.hidden = profiles.length > 0;
  elements.catalogueSummary.textContent = `${profiles.length} of ${state.profiles.length} care profile${state.profiles.length === 1 ? '' : 's'}`;
}

function populateCatalogueCategories() {
  elements.browseCatalogue.textContent = `Browse care catalogue (${state.profiles.length})`;
  const all = document.createElement('option');
  all.value = 'all';
  all.textContent = 'All categories';
  const categories = [...new Set(state.profiles.map((profile) => profile.category))]
    .sort((a, b) => a.localeCompare(b))
    .map((category) => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      return option;
    });
  elements.catalogueCategory.replaceChildren(all, ...categories);
}

function roomOptions(selectedRoom) {
  return Object.keys(state.rooms).sort().map((room) => {
    const option = document.createElement('option');
    option.value = room;
    option.textContent = room;
    option.selected = room === selectedRoom;
    return option;
  });
}

function plantView(specimen) {
  const profile = state.profileMap.get(specimen.profileId);
  return {
    ...profile,
    ...specimen,
    commonName: specimen.name || profile?.commonName || 'Unnamed plant',
    scientificName: profile?.scientificName || 'Care profile pending',
    difficulty: profile?.difficulty || 'Not rated',
    care: profile?.care || {},
    sources: profile?.sources || [],
    image: specimen.image || profile?.defaultImage || 'images/placeholder.svg',
  };
}

const DAY_MS = 86_400_000;

function checkIntervalDays(waterAdvice = '', season = state.season) {
  const advice = waterAdvice.toLocaleLowerCase();
  const range = advice.match(/(?:every|often every)\s+(\d+)[–-](\d+)\s+(day|week)s?/);
  if (range) return Number(range[1]) * (range[3] === 'week' ? 7 : 1);
  const single = advice.match(/(?:every|about)\s+(\d+)\s+(day|week)s?/);
  if (single) return Number(single[1]) * (single[2] === 'week' ? 7 : 1);
  if (/check daily|daily in/.test(advice)) return 1;
  if (/check weekly|weekly/.test(advice)) return 7;
  if (/monthly/.test(advice)) return 28;
  return season === 'summer' ? 7 : 14;
}

function latestReading(specimen) {
  return [...(specimen.moistureReadings || [])]
    .sort((a, b) => new Date(b.checkedAt) - new Date(a.checkedAt))[0] || null;
}

function latestGeneralNote(specimen) {
  return [...(specimen.notes || [])]
    .filter((entry) => entry.type !== 'future-action')
    .sort((a, b) => {
      const eventDate = String(b.eventDate || b.createdAt.slice(0, 10)).localeCompare(String(a.eventDate || a.createdAt.slice(0, 10)));
      return eventDate || b.createdAt.localeCompare(a.createdAt);
    })[0] || null;
}

function dueInfo(specimen) {
  const reading = latestReading(specimen);
  const plant = plantView(specimen);
  const automaticDays = checkIntervalDays(plant.care?.[state.season]?.water, state.season);
  const days = effectiveCheckIntervalDays(reading, automaticDays);
  if (!reading) return { state: 'never', days, remaining: Number.NEGATIVE_INFINITY, text: 'Not checked yet' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(reading.checkedAt);
  due.setHours(0, 0, 0, 0);
  due.setDate(due.getDate() + days);
  const remaining = Math.round((due - today) / DAY_MS);
  if (remaining < 0) return { state: 'overdue', days, remaining, text: `Overdue by ${Math.abs(remaining)} day${remaining === -1 ? '' : 's'}` };
  if (remaining === 0) return { state: 'due', days, remaining, text: 'Check today' };
  if (remaining === 1) return { state: 'soon', days, remaining, text: 'Check tomorrow' };
  return { state: 'current', days, remaining, text: `Check in ${remaining} days` };
}

function localDateKey(date = new Date()) {
  const offsetDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60_000));
  return offsetDate.toISOString().slice(0, 10);
}

function futureActionInfo(specimen) {
  const next = [...(specimen.notes || [])]
    .filter((entry) => entry.type === 'future-action' && !entry.completedAt)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate))[0];
  if (!next) return { state: 'none', remaining: Number.POSITIVE_INFINITY, text: 'No future action scheduled', entry: null };
  const today = new Date(`${localDateKey()}T12:00:00`);
  const due = new Date(`${next.eventDate}T12:00:00`);
  const remaining = Math.round((due - today) / DAY_MS);
  if (remaining < 0) {
    const days = Math.abs(remaining);
    return { state: 'overdue', remaining, text: `Overdue by ${days} day${days === 1 ? '' : 's'}`, entry: next };
  }
  if (remaining === 0) return { state: 'due', remaining, text: 'Due today', entry: next };
  if (remaining === 1) return { state: 'soon', remaining, text: 'Due tomorrow', entry: next };
  return {
    state: 'current',
    remaining,
    text: `Due ${new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(due)}`,
    entry: next,
  };
}

function combinedDueInfo(specimen) {
  const futureAction = futureActionInfo(specimen);
  if (['overdue', 'due', 'soon'].includes(futureAction.state)) return futureAction;
  return dueInfo(specimen);
}

function formatActivityDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatCalendarDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`));
}

function checkedLabel(value) {
  const checked = new Date(value);
  const today = new Date();
  checked.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const elapsed = Math.round((today - checked) / DAY_MS);
  if (elapsed === 0) return 'Checked today';
  if (elapsed === 1) return 'Checked yesterday';
  return `Checked ${new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(checked)}`;
}

function activityId(prefix) {
  const suffix = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`.toLocaleLowerCase();
}

function migrateLegacyFollowUps(inventory) {
  if (!inventory?.plants) return inventory;
  let changed = false;
  const plants = inventory.plants.map((plant) => {
    if (!(plant.notes || []).some((entry) => entry.followUpDate)) return plant;
    changed = true;
    const usedIds = new Set((plant.notes || []).map((entry) => entry.id));
    const notes = (plant.notes || []).flatMap((entry) => {
      if (!entry.followUpDate) return [entry];
      const { followUpDate, completedAt, ...historicalEntry } = entry;
      let id = `future-action-${entry.id}`.slice(0, 80).replace(/-+$/, '');
      let suffix = 2;
      while (usedIds.has(id)) {
        id = `${`future-action-${entry.id}`.slice(0, 77)}-${suffix}`.slice(0, 80).replace(/-+$/, '');
        suffix += 1;
      }
      usedIds.add(id);
      return [historicalEntry, {
        id,
        createdAt: entry.createdAt,
        eventDate: followUpDate,
        type: 'future-action',
        text: entry.text,
        ...(completedAt ? { completedAt } : {}),
      }];
    });
    return { ...plant, notes };
  });
  return changed ? { ...inventory, plants } : inventory;
}

function currentJournalPlant() {
  return state.inventory.plants.find((plant) => plant.id === state.journalPlantId);
}

async function saveJournalChange(specimen, previous, message) {
  try {
    await persistInventory(message);
    render();
    renderJournal();
    elements.journalStatus.textContent = message;
    return true;
  } catch (error) {
    specimen.moistureReadings = previous.moistureReadings;
    specimen.notes = previous.notes;
    elements.journalStatus.textContent = error.message;
    setInventoryStatus(error.message, 'error');
    renderJournal();
    return false;
  }
}

function resetRecoveryForm() {
  state.editingNoteId = null;
  elements.noteForm.reset();
  elements.noteType.value = 'observation';
  elements.noteDate.value = localDateKey();
  updateRecoveryFormLabels();
  elements.saveNote.textContent = 'Add entry';
  elements.cancelNoteEdit.hidden = true;
}

function updateRecoveryFormLabels() {
  const futureAction = elements.noteType.value === 'future-action';
  elements.noteDateLabel.textContent = futureAction ? 'Due date' : 'Date';
  elements.noteTextLabel.textContent = futureAction ? 'What needs doing?' : 'What happened?';
  elements.noteInput.placeholder = futureAction
    ? 'Describe the action clearly enough to carry it out later'
    : 'What you saw or did, with enough detail to compare next time';
}

function journalEntry(item, specimen) {
  const li = document.createElement('li');
  const title = document.createElement('p');
  const date = document.createElement('time');
  const actions = document.createElement('div');
  li.className = `journal-entry journal-entry--${item.kind === 'reading' ? 'reading' : item.type}`;
  if (item.completedAt) li.classList.add('journal-entry--complete');
  title.className = 'journal-entry__title';
  title.textContent = item.kind === 'reading' ? `Moisture ${item.value}/10` : (noteTypeLabels[item.type] || 'Other note');
  date.className = 'journal-entry__date';
  date.dateTime = item.date;
  date.textContent = item.kind === 'reading'
    ? formatActivityDate(item.date)
    : `${item.type === 'future-action' ? 'Due ' : ''}${formatCalendarDate(item.date)}`;
  actions.className = 'journal-entry__actions';
  if (item.kind === 'entry') {
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => {
      state.editingNoteId = item.id;
      elements.noteInput.value = item.text;
      elements.noteType.value = item.type || 'note';
      elements.noteDate.value = item.eventDate || item.createdAt.slice(0, 10);
      updateRecoveryFormLabels();
      elements.saveNote.textContent = 'Save entry';
      elements.cancelNoteEdit.hidden = false;
      elements.noteInput.focus();
    });
    actions.append(edit);
    if (item.type === 'future-action') {
      const complete = document.createElement('button');
      complete.type = 'button';
      complete.textContent = item.completedAt ? 'Reopen' : 'Done';
      complete.addEventListener('click', async () => {
        const previous = { moistureReadings: [...(specimen.moistureReadings || [])], notes: [...(specimen.notes || [])] };
        specimen.notes = previous.notes.map((note) => {
          if (note.id !== item.id) return note;
          if (item.completedAt) {
            const { completedAt, ...reopened } = note;
            return reopened;
          }
          return { ...note, completedAt: new Date().toISOString() };
        });
        elements.journalStatus.textContent = 'Saving…';
        await saveJournalChange(specimen, previous, item.completedAt ? 'Future action reopened.' : 'Future action completed.');
      });
      actions.append(complete);
    }
  }
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Remove';
  remove.addEventListener('click', async () => {
    if (!window.confirm(`Remove this ${item.kind === 'reading' ? 'moisture reading' : 'recovery entry'}?`)) return;
    const previous = { moistureReadings: [...(specimen.moistureReadings || [])], notes: [...(specimen.notes || [])] };
    if (item.kind === 'reading') specimen.moistureReadings = previous.moistureReadings.filter((entry) => entry.id !== item.id);
    else specimen.notes = previous.notes.filter((entry) => entry.id !== item.id);
    elements.journalStatus.textContent = 'Saving…';
    await saveJournalChange(specimen, previous, 'Recovery log updated.');
  });
  actions.append(remove);
  li.append(title, actions, date);
  if (item.text) {
    const text = document.createElement('p');
    text.className = 'journal-entry__text';
    text.textContent = item.text;
    li.append(text);
  }
  if (item.type === 'future-action' && item.completedAt) {
    const completion = document.createElement('p');
    completion.className = 'journal-entry__completion';
    completion.textContent = `Completed ${formatActivityDate(item.completedAt)}`;
    li.append(completion);
  }
  return li;
}

function renderJournal() {
  const specimen = currentJournalPlant();
  if (!specimen) return;
  const plant = plantView(specimen);
  const due = dueInfo(specimen);
  const futureAction = futureActionInfo(specimen);
  elements.journalHeading.textContent = plant.commonName;
  elements.journalGuidance.textContent = `Moisture: ${due.text.toLocaleLowerCase()}. ${futureAction.entry ? `Next action: ${futureAction.text.toLocaleLowerCase()}.` : 'No future action scheduled.'}`;
  const activities = [
    ...(specimen.moistureReadings || []).map((entry) => ({ ...entry, kind: 'reading', date: entry.checkedAt, sortDate: entry.checkedAt, text: entry.note })),
    ...(specimen.notes || []).map((entry) => ({
      ...entry,
      kind: 'entry',
      type: entry.type || 'note',
      date: entry.eventDate || entry.createdAt.slice(0, 10),
      sortDate: `${entry.eventDate || entry.createdAt.slice(0, 10)}T${entry.createdAt.slice(11)}`,
    })),
  ].sort((a, b) => b.sortDate.localeCompare(a.sortDate));
  elements.journalList.replaceChildren(...activities.map((item) => journalEntry(item, specimen)));
  elements.journalEmpty.hidden = activities.length > 0;
  elements.journalList.hidden = activities.length === 0;
}

function resetMoistureForm(specimen) {
  elements.moistureForm.reset();
  elements.moistureValue.value = '5';
  elements.moistureOutput.value = '5';
  const plant = plantView(specimen);
  const automaticDays = checkIntervalDays(plant.care?.[state.season]?.water, state.season);
  elements.moistureNextCheck.value = String(automaticDays);
  elements.moistureNextCheck.dataset.automaticDays = String(automaticDays);
  elements.moistureNextCheckHelp.textContent = `Suggested automatically from the ${state.season} care guidance; change it for this reading if needed.`;
}

function openJournal(specimen) {
  state.journalPlantId = specimen.id;
  state.editingNoteId = null;
  resetMoistureForm(specimen);
  resetRecoveryForm();
  elements.journalStatus.textContent = '';
  renderJournal();
  elements.journalDialog.showModal();
}

function currentPhotoPlant() {
  return state.inventory.plants.find((plant) => plant.id === state.photoPlantId);
}

function setPhotoStatus(message, tone = '') {
  elements.photoStatus.textContent = message;
  elements.photoStatus.dataset.tone = tone;
}

function clearTimelinePreview() {
  if (state.timelinePreviewObjectUrl) URL.revokeObjectURL(state.timelinePreviewObjectUrl);
  state.timelinePreviewObjectUrl = '';
  elements.timelinePhotoPreview.hidden = true;
  elements.timelinePhotoPreviewImage.removeAttribute('src');
  elements.timelinePhotoPreviewTitle.textContent = '';
  elements.timelinePhotoPreviewDetail.textContent = '';
}

function showTimelinePreview(url, title, detail, { objectUrl = false } = {}) {
  clearTimelinePreview();
  if (!url) return;
  if (objectUrl) state.timelinePreviewObjectUrl = url;
  elements.timelinePhotoPreviewImage.src = url;
  elements.timelinePhotoPreviewTitle.textContent = title;
  elements.timelinePhotoPreviewDetail.textContent = detail;
  elements.timelinePhotoPreview.hidden = false;
}

function hasUnsavedTimelinePhoto() {
  return Boolean(state.pendingTimelinePhotoImage || state.pendingExistingPhotoUrl || state.timelinePhotoSelected);
}

function requestPhotoDialogClose() {
  if (hasUnsavedTimelinePhoto()
    && !window.confirm('This photo has not been saved to the library. Close and discard it?')) return;
  elements.photoDialog.close();
}

function photoTimelineEntry(photo, specimen, { legacy = false } = {}) {
  const item = document.createElement('li');
  const figure = document.createElement('figure');
  const image = document.createElement('img');
  const caption = document.createElement('figcaption');
  const dateLine = document.createElement('div');
  const date = document.createElement(photo.capturedOn ? 'time' : 'span');
  item.className = 'photo-entry';
  if (photo.id) item.dataset.photoId = photo.id;
  if (photo.id === state.highlightedPhotoId) item.classList.add('photo-entry--added');
  image.src = photo.url;
  image.alt = photo.note || specimen.imageAlt || `${plantView(specimen).commonName} houseplant`;
  image.loading = 'lazy';
  image.addEventListener('error', () => {
    image.src = 'images/placeholder.svg';
    item.classList.add('photo-entry--missing');
    const warning = document.createElement('p');
    warning.className = 'photo-entry__warning';
    warning.textContent = 'The saved photo file could not be loaded. A placeholder is shown here instead.';
    caption.append(warning);
  }, { once: true });
  dateLine.className = 'photo-entry__date';
  date.textContent = photo.capturedOn
    ? formatCalendarDate(photo.capturedOn)
    : `${photo.url === specimen.image ? 'Current photo · ' : ''}date not recorded`;
  if (photo.capturedOn) date.dateTime = photo.capturedOn;
  dateLine.append(date);
  if (photo.url === specimen.image) {
    const current = document.createElement('span');
    current.className = 'photo-entry__current';
    current.textContent = 'Main photo';
    dateLine.append(current);
  }
  if (photo.id === state.highlightedPhotoId) {
    const added = document.createElement('span');
    added.className = 'photo-entry__added';
    added.textContent = 'Added to library';
    dateLine.append(added);
  }
  caption.append(dateLine);
  if (photo.note) {
    const note = document.createElement('p');
    note.className = 'photo-entry__note';
    note.textContent = photo.note;
    caption.append(note);
  }
  if (state.managing && (!photo.capturedOn || !legacy)) {
    const actions = document.createElement('div');
    actions.className = 'photo-entry__actions';
    if (!photo.capturedOn) {
      const addDate = document.createElement('button');
      addDate.type = 'button';
      addDate.textContent = 'Add date';
      addDate.setAttribute('aria-label', `Add a date to this photo of ${plantView(specimen).commonName}`);
      addDate.addEventListener('click', () => beginDatingExistingPhoto(photo, specimen));
      actions.append(addDate);
    }
    if (!legacy) {
      const remove = document.createElement('button');
      remove.className = 'photo-entry__remove';
      remove.type = 'button';
      remove.textContent = 'Delete';
      remove.setAttribute('aria-label', `Delete this photo of ${plantView(specimen).commonName}`);
      remove.addEventListener('click', () => removeTimelinePhoto(photo, specimen, remove));
      actions.append(remove);
    }
    caption.append(actions);
  }
  figure.append(image, caption);
  item.append(figure);
  return item;
}

function renderPhotoTimeline() {
  const specimen = currentPhotoPlant();
  if (!specimen) return;
  const photos = orderedPlantPhotos(specimen.photos || []);
  const entries = photos.map((photo) => photoTimelineEntry(photo, specimen));
  const currentRecorded = photos.some((photo) => photo.url === specimen.image);
  if (!currentRecorded && specimen.image && specimen.image !== 'images/placeholder.svg') {
    entries.unshift(photoTimelineEntry({ url: specimen.image, note: '' }, specimen, { legacy: true }));
  }
  elements.photoHeading.textContent = plantView(specimen).commonName;
  const datedCount = photos.filter((photo) => photo.capturedOn).length;
  const undatedCount = photos.length - datedCount;
  elements.photoSummary.textContent = photos.length
    ? `${photos.length} saved photo${photos.length === 1 ? '' : 's'}${undatedCount ? `, ${undatedCount} still needing a date` : ''}. Newest dated photos appear first.`
    : (state.managing ? 'Add the first photo for this individual plant.' : 'No photo history has been added yet.');
  const originalPhoto = originalPhotoForSpecimen(specimen.id);
  const originalMissing = originalPhoto
    && specimen.image !== originalPhoto
    && !photos.some((photo) => photo.url === originalPhoto);
  if (state.managing && originalMissing) {
    const restore = document.createElement('button');
    restore.className = 'photo-summary__restore';
    restore.type = 'button';
    restore.textContent = 'Restore original photo';
    restore.addEventListener('click', () => restoreOriginalPhoto(specimen, originalPhoto, restore));
    elements.photoSummary.append(' ', restore);
  }
  elements.photoForm.hidden = !state.managing;
  elements.photoList.replaceChildren(...entries);
  elements.photoEmpty.hidden = entries.length > 0;
  elements.photoList.hidden = entries.length === 0;
}

function timelinePhotoStatus(filename, captureInfo = {}) {
  if (!filename) return state.pendingTimelinePhotoImage ? 'Upload complete — now save it to the photo library.' : '';
  if (captureInfo.source === 'exif') return `${filename} selected. Its camera date has been filled in. Complete the upload, then save it to the library.`;
  if (captureInfo.source === 'file') return `${filename} selected. Check the suggested date, complete the upload, then save it to the library.`;
  return `${filename} selected. Complete the upload, then save it to the library.`;
}

function prepareTimelinePhotoUploader(specimen) {
  photoUploader.setContext({
    key: `timeline:${specimen.id}`,
    plantId: specimen.id,
    onEditorOpen() {
      state.preservePhotoDialogOnClose = true;
      elements.photoDialog.close();
    },
    onEditorClose() {
      if (!elements.photoDialog.open) elements.photoDialog.showModal();
    },
    onSelected(filename, captureInfo = {}, file = null) {
      state.timelinePhotoSelected = Boolean(filename);
      if (!filename) clearTimelinePreview();
      else if (file?.data && !state.pendingTimelinePhotoImage) {
        const previewUrl = URL.createObjectURL(file.data);
        showTimelinePreview(previewUrl, 'Selected for editing', 'This is not uploaded or saved to the library yet.', { objectUrl: true });
      }
      if (captureInfo.capturedOn && !state.photoDateTouched) {
        elements.photoCapturedOn.value = captureInfo.capturedOn;
        elements.photoUseMain.checked = suggestMainPhoto(specimen, captureInfo.capturedOn, localDateKey());
      }
      elements.timelinePhotoStatus.textContent = timelinePhotoStatus(filename, captureInfo);
    },
    onUploaded(uploadedImage, _file, captureInfo = {}) {
      const previousImage = state.pendingTimelinePhotoImage;
      state.pendingTimelinePhotoImage = uploadedImage;
      state.timelinePhotoSelected = false;
      if (captureInfo.capturedOn && !state.photoDateTouched) {
        elements.photoCapturedOn.value = captureInfo.capturedOn;
        elements.photoUseMain.checked = suggestMainPhoto(specimen, captureInfo.capturedOn, localDateKey());
      }
      photoUploader.prepareForNextFile();
      showTimelinePreview(uploadedImage, 'Upload complete', 'Not in the photo library yet. Check the date, then choose “Save to photo library”.');
      elements.timelinePhotoStatus.textContent = 'Upload complete — one final save is needed below.';
      if (previousImage && previousImage !== uploadedImage) deleteUploadedPhoto(previousImage);
    },
    onError(error) {
      elements.timelinePhotoStatus.textContent = error.message;
      setPhotoStatus(error.message, 'error');
    },
  });
}

function resetTimelinePhotoDraft({ removeUpload = false } = {}) {
  const orphanedImage = state.pendingTimelinePhotoImage;
  state.pendingTimelinePhotoImage = '';
  state.pendingExistingPhotoUrl = '';
  state.pendingExistingPhotoId = '';
  state.timelinePhotoSelected = false;
  state.photoDateTouched = false;
  elements.photoForm.reset();
  elements.photoCapturedOn.value = localDateKey();
  elements.timelinePhoto.hidden = false;
  elements.photoUseMain.disabled = false;
  elements.saveTimelinePhoto.textContent = 'Save to photo library';
  elements.timelinePhotoStatus.textContent = '';
  setPhotoStatus('');
  clearTimelinePreview();
  photoUploader.reset();
  if (removeUpload && orphanedImage) deleteUploadedPhoto(orphanedImage);
}

function beginDatingExistingPhoto(photo, specimen) {
  resetTimelinePhotoDraft({ removeUpload: true });
  const suggestion = legacyPhotoCaptureSuggestion(photo.url);
  state.pendingExistingPhotoUrl = photo.url;
  state.pendingExistingPhotoId = photo.id || '';
  elements.timelinePhoto.hidden = true;
  elements.photoCapturedOn.value = suggestion?.capturedOn || '';
  elements.photoUseMain.checked = photo.url === specimen.image;
  elements.photoUseMain.disabled = true;
  elements.photoNote.value = photo.note || '';
  elements.saveTimelinePhoto.textContent = 'Save photo date';
  elements.timelinePhotoStatus.textContent = suggestion
    ? `Suggested date from the retained original ${suggestion.source === 'exif' ? 'camera metadata' : 'filename'}. Check it before saving.`
    : 'Using the existing photo. Enter its date; it will not be uploaded again.';
  showTimelinePreview(photo.url, 'Existing photo selected', 'No upload is needed. Check the date, then save it.');
  elements.photoCapturedOn.focus();
  elements.photoForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function openPhotoTimeline(specimen) {
  state.photoPlantId = specimen.id;
  state.highlightedPhotoId = '';
  resetTimelinePhotoDraft();
  elements.photoCapturedOn.value = localDateKey();
  elements.photoUseMain.checked = suggestMainPhoto(specimen, elements.photoCapturedOn.value, localDateKey());
  prepareTimelinePhotoUploader(specimen);
  renderPhotoTimeline();
  elements.photoDialog.showModal();
}

async function restoreOriginalPhoto(specimen, originalPhoto, button) {
  const previous = {
    photos: [...(specimen.photos || [])],
    image: specimen.image,
    imageAlt: specimen.imageAlt,
  };
  const restored = {
    id: activityId('photo'),
    url: originalPhoto,
    capturedOn: null,
    addedAt: new Date().toISOString(),
    note: '',
  };
  const photosWithCurrent = previous.image === originalPhoto
    ? previous.photos
    : withPreservedMainPhoto(previous.photos, previous.image, { id: activityId('photo'), addedAt: restored.addedAt });
  if (photosWithCurrent.length + 1 > 100) {
    setPhotoStatus('Delete another photo before restoring the original.', 'error');
    return;
  }
  button.disabled = true;
  setPhotoStatus('Restoring the original photo…');
  specimen.photos = [...photosWithCurrent, restored];
  specimen.image = originalPhoto;
  specimen.imageAlt = `${plantView(specimen).commonName} houseplant`;
  try {
    await persistInventory('Original photo restored.');
    state.highlightedPhotoId = restored.id;
    renderPhotoTimeline();
    setPhotoStatus('Original photo restored to the library and set as the main image.', 'saved');
    document.querySelector(`[data-photo-id="${restored.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    specimen.photos = previous.photos;
    specimen.image = previous.image;
    specimen.imageAlt = previous.imageAlt;
    button.disabled = false;
    setPhotoStatus(error.message, 'error');
    setInventoryStatus(error.message, 'error');
  }
}

async function removeTimelinePhoto(photo, specimen, button) {
  const previous = {
    photos: [...(specimen.photos || [])],
    image: specimen.image,
    imageAlt: specimen.imageAlt,
  };
  const remaining = previous.photos.filter((entry) => entry.id !== photo.id);
  const removingMain = photo.url === specimen.image;
  const removingRepositoryMain = removingMain && !isUploadedPhoto(photo.url);
  const replacement = removingMain && !removingRepositoryMain
    ? orderedPlantPhotos(remaining)[0] || null
    : null;
  const originalFallback = originalPhotoForSpecimen(specimen.id);
  const fallbackUrl = replacement?.url || originalFallback || state.profileMap.get(specimen.profileId)?.defaultImage || 'images/placeholder.svg';
  const consequence = removingRepositoryMain
    ? ' The image file will remain as the undated main photo.'
    : (removingMain ? ` The main image will switch to ${replacement ? 'the newest remaining library photo' : (originalFallback ? 'the original repository photo' : 'the catalogue fallback')}.` : '');
  if (!window.confirm(`Delete this photo from the library?${consequence}`)) return;

  button.disabled = true;
  setPhotoStatus('Deleting photo…');
  specimen.photos = remaining;
  if (removingMain && !removingRepositoryMain) {
    specimen.image = fallbackUrl;
    specimen.imageAlt = replacement?.note
      || (replacement?.capturedOn ? `${plantView(specimen).commonName} photographed ${formatCalendarDate(replacement.capturedOn)}` : `${plantView(specimen).commonName} houseplant`);
  }
  try {
    await persistInventory('Photo removed.');
    const stillReferenced = specimen.image === photo.url || remaining.some((entry) => entry.url === photo.url);
    const storageRemoved = stillReferenced ? true : await deleteUploadedPhoto(photo.url);
    state.highlightedPhotoId = '';
    renderPhotoTimeline();
    setPhotoStatus(
      storageRemoved ? 'Photo deleted from the library.' : 'Photo removed from the library, but its unused stored file could not be cleaned up.',
      storageRemoved ? 'saved' : 'error',
    );
  } catch (error) {
    specimen.photos = previous.photos;
    specimen.image = previous.image;
    specimen.imageAlt = previous.imageAlt;
    button.disabled = false;
    setPhotoStatus(error.message, 'error');
    setInventoryStatus(error.message, 'error');
  }
}

async function persistInventory(successMessage) {
  state.inventory.updatedAt = new Date().toISOString();

  if (state.localPreview && !state.syncAvailable) {
    localStorage.setItem('plant-guide-inventory-v1', JSON.stringify(state.inventory));
    setInventoryStatus(`${successMessage} Saved in this browser preview only.`, 'local');
    return;
  }

  if (!state.syncAvailable) throw new Error('Synchronized editing is not configured yet.');

  setInventoryStatus('Saving…');
  const response = await fetch('/api/inventory', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(state.inventory),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Save failed (${response.status})`);
  state.inventory = payload.inventory;
  render();
  setInventoryStatus(`${successMessage} Synchronized across your devices.`, 'saved');
}

function profileOptions(selectedProfileId, profiles = state.profiles, pendingLabel = 'Care profile pending') {
  const pending = document.createElement('option');
  pending.value = '';
  pending.textContent = pendingLabel;
  pending.selected = !selectedProfileId;

  const options = [...profiles]
    .sort((a, b) => a.commonName.localeCompare(b.commonName))
    .map((profile) => {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = `${profile.commonName} — ${profile.scientificName}`;
      option.selected = profile.id === selectedProfileId;
      return option;
    });

  return [pending, ...options];
}

function plantEditDraft(specimen) {
  if (!state.editDrafts.has(specimen.id)) {
    state.editDrafts.set(specimen.id, {
      name: specimen.name || '',
      profileId: specimen.profileId || null,
      room: specimen.room || '',
      status: specimen.status || 'New',
      placement: specimen.placement || '',
      image: specimen.image || 'images/placeholder.svg',
      imageAlt: specimen.imageAlt || '',
      pendingUploadedImage: '',
      dirty: false,
    });
  }
  return state.editDrafts.get(specimen.id);
}

function hasUnsavedPlantEdits() {
  return [...state.editDrafts.values()].some((draft) => draft.dirty);
}

function discardPlantEditDrafts() {
  for (const draft of state.editDrafts.values()) {
    if (draft.pendingUploadedImage) deleteUploadedPhoto(draft.pendingUploadedImage);
  }
  state.editDrafts.clear();
  photoUploader.reset();
}

function makePlantEditor(specimen) {
  const draft = plantEditDraft(specimen);
  const editor = document.createElement('div');
  editor.className = 'plant-editor';

  const nameLabel = document.createElement('label');
  const nameText = document.createElement('span');
  const name = document.createElement('input');
  nameText.textContent = 'Plant name';
  name.value = draft.name;
  name.maxLength = 100;
  name.setAttribute('aria-label', `Name for ${plantView(specimen).commonName}`);
  nameLabel.append(nameText, name);

  const profileLabel = document.createElement('label');
  const profileText = document.createElement('span');
  const profileSelect = document.createElement('select');
  profileText.textContent = 'Care profile';
  profileSelect.setAttribute('aria-label', `Care profile for ${plantView(specimen).commonName}`);
  profileSelect.append(...profileOptions(draft.profileId));
  profileLabel.append(profileText, profileSelect);

  const roomLabel = document.createElement('label');
  const roomText = document.createElement('span');
  const select = document.createElement('select');
  roomText.textContent = 'Room';
  select.setAttribute('aria-label', `Room for ${plantView(specimen).commonName}`);
  select.append(...roomOptions(draft.room));
  roomLabel.append(roomText, select);

  const statusLabel = document.createElement('label');
  const statusText = document.createElement('span');
  const statusSelect = document.createElement('select');
  statusText.textContent = 'Status';
  statusSelect.setAttribute('aria-label', `Status for ${plantView(specimen).commonName}`);
  statusSelect.append(...statusOptions.map((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    option.selected = value === draft.status;
    return option;
  }));
  statusLabel.append(statusText, statusSelect);

  const placementLabel = document.createElement('label');
  const placementText = document.createElement('span');
  const placement = document.createElement('input');
  placementText.textContent = 'Position in room';
  placement.value = draft.placement;
  placement.placeholder = 'Optional, e.g. beside the window';
  placement.setAttribute('aria-label', `Position for ${plantView(specimen).commonName}`);
  placementLabel.append(placementText, placement);

  const imageLabel = document.createElement('label');
  const imageText = document.createElement('span');
  const image = document.createElement('input');
  imageText.textContent = 'Repository photo path';
  image.value = draft.image;
  image.placeholder = 'images/filename.jpg';
  image.spellcheck = false;
  image.setAttribute('aria-label', `Photo for ${plantView(specimen).commonName}`);
  imageLabel.append(imageText, image);

  const imageAdvanced = document.createElement('details');
  const imageAdvancedSummary = document.createElement('summary');
  imageAdvanced.className = 'plant-editor__advanced';
  imageAdvancedSummary.textContent = 'Advanced photo option';
  imageAdvanced.append(imageAdvancedSummary, imageLabel);

  const uploadGroup = document.createElement('div');
  const upload = document.createElement('button');
  const uploadStatus = document.createElement('small');
  uploadGroup.className = 'plant-editor__photo';
  upload.className = 'button button--secondary';
  upload.type = 'button';
  upload.textContent = 'Add dated photo';
  upload.setAttribute('aria-label', `${upload.textContent} for ${plantView(specimen).commonName}`);
  uploadStatus.className = 'photo-status';
  uploadStatus.setAttribute('role', 'status');
  uploadStatus.setAttribute('aria-live', 'polite');
  uploadStatus.textContent = 'Opens this specimen’s photo timeline.';
  uploadGroup.append(upload, uploadStatus);

  const imageAltLabel = document.createElement('label');
  const imageAltText = document.createElement('span');
  const imageAlt = document.createElement('input');
  imageAltText.textContent = 'Photo description';
  imageAlt.value = draft.imageAlt;
  imageAlt.maxLength = 300;
  imageAlt.placeholder = 'A short description for screen readers';
  imageAlt.setAttribute('aria-label', `Photo description for ${plantView(specimen).commonName}`);
  imageAltLabel.append(imageAltText, imageAlt);

  const actions = document.createElement('div');
  const editorStatus = document.createElement('small');
  const save = document.createElement('button');
  const remove = document.createElement('button');
  actions.className = 'plant-editor__actions';
  editorStatus.className = 'plant-editor__status';
  editorStatus.setAttribute('role', 'status');
  editorStatus.setAttribute('aria-live', 'polite');
  editorStatus.textContent = draft.dirty ? 'Unsaved changes' : 'All changes saved';
  save.className = 'button';
  save.type = 'button';
  save.textContent = 'Save changes';
  save.disabled = !draft.dirty;
  save.setAttribute('aria-label', `Save changes to ${plantView(specimen).commonName}`);
  remove.className = 'button button--danger';
  remove.type = 'button';
  remove.textContent = 'Remove plant';
  remove.setAttribute('aria-label', `Remove ${plantView(specimen).commonName}`);
  remove.addEventListener('click', () => {
    state.pendingDeleteId = specimen.id;
    elements.deleteSummary.textContent = `Remove “${draft.name.trim() || plantView(specimen).commonName}” from ${draft.room}?`;
    elements.deleteDialog.showModal();
    elements.confirmDelete.focus();
  });
  actions.append(editorStatus, save, remove);

  const markDirty = () => {
    draft.dirty = true;
    save.disabled = false;
    editorStatus.textContent = 'Unsaved changes';
  };

  name.addEventListener('input', () => { draft.name = name.value; markDirty(); });
  profileSelect.addEventListener('change', () => { draft.profileId = profileSelect.value || null; markDirty(); });
  statusSelect.addEventListener('change', () => { draft.status = statusSelect.value; markDirty(); });
  select.addEventListener('change', () => {
    draft.room = select.value;
    draft.placement = '';
    placement.value = '';
    markDirty();
  });
  placement.addEventListener('input', () => { draft.placement = placement.value; markDirty(); });
  image.addEventListener('input', () => { draft.image = image.value; markDirty(); });
  imageAlt.addEventListener('input', () => { draft.imageAlt = imageAlt.value; markDirty(); });

  upload.addEventListener('click', () => {
    openPhotoTimeline(specimen);
  });

  save.addEventListener('click', async () => {
    const nextName = draft.name.trim();
    const repositoryImage = draft.image.trim() || 'images/placeholder.svg';
    if (!nextName) {
      editorStatus.textContent = 'Plant name cannot be empty.';
      name.focus();
      return;
    }
    if (!/^images\/[a-zA-Z0-9._/-]+$/.test(repositoryImage) && !isUploadedPhoto(repositoryImage)) {
      editorStatus.textContent = 'Photo files must use a safe path inside the images folder.';
      imageAdvanced.open = true;
      image.focus();
      return;
    }

    const previous = {
      name: specimen.name,
      profileId: specimen.profileId,
      room: specimen.room,
      status: specimen.status,
      placement: specimen.placement,
      image: specimen.image,
      imageAlt: specimen.imageAlt,
      photos: [...(specimen.photos || [])],
    };
    const pendingUploadedImage = draft.pendingUploadedImage;
    save.disabled = true;
    remove.disabled = true;
    upload.disabled = true;
    editorStatus.textContent = pendingUploadedImage ? 'Saving photo and changes…' : 'Saving…';
    try {
      const nextPhotos = repositoryImage === previous.image
        ? previous.photos
        : withPreservedMainPhoto(previous.photos, previous.image, { id: activityId('photo'), addedAt: new Date().toISOString() });
      if (nextPhotos.length > 100) throw new Error('Date or delete an existing photo before changing the main image.');
      Object.assign(specimen, {
        name: nextName,
        profileId: draft.profileId,
        room: draft.room,
        status: draft.status,
        placement: draft.placement.trim(),
        image: repositoryImage,
        imageAlt: draft.imageAlt.trim(),
        photos: nextPhotos,
      });
      await persistInventory(`${nextName} saved.`);
      if (specimen.image !== previous.image && !(specimen.photos || []).some((photo) => photo.url === previous.image)) {
        await deleteUploadedPhoto(previous.image);
      }
      if (pendingUploadedImage && specimen.image !== pendingUploadedImage) {
        await deleteUploadedPhoto(pendingUploadedImage);
      }
      draft.pendingUploadedImage = '';
      state.editDrafts.delete(specimen.id);
      render();
    } catch (error) {
      Object.assign(specimen, previous);
      draft.dirty = true;
      save.disabled = false;
      remove.disabled = false;
      upload.disabled = false;
      editorStatus.textContent = error.message;
      setInventoryStatus(error.message, 'error');
    }
  });

  editor.append(nameLabel, profileLabel, roomLabel, statusLabel, placementLabel, uploadGroup, imageAltLabel, imageAdvanced, actions);
  return editor;
}

function makeCard(specimen) {
  const plant = plantView(specimen);
  const card = elements.template.content.firstElementChild.cloneNode(true);
  const image = card.querySelector('.plant-card__image');
  image.src = plant.image;
  image.alt = plant.imageAlt || `${plant.commonName} houseplant`;
  image.addEventListener('error', () => { image.src = 'images/placeholder.svg'; });
  card.querySelector('.plant-card__name').textContent = plant.commonName;
  card.querySelector('.plant-card__scientific').textContent = plant.scientificName;
  card.querySelector('.plant-card__room').textContent = plant.room || 'Room not set';
  const photos = card.querySelector('.plant-card__photos');
  const photoCount = (specimen.photos || []).length;
  photos.textContent = photoCount ? `${photoCount} photo${photoCount === 1 ? '' : 's'}` : 'Photo history';
  photos.setAttribute('aria-label', `Open ${plant.commonName} photo history`);
  photos.addEventListener('click', () => openPhotoTimeline(specimen));
  card.querySelector('.plant-card__difficulty').textContent = plant.difficulty;
  const status = card.querySelector('.plant-card__status');
  status.textContent = plant.status || 'Status not set';
  status.dataset.status = plant.status?.toLocaleLowerCase() || '';

  const reading = latestReading(specimen);
  const due = dueInfo(specimen);
  const moisture = card.querySelector('.moisture-summary');
  moisture.dataset.due = due.state;
  moisture.querySelector('.moisture-summary__score').textContent = reading ? `Moisture ${reading.value}/10` : 'Log moisture';
  moisture.querySelector('.moisture-summary__timing').textContent = reading ? `${checkedLabel(reading.checkedAt)} · ${due.text}` : due.text;
  moisture.setAttribute('aria-label', `${plant.commonName} recovery log. ${reading ? `Latest moisture ${reading.value} out of 10, ${checkedLabel(reading.checkedAt).toLocaleLowerCase()}. ` : ''}${due.text}.`);
  moisture.addEventListener('click', () => openJournal(specimen));

  const futureAction = futureActionInfo(specimen);
  const recovery = card.querySelector('.recovery-summary');
  const showRecovery = Boolean(futureAction.entry) || recoveryStatuses.has(plant.status);
  recovery.hidden = !showRecovery;
  if (showRecovery) {
    recovery.dataset.due = futureAction.state;
    recovery.querySelector('.recovery-summary__label').textContent = futureAction.entry
      ? 'Future action'
      : 'Recovery log';
    recovery.querySelector('.recovery-summary__timing').textContent = futureAction.text;
    recovery.setAttribute('aria-label', `${plant.commonName} recovery log. ${futureAction.text}.`);
    recovery.addEventListener('click', () => openJournal(specimen));
  }

  const latestNote = latestGeneralNote(specimen);
  const cardNotes = card.querySelector('.latest-card-notes');
  const readingNote = cardNotes.querySelector('[data-latest-note="reading"]');
  const generalNote = cardNotes.querySelector('[data-latest-note="general"]');
  if (reading?.note) {
    const label = document.createElement('strong');
    label.textContent = 'Latest check · ';
    readingNote.append(label, reading.note);
    readingNote.hidden = false;
  }
  if (latestNote) {
    const label = document.createElement('strong');
    label.textContent = `${noteTypeLabels[latestNote.type || 'note']} · `;
    generalNote.append(label, latestNote.text);
    generalNote.hidden = false;
  }
  cardNotes.hidden = !reading?.note && !latestNote;

  const seasonal = plant.care?.[state.season] || {};
  card.querySelector('[data-care="water"]').textContent = seasonal.water || 'Care advice pending';
  card.querySelector('[data-care="meter"]').textContent = plant.care?.meter ? `Meter guide: ${plant.care.meter}` : '';
  card.querySelector('[data-care="feed"]').textContent = seasonal.feed || 'Care advice pending';
  const lightAdvice = plant.care?.light || 'Care advice pending';
  const lightDli = formatDliRange(plant.care?.lightDli);
  card.querySelector('[data-care="light"]').textContent = lightDli
    ? `${lightAdvice} Daily light target at leaf level: ${lightDli}.`
    : lightAdvice;

  if (state.managing) card.querySelector('.plant-card__body').insertBefore(makePlantEditor(specimen), card.querySelector('.care-highlights'));

  const details = card.querySelector('.care-details');
  appendDetail(details, 'Room light', state.rooms[plant.room]?.summary);
  appendDetail(details, 'Where', plant.placement);
  appendDetail(details, 'Current condition', plant.condition);
  appendDetail(details, 'History', plant.history);
  appendDetail(details, 'Identification', plant.identificationConfidence ? `${plant.identificationConfidence} confidence` : 'Pending research');
  Object.entries(detailLabels).forEach(([key, label]) => appendDetail(details, label, plant.care?.[key]));

  if (plant.sources?.length) {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    const list = document.createElement('ul');
    list.className = 'source-list';
    plant.sources.forEach((source) => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = source.url;
      link.textContent = source.label;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      item.append(link);
      list.append(item);
    });
    dt.textContent = 'Sources';
    dd.append(list);
    details.append(dt, dd);
  }

  if (!details.children.length) card.querySelector('details').hidden = true;
  return card;
}

function filteredPlants() {
  const query = normalizeSearch(state.query.trim());
  const plants = state.inventory.plants.filter((specimen) => {
    const plant = plantView(specimen);
    const matchesRoom = state.room === 'all' || plant.room === state.room;
    const matchesStatus = state.status === 'all' || plant.status === state.status;
    const room = state.rooms[plant.room];
    const journalText = [
      ...(specimen.notes || []).flatMap((entry) => [entry.text, noteTypeLabels[entry.type || 'note']]),
      ...(specimen.moistureReadings || []).map((entry) => entry.note),
      ...(specimen.photos || []).map((photo) => photo.note),
    ];
    const searchable = normalizeSearch([plant.commonName, plant.scientificName, ...(plant.aliases || []), plant.category, plant.room, plant.placement, plant.status, plant.condition, ...journalText, room?.aspect, room?.summary].filter(Boolean).join(' '));
    const moistureNeedsCheck = ['never', 'due', 'overdue', 'soon'].includes(dueInfo(specimen).state);
    const recoveryNeedsCheck = ['due', 'overdue', 'soon'].includes(futureActionInfo(specimen).state);
    const matchesCheck = !state.needsCheck || moistureNeedsCheck || recoveryNeedsCheck;
    return matchesRoom && matchesStatus && matchesCheck && (!query || searchable.includes(query));
  });

  return plants.sort((left, right) => {
    const leftPlant = plantView(left);
    const rightPlant = plantView(right);
    const leftDue = combinedDueInfo(left);
    const rightDue = combinedDueInfo(right);
    return comparePlantOrder(
      { room: leftPlant.room, name: leftPlant.commonName, dueState: leftDue.state, dueRemaining: leftDue.remaining },
      { room: rightPlant.room, name: rightPlant.commonName, dueState: rightDue.state, dueRemaining: rightDue.remaining },
      { needsCheck: state.needsCheck },
    );
  });
}

function render() {
  const plants = filteredPlants();
  elements.list.replaceChildren(...plants.map(makeCard));
  const total = state.inventory.plants.length;
  elements.empty.hidden = plants.length > 0;
  elements.list.hidden = plants.length === 0;
  elements.summary.textContent = total ? `${plants.length} of ${total} plant${total === 1 ? '' : 's'}` : '';
  elements.add.hidden = !state.managing;
  elements.manage.textContent = state.managing ? 'Finish managing' : 'Manage plants';
  elements.manage.setAttribute('aria-pressed', String(state.managing));

  if (!total) {
    elements.empty.querySelector('h2').textContent = 'No plants added yet';
    elements.empty.querySelector('p').textContent = 'Choose Manage plants, then add the first specimen.';
  } else if (!plants.length) {
    elements.empty.querySelector('h2').textContent = 'No matching plants';
    elements.empty.querySelector('p').textContent = 'Try another search, room or status.';
  }
}

function replaceSelectOptions(select, options) {
  const current = select.value;
  select.replaceChildren(...options);
  if ([...select.options].some((option) => option.value === current)) select.value = current;
}

function populateProfileOptions(query = '') {
  const search = normalizeSearch(query.trim());

  const matches = [...state.profiles]
    .filter((profile) => {
      if (!search) return true;
      return profileSearchText(profile).includes(search);
    })
    .sort((a, b) => a.commonName.localeCompare(b.commonName));

  if (!matches.length) {
    const noMatch = document.createElement('option');
    noMatch.disabled = true;
    noMatch.textContent = 'No matching care profiles';
    replaceSelectOptions(elements.profileInput, [...profileOptions(null, [], 'Species not listed — care profile pending'), noMatch]);
  } else {
    replaceSelectOptions(elements.profileInput, profileOptions(elements.profileInput.value, matches, 'Species not listed — care profile pending'));
  }

  if (search && matches.length === 1) {
    elements.profileInput.value = matches[0].id;
    if (!elements.nameInput.value.trim()) elements.nameInput.value = matches[0].commonName;
  }

  elements.profileResults.textContent = search
    ? `${matches.length} matching profile${matches.length === 1 ? ' selected' : 's'}`
    : `${matches.length} reviewed care profiles available`;
}

function populateControls() {
  const allRooms = document.createElement('option');
  allRooms.value = 'all';
  allRooms.textContent = 'All rooms';
  replaceSelectOptions(elements.room, [allRooms, ...roomOptions('')]);

  const allStatuses = document.createElement('option');
  allStatuses.value = 'all';
  allStatuses.textContent = 'All statuses';
  replaceSelectOptions(elements.status, [allStatuses, ...statusOptions.map((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    return option;
  })]);

  elements.roomInput.replaceChildren(...roomOptions(''));
  populateProfileOptions();
}

function uniquePlantId(name) {
  const slug = name.toLocaleLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'plant';
  const suffix = crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36);
  return `${slug}-${suffix}`;
}

function discardPendingNewPhoto() {
  const orphanedImage = state.pendingNewPhotoImage;
  state.pendingNewPlantId = null;
  state.pendingNewPhotoImage = '';
  state.pendingNewPhotoCaptureInfo = { capturedOn: '', source: '' };
  elements.newPhotoStatus.textContent = '';
  photoUploader.reset();
  if (orphanedImage) deleteUploadedPhoto(orphanedImage);
}

function startNewPlantPhoto() {
  discardPendingNewPhoto();
  state.pendingNewPlantId = uniquePlantId('plant');
  photoUploader.setContext({
    key: `new:${state.pendingNewPlantId}`,
    plantId: state.pendingNewPlantId,
    onEditorOpen() {
      state.preservePlantDialogOnClose = true;
      elements.dialog.close();
    },
    onEditorClose() {
      if (!elements.dialog.open) elements.dialog.showModal();
    },
    onSelected(filename, captureInfo = {}) {
      state.pendingNewPhotoCaptureInfo = captureInfo;
      elements.newPhotoStatus.textContent = filename ? `${filename} selected. Crop it, then choose Upload or add the plant.` : '';
    },
    onUploaded(uploadedImage, _file, captureInfo = {}) {
      const previousImage = state.pendingNewPhotoImage;
      state.pendingNewPhotoImage = uploadedImage;
      state.pendingNewPhotoCaptureInfo = captureInfo;
      photoUploader.prepareForNextFile();
      elements.newPhotoStatus.textContent = 'Photo uploaded and ready to use.';
      if (previousImage && previousImage !== uploadedImage) deleteUploadedPhoto(previousImage);
    },
    onError(error) {
      elements.newPhotoStatus.textContent = error.message;
      setInventoryStatus(error.message, 'error');
    },
  });
}

elements.search.addEventListener('input', (event) => { state.query = event.target.value; render(); });
elements.room.addEventListener('change', (event) => { state.room = event.target.value; render(); });
elements.status.addEventListener('change', (event) => { state.status = event.target.value; render(); });
elements.needsCheck.addEventListener('click', () => {
  state.needsCheck = !state.needsCheck;
  elements.needsCheck.setAttribute('aria-pressed', String(state.needsCheck));
  render();
});
elements.manage.addEventListener('click', () => {
  if (state.managing && hasUnsavedPlantEdits()
    && !window.confirm('Finish managing and discard your unsaved changes?')) return;
  const finishing = state.managing;
  state.managing = !state.managing;
  if (finishing) discardPlantEditDrafts();
  else state.editDrafts.clear();
  render();
});
window.addEventListener('beforeunload', (event) => {
  if (!hasUnsavedPlantEdits() && !hasUnsavedTimelinePhoto()) return;
  event.preventDefault();
  event.returnValue = '';
});
elements.browseCatalogue.addEventListener('click', () => {
  elements.catalogueSearch.value = '';
  elements.catalogueCategory.value = 'all';
  renderCatalogue();
  elements.catalogueDialog.showModal();
  elements.catalogueSearch.focus();
});
elements.closeCatalogue.addEventListener('click', () => elements.catalogueDialog.close());
elements.catalogueSearch.addEventListener('input', renderCatalogue);
elements.catalogueCategory.addEventListener('change', renderCatalogue);
elements.add.addEventListener('click', () => {
  elements.form.reset();
  startNewPlantPhoto();
  elements.profileSearch.value = '';
  populateProfileOptions();
  elements.roomInput.value = state.room !== 'all' ? state.room : 'Bright room';
  elements.dialog.showModal();
  elements.profileSearch.focus();
});
elements.cancelDialog.addEventListener('click', () => elements.dialog.close());
elements.dialog.addEventListener('close', () => {
  if (state.preservePlantDialogOnClose) {
    state.preservePlantDialogOnClose = false;
    return;
  }
  elements.form.reset();
  discardPendingNewPhoto();
});
elements.cancelDelete.addEventListener('click', () => elements.deleteDialog.close());
elements.deleteDialog.addEventListener('close', () => { state.pendingDeleteId = null; });
elements.confirmDelete.addEventListener('click', async () => {
  const plantId = state.pendingDeleteId;
  const index = state.inventory.plants.findIndex((plant) => plant.id === plantId);
  if (index < 0) {
    elements.deleteDialog.close();
    return;
  }

  const removedDraft = state.editDrafts.get(plantId);
  const [removed] = state.inventory.plants.splice(index, 1);
  const name = plantView(removed).commonName;
  elements.confirmDelete.disabled = true;
  elements.deleteDialog.close();
  render();
  try {
    await persistInventory(`${name} removed.`);
    state.editDrafts.delete(plantId);
    if (removedDraft?.pendingUploadedImage) await deleteUploadedPhoto(removedDraft.pendingUploadedImage);
    await Promise.all([...uploadedPhotoPaths(removed)].map(deleteUploadedPhoto));
  } catch (error) {
    state.inventory.plants.splice(index, 0, removed);
    render();
    setInventoryStatus(error.message, 'error');
  } finally {
    elements.confirmDelete.disabled = false;
  }
});
elements.profileSearch.addEventListener('input', (event) => populateProfileOptions(event.target.value));
elements.profileInput.addEventListener('change', () => {
  const profile = state.profileMap.get(elements.profileInput.value);
  if (profile && !elements.nameInput.value.trim()) elements.nameInput.value = profile.commonName;
});
elements.newPhoto.addEventListener('click', () => photoUploader.open());
elements.moistureValue.addEventListener('input', () => { elements.moistureOutput.value = elements.moistureValue.value; });
elements.closeJournal.addEventListener('click', () => elements.journalDialog.close());
elements.journalDialog.addEventListener('close', () => {
  state.journalPlantId = null;
  state.editingNoteId = null;
});
elements.closePhotos.addEventListener('click', requestPhotoDialogClose);
elements.photoDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  requestPhotoDialogClose();
});
elements.photoDialog.addEventListener('close', () => {
  if (state.preservePhotoDialogOnClose) {
    state.preservePhotoDialogOnClose = false;
    return;
  }
  state.photoPlantId = null;
  resetTimelinePhotoDraft({ removeUpload: true });
});
elements.timelinePhoto.addEventListener('click', () => photoUploader.open());
elements.photoCapturedOn.addEventListener('input', () => { state.photoDateTouched = true; });
elements.photoForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const specimen = currentPhotoPlant();
  const capturedOn = elements.photoCapturedOn.value;
  if (!specimen || !capturedOn) return;
  const editingExistingEntry = Boolean(state.pendingExistingPhotoId);
  if (!editingExistingEntry && (specimen.photos || []).length >= 100) {
    setPhotoStatus('This specimen has reached its 100-photo limit.', 'error');
    return;
  }
  const submit = elements.photoForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  elements.timelinePhoto.disabled = true;
  setPhotoStatus('Saving to the photo library…');
  let uploadedImage = '';
  const previous = {
    photos: [...(specimen.photos || [])],
    image: specimen.image,
    imageAlt: specimen.imageAlt,
  };
  const datingExistingPhoto = Boolean(state.pendingExistingPhotoUrl);
  try {
    uploadedImage = state.pendingExistingPhotoUrl || await photoUploader.uploadCurrent() || state.pendingTimelinePhotoImage;
    if (!uploadedImage) throw new Error('Choose and upload a photo before saving it to the library.');
    const note = elements.photoNote.value.trim();
    const now = new Date().toISOString();
    const savedPhoto = {
      id: state.pendingExistingPhotoId || activityId('photo'),
      url: uploadedImage,
      capturedOn,
      addedAt: state.pendingExistingPhotoId
        ? previous.photos.find((photo) => photo.id === state.pendingExistingPhotoId)?.addedAt || now
        : now,
      note,
    };
    let nextPhotos = editingExistingEntry
      ? previous.photos.map((photo) => (photo.id === state.pendingExistingPhotoId ? savedPhoto : photo))
      : [...previous.photos, savedPhoto];
    const replacingUnrecordedMain = !datingExistingPhoto
      && elements.photoUseMain.checked
      && previous.image
      && previous.image !== 'images/placeholder.svg'
      && previous.image !== uploadedImage
      && !previous.photos.some((photo) => photo.url === previous.image);
    if (replacingUnrecordedMain) {
      nextPhotos = withPreservedMainPhoto(nextPhotos, previous.image, { id: activityId('photo'), addedAt: now });
    }
    if (nextPhotos.length > 100) throw new Error('Date or delete an existing photo before replacing the main image.');
    specimen.photos = nextPhotos;
    if (elements.photoUseMain.checked) {
      specimen.image = uploadedImage;
      if (!datingExistingPhoto) {
        specimen.imageAlt = note || `${plantView(specimen).commonName} photographed ${formatCalendarDate(capturedOn)}`;
      }
    }
    await persistInventory('Photo history updated.');
    state.pendingTimelinePhotoImage = '';
    state.timelinePhotoSelected = false;
    resetTimelinePhotoDraft();
    const refreshedSpecimen = currentPhotoPlant();
    prepareTimelinePhotoUploader(refreshedSpecimen);
    elements.photoUseMain.checked = suggestMainPhoto(refreshedSpecimen, localDateKey(), localDateKey());
    state.highlightedPhotoId = savedPhoto.id;
    renderPhotoTimeline();
    setPhotoStatus(datingExistingPhoto ? 'Photo date saved.' : 'Added to the photo library. It is highlighted below.', 'saved');
    document.querySelector(`[data-photo-id="${savedPhoto.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    specimen.photos = previous.photos;
    specimen.image = previous.image;
    specimen.imageAlt = previous.imageAlt;
    setPhotoStatus(error.message, 'error');
    setInventoryStatus(error.message, 'error');
  } finally {
    submit.disabled = false;
    elements.timelinePhoto.disabled = false;
  }
});
elements.moistureForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const specimen = currentJournalPlant();
  if (!specimen) return;
  const previous = { moistureReadings: [...(specimen.moistureReadings || [])], notes: [...(specimen.notes || [])] };
  const nextCheckDays = Number(elements.moistureNextCheck.value);
  const automaticDays = Number(elements.moistureNextCheck.dataset.automaticDays);
  const reading = {
    id: activityId('reading'),
    value: Number(elements.moistureValue.value),
    checkedAt: new Date().toISOString(),
    note: elements.moistureNote.value.trim(),
    ...(nextCheckDays === automaticDays ? {} : { nextCheckDays }),
  };
  specimen.moistureReadings = [...previous.moistureReadings, reading].slice(-30);
  elements.journalStatus.textContent = 'Saving reading…';
  if (await saveJournalChange(specimen, previous, 'Moisture reading saved.')) {
    elements.journalDialog.close();
  }
});
elements.noteForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const specimen = currentJournalPlant();
  const text = elements.noteInput.value.trim();
  const type = elements.noteType.value;
  const eventDate = elements.noteDate.value;
  if (!specimen || !text || !eventDate) return;
  if (!state.editingNoteId && (specimen.notes || []).length >= 100) {
    elements.journalStatus.textContent = 'This recovery log has reached its 100-entry limit.';
    return;
  }
  const previous = { moistureReadings: [...(specimen.moistureReadings || [])], notes: [...(specimen.notes || [])] };
  const now = new Date().toISOString();
  if (state.editingNoteId) {
    specimen.notes = previous.notes.map((note) => {
      if (note.id !== state.editingNoteId) return note;
      const updated = { ...note, type, eventDate, text, updatedAt: now };
      if (type !== 'future-action') delete updated.completedAt;
      return updated;
    });
  } else {
    specimen.notes = [...previous.notes, {
      id: activityId('entry'),
      createdAt: now,
      eventDate,
      type,
      text,
    }];
  }
  elements.journalStatus.textContent = 'Saving entry…';
  if (await saveJournalChange(specimen, previous, 'Recovery entry saved.')) {
    resetRecoveryForm();
    elements.journalStatus.textContent = 'Entry saved.';
  }
});
elements.cancelNoteEdit.addEventListener('click', () => {
  resetRecoveryForm();
});
elements.noteType.addEventListener('change', updateRecoveryFormLabels);
elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(elements.form);
  const profileId = form.get('profileId') || null;
  const profile = state.profileMap.get(profileId);
  const name = String(form.get('name') || profile?.commonName || '').trim();
  const specimen = {
    id: state.pendingNewPlantId || uniquePlantId(name),
    profileId,
    name,
    room: String(form.get('room')),
    placement: String(form.get('placement') || '').trim(),
    image: profile?.defaultImage || 'images/placeholder.svg',
    imageAlt: profile ? `${profile.commonName} houseplant` : '',
    status: String(form.get('status') || 'New'),
    condition: '',
    history: [],
    photos: [],
    moistureReadings: [],
    notes: [],
    createdAt: new Date().toISOString(),
  };
  const submit = elements.form.querySelector('button[type="submit"]');
  let uploadedImage = '';
  submit.disabled = true;
  elements.cancelDialog.disabled = true;
  elements.newPhoto.disabled = true;
  elements.newPhotoStatus.textContent = 'Preparing the plant and its photo…';
  try {
    uploadedImage = await photoUploader.uploadCurrent() || state.pendingNewPhotoImage;
    if (uploadedImage) {
      specimen.image = uploadedImage;
      specimen.imageAlt = `${name} houseplant`;
      specimen.photos = [{
        id: activityId('photo'),
        url: uploadedImage,
        capturedOn: state.pendingNewPhotoCaptureInfo.capturedOn || localDateKey(),
        addedAt: new Date().toISOString(),
        note: '',
      }];
    }
    state.inventory.plants.push(specimen);
    render();
    await persistInventory(`${name} added.`);
    state.pendingNewPhotoImage = '';
    photoUploader.reset();
    elements.dialog.close();
  } catch (error) {
    state.inventory.plants = state.inventory.plants.filter((plant) => plant !== specimen);
    render();
    elements.newPhotoStatus.textContent = `${error.message} Your selected photo is still available; you can try again.`;
    setInventoryStatus(error.message, 'error');
  } finally {
    submit.disabled = false;
    elements.cancelDialog.disabled = false;
    elements.newPhoto.disabled = false;
  }
});
elements.seasons.forEach((button) => button.addEventListener('click', () => {
  state.season = button.dataset.season;
  elements.seasons.forEach((item) => {
    const active = item === button;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-pressed', String(active));
  });
  render();
}));

async function loadInventory(seed) {
  try {
    const response = await fetch('/api/inventory', { headers: { Accept: 'application/json' }, cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error(`Inventory service unavailable (${response.status})`);
    const payload = await response.json();
    state.syncAvailable = true;
    setInventoryStatus(payload.inventory ? 'Inventory synchronized.' : 'Ready to synchronize your first change.', 'saved');
    return migrateLegacyFollowUps(payload.inventory || seed);
  } catch (error) {
    if (state.localPreview) {
      let saved = null;
      try {
        saved = JSON.parse(localStorage.getItem('plant-guide-inventory-v1'));
      } catch {
        localStorage.removeItem('plant-guide-inventory-v1');
      }
      setInventoryStatus('Local preview: edits stay in this browser.', 'local');
      return migrateLegacyFollowUps(saved || seed);
    }
    setInventoryStatus('Plant editing is unavailable until EdgeOne KV is connected.', 'error');
    return migrateLegacyFollowUps(seed);
  }
}

try {
  const [profilesResponse, seedResponse, roomsResponse] = await Promise.all([
    fetch('data/care-profiles.json', { cache: 'no-store' }),
    fetch('data/inventory.json', { cache: 'no-store' }),
    fetch('data/rooms.json', { cache: 'no-store' }),
  ]);
  if (!profilesResponse.ok) throw new Error(`Unable to load care profiles (${profilesResponse.status})`);
  if (!seedResponse.ok) throw new Error(`Unable to load plant inventory (${seedResponse.status})`);
  if (!roomsResponse.ok) throw new Error(`Unable to load room data (${roomsResponse.status})`);
  state.profiles = await profilesResponse.json();
  state.profileMap = new Map(state.profiles.map((profile) => [profile.id, profile]));
  const seed = await seedResponse.json();
  const rooms = await roomsResponse.json();
  state.rooms = Object.fromEntries(rooms.map((room) => [room.name, room]));
  state.inventory = await loadInventory(seed);
  populateCatalogueCategories();
  populateControls();
  render();
} catch (error) {
  elements.empty.hidden = false;
  elements.empty.querySelector('h2').textContent = 'The plant guide could not be loaded';
  elements.empty.querySelector('p').textContent = `${error.message}. Open this project through a local web server rather than directly from the file system.`;
  setInventoryStatus('Unable to load the inventory.', 'error');
  console.error(error);
}
