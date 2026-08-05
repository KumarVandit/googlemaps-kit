import type { CreateShortUrlResult, DecodedMapsUrl } from '../types/batch-url.js';
import type { PbNode } from '../types/protobuf.js';
import { safeGet } from '../utils/safe-get.js';
import { parseBatchPayload } from '../rpc/batch-rpc.js';

/**
 * Parse DecodeUrl batchexecute response.
 * Verified: lng [0][2][1][1], lat [0][2][1][2], zoom [0][2][1][5], name [0][3][2][1].
 */
export function extractDecodedMapsUrl(data: unknown, options?: { raw?: boolean }): DecodedMapsUrl {
  const root = parseBatchPayload(data);
  const block = safeGet<PbNode[]>(root, 0) ?? root;
  const coords = safeGet<unknown[]>(block, 2, 1);
  const name = safeGet<string>(block, 3, 2, 1);

  let lat: number | undefined;
  let lng: number | undefined;
  let zoom: number | undefined;

  if (Array.isArray(coords)) {
    lng = typeof coords[1] === 'number' ? coords[1] : undefined;
    lat = typeof coords[2] === 'number' ? coords[2] : undefined;
    zoom = typeof coords[5] === 'number' ? coords[5] : undefined;
  }

  return {
    name,
    lat,
    lng,
    zoom,
    raw: options?.raw ? root : undefined,
  };
}

/** Parse CreateShortUrl — short link typically at [0] or [1]. */
export function extractCreateShortUrlResult(data: unknown, options?: { raw?: boolean }): CreateShortUrlResult {
  const root = parseBatchPayload(data);
  const candidates = [
    safeGet<string>(root, 0),
    safeGet<string>(root, 1),
    safeGet<string>(root, 0, 0),
  ];
  const shortUrl = candidates.find((u) => typeof u === 'string' && u.includes('goo.gl'));
  return {
    shortUrl,
    raw: options?.raw ? root : undefined,
  };
}
