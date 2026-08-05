import { GMapsParseError } from '../types/common.js';

const XSSI_PREFIX = ")]}'";

/**
 * Strip Google's XSSI prefix and parse the first complete JSON array.
 * Maps endpoints return `)]}'` followed by nested JSON arrays (protobuf-over-JSON).
 */
export function parseGoogleResponse<T = unknown>(responseText: string): T {
  if (!responseText) {
    return [] as T;
  }

  let text = responseText.trim();
  if (text.startsWith(XSSI_PREFIX)) {
    text = text.slice(XSSI_PREFIX.length).trim();
  }

  if (!text) {
    return [] as T;
  }

  let depth = 0;
  let start: number | null = null;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (char === ']') {
      depth--;
      if (depth === 0 && start !== null) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as T;
        } catch {
          // continue scanning
        }
      }
    }
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new GMapsParseError('Failed to parse Google Maps response', error);
  }
}

export function isValidResponseBody(body: string): boolean {
  const stripped = body.startsWith(XSSI_PREFIX) ? body.slice(4).trim() : body.trim();
  return stripped.length >= 100;
}
