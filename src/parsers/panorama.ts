import { buildThumbnailUrl } from '../rpc/panorama-pb.js';
import { safeGet } from '../utils/payload.js';
import { asNumber, asString } from './shared.js';
import type {
  PanoramaDepthMap,
  PanoramaHistoricalCapture,
  PanoramaLink,
  PanoramaMetadata,
  PanoramaRef,
} from '../types/panorama.js';

type PbNode = unknown;

function formatCaptureDate(year: unknown, month: unknown): string | undefined {
  if (typeof year !== 'number' || typeof month !== 'number') return undefined;
  const mm = String(month).padStart(2, '0');
  return `${year}-${mm}`;
}

/**
 * Convert a compass heading (0–360°) to a human-readable bearing label.
 * e.g. 0 → "N", 45 → "NE", 180 → "S", 315 → "NW".
 */
function headingToBearing(heading: number): string {
  const normalized = ((heading % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % 8;
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][index]!;
}

/**
 * Build a shareable Google Maps Street View URL for a given pano id and optional camera.
 */
function buildStreetViewUrl(panoId: string, heading?: number, pitch?: number): string {
  const h = heading ?? 0;
  const p = pitch ?? 0;
  return `https://www.google.com/maps/@?api=1&map_action=pano&pano=${panoId}&heading=${h}&pitch=${p}`;
}

/**
 * Build a Maps embed URL for a Street View panorama (works in <iframe>, no API key needed).
 */
function buildEmbedUrl(panoId: string, heading?: number, pitch?: number): string {
  const h = heading ?? 0;
  const p = pitch ?? 0;
  return `https://www.google.com/maps/embed?pb=!4v1!6m8!1m7!1s${panoId}!2m2!1d0!2d0!3f${h}!4f${p}!5f0.7820865974627469`;
}

/**
 * Detect the ~74-byte photometa stub Google returns for invalid/expired pano ids.
 *
 * The stub echoes the id at `$[1][0][1][1]` but leaves indices 2–6 null — unlike a
 * rich response which populates tile, address, attribution and navigation blocks.
 */
export function isPanoramaMetadataStub(data: unknown): boolean {
  const block = safeGet<PbNode[]>(data, 1, 0);
  if (!Array.isArray(block)) return true;

  for (const idx of [2, 3, 4, 5, 6]) {
    if (block[idx] != null) return false;
  }

  return asString(safeGet(block, 1, 1)) != null;
}

/**
 * Parse panoramas out of a `/maps/photometa/ac/v1` coverage tile.
 *
 * Coverage tiles are the more dependable lat/lng entry point: listentityphotos is abuse
 * throttled and mixes user photos into its results, whereas a tile returns only official
 * Street View panoramas with coordinates. Entries live at `$[1][1][i]`, with the id under
 * `[0][0][1]` and the position under `[0][2][0]`.
 */
export function extractCoveragePanoramas(data: unknown): PanoramaRef[] {
  const tiles = safeGet<PbNode[]>(data, 1, 1);
  if (!Array.isArray(tiles)) return [];

  const results: PanoramaRef[] = [];

  for (const entry of tiles) {
    if (!Array.isArray(entry)) continue;

    const panoId = asString(safeGet(entry, 0, 0, 1));
    if (!panoId) continue;

    const heading = asNumber(safeGet(entry, 0, 2, 2, 0));

    results.push({
      panoId,
      lat: asNumber(safeGet(entry, 0, 2, 0, 2)),
      lng: asNumber(safeGet(entry, 0, 2, 0, 3)),
      heading,
      thumbnailUrl: buildThumbnailUrl({ panoId, yaw: heading ?? 0 }),
      raw: entry,
    });
  }

  return results;
}

/** Parse `$[0][i]` entries from listentityphotos. */
export function extractNearbyPanoramas(data: unknown): PanoramaRef[] {
  const list = safeGet<PbNode[]>(data, 0);
  if (!Array.isArray(list)) return [];

  const results: PanoramaRef[] = [];

  for (const item of list) {
    if (!Array.isArray(item)) continue;

    const panoId = asString(safeGet(item, 0));
    if (!panoId) continue;

    const heading = asNumber(safeGet(item, 8, 1, 0));

    results.push({
      panoId,
      thumbnailUrl: asString(safeGet(item, 6, 0)),
      lng: asNumber(safeGet(item, 8, 0, 1)),
      lat: asNumber(safeGet(item, 8, 0, 2)),
      heading,
      pitch: asNumber(safeGet(item, 8, 1, 1)),
      raw: item,
    });
  }

  return results;
}

function parsePanoramaLink(linkNode: unknown): PanoramaLink | undefined {
  const panoId = asString(safeGet(linkNode, 0, 1));
  if (!panoId) return undefined;

  const heading = asNumber(safeGet(linkNode, 2, 1, 0));
  const bearingLabel = heading != null ? headingToBearing(heading) : undefined;

  return {
    panoId,
    lat: asNumber(safeGet(linkNode, 2, 0, 2)),
    lng: asNumber(safeGet(linkNode, 2, 0, 3)),
    heading,
    bearingLabel,
    raw: linkNode,
  };
}

function parseHistoricalCaptures(data: unknown): PanoramaHistoricalCapture[] {
  const list = safeGet<PbNode[]>(data, 1, 0, 5, 0, 8);
  if (!Array.isArray(list)) return [];

  const captures: PanoramaHistoricalCapture[] = [];

  for (const entry of list) {
    const year = asNumber(safeGet(entry, 1, 0));
    const month = asNumber(safeGet(entry, 1, 1));
    if (year == null || month == null) continue;
    const mm = String(month).padStart(2, '0');
    captures.push({ year, month, label: `${year}-${mm}`, raw: entry });
  }

  return captures;
}

function parseTileSizes(data: unknown): Array<[number, number]> | undefined {
  const zoomLevels = safeGet<PbNode[]>(data, 1, 0, 2, 3, 0);
  if (!Array.isArray(zoomLevels)) return undefined;

  const sizes: Array<[number, number]> = [];

  for (const level of zoomLevels) {
    const width = asNumber(safeGet(level, 0, 0));
    const height = asNumber(safeGet(level, 0, 1));
    if (width == null || height == null) continue;
    sizes.push([width, height]);
  }

  return sizes.length > 0 ? sizes : undefined;
}

/** Parse full photometa payload; returns null for stub / not-found responses. */
/** Address lines from `[1,0,3,2]` — `[["7th Ave","en"],["New York","en"]]`. */
function parseAddressLines(data: unknown): string[] | undefined {
  const rows = safeGet<PbNode[]>(data, 1, 0, 3, 2);
  if (!Array.isArray(rows)) return undefined;
  const lines = rows
    .map((row) => asString(safeGet(row, 0)))
    .filter((line): line is string => Boolean(line));
  return lines.length > 0 ? lines : undefined;
}

/**
 * Depth raster from `[1,0,20,0]`, present only when the request asked for
 * photometa section 18.
 *
 * The payload is a WebP carried inside the JSON as one byte per code unit, so
 * the caller must have parsed the response from latin1 rather than UTF-8 — a
 * UTF-8 parse replaces every byte above 0x7f and destroys the image.
 */
function parseDepthMap(data: unknown): PanoramaDepthMap | undefined {
  const encoded = asString(safeGet(data, 1, 0, 20, 0));
  if (!encoded || !encoded.startsWith('RIFF')) return undefined;

  const bytes = new Uint8Array(encoded.length);
  for (let i = 0; i < encoded.length; i++) {
    const code = encoded.charCodeAt(i);
    // A code point above a byte means the response was decoded as UTF-8.
    if (code > 0xff) return undefined;
    bytes[i] = code;
  }

  const size = readVp8lSize(bytes);
  if (!size) return undefined;
  return { format: 'webp', width: size.width, height: size.height, bytes };
}

/** Read width/height out of a lossless WebP (VP8L) header. */
function readVp8lSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  for (let i = 0; i + 13 <= bytes.length && i < 64; i++) {
    if (bytes[i] !== 0x56 || bytes[i + 1] !== 0x50 || bytes[i + 2] !== 0x38 || bytes[i + 3] !== 0x4c) {
      continue;
    }
    // "VP8L", 4-byte chunk length, 0x2f signature, then 14 bits width-1 and
    // 14 bits height-1 packed little-endian.
    if (bytes[i + 8] !== 0x2f) return undefined;
    const bits =
      bytes[i + 9]! | (bytes[i + 10]! << 8) | (bytes[i + 11]! << 16) | (bytes[i + 12]! << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return undefined;
}

export function extractPanoramaMetadata(
  data: unknown,
  options?: { raw?: boolean },
): PanoramaMetadata | null {
  if (isPanoramaMetadataStub(data)) return null;

  const panoId = asString(safeGet(data, 1, 0, 1, 1));
  if (!panoId) return null;

  const maxWidth = asNumber(safeGet(data, 1, 0, 2, 2, 0));
  const maxHeight = asNumber(safeGet(data, 1, 0, 2, 2, 1));
  const faceWidth = asNumber(safeGet(data, 1, 0, 2, 3, 1, 0));
  const faceHeight = asNumber(safeGet(data, 1, 0, 2, 3, 1, 1));

  // Camera orientation: heading at [1,0,5,0,1,2,0], pitch at [1,0,5,0,1,2,1], roll at [1,0,5,0,1,2,2]
  const heading = asNumber(safeGet(data, 1, 0, 5, 0, 1, 2, 0));
  const pitch   = asNumber(safeGet(data, 1, 0, 5, 0, 1, 2, 1));
  const roll    = asNumber(safeGet(data, 1, 0, 5, 0, 1, 2, 2));

  const linksList = safeGet<PbNode[]>(data, 1, 0, 5, 0, 3, 0);
  const links: PanoramaLink[] = [];
  if (Array.isArray(linksList)) {
    for (let i = 1; i < linksList.length; i++) {
      const link = parsePanoramaLink(linksList[i]);
      if (link) links.push(link);
    }
  }

  const tileSizes = parseTileSizes(data);

  // [1,0,5,0,1,1] is [seaLevel, null, ellipsoidal]. Verified 2026-08-23 against
  // Denver (1598 m), Times Square (16.8 m) and Amsterdam (4.3 m); the third
  // slot differs from the first by the local geoid offset.
  const elevationMeters = asNumber(safeGet(data, 1, 0, 5, 0, 1, 1, 0));
  const ellipsoidalHeightMeters = asNumber(safeGet(data, 1, 0, 5, 0, 1, 1, 2));
  const addressLines = parseAddressLines(data);
  const depthMap = parseDepthMap(data);

  const metadata: PanoramaMetadata = {
    panoId,
    lat: asNumber(safeGet(data, 1, 0, 5, 0, 1, 0, 2)),
    lng: asNumber(safeGet(data, 1, 0, 5, 0, 1, 0, 3)),
    captureDate: formatCaptureDate(
      safeGet(data, 1, 0, 6, 7, 0),
      safeGet(data, 1, 0, 6, 7, 1),
    ),
    copyright: asString(safeGet(data, 1, 0, 4, 0, 0, 0, 0)),
    attribution: asString(safeGet(data, 1, 0, 4, 1, 0, 0, 0)),
    address: addressLines?.[0],
    addressLines,
    elevationMeters,
    ellipsoidalHeightMeters,
    imagerySource: asString(safeGet(data, 1, 0, 19, 0)),
    imageKey: asString(safeGet(data, 1, 0, 19, 1)),
    depthMap,
    heading,
    pitch,
    roll,
    tileSizes,
    tileZoomLevels: tileSizes ? tileSizes.length : undefined,
    maxTileDimensions:
      maxWidth != null && maxHeight != null ? [maxWidth, maxHeight] : undefined,
    tileFaceSize:
      faceWidth != null && faceHeight != null ? [faceWidth, faceHeight] : undefined,
    links,
    historicalCaptures: parseHistoricalCaptures(data),
    embedUrl: buildEmbedUrl(panoId, heading, pitch),
    streetViewUrl: buildStreetViewUrl(panoId, heading, pitch),
  };

  if (options?.raw) {
    metadata.raw = data;
  }

  return metadata;
}
