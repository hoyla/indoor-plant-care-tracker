import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const source = await readFile(new URL('../photo-uploader-entry.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const pageSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const stylesheet = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

test('the photo workflow uses the Uppy editor, compressor and same-origin uploader', () => {
  for (const dependency of [
    '@uppy/core',
    '@uppy/dashboard',
    '@uppy/image-editor',
    '@uppy/compressor',
    '@uppy/xhr-upload',
  ]) {
    assert.ok(packageJson.dependencies[dependency], `${dependency} is required`);
  }

  assert.match(source, /aspectRatio:\s*3\s*\/\s*4/);
  assert.match(source, /maxWidth:\s*900/);
  assert.match(source, /maxHeight:\s*1200/);
  assert.match(source, /mimeType:\s*['"]image\/jpeg['"]/);
  assert.match(source, /MAX_PREPARED_PHOTO_BYTES\s*=\s*900\s*\*\s*1024/);
  assert.match(source, /`\/api\/photos\?plantId=\$\{encodeURIComponent\(sessionContext\.plantId\)\}`/);
  assert.match(source, /method:\s*['"]POST['"]/);
  assert.match(source, /formData:\s*false/);
  assert.doesNotMatch(source, /createUploadUrl|uploadUrl|method:\s*['"]PUT['"]/);
});

test('portrait photos divide into a square image and plain identity strip', () => {
  assert.match(stylesheet, /\.plant-card__image-wrap\s*{[^}]*aspect-ratio:\s*3\s*\/\s*4/);
  assert.match(stylesheet, /\.plant-card__heading\s*{[^}]*height:\s*25%/);
  assert.match(stylesheet, /\.plant-card__heading::before\s*{[^}]*background:\s*rgba\(244,247,241,\.5\)/);
  assert.doesNotMatch(stylesheet, /\.plant-card__heading::before\s*{[^}]*radial-gradient/);
  assert.match(stylesheet, /\.plant-card__badges\s*{[^}]*flex-direction:\s*column/);
  assert.match(pageSource, /plant-card__image-wrap[\s\S]*plant-card__heading[\s\S]*plant-card__body/);
});

test('the deployable Uppy assets have been built', async () => {
  for (const asset of ['photo-uploader.js', 'photo-uploader.css']) {
    const details = await stat(new URL(`../vendor/${asset}`, import.meta.url));
    assert.ok(details.size > 1_000, `${asset} should contain the bundled uploader`);
  }
});

test('existing-plant photos remain visibly pending until a timeline entry is saved', () => {
  assert.doesNotMatch(pageSource, /type=["']file["']/);
  assert.match(appSource, /pendingTimelinePhotoImage/);
  assert.match(appSource, /Upload complete — one final save is needed below\./);
  assert.match(appSource, /Not in the photo library yet/);
  assert.match(appSource, /hasUnsavedTimelinePhoto/);
  assert.match(appSource, /Close and discard it\?/);
  assert.match(appSource, /capturedOn,[\s\S]*?addedAt:[\s\S]*?note,/);
  assert.match(appSource, /await persistInventory\('Photo history updated\.'\)/);
});

test('a legacy main photo can be dated without uploading it again', () => {
  assert.match(appSource, /pendingExistingPhotoUrl/);
  assert.match(appSource, /state\.pendingExistingPhotoUrl\s*\|\|\s*await photoUploader\.uploadCurrent\(\)/);
  assert.match(appSource, /beginDatingExistingPhoto\(photo, specimen\)/);
  assert.match(appSource, /if \(!datingExistingPhoto\)\s*{\s*specimen\.imageAlt/);
  assert.match(pageSource, /id="save-timeline-photo"/);
});

test('saved photo feedback, deletion and original recovery are available', () => {
  assert.match(pageSource, /id="timeline-photo-preview"/);
  assert.match(pageSource, />Save to photo library</);
  assert.match(appSource, /Added to the photo library\. It is highlighted below\./);
  assert.match(appSource, /removeTimelinePhoto\(photo, specimen, remove\)/);
  assert.match(appSource, /Restore original photo/);
  assert.match(appSource, /capturedOn:\s*null/);
});

test('photo selection reads capture metadata before timeline persistence', () => {
  assert.match(source, /photoCaptureInfo/);
  assert.match(source, /current\.captureInfo\s*=\s*await photoCaptureInfo\(file\.data\)/);
  assert.match(source, /onUploaded\?\.\(current\.uploadedImage, file, current\.captureInfo\)/);
  assert.match(source, /onSelected\?\.\(file\.name, current\.captureInfo, file\)/);
  assert.match(pageSource, /id="photo-captured-on"[^>]*type="date"/);
  assert.match(pageSource, /id="photo-note"[^>]*maxlength="500"/);
});

test('every picker opening gets a fresh editor session without clearing an active upload', () => {
  assert.match(source, /function createSession\(\)/);
  assert.match(source, /id:\s*`plant-photo-uploader-\$\{\+\+sessionNumber\}`/);
  assert.match(source, /open\(nextContext = null\)[\s\S]*?const current = createSession\(\);[\s\S]*?current\.dashboard\.openModal\(\)/);
  assert.match(source, /previous\.uppy\.destroy\(\)/);
  assert.doesNotMatch(source, /uppy\.clear\(\)/);
  assert.match(appSource, /state\.pendingNewPhotoImage\s*=\s*uploadedImage;[\s\S]*?photoUploader\.prepareForNextFile\(\)/);
  assert.match(appSource, /uploadedImage\s*=\s*await photoUploader\.uploadCurrent\(\)\s*\|\|\s*state\.pendingNewPhotoImage/);
  assert.doesNotMatch(appSource, /state\.pendingNewPhotoImage\s*\|\|\s*await photoUploader\.uploadCurrent\(\)/);
});

test('the new-plant dialog yields the browser top layer while its photo editor is open', () => {
  assert.match(appSource, /onEditorOpen\(\)\s*{[\s\S]*?elements\.dialog\.close\(\)/);
  assert.match(appSource, /onEditorClose\(\)\s*{[\s\S]*?elements\.dialog\.showModal\(\)/);
  assert.match(appSource, /preservePlantDialogOnClose/);
  assert.match(source, /dashboard:modal-closed/);
  assert.match(source, /context\.onEditorOpen\?\.\(\);[\s\S]*?current\.dashboard\.openModal\(\)/);
});
