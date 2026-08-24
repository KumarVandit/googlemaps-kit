/**
 * Where place photos were fetched.
 *
 * `combined` merges `batchexecute` (metadata-rich, paginated) with `place_preview`
 * (carries some images the gallery RPC omits), deduped by URL — use it when you want
 * every image and can afford the extra request.
 */
export type PhotosSource = 'place_preview' | 'listentityphotos' | 'batchexecute' | 'combined';

/**
 * Photo class tabs exposed in the Maps place gallery UI.
 * `latest` is a sort tab (newest first), not a content class — use `category: 'all'`
 * with batchexecute sort if needed; token mapping is capture-derived.
 */
export type PhotoCategory =
  | 'all'
  | 'latest'
  | 'interior'
  | 'exterior'
  | 'menu'
  | 'food'
  | 'videos'
  | 'street_view'
  | 'by_owner'
  | 'by_visitor';

/** Parsed place/user photo from listentityphotos (entity mode). */
export interface PlacePhoto {
  /** Stable photo id (CIHM… / CIABIh…). */
  photoId: string;
  /** Absolute thumbnail or full-size URL from the response. */
  url: string;
  /** Same URL with size params rewritten via normalizePhotoUrl / resizePhotoUrl. */
  normalizedUrl: string;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  /** Uploader or business attribution label when present. */
  attribution?: string;
  /** Google user id of the uploader when present (numeric string). */
  authorId?: string;
  /** Display name of the uploader when present (e.g. "John Smith"). */
  authorName?: string;
  /** Uploader profile URL on Google Maps. */
  authorProfileUrl?: string;
  caption?: string;
  /** Human-readable category (e.g. Street View, Menu) when present. */
  categoryLabel?: string;
  uploadDate?: string;
  lat?: number;
  lng?: number;
  isVideo: boolean;
  isStreetView: boolean;
  /** True when uploaded by the business owner (not a visitor). */
  isOwnerPhoto?: boolean;
  /** Street View pano id — pass to PanoramaService for tile URLs. */
  panoId?: string;
  /** YouTube or hosted video id when `isVideo` (batchexecute only). */
  videoId?: string;
  /** Poster/thumbnail URL for video entries when distinct from `url`. */
  videoThumbnailUrl?: string;
  /** Duration in seconds when present in gallery metadata. */
  durationSec?: number;
  /** Like / thumbs-up count when available. */
  likeCount?: number;
  /** Raw entry from the gallery RPC when `raw: true` was passed. */
  raw?: unknown;
}

export interface PhotosListResult {
  photos: PlacePhoto[];
  totalCount?: number;
  nextPageToken?: string;
  /** Category tab counts when the response includes them. */
  categories?: PhotoCategoryCount[];
  /** Endpoint that produced this result. */
  source: PhotosSource;
}

export interface PhotoCategoryCount {
  category: PhotoCategory;
  count?: number;
  label?: string;
  /** Raw tab id from batchexecute slot [8] when labels are absent. */
  tabId?: number;
}

export interface ListPlacePhotosOptions {
  hexId: string;
  /** Place name — improves referer and enables rich preview pb when coords are set. */
  name?: string;
  /** Coordinates — required for batchexecute (session psi) and detail preview. */
  lat?: number;
  lng?: number;
  category?: PhotoCategory;
  /** Google feature id (/g/…) — improves batchexecute ListEntityPhotos arg shape. */
  featureId?: string;
  /** Base64 category tab token for batchexecute gallery (overrides `category`). */
  categoryToken?: string;
  pageSize?: number;
  pageToken?: string;
  /** Minimum width passed to normalizePhotoUrl (default 800). Alias: use with `height`. */
  minWidth?: number;
  /** Explicit height for resizePhotoUrl (defaults to width × 0.75). */
  height?: number;
  /**
   * Default source selection (when omitted):
   * - `batchexecute` when `lat`/`lng` are set — metadata-rich, paginated, not abuse-blocked.
   * - `place_preview` when coords are absent — URLs only, single page, highest count.
   *
   * Explicit sources:
   * - `place_preview`: `/maps/preview/place` — reliable bulk URLs, **no** attribution/category/dimensions/uploadDate/lat/lng/panoId.
   * - `listentityphotos`: GET gallery RPC — **IP abuse-blocked** (403).
   * - `batchexecute`: POST `/MapsPhotoService.ListEntityPhotos` — full metadata + pagination.
   * - `combined`: gallery + preview merged and deduped — most images, one extra request.
   */
  source?: PhotosSource;
}

export interface ListAllPlacePhotosOptions extends ListPlacePhotosOptions {
  maxPages?: number;
}

/** Fields populated per source (verified on live Kake Di Hatti fixtures, 2026-07-31). */
export const PHOTOS_SOURCE_METADATA: Record<
  PhotosSource,
  { populated: (keyof PlacePhoto)[]; absent: (keyof PlacePhoto)[] }
> = {
  place_preview: {
    populated: ['photoId', 'url', 'normalizedUrl', 'isVideo', 'isStreetView'],
    absent: [
      'attribution',
      'caption',
      'categoryLabel',
      'uploadDate',
      'maxWidth',
      'maxHeight',
      'thumbnailWidth',
      'thumbnailHeight',
      'lat',
      'lng',
      'panoId',
      'videoId',
      'videoThumbnailUrl',
      'durationSec',
    ],
  },
  listentityphotos: {
    populated: [
      'photoId',
      'url',
      'normalizedUrl',
      'attribution',
      'caption',
      'categoryLabel',
      'uploadDate',
      'maxWidth',
      'maxHeight',
      'thumbnailWidth',
      'thumbnailHeight',
      'lat',
      'lng',
      'isVideo',
      'isStreetView',
      'panoId',
    ],
    absent: ['authorName', 'videoId', 'videoThumbnailUrl', 'durationSec'],
  },
  batchexecute: {
    populated: [
      'photoId',
      'url',
      'normalizedUrl',
      'attribution',
      'authorName',
      'caption',
      'categoryLabel',
      'uploadDate',
      'maxWidth',
      'maxHeight',
      'thumbnailWidth',
      'thumbnailHeight',
      'lat',
      'lng',
      'isVideo',
      'isStreetView',
      'panoId',
      'videoId',
    ],
    absent: ['videoThumbnailUrl', 'durationSec'],
  },
  /**
   * Union of the two above. Identity fields are always present; the metadata fields are
   * present only on the rows that came from the gallery, so treat them as per-photo
   * optional rather than guaranteed for the whole result.
   */
  combined: {
    populated: ['photoId', 'url', 'normalizedUrl', 'isVideo', 'isStreetView'],
    absent: [],
  },
};
