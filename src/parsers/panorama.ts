import { buildThumbnailUrl } from '../rpc/panorama-pb.js';
import { safeGet } from '../utils/safe-get.js';
import type {
  PanoramaHistoricalCapture,
  PanoramaLink,
  PanoramaMetadata,
  PanoramaRef,
} from '../types/panorama.js';

type PbNode = unknown;

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

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
    address: asString(safeGet(data, 1, 0, 3, 2, 0, 0)),
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
