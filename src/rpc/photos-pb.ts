

/**
 * Protobuf builders for `/maps/rpc/photo/listentityphotos` — place (entity) photo sets.
 *
 * Entity mode uses `!1e2` with the hex feature id in `!6m3!1s{hexId}!7e81!15i16698`
 * (veTypeId 16698 = MapsPhotoService entity type 2). Location/nearby mode remains
 * `!1e3` with `!9m2!2d…!3d…!10d…` and is not used for place galleries.
 */

import type { PhotoCategory , PlacePhoto } from '../types/photos.js';

const ENTITY_VE_TYPE = 16698;

const DEFAULT_FILTERS =
  '!7m33!1m3!1e1!2b0!3e3!1m3!1e2!2b1!3e2!1m3!1e2!2b0!3e3!1m3!1e8!2b0!3e3' +
  '!1m3!1e10!2b0!3e3!1m3!1e10!2b1!3e2!1m3!1e10!2b0!3e4!1m3!1e9!2b1!3e2!2b1' +
  '!8m2!1m1!1e2!9b0!11m1!4b1';

/** Toggle one filter triplet inside the !7m33 block (2b1 = enabled, 2b0 = disabled). */
function buildCategoryFilters(category: PhotoCategory | undefined): string {
  if (!category || category === 'all') {
    return DEFAULT_FILTERS;
  }

  const enabled = '!2b1';
  const disabled = '!2b0';

  const flags: Record<PhotoCategory, Array<[number, boolean]>> = {
    all: [],
    latest: [],
    interior: [[2, true], [3, false], [8, false], [10, false], [9, false]],
    exterior: [[2, false], [3, true], [8, false], [10, false], [9, false]],
    menu: [[2, false], [3, false], [8, true], [10, false], [9, false]],
    food: [[2, false], [3, false], [8, true], [10, false], [9, false]],
    videos: [[2, false], [3, false], [8, false], [10, true], [9, false]],
    street_view: [[2, true], [3, false], [8, false], [10, false], [9, false]],
    by_owner: [[2, false], [3, false], [8, false], [10, true], [9, false]],
    by_visitor: [[2, false], [3, false], [8, false], [10, false], [9, true]],
  };

  const triplets: Record<number, string> = {
    1: '!1m3!1e1!2b0!3e3',
    2: '!1m3!1e2!2b1!3e2',
    3: '!1m3!1e2!2b0!3e3',
    8: '!1m3!1e8!2b0!3e3',
    10: '!1m3!1e10!2b0!3e3',
    9: '!1m3!1e9!2b1!3e2',
  };

  const ownerTriplet = '!1m3!1e10!2b1!3e2';
  const visitorTriplet = '!1m3!1e10!2b0!3e4';

  let block = '!7m33!1m3!1e1!2b0!3e3';
  for (const [key, on] of flags[category]) {
    const triplet = triplets[key]!;
    block += triplet.replace(on ? disabled : enabled, on ? enabled : disabled);
  }
  block += ownerTriplet + visitorTriplet + '!8m2!1m1!1e2!9b0!11m1!4b1';
  return block;
}

function buildPageSizeCluster(pageSize: number, pageToken?: string): string {
  if (pageToken) {
    return `!3m3!2i${pageSize}!3s${pageToken}`;
  }
  return `!3m2!2i${pageSize}`;
}

/** Pb body for place entity photo listing. */
export function buildPlacePhotosPb(params: {
  hexId: string;
  pageSize?: number;
  pageToken?: string;
  category?: PhotoCategory;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
}): string {
  const pageSize = params.pageSize ?? 40;
  const thumbW = params.thumbnailWidth ?? 203;
  const thumbH = params.thumbnailHeight ?? 100;
  const filters = buildCategoryFilters(params.category);
  const pageCluster = buildPageSizeCluster(pageSize, params.pageToken);

  return (
    `!1e2!5m46!2m2!1i${thumbW}!2i${thumbH}${pageCluster}!5b1` +
    filters +
    `!6m3!1s${params.hexId}!7e81!15i${ENTITY_VE_TYPE}`
  );
}

