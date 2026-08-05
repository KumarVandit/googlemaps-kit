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

import type { PhotoCategory, PlacePhoto } from '../types/photos.js';

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
