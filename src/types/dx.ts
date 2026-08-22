/**
 * Developer-experience types: PlaceRef, Intent API options, client capabilities.
 *
 * Intent methods return these shapes so agents/devs always know where fields live.
 */

import type {
  Coordinates,
  KnowledgeEntity,
  LocalPost,
  PlaceDetails,
  PlaceFullMeta,
  ReviewsResult,
  SearchMode,
  SearchResult,
  TravelMode,
} from './common.js';
import type { TransitMode, TransitRoutingPreference } from './directions.js';
import type { SearchClientFilters } from './search-filters.js';
import type { ReviewClientFilters } from './reviews.js';
import type { PhotoCategory, PlacePhoto, PhotosSource } from './photos.js';
import type { PanoramaRef } from './panorama.js';
import type { DirectionsResult } from './directions.js';
import type { ProgressCallback } from './hooks.js';

/** Shared cancellation / progress knobs for Intent methods. */
export interface IntentCallOptions {
  /** Cancel in-flight HTTP when aborted. */
  signal?: AbortSignal;
  /** Progress for multi-page / multi-item work. */
  onProgress?: ProgressCallback;
}

/** Session profile selected at client construction. */
export type SessionMode = 'anonymous' | 'authenticated';

/**
 * Profile depth for Intent `profile()`.
 * - `card` — place details only (~1 parallel preview+enrich round-trip)
 * - `full` — details + reviews (+ optional local posts)
 * - `complete` — full + knowledge fallback
 */
export type ProfileDepth = 'card' | 'full' | 'complete';

/** Review transport for Intent `opinions()` / `reviews.list({ source })`. */
export type ReviewSource = 'auto' | 'boq' | 'embedded' | 'rpc';

/**
 * Stable place identity. Prefer hexId; ChIJ placeId is auto-converted.
 * Accepts `lat`/`lng` (preferred) or search-row `latitude`/`longitude`.
 */
export type PlaceRef =
  | string
  | {
      hexId?: string;
      name?: string;
      lat?: number;
      lng?: number;
      /** Search-row alias for lat. */
      latitude?: number;
      /** Search-row alias for lng. */
      longitude?: number;
      placeId?: string;
      ftid?: string;
      /**
       * When set (e.g. from a search hit), profile skips incomplete-payload retry —
       * saves ~400–900 ms on truncated previews.
       */
      reviewCount?: number;
    };

export interface NormalizedPlaceRef {
  hexId: string;
  name?: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  ftid?: string;
  reviewCount?: number;
}

/** Capability flags for `maps.capabilities()`. */
export interface ClientCapabilities {
  session: SessionMode;
  signedIn: boolean;
  search: true;
  placeDetails: true;
  reviewsBoq: true;
  reviewsRpc: boolean;
  photos: true;
  directions: true;
  askMaps: boolean;
  askMapsHistory: boolean;
  privateLists: boolean;
  legacyRpc: boolean;
}

export type AuthCapability = keyof Pick<
  ClientCapabilities,
  'askMaps' | 'askMapsHistory' | 'reviewsRpc' | 'privateLists' | 'legacyRpc'
>;

/** Input for `maps.discover()`. */
export interface DiscoverOptions extends IntentCallOptions {
  /** Free-text query, e.g. "coffee" or "cafes in indiranagar". */
  query: string;
  /**
   * Bias center (Intent spelling). Required unless `location` is set.
   * Same meaning as search service `location`.
   */
  near?: Coordinates;
  /**
   * Alias for `near` — accepted so agents can copy search-service examples.
   */
  location?: Coordinates;
  /**
   * `fast` (default) — ~5 rows, name/rating/coords/thumbnail, ~400 ms warm.
   * `full` — up to 20 rows with hours/phone/attributes.
   */
  mode?: SearchMode;
  limit?: number;
  radiusMeters?: number;
  /** Pagination offset (pass `pagination.nextOffset` from a prior discover). */
  offset?: number;
  /** Session token from a prior page (`pagination` does not expose psi — use searchPage for psi). */
  psi?: string;
  filters?: SearchClientFilters;
}

/** Input for `maps.discoverPages()` / multi-page discover. */
export interface DiscoverPagesOptions extends DiscoverOptions {
  /** Max search pages to yield (default 5). */
  maxPages?: number;
}

/**
 * Output of `maps.discover()`.
 *
 * @example
 * const { places, timingMs } = await maps.discover({ query: 'coffee', near });
 * const top = places[0]!; // { name, hexId, rating, lat, lng, thumbnailUrl, … }
 */
export interface DiscoverResult {
  places: SearchResult[];
  /** Wall time for the single search request. */
  timingMs: number;
  /** Effective mode used for this call. */
  mode: SearchMode;
  pagination: {
    offset: number;
    pageSize: number;
    hasMore: boolean;
    nextOffset?: number;
    psi?: string;
  };
}

/** Input for `maps.resolve()`. */
export interface ResolveOptions extends IntentCallOptions {
  /** Free-text query (geocode / suggest / search). */
  query?: string;
  /** Short or full Maps URL. */
  url?: string;
  /** Bias for suggest / search (strongly recommended for queries). */
  near?: Coordinates;
  /** Alias for `near`. */
  location?: Coordinates;
}

/**
 * Output of `maps.resolve()` — identity only, not a full place card.
 * Call `profile(resolved)` next when you need hours/phone/photos.
 *
 * Always check `hexId` (or `placeId`) before profile/media — viewport-only
 * URL resolves may return coords without an id.
 */
export interface ResolvedPlace {
  hexId?: string;
  placeId?: string;
  name?: string;
  address?: string;
  lat?: number;
  lng?: number;
  ftid?: string;
  source: 'url' | 'geocode' | 'suggest' | 'search';
}

