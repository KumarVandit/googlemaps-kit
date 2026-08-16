import { htmlToPlainText } from './shared.js';
import { GMapsParseError } from '../types/common.js';
import type { PlaceList, PlaceListEntry } from '../types/lists.js';
import { toFeatureId } from '../utils/ids.js';
import { safeGet } from '../utils/payload.js';
import type { PbNode } from '../types/protobuf.js';

/** Known getlist error envelope codes returned with HTTP 200. */
export type ListErrorCode = 2 | 4;

export interface ListErrorEnvelope {
  code: ListErrorCode;
  detail?: string;
}

/** Detect `[null,null,[code,detail]]` error envelopes (codes 2 and 4). */
export function detectListErrorEnvelope(data: unknown): ListErrorEnvelope | null {
  if (!Array.isArray(data) || data.length !== 3) return null;
  if (data[0] !== null || data[1] !== null) return null;

  const block = data[2];
  if (!Array.isArray(block) || typeof block[0] !== 'number') return null;

  const code = block[0];
  switch (code) {
    case 2:
    case 4:
      return {
        code,
        detail: typeof block[1] === 'string' ? block[1] : undefined,
      };
    default:
      return null;
  }
}

/** Throw a descriptive parse error for list error envelopes. */
export function assertListNotErrorEnvelope(data: unknown): void {
  const err = detectListErrorEnvelope(data);
  if (!err) return;

  switch (err.code) {
    case 2:
      throw new GMapsParseError(
        err.detail
          ? `Place list request failed (code 2): ${err.detail}`
          : 'Place list request failed (code 2): share URL or context required',
      );
    case 4:
      throw new GMapsParseError(
        err.detail
          ? `Place list not found or private (code 4): ${err.detail}`
          : 'Place list not found or private (code 4)',
      );
    default: {
      const exhaustive: never = err.code;
      throw new GMapsParseError(`Unhandled place list error code: ${String(exhaustive)}`);
    }
  }
}

/** Extract list id from a placelists page URL, short link, or raw id string. */
export function parseListIdFromInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const fromPath = trimmed.match(/placelists\/list\/([a-zA-Z0-9_-]+)/);
  if (fromPath) return fromPath[1]!;

  if (/^https?:\/\//i.test(trimmed) || trimmed.includes('goo.gl')) {
    return null;
  }

  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/** Extract list id from a redirected Maps list page HTML preload link. */
