import type {
  PhotoCategory,
  PhotoCategoryCount,
  PhotosSource,
  PlacePhoto,
  PhotosListResult,
} from '../types/photos.js';
import type { PbNode } from '../types/protobuf.js';
import { PHOTO_TAB_ID_LABELS } from '../rpc/photos-pb.js';
import { normalizePhotoUrl } from '../utils/photo-url.js';
import { safeGet } from '../utils/payload.js';
import { extractPhotosDeep } from './place.js';
import { asNumber, asString } from './shared.js';

function captionFrom(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = captionFrom(item);
      if (parsed) return parsed;
    }
    return undefined;
  }
  return asString(value);
}

function formatUploadDate(parts: unknown): string | undefined {
  if (!Array.isArray(parts) || parts.length < 3) return undefined;
  const year = asNumber(parts[0]);
  const month = asNumber(parts[1]);
  const day = asNumber(parts[2]);
  if (year == null || month == null || day == null) return undefined;
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function isHtmlLike(value: string): boolean {
  return value.includes('<!DOCTYPE') || value.includes('<html') || value.includes('</');
}

function normalizeAbsoluteUrl(url: string): string {
  const absolute = url.startsWith('//') ? `https:${url}` : url;
  return absolute.startsWith('http') ? absolute : url;
}

function derivePhotoIdFromUrl(url: string): string {
  const gpsMatch = url.match(/\/gps-cs-s\/([^/?=]+)/);
  if (gpsMatch?.[1]) return gpsMatch[1];
  const pathMatch = url.match(/googleusercontent\.com\/([^/?=]+)/);
  if (pathMatch?.[1] && pathMatch[1].length >= 12) return pathMatch[1];
  return `url:${(url.split('=')[0] ?? url).slice(-48)}`;
}

/** Deep-scan a place preview payload for photo URLs and normalize into PlacePhoto rows. */
export function extractPlacePreviewPhotos(
  data: PbNode,
  options?: { minWidth?: number; maxPhotos?: number },
): PhotosListResult {
  const minWidth = options?.minWidth ?? 800;
  const maxPhotos = options?.maxPhotos ?? 200;
  const urls = extractPhotosDeep(data, maxPhotos);
  const photos: PlacePhoto[] = [];
  const seen = new Set<string>();

  for (const urlRaw of urls) {
    const url = normalizeAbsoluteUrl(urlRaw);
    const key = url.split('=')[0] ?? url;
    if (seen.has(key)) continue;
    seen.add(key);

    photos.push({
      photoId: derivePhotoIdFromUrl(url),
      url,
      normalizedUrl: normalizePhotoUrl(url, minWidth),
      isVideo: false,
      isStreetView: /streetview|cb_client=maps_sv/i.test(url),
    });
  }

  return {
    photos,
    totalCount: photos.length,
    source: 'place_preview',
  };
}

/** Map UI labels from the response to our category union when recognizable. */
function labelToCategory(label: string | undefined): PhotoCategory | undefined {
  if (!label) return undefined;
  const lower = label.toLowerCase();
  if (lower === 'all') return 'all';
  if (lower.includes('latest')) return 'latest';
  if (lower.includes('street view') || lower.includes('360')) return 'street_view';
  if (lower.includes('menu')) return 'menu';
  if (lower.includes('food')) return 'food';
  if (lower.includes('interior') || lower.includes('room')) return 'interior';
  if (lower.includes('exterior')) return 'exterior';
  if (lower.includes('video')) return 'videos';
  if (lower.includes('owner')) return 'by_owner';
  if (lower.includes('visitor')) return 'by_visitor';
  return undefined;
}

function parsePhotoEntry(entry: unknown, minWidth: number, height?: number): PlacePhoto | null {
  if (!Array.isArray(entry)) return null;

  const photoId = asString(safeGet(entry, 0));
  const urlRaw = asString(safeGet(entry, 6, 0));
  if (!photoId || !urlRaw || isHtmlLike(urlRaw)) return null;

  const url = normalizeAbsoluteUrl(urlRaw);
  const subType = asNumber(safeGet(entry, 2));
  const caption =
    captionFrom(safeGet(entry, 3)) ??
    captionFrom(safeGet(entry, 4)) ??
    captionFrom(safeGet(entry, 21, 14, 0, 2, 0)) ??
    captionFrom(safeGet(entry, 21, 0, 2, 0));
  const attribution = asString(safeGet(entry, 6, 1));
  const maxWidth = asNumber(safeGet(entry, 6, 2, 0));
  const maxHeight = asNumber(safeGet(entry, 6, 2, 1));
  const thumbnailWidth = asNumber(safeGet(entry, 6, 3, 0));
  const thumbnailHeight = asNumber(safeGet(entry, 6, 3, 1));
  const categoryLabel = asString(safeGet(entry, 20));
  const uploadDate =
    formatUploadDate(safeGet(entry, 21, 6, 8)) ??
    formatUploadDate(safeGet(entry, 21, 6)) ??
    formatUploadDate(safeGet(entry, 21, 0, 8));
  const mediaKind = asNumber(safeGet(entry, 22));
  const panoId = asString(safeGet(entry, 31));
  const lat = asNumber(safeGet(entry, 8, 0, 2));
  const lng = asNumber(safeGet(entry, 8, 0, 1));
  const videoId = asString(safeGet(entry, 31));
  const durationSec = asNumber(safeGet(entry, 21, 0, 3, 0));
  const authorId = asString(safeGet(entry, 6, 5)) ?? asString(safeGet(entry, 21, 18, 0));
  const authorName = asString(safeGet(entry, 21, 18, 2)) ?? asString(safeGet(entry, 21, 0, 9));
  const authorProfileUrl = asString(safeGet(entry, 6, 4)) ?? asString(safeGet(entry, 21, 18, 1));
  const likeCount = asNumber(safeGet(entry, 21, 0, 5)) ?? asNumber(safeGet(entry, 21, 3));
  const ownerLabel = `${asString(safeGet(entry, 6, 1)) ?? ''} ${asString(safeGet(entry, 20)) ?? ''}`.toLowerCase();

  const isStreetView =
    categoryLabel === 'Street View' || subType === 11 || (subType === 11 && mediaKind === 3);
  const isVideo = subType === 13 || mediaKind === 2 || safeGet(entry, 11) === 1;
  const isOwnerPhoto = ownerLabel.includes('owner');

  const sizedUrl =
    height != null ? resizePhotoUrl(url, minWidth, height) : normalizePhotoUrl(url, minWidth);

  return {
    photoId,
    url,
    normalizedUrl: sizedUrl,
    thumbnailWidth,
    thumbnailHeight,
    maxWidth,
    maxHeight,
    attribution: attribution && !isHtmlLike(attribution) ? attribution : undefined,
    authorId,
    authorName: authorName && !isHtmlLike(authorName) ? authorName : undefined,
    authorProfileUrl,
    caption: caption && !isHtmlLike(caption) ? caption : undefined,
    categoryLabel,
    uploadDate,
    lat,
    lng,
    isVideo,
    isStreetView,
    isOwnerPhoto: isOwnerPhoto || undefined,
    panoId: isStreetView ? panoId : undefined,
    videoId: isVideo ? videoId : undefined,
    videoThumbnailUrl: isVideo ? url : undefined,
    durationSec,
    likeCount,
    raw: entry,
  };
}

function parseCategoryTabs(data: PbNode): PhotoCategoryCount[] | undefined {
  const tabs = safeGet<PbNode[]>(data, 2);
  if (!Array.isArray(tabs) || tabs.length === 0) return undefined;

  const counts: PhotoCategoryCount[] = [];
  for (const tab of tabs) {
    if (!Array.isArray(tab)) continue;
    const label = asString(safeGet(tab, 0)) ?? asString(safeGet(tab, 1));
    const count = asNumber(safeGet(tab, 2));
    const tabId = asNumber(safeGet(tab, 3)) ?? asNumber(safeGet(tab, 4));
    const category = labelToCategory(label) ?? 'all';
    counts.push({ category, count, label, tabId });
  }

  return counts.length > 0 ? counts : undefined;
}

function flattenTabPairs(node: unknown): Array<[number, number]> {
  if (!Array.isArray(node)) return [];
  if (
    node.length >= 2 &&
    typeof node[0] === 'number' &&
    typeof node[1] === 'number' &&
    !Array.isArray(node[0])
  ) {
    return [[node[0], node[1]]];
  }
  const out: Array<[number, number]> = [];
  for (const child of node) {
    out.push(...flattenTabPairs(child));
  }
  return out;
}

/** batchexecute slot [8]: `[[[tabId,count],…]], _, _, reportedTotal, tabCount`. */
function parseBatchCategoryCounts(data: PbNode): PhotoCategoryCount[] | undefined {
  const slot = safeGet<PbNode>(data, 8);
  if (!Array.isArray(slot)) return undefined;

  const pairs = flattenTabPairs(safeGet(slot, 0));
  if (pairs.length === 0) return undefined;

  const counts: PhotoCategoryCount[] = [];
  for (const [tabId, count] of pairs) {
    const label = PHOTO_TAB_ID_LABELS[tabId];
    counts.push({
      category: labelToCategory(label) ?? 'all',
      count,
      label,
      tabId,
    });
  }

  return counts.length > 0 ? counts : undefined;
}

function parseTotalCount(data: PbNode, _parsedCount: number): number | undefined {
  const direct = asNumber(safeGet(data, 1));
  if (direct != null) return direct;

  const slot8 = safeGet<PbNode>(data, 8);
  if (Array.isArray(slot8)) {
    const fromSlot = asNumber(safeGet(slot8, 3));
    if (fromSlot != null) return fromSlot;
    const categories = parseBatchCategoryCounts(data);
    const allTab = categories?.find((c) => c.tabId === 1 || c.category === 'all');
    if (allTab?.count != null) return allTab.count;
  }

  return undefined;
}

function extractNextPageToken(
  data: PbNode,
  parsedCount: number,
  pageSize: number,
): string | undefined {
  const total = parseTotalCount(data, parsedCount);
  const sessionId = asString(safeGet(data, 3));
  const longToken = asString(safeGet(data, 5));

  const exhausted = total != null && parsedCount >= total;
  if (longToken && longToken.length > 20 && !exhausted) {
    return longToken;
  }

  if (total != null && parsedCount > 0 && parsedCount < total) {
    if (sessionId) return sessionId;
    return String(parsedCount);
  }

  const alt = asString(safeGet(data, 2));
  if (alt && parsedCount >= pageSize) {
    return alt;
  }

  return undefined;
}

/**
 * Parse listentityphotos / batchexecute entity response into place photos.
 *
 * Entries live at `$[0][i]` — url at `[6][0]`, attribution at `[6][1]`, category at `[20]`.
 */
export function extractPlacePhotos(
  data: PbNode,
  options?: { minWidth?: number; pageSize?: number; height?: number; source?: PhotosSource },
): PhotosListResult {
  const minWidth = options?.minWidth ?? 800;
  const height = options?.height;
  const pageSize = options?.pageSize ?? 40;
  const source = options?.source ?? 'listentityphotos';
  const list = safeGet<PbNode[]>(data, 0);
  if (list != null && !Array.isArray(list)) {
    return { photos: [], source };
  }

  const photos: PlacePhoto[] = [];
  const seen = new Set<string>();

  if (Array.isArray(list)) {
    for (const entry of list) {
      const photo = parsePhotoEntry(entry, minWidth, height);
      if (!photo) continue;
      const key = photo.url.split('=')[0] ?? photo.photoId;
      if (seen.has(key)) continue;
      seen.add(key);
      photos.push(photo);
    }
  }

  const totalCount = parseTotalCount(data, photos.length) ?? (photos.length > 0 ? photos.length : undefined);
  const nextPageToken = extractNextPageToken(data, photos.length, pageSize);
  const categories = parseCategoryTabs(data) ?? parseBatchCategoryCounts(data);

  return {
    photos,
    totalCount,
    nextPageToken,
    categories,
    source,
  };
}

/** Rewrite a photo URL to explicit width/height using googleusercontent size params. */
export function resizePhotoUrl(
  url: string,
  width: number,
  height?: number,
): string {
  const h = height ?? Math.round(width * 0.75);
  return normalizePhotoUrl(url, width).replace(
    /=w\d+-h\d+[^/]*/i,
    `=w${width}-h${h}-k-no`,
  );
}
