import assert from 'node:assert/strict';
import test from 'node:test';

import { extractExifCaptureDate, photoCaptureInfo } from '../photo-metadata.js';

function jpegWithExifDate(value) {
  const date = new TextEncoder().encode(`${value}\0`);
  const tiffLength = 44 + date.length;
  const bytes = new Uint8Array(2 + 2 + 2 + 6 + tiffLength + 2);
  const view = new DataView(bytes.buffer);
  bytes.set([0xff, 0xd8, 0xff, 0xe1], 0);
  view.setUint16(4, 2 + 6 + tiffLength);
  bytes.set(new TextEncoder().encode('Exif\0\0'), 6);
  const tiff = 12;
  bytes.set(new TextEncoder().encode('II'), tiff);
  view.setUint16(tiff + 2, 42, true);
  view.setUint32(tiff + 4, 8, true);
  view.setUint16(tiff + 8, 1, true);
  view.setUint16(tiff + 10, 0x8769, true);
  view.setUint16(tiff + 12, 4, true);
  view.setUint32(tiff + 14, 1, true);
  view.setUint32(tiff + 18, 26, true);
  view.setUint32(tiff + 22, 0, true);
  view.setUint16(tiff + 26, 1, true);
  view.setUint16(tiff + 28, 0x9003, true);
  view.setUint16(tiff + 30, 2, true);
  view.setUint32(tiff + 32, date.length, true);
  view.setUint32(tiff + 36, 44, true);
  view.setUint32(tiff + 40, 0, true);
  bytes.set(date, tiff + 44);
  bytes.set([0xff, 0xd9], bytes.length - 2);
  return bytes.buffer;
}

test('extracts the EXIF DateTimeOriginal calendar date', () => {
  assert.equal(extractExifCaptureDate(jpegWithExifDate('2024:11:03 14:25:09')), '2024-11-03');
});

test('ignores invalid or absent EXIF dates', () => {
  assert.equal(extractExifCaptureDate(jpegWithExifDate('2024:02:31 14:25:09')), '');
  assert.equal(extractExifCaptureDate(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer), '');
});

test('prefers EXIF and otherwise offers an editable file-date suggestion', async () => {
  const jpeg = new Blob([jpegWithExifDate('2023:08:17 09:00:00')], { type: 'image/jpeg' });
  assert.deepEqual(await photoCaptureInfo(jpeg), { capturedOn: '2023-08-17', source: 'exif' });

  const png = new Blob([new Uint8Array([0x89, 0x50])], { type: 'image/png' });
  Object.defineProperty(png, 'lastModified', { value: new Date(2022, 5, 4, 12).getTime() });
  assert.deepEqual(await photoCaptureInfo(png), { capturedOn: '2022-06-04', source: 'file' });
});
