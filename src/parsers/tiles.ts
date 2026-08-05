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
