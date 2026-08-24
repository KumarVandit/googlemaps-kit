import type { CreateShortUrlResult, DecodedMapsUrl } from '../types/batch-url.js';
import type { PbNode } from '../types/protobuf.js';
import { safeGet } from '../utils/payload.js';
import { parseBatchPayload } from '../rpc/batch-rpc.js';

/**
 * Parse DecodeUrl batchexecute response.
 *
 * Verified slot layout from decode-url-kake.json fixture:
 *   root[0][2][1] = [typeCode, lng, lat, null, null, zoom]
 *   root[0][3][2][1] = name string
 *
 * typeCode values (observed):
 *   2 = place page URL (has name + lat/lng/zoom)
 *   1 = search/query URL (unconfirmed — no fixture)
 *   3 = directions URL (unconfirmed — no fixture)
 *   4 = viewport-only URL (unconfirmed — no fixture)
 */
export function extractDecodedMapsUrl(data: unknown, options?: { raw?: boolean }): DecodedMapsUrl {
  const root = parseBatchPayload(data);
  const block = safeGet<PbNode[]>(root, 0) ?? root;
  const coords = safeGet<unknown[]>(block, 2, 1);
  const name = safeGet<string>(block, 3, 2, 1);

  let lat: number | undefined;
  let lng: number | undefined;
  let zoom: number | undefined;
  let type: DecodedMapsUrl['type'];

  if (Array.isArray(coords)) {
    const typeCode = typeof coords[0] === 'number' ? coords[0] : undefined;
    lng = typeof coords[1] === 'number' ? coords[1] : undefined;
    lat = typeof coords[2] === 'number' ? coords[2] : undefined;
    zoom = typeof coords[5] === 'number' ? coords[5] : undefined;

    // Derive URL type from the type code. Only code 2 (place) is confirmed from
    // the fixture; others are inferred from Maps URL structure conventions.
    switch (typeCode) {
      case 1: type = 'search'; break;
      case 2: type = 'place'; break;
      case 3: type = 'directions'; break;
      case 4: type = 'viewport'; break;
    }
  }

  return {
    name,
    lat,
    lng,
    zoom,
    type,
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
