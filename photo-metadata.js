function readAscii(view, offset, length) {
  if (offset < 0 || length < 0 || offset + length > view.byteLength) return '';
  let value = '';
  for (let index = 0; index < length; index += 1) {
    const byte = view.getUint8(offset + index);
    if (!byte) break;
    value += String.fromCharCode(byte);
  }
  return value;
}

function exifCalendarDate(value) {
  const match = /^(\d{4}):(\d{2}):(\d{2})(?:\s|$)/.exec(value.trim());
  if (!match) return '';
  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (parsed.getUTCFullYear() !== Number(year)
    || parsed.getUTCMonth() !== Number(month) - 1
    || parsed.getUTCDate() !== Number(day)) return '';
  return `${year}-${month}-${day}`;
}

function ifdValue(view, tiffStart, entryOffset, littleEndian) {
  const type = view.getUint16(entryOffset + 2, littleEndian);
  const count = view.getUint32(entryOffset + 4, littleEndian);
  if (type !== 2 || !count || count > 40) return '';
  const valueOffset = count <= 4
    ? entryOffset + 8
    : tiffStart + view.getUint32(entryOffset + 8, littleEndian);
  return readAscii(view, valueOffset, count);
}

function readIfd(view, tiffStart, relativeOffset, littleEndian) {
  const offset = tiffStart + relativeOffset;
  if (offset < tiffStart || offset + 2 > view.byteLength) return { date: '', exifOffset: 0 };
  const count = view.getUint16(offset, littleEndian);
  if (count > 256 || offset + 2 + (count * 12) > view.byteLength) return { date: '', exifOffset: 0 };
  let fallbackDate = '';
  let exifOffset = 0;
  for (let index = 0; index < count; index += 1) {
    const entryOffset = offset + 2 + (index * 12);
    const tag = view.getUint16(entryOffset, littleEndian);
    if (tag === 0x8769) exifOffset = view.getUint32(entryOffset + 8, littleEndian);
    if (tag === 0x0132 || tag === 0x9003 || tag === 0x9004) {
      const date = exifCalendarDate(ifdValue(view, tiffStart, entryOffset, littleEndian));
      if (date && (tag === 0x9003 || !fallbackDate)) fallbackDate = date;
    }
  }
  return { date: fallbackDate, exifOffset };
}

export function extractExifCaptureDate(buffer) {
  const view = buffer instanceof DataView ? buffer : new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return '';
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xda || marker === 0xd9) break;
    const segmentLength = view.getUint16(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > view.byteLength) break;
    if (marker === 0xe1 && readAscii(view, offset + 4, 6) === 'Exif') {
      const tiffStart = offset + 10;
      if (tiffStart + 8 > view.byteLength) return '';
      const byteOrder = readAscii(view, tiffStart, 2);
      const littleEndian = byteOrder === 'II';
      if (!littleEndian && byteOrder !== 'MM') return '';
      if (view.getUint16(tiffStart + 2, littleEndian) !== 42) return '';
      const first = readIfd(view, tiffStart, view.getUint32(tiffStart + 4, littleEndian), littleEndian);
      if (first.exifOffset) {
        const exif = readIfd(view, tiffStart, first.exifOffset, littleEndian);
        if (exif.date) return exif.date;
      }
      return first.date;
    }
    offset += 2 + segmentLength;
  }
  return '';
}

export async function photoCaptureInfo(file) {
  if (file instanceof Blob && /jpe?g/i.test(file.type || '')) {
    try {
      const capturedOn = extractExifCaptureDate(await file.arrayBuffer());
      if (capturedOn) return { capturedOn, source: 'exif' };
    } catch {
      // Metadata is only a convenience; the editable date field remains available.
    }
  }
  if (Number.isFinite(file?.lastModified) && file.lastModified > 0) {
    const modified = new Date(file.lastModified);
    if (!Number.isNaN(modified.getTime())) {
      const local = new Date(modified.getTime() - (modified.getTimezoneOffset() * 60_000));
      return { capturedOn: local.toISOString().slice(0, 10), source: 'file' };
    }
  }
  return { capturedOn: '', source: '' };
}