/** Full listentityphotos URL for a place hex id. */
export function buildPlacePhotosUrl(params: {
  hexId: string;
  hl: string;
  gl: string;
  pageSize?: number;
  pageToken?: string;
  category?: PhotoCategory;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
}): string {
  const pb = buildPlacePhotosPb(params);
  return (
    `https://www.google.com/maps/rpc/photo/listentityphotos` +
    `?authuser=0&hl=${params.hl}&gl=${params.gl}` +
    `&pb=${encodeURIComponent(pb)}`
  );
}

/**
 * Gallery tab metadata for MapsPhotoService.ListEntityPhotos (hspqX).
 *
 * Server-side tab selection does NOT work outside the browser. A token belongs at
 * batchexecute arg[4][25][0][0] as a base64 protobuf (outer field 1 -> inner field 3 =
 * enum value), and `CgIYIA==` (field 3 = 32, "Food & drink") was captured verbatim from a
 * headless tab click — yet replaying that exact token from Node returns batchexecute `[3]`
 * while the identical request without it succeeds. A sweep of field-3 values
 * 8/16/24/32/40/48/56/64 returned `[3]` for every one (2026-07-31), so this is not a
 * matter of finding the right number: something session-bound in the browser request is
 * missing. Categories are therefore filtered client-side from row fields instead — the
 * same conclusion the search filters and review filters reached.
 */

/** Gallery tab id -> human label (from response slot [8] when labels are absent). */
export const PHOTO_TAB_ID_LABELS: Record<number, string> = {
  1: 'All',
  2: 'Latest',
  3: 'Videos',
  4: 'Menu',
  5: 'Food & drink',
  6: 'Interior',
  7: 'Exterior',
  8: 'Vibe',
  9: 'By owner',
  10: 'By visitor',
  11: 'Street View & 360°',
};

/** The one token observed in a real browser request. Kept as evidence; rejected by the server from Node. */
export const CAPTURED_FOOD_CATEGORY_TOKEN = 'CgIYIA==';

/** Encode `{ field, value }` as a category token (matches the captured CgIYIA== layout). */
export function encodePhotoCategoryToken(field: number, value: number): string {
  const tag = (field << 3) | 0;
  const inner = Buffer.from([tag, value]);
  return Buffer.concat([Buffer.from([0x0a, inner.length]), inner]).toString('base64');
}

/**
 * Categories that can be honoured client-side, because the row itself carries the
 * discriminator. Everything else depends on a server-side tab we cannot select.
 */
export const CLIENT_FILTERABLE_CATEGORIES: readonly PhotoCategory[] = [
  'all',
  'videos',
  'street_view',
];

export function isClientFilterableCategory(category: PhotoCategory): boolean {
  return CLIENT_FILTERABLE_CATEGORIES.includes(category);
}

/** Filter fetched rows down to a category using only fields present on the row. */
export function filterPhotosByCategory(photos: PlacePhoto[], category: PhotoCategory): PlacePhoto[] {
  switch (category) {
    case 'all':
      return photos;
    case 'videos':
      return photos.filter((photo) => photo.isVideo);
    case 'street_view':
      return photos.filter((photo) => photo.isStreetView || photo.panoId != null);
    case 'latest':
    case 'interior':
    case 'exterior':
    case 'menu':
    case 'food':
    case 'by_owner':
    case 'by_visitor':
      return photos.filter(
        (photo) => photo.categoryLabel != null && matchesLabel(photo.categoryLabel, category),
      );
    default: {
      const exhaustive: never = category;
      throw new Error(`Unhandled photo category: ${String(exhaustive)}`);
    }
  }
}

function matchesLabel(label: string, category: PhotoCategory): boolean {
  const normalized = label.toLowerCase();
  switch (category) {
    case 'interior':
      return normalized.includes('interior');
    case 'exterior':
      return normalized.includes('exterior');
    case 'menu':
      return normalized.includes('menu');
    case 'food':
      return normalized.includes('food') || normalized.includes('drink');
    case 'by_owner':
      return normalized.includes('owner');
    case 'by_visitor':
      return normalized.includes('visitor');
    case 'latest':
    case 'all':
    case 'videos':
    case 'street_view':
      return true;
    default: {
      const exhaustive: never = category;
      throw new Error(`Unhandled photo category label match: ${String(exhaustive)}`);
    }
  }
}