export function extractListIdFromPageHtml(html: string, finalUrl?: string): string | null {
  if (finalUrl) {
    const fromUrl = finalUrl.match(/placelists\/list\/([a-zA-Z0-9_-]+)/);
    if (fromUrl) return fromUrl[1]!;
  }

  const fromHtml = html.match(/placelists\/list\/([a-zA-Z0-9_-]+)/);
  if (fromHtml) return fromHtml[1]!;

  const pbMatches = [
    ...html.matchAll(/entitylist\/getlist\?[^"'\\]+/g),
    ...html.matchAll(/!1m1!1s([a-zA-Z0-9_-]+)/g),
  ];
  for (const match of pbMatches) {
    const pbParam = match[0] ?? '';
    const decoded = decodeURIComponent(pbParam.replace(/&amp;/g, '&'));
    const fromPb = decoded.match(/!1s([a-zA-Z0-9_-]+)/);
    if (fromPb) return fromPb[1]!;
    if (match[1]) return match[1]!;
  }

  const jsonMatch = html.match(/"listId":"([^"]+)"/);
  if (jsonMatch) return jsonMatch[1]!;

  return null;
}

function decimalPairToHexId(pair: unknown): string | undefined {
  if (!Array.isArray(pair) || pair.length < 2) return undefined;
  const hiRaw = pair[0];
  const loRaw = pair[1];
  if (
    (typeof hiRaw !== 'string' && typeof hiRaw !== 'number') ||
    (typeof loRaw !== 'string' && typeof loRaw !== 'number')
  ) {
    return undefined;
  }

  try {
    return toFeatureId(BigInt(String(hiRaw)), BigInt(String(loRaw)));
  } catch {
    return undefined;
  }
}

function parseAddedAt(value: unknown): string | undefined {
  if (!Array.isArray(value) || typeof value[0] !== 'number') return undefined;
  const seconds = value[0];
  const nanos = typeof value[1] === 'number' ? value[1] : 0;
  const ms = seconds * 1000 + Math.floor(nanos / 1_000_000);
  return new Date(ms).toISOString();
}

function parsePlaceListEntry(raw: PbNode): PlaceListEntry | null {
  if (!Array.isArray(raw)) return null;

  const nameRaw = safeGet<string>(raw, 2);
  if (typeof nameRaw !== 'string' || nameRaw.length === 0) return null;

  const addressBlock = safeGet<PbNode>(raw, 1);
  // Verified slot layout from lists-tokyo-trimmed.json fixture (2026-07-31):
  //   addressBlock[2] = full formatted address including place name prefix
  //                     e.g. "Marcy Land Omotesando Ramen Bar, 屋台 ... Tokyo 107-0061, Japan"
  //   addressBlock[4] = locale-format reverse address (country-first, not useful as street)
  //                     e.g. "Japan, 〒107-0061 Tokyo, Minato City, ..."
  //   addressBlock[5] = [null, null, lat, lng]
  //   addressBlock[6] = ["hi_decimal", "lo_decimal"] for hex id reconstruction
  //   addressBlock[7] = "/g/featureId"
  //   addressBlock[8] = "ChIJ..." placeId when present
  const fullAddressRaw = safeGet<string>(addressBlock, 2);
  const lat = safeGet<number>(addressBlock, 5, 2);
  const lng = safeGet<number>(addressBlock, 5, 3);

  const hexPair =
    safeGet<unknown>(addressBlock, 6) ??
    safeGet<unknown>(addressBlock, 5, 4);
  const featureIdRaw =
    safeGet<string>(addressBlock, 7) ??
    safeGet<string>(addressBlock, 5, 5);
  // placeId at addressBlock[8] or addressBlock[5][6]
  const placeIdRaw =
    safeGet<string>(addressBlock, 8) ??
    safeGet<string>(addressBlock, 5, 6);

  const noteRaw = safeGet<string>(raw, 3);
  const addedBy =
    safeGet<string>(raw, 12, 0) ??
    safeGet<string>(raw, 13, 0);
  const addedAt =
    parseAddedAt(safeGet(raw, 9)) ??
    parseAddedAt(safeGet(raw, 11));

  const entry: PlaceListEntry = {
    name: htmlToPlainText(nameRaw),
    raw,
  };

  if (typeof noteRaw === 'string' && noteRaw.length > 0) {
    entry.note = htmlToPlainText(noteRaw);
  }
  // fullAddressRaw (ab[2]) is the full address string — may be prefixed with the place name.
  // Populate `address` from it; `streetAddress` is no longer populated because ab[4]
  // is the locale-format reverse address (country-first), not a street-level line.
  if (typeof fullAddressRaw === 'string' && fullAddressRaw.length > 0) {
    entry.address = htmlToPlainText(fullAddressRaw);
  }
  if (typeof lat === 'number' && Number.isFinite(lat)) entry.lat = lat;
  if (typeof lng === 'number' && Number.isFinite(lng)) entry.lng = lng;

  const hexId = decimalPairToHexId(hexPair);
  if (hexId) entry.hexId = hexId;
  if (typeof featureIdRaw === 'string' && featureIdRaw.length > 0) {
    entry.featureId = featureIdRaw;
  }
  if (typeof placeIdRaw === 'string' && placeIdRaw.startsWith('ChIJ')) {
    entry.placeId = placeIdRaw;
  }
  if (typeof addedBy === 'string' && addedBy.length > 0) {
    entry.addedBy = addedBy;
  }
  if (addedAt) entry.addedAt = addedAt;

  return entry;
}

function listBundleRoot(data: unknown): PbNode | undefined {
  if (!Array.isArray(data)) return undefined;

  const err = detectListErrorEnvelope(data);
  if (err) return undefined;

  const first = data[0];
  if (!Array.isArray(first)) return undefined;

  if (typeof first[0] === 'string' || Array.isArray(first[0])) {
    return first;
  }

  const nested = first[0];
  if (Array.isArray(nested)) return nested;

  return first;
}

/**
 * Parse a getlist response into a {@link PlaceList}.
 * Throws {@link GMapsParseError} on error envelopes (codes 2 and 4).
 */
export function extractPlaceList(data: unknown, options?: { raw?: boolean }): PlaceList {
  assertListNotErrorEnvelope(data);

  const bundle = listBundleRoot(data);
  if (!bundle) {
    return { entries: [], raw: options?.raw ? data : undefined };
  }

  const listIdFromNested = safeGet<string>(bundle, 0, 0);
  const listIdDirect = Array.isArray(bundle) && typeof bundle[0] === 'string' ? bundle[0] : undefined;
  const listId = listIdFromNested ?? listIdDirect;

  const title = safeGet<string>(bundle, 4);
  const ownerName = safeGet<string>(bundle, 3, 0);
  const ownerAvatarUrl = safeGet<string>(bundle, 3, 1);
  const shareUrl = safeGet<string>(bundle, 2, 2);
  const placeCount = safeGet<number>(bundle, 12);

  const placesNode =
    safeGet<PbNode[]>(bundle, 8) ??
    safeGet<PbNode[]>(bundle, 7);

  const entries: PlaceListEntry[] = [];
  if (Array.isArray(placesNode)) {
    for (const rawEntry of placesNode) {
      const parsed = parsePlaceListEntry(rawEntry);
      if (parsed) entries.push(parsed);
    }
  }

  const result: PlaceList = {
    title: typeof title === 'string' ? title : undefined,
    ownerName: typeof ownerName === 'string' ? ownerName : undefined,
    ownerAvatarUrl: typeof ownerAvatarUrl === 'string' ? ownerAvatarUrl : undefined,
    shareUrl: typeof shareUrl === 'string' ? shareUrl : undefined,
    placeCount: typeof placeCount === 'number' ? placeCount : undefined,
    entries,
    raw: options?.raw ? data : undefined,
  };
  if (listId) result.listId = listId;
  return result;
}