/** Input for `maps.profile()`. */
export interface ProfileOptions extends IntentCallOptions {
  /**
   * `card` (default) — place details only.
   * `full` — + reviews (local posts off unless `includeLocalPosts: true`).
   * `complete` — + knowledge fallback.
   */
  depth?: ProfileDepth;
  maxReviewPages?: number;
  includeLocalPosts?: boolean;
}

/** Input for `maps.profileMany()`. */
export interface ProfileManyOptions extends ProfileOptions {
  /** Max parallel profiles (default client concurrency). */
  concurrency?: number;
}

/**
 * Output of `maps.profile()` — always the same shape.
 * Place fields live under `place` at every depth (never a bare PlaceDetails union).
 *
 * Wrong: `profile().name` — Right: `profile().place.name`
 * (Contrast: `maps.places.get()` returns bare PlaceDetails.)
 *
 * @example
 * const { place, reviews, depth } = await maps.profile(hit, { depth: 'full' });
 * console.log(place.name, place.rating, reviews?.totalReviews ?? reviews?.reviews.length);
 */
export interface PlaceProfile {
  /** Place card fields (name, rating, hours, photos URLs, …). */
  place: PlaceDetails;
  /** Present when depth is `full` or `complete`. */
  reviews?: ReviewsResult;
  localPosts?: LocalPost[];
  /** Present when depth is `complete`. */
  knowledge?: KnowledgeEntity;
  depth: ProfileDepth;
  meta?: PlaceFullMeta;
}

/** Input for `maps.route()`. Also accepts origin/destination aliases. */
export interface RouteOptions extends IntentCallOptions {
  /** Intent spelling (preferred). */
  from?: Coordinates | string | PlaceRef;
  to?: Coordinates | string | PlaceRef;
  /** Alias for `from` — directions service spelling. */
  origin?: Coordinates | string | PlaceRef;
  /** Alias for `to`. */
  destination?: Coordinates | string | PlaceRef;
  mode?: TravelMode;
  /**
   * Turn-by-turn steps (may scrape dir HTML — slower).
   * Default false: duration/distance only.
   */
  includeSteps?: boolean;

  // ─── transit-specific options ──────────────────────────────────────────────

  /**
   * Desired departure time as a Unix timestamp (seconds). For `mode: 'transit'`.
   * Defaults to current time when omitted.
   */
  departureTime?: number;
  /**
   * Desired arrival time as a Unix timestamp (seconds). Mutually exclusive with `departureTime`.
   */
  arrivalTime?: number;
  /**
   * Restrict transit routes to these vehicle types. Only effective when `mode: 'transit'`.
   */
  transitModes?: TransitMode[];
  /**
   * Preference for transit routing: `'less_walking'` or `'fewer_transfers'`.
   */
  transitRoutingPreference?: TransitRoutingPreference;
}

/** Output of `maps.route()` — same as directions service. */
export type RouteResult = DirectionsResult;

/** Input for `maps.opinions()`. */
export interface OpinionsOptions extends IntentCallOptions {
  /** Boq pages to fetch (default 1). */
  pages?: number;
  /** Reviews per page (default 10). */
  limit?: number;
  source?: ReviewSource;
  /**
   * Attach place-wide rating histogram (extra batchexecute).
   * Default **false** for latency — set true when you need star distribution / `totalReviews`.
   */
  includeAggregates?: boolean;
  filters?: ReviewClientFilters;
}

/** Input for `maps.opinionsPages()` — stream Boq pages. */
export interface OpinionsPagesOptions extends OpinionsOptions {
  /** Max Boq pages to yield (default 10). */
  maxPages?: number;
}

/**
 * Output of `maps.opinions()`.
 * - `reviewCount` = length of this page (`reviews.length`), NOT the place total
 * - `totalReviews` = place-wide total (needs `includeAggregates: true` or embedded fallback)
 */
export type OpinionsResult = ReviewsResult;

/** Input for `maps.media()`. */
export interface MediaOptions extends IntentCallOptions {
  /** Include photo gallery (default true). */
  photos?: boolean;
  /** Include nearby Street View panos (default false — extra request). */
  streetView?: boolean;
  pageSize?: number;
  category?: PhotoCategory;
  source?: PhotosSource;
}

/** Input for `maps.mediaMany()`. */
export interface MediaManyOptions extends MediaOptions {
  concurrency?: number;
}

/**
 * Output of `maps.media()` — flat photo list (not nested `.photos.photos`).
 * Note: `PlaceDetails.photos` / search `photos` are URL strings; media returns `PlacePhoto` objects.
 *
 * @example
 * const { photos, nextPageToken } = await maps.media(hit);
 * console.log(photos[0]?.normalizedUrl);
 */
export interface MediaResult {
  photos: PlacePhoto[];
  /** Photos in this page (not necessarily gallery total). */
  photoCount: number;
  nextPageToken?: string;
  photoSource?: PhotosSource;
  panoramas?: PanoramaRef[];
}

/** One step of `maps.pipeline()` — discover → profile → optional opinions. */
export interface PipelineOptions extends IntentCallOptions {
  discover: DiscoverOptions;
  /** Cap places after discover (default all). */
  maxPlaces?: number;
  /** Profile depth options (default `{ depth: 'card' }`). Pass `false` to skip. */
  profile?: ProfileOptions | false;
  /** Opinions options. Default off — pass `{}` or options to enable. */
  opinions?: OpinionsOptions | false;
  concurrency?: number;
}

export interface PipelinePlaceRow {
  hit: SearchResult;
  profile?: PlaceProfile;
  opinions?: OpinionsResult;
}

export interface PipelineResult {
  places: PipelinePlaceRow[];
  discover: DiscoverResult;
  timingMs: number;
}
