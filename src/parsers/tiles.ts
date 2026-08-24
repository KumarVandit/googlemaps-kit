/**
 * Parse protobuf-wrapped basemap tile responses.
 *
 * `/maps/vt/proto` and `/maps/vt/stream` return `application/x-octet-stream` bodies
 * where a PNG image is embedded inside a protobuf envelope. The PNG magic `\x89PNG`
 * appears after a short protobuf header; locate it and slice through the IEND chunk.
 */

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IEND_TYPE = new Uint8Array([0x49, 0x45, 0x4e, 0x44]); // "IEND"
const IEND_TRAILER = new Uint8Array([0xae, 0x42, 0x60, 0x82]);
const JPEG_SOI = new Uint8Array([0xff, 0xd8, 0xff]);

function bytesEqual(a: Uint8Array, offset: number, pattern: Uint8Array): boolean {
  if (offset + pattern.length > a.length) return false;
  for (let i = 0; i < pattern.length; i++) {
    if (a[offset + i] !== pattern[i]) return false;
  }
  return true;
}

/** Locate the PNG signature inside a protobuf-wrapped tile body. */
export function findPngOffset(data: Uint8Array): number {
  for (let i = 0; i <= data.length - PNG_SIGNATURE.length; i++) {
    if (bytesEqual(data, i, PNG_SIGNATURE)) return i;
  }
  return -1;
}

/**
 * Extract raw PNG bytes from a protobuf-wrapped tile response.
 * Returns null when no valid PNG envelope is found.
 */
export function unwrapTilePng(data: Uint8Array): Uint8Array | null {
  const start = findPngOffset(data);
  if (start < 0) return null;

  for (let i = start + 8; i <= data.length - 8; i++) {
    if (
      bytesEqual(data, i, IEND_TYPE) &&
      i >= 4 &&
      data[i - 4] === 0 &&
      data[i - 3] === 0 &&
      data[i - 2] === 0 &&
      data[i - 1] === 0 &&
      bytesEqual(data, i + 4, IEND_TRAILER)
    ) {
      return data.slice(start, i + 8);
    }
  }

  return null;
}

/** Read PNG width/height from the IHDR chunk (first chunk after the 8-byte signature). */
export function readPngDimensions(data: Uint8Array): { width: number; height: number } | null {
  if (data.length < 24 || !bytesEqual(data, 0, PNG_SIGNATURE)) return null;

  const ihdrOffset = 8;
  if (!bytesEqual(data, ihdrOffset + 4, new Uint8Array([0x49, 0x48, 0x44, 0x52]))) {
    return null;
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const width = view.getUint32(ihdrOffset + 8, false);
  const height = view.getUint32(ihdrOffset + 12, false);

  if (width === 0 || height === 0) return null;
  return { width, height };
}

/** True when the buffer contains a PNG signature (raw or protobuf-wrapped). */
export function isPngBytes(data: Uint8Array): boolean {
  if (bytesEqual(data, 0, PNG_SIGNATURE)) return true;
  return findPngOffset(data) >= 0;
}

/** Locate the JPEG SOI marker inside a tile body. */
function findJpegOffset(data: Uint8Array): number {
  for (let i = 0; i <= data.length - JPEG_SOI.length; i++) {
    if (bytesEqual(data, i, JPEG_SOI)) return i;
  }
  return -1;
}

/**
 * Extract raw JPEG bytes from a tile response.
 *
 * `mt.google.com/vt?lyrs=p` (terrain) and the satellite layers answer with
 * `image/jpeg`, not PNG. Slices from SOI through the EOI marker; falls back to
 * the tail of the buffer when EOI is absent.
 */
function unwrapTileJpeg(data: Uint8Array): Uint8Array | null {
  const start = findJpegOffset(data);
  if (start < 0) return null;

  for (let i = data.length - 2; i > start; i--) {
    if (data[i] === 0xff && data[i + 1] === 0xd9) {
      return data.slice(start, i + 2);
    }
  }

  return data.slice(start);
}

/** Read JPEG width/height from the first SOFn frame header. */
export function readJpegDimensions(data: Uint8Array): { width: number; height: number } | null {
  if (!bytesEqual(data, 0, JPEG_SOI)) return null;

  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = data[offset + 1]!;
    // SOF0–SOF15, excluding DHT (c4), JPG (c8) and DAC (cc).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = (data[offset + 5]! << 8) | data[offset + 6]!;
      const width = (data[offset + 7]! << 8) | data[offset + 8]!;
      return { width, height };
    }
    const segmentLength = (data[offset + 2]! << 8) | data[offset + 3]!;
    if (segmentLength < 2) return null;
    offset += 2 + segmentLength;
  }

  return null;
}

/**
 * Extract the image bytes from a tile response regardless of codec.
 * Returns the slice plus the detected mime type.
 */
export function unwrapTileImage(
  data: Uint8Array,
): { bytes: Uint8Array; mimeType: 'image/png' | 'image/jpeg' } | null {
  const png = unwrapTilePng(data);
  if (png && readPngDimensions(png)) return { bytes: png, mimeType: 'image/png' };

  const jpeg = unwrapTileJpeg(data);
  if (jpeg && readJpegDimensions(jpeg)) return { bytes: jpeg, mimeType: 'image/jpeg' };

  return null;
}
