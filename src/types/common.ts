import type { SearchClientFilters } from './search-filters.js';
import type {
  PlaceReviewRatingDistribution,
  ReviewAttribute,
  ReviewOwnerReply,
  ReviewPhoto,
  ReviewerCredibility,
  ReviewTranslation,
} from './reviews.js';

export interface GMapsConfig {
  /** BCP-47 language, e.g. "en" */
  hl?: string;
  /** Country code, e.g. "in", "us" */
  gl?: string;
  /** Google session cookies (enables full review RPC when SAPISID is present) */
  cookies?: string;
  /** batchexecute `at` token (SNlM0e from WIZ_global_data; optional for anonymous) */
  authToken?: string;
  /** batchexecute build label (`bl` query param) */
  buildLabel?: string;
  /** batchexecute session id (`f.sid` query param) */
  sessionId?: string;
  /** Enable request/response debug logging */
  debug?: boolean;
  /** Max automatic retries on transient failures */
  maxRetries?: number;
  /** Base retry delay in ms */
  retryDelay?: number;
  /** Max retry backoff in ms (default 30000) */
  retryMaxDelay?: number;
  /** Minimum ms between HTTP request starts (default 0 — opt-in pacing) */
  requestDelayMs?: number;
  /** Max concurrent in-flight HTTP requests (default 6) */
  concurrency?: number;
}

/** Signed-in session probe result — see AuthService.getStatus(). */
export interface AuthCapabilities {
  sapisidHash: boolean;
  batchexecuteXsrf: boolean;
  batchUgcPosts: boolean;
}

export interface AuthStatus {
  signedIn: boolean;
  cookiesPresent: boolean;
  cookieNames: string[];
  authTokenPresent: boolean;
  authTokenLength: number;
  capabilities: AuthCapabilities;
  liveCheck?: 'valid' | 'expired' | 'anonymous' | 'error';
  message?: string;
}

/** Single batchexecute RPC invocation. */
export interface RPCCall {
  id: string;
  args: unknown[];
  urlParams?: Record<string, string>;
}

/** Parsed batchexecute RPC response. */
export interface RPCResponse {
  id: string;
  index: number;
  data: unknown;
}

/** Configuration for POST batchexecute (Maps uses WIZ eptZe base path). */
export interface BatchExecuteConfig {
  host: string;
  /** Legacy app name, e.g. MapsUi — used when basePath is unset. */
  app?: string;
  /** WIZ eptZe path, e.g. /maps/_/MapsWizUi/ */
  basePath?: string;
  authToken: string;
  cookies: string;
  headers?: Record<string, string>;
  urlParams?: Record<string, string>;
  debug?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  retryMaxDelay?: number;
  /**
   * Wraps each HTTP attempt so batchexecute traffic shares the owning HttpClient's
   * pacing and request counter. Without it these requests escape `requestDelayMs` /
   * `concurrency` and are invisible to `getStats()`.
   */
  schedule?: <T>(fn: () => Promise<T>) => Promise<T>;
}

/** Tokens scraped from a Maps HTML bootstrap page. */
export interface MapsPageTokens {
  authToken: string;
  buildLabel?: string;
  sessionId?: string;
  /** WIZ Im6cmf — UI mount path */
  appPath?: string;
  /** WIZ eptZe — batchexecute base path */
  batchExecutePath?: string;
  /** Inline kEI session key from APP bootstrap */
  kEI?: string;
  /** JS build version from APP_OPTIONS */
  jsVersion?: string;
  /** Maps search session id (APP_OPTIONS[11] / response psi) */
  psi?: string;
}

/** Endpoint paths reverse-engineered from APP_OPTIONS + JS bundles. */
export interface MapsEndpointRegistry {
  batchexecute: {
    appPath: string;
    url: string;
    wizKey: string;
    authKey: string;
  };
  preview: string[];
  rpc: string[];
  search: string[];
  httpservice: string[];
  modules: {
    initial: string[];
    lazyCount: number;
    lazySample: string[];
  };
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface SearchOptions {
  query: string;
  location: Coordinates;
  /** Results per page (default 20) */
  limit?: number;
  /** Search radius in meters (default 150000) */
  radiusMeters?: number;
  /** Pagination offset via !8i in pb (default 0) */
  offset?: number;
  /** Viewport distance for pb builder (!1d altitude) */
  viewportDist?: number;
  /** Map zoom used to derive viewportDist when unset */
  zoom?: number;
  /** Session psi token from prior search response (optional) */
  psi?: string;
  /** ech page counter for pagination (default 1) */
  ech?: number;
  /**
   * Filter parsed results client-side. Anonymous GET search ignores server-side
   * filter pb — see `searchFilters` in known-surfaces.ts.
   */
  filters?: SearchClientFilters;
}

/**
 * Field-mask tiers mirroring Places API (New) Text Search SKUs.
 *
 * Search rows already embed Enterprise-class fields (hours, phone, attributes,
 * thumbnail). Use `searchText` for one-call parity; only escalate to place
 * preview when you need a full photo gallery or review snippets.
 */
export type SearchFieldMask = 'pro' | 'enterprise' | 'atmosphere';

export interface SearchTextOptions extends SearchOptions {
  /**
   * Desired field tier. All tiers are satisfied from the search payload alone
   * today — this documents intent and future-proofs if we ever thin the parser.
   */
  fieldMask?: SearchFieldMask;
}

export interface SearchTextResult {
  places: SearchResult[];
  /** Always 1 for the current search-only path — matches official one-RPC Text Search. */
  requestCount: number;
  /** Milliseconds wall time for the call. */
  timingMs: number;
  fieldMask: SearchFieldMask;
  pagination: SearchPageResult['pagination'];
}

export interface SearchPageResult {
  results: SearchResult[];
  pagination: {
    offset: number;
    pageSize: number;
    psi?: string;
    nextOffset?: number;
    hasMore: boolean;
  };
}

export interface SearchResult {
  name: string;
  address?: string;
  placeId?: string;
  hexId?: string;
  ftid?: string;
  rating?: number;
  reviewCount?: number;
  latitude?: number;
  longitude?: number;
  phone?: string;
  /** E.164-style number from placeData[178] when Google provides one (e.g. "+91 …"). */
  internationalPhone?: string;
  website?: string;
  category?: string;
  categories?: string[];
  isAd?: boolean;
  /** From placeData[203] when present in search rows — used for client-side openNow filter. */
  openStatus?: string;
  /** Derived from openStatus — true when label starts with "Open". */
  isOpenNow?: boolean;
  /** From placeData[4][14] when present — often missing in restaurant search payloads. */
  priceLevel?: number;
  /**
   * Per-place photo from placeData[157], included in the search payload itself.
   *
   * Free with the search request — no place lookup needed for one image per result.
   * Verified against the place's own gallery. Append Google's sizing suffix
   * (e.g. `=w400-h300`) to control dimensions.
   */
  thumbnailUrl?: string;
  /**
   * Photo URLs already present in the search row (today: the thumbnail).
   * Mirrors Places API Text Search `places.photos` for field-mask parity — full
   * galleries still need `photos.list` / place preview.
   */
  photos?: string[];
  /** IANA timezone from placeData[30] when present in the search row. */
  timezone?: string;
  /**
   * Structured weekly hours from placeData[203] — same tree as place preview.
   * Makes one search call enough for Places Text Search Enterprise hour fields.
   */
  openingSchedule?: PlaceOpeningSchedule;
  /** Attribute groups from placeData[100] when embedded in search rows. */
  attributeGroups?: PlaceAttributeGroup[];
}

export interface BusinessHours {
  [day: string]: string;
}

/** 0 = Sunday … 6 = Saturday — matches the day index Google sends at hours day-entry [1]. */
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type WeekdayName =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday';

/** One open/close interval from placeData[203] day-entry slot [3][*]. */
export interface PlaceHoursInterval {
  /** Display text from the payload, e.g. "11 am-11:30 pm" or "Open 24 hours". */
  text: string;
  openHour?: number;
  openMinute?: number;
  closeHour?: number;
  closeMinute?: number;
}

/** Per-weekday schedule row from placeData[203] via collectHourDayEntries. */
export interface PlaceDaySchedule {
  weekday: WeekdayName;
  weekdayIndex: WeekdayIndex;
  /** Optional [year, month, day] tuple when Google attaches a calendar date. */
  date?: [number, number, number];
  intervals: PlaceHoursInterval[];
  isClosed?: boolean;
  is24Hours?: boolean;
}

/** Structured opening hours from placeData[203] (live/rich/detail pb with !2i203). */
export interface PlaceOpeningSchedule {
  /** Google's status label, e.g. "Open · Closes 11 PM" — from payload, not clock-derived. */
  openStatus?: string;
  /** Deduplicated one-row-per-weekday schedule when day entries are present. */
  weekly?: PlaceDaySchedule[];
  /** Raw day rows before weekday dedupe (may include duplicate weekdays with dates). */
  days?: PlaceDaySchedule[];
}

/** Accessibility or amenity attribute from placeData[100][1][*][2][*]. */
export interface PlaceAttribute {
  groupId: string;
  groupTitle: string;
  /** Ontology path, e.g. /geo/type/establishment_poi/has_wheelchair_accessible_entrance */
  ontologyPath?: string;
  label: string;
  /** Parsed from attribute value block [2][0]: 1 = present, 0/2 = absent. */
  available?: boolean;
}

/** Convenience view of accessibility rows only. */
export interface PlaceAccessibilityFeature {
  label: string;
  ontologyPath?: string;
  available?: boolean;
}

/** Grouped place attributes (service options, payments, atmosphere, …). */
export interface PlaceAttributeGroup {
  id: string;
  title: string;
  attributes: PlaceAttribute[];
}

export interface PlaceDetails {
  name?: string;
  address?: string;
  placeId?: string;
  hexId?: string;
  ftid?: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: number;
  /** Human-readable price range, e.g. "₹400–1,400". */
  priceRange?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  website?: string;
  categories?: string[];
  hours?: BusinessHours;
  /** Current open/closed status, e.g. "Open · Closes 11:30 pm". */
  openStatus?: string;
  /** Structured weekly hours from placeData[203] (rich/live pb). Absent on stub payloads. */
  openingSchedule?: PlaceOpeningSchedule;
  /** Wheelchair and related accessibility rows from the accessibility attribute group. */
  accessibility?: PlaceAccessibilityFeature[];
  /** Structured attribute groups from placeData[100] (rich/live pb). */
  attributeGroups?: PlaceAttributeGroup[];
  /** IANA timezone at placeData[30], e.g. "America/New_York". */
  timezone?: string;
  /** Plus code with locality at placeData[183][2][2][0], e.g. "Q237+QC New York". */
  plusCode?: string;
  photos?: string[];
  description?: string;
  amenities?: string[];
  /** Google Maps place URL. */
  mapsUrl?: string;
  /** Highlight review snippets from place preview (always available). */
  reviewSnippets?: Review[];
}

export type {
  PlaceReviewRatingDistribution,
  ReviewAttribute,
  ReviewClientFilters,
  ReviewOwnerReply,
  ReviewPhoto,
  ReviewerCredibility,
  ReviewTranslation,
} from './reviews.js';

export interface Review {
  reviewId?: string;
  author?: string;
  authorPhoto?: string;
  profileUrl?: string;
  /** Reviewer stats — boq entry [3]; absent on embedded/rpc stubs. */
  credibility?: ReviewerCredibility;
  rating?: number;
  /** Relative date, e.g. "a month ago" — boq entry [2][0]. */
  date?: string;
  /** Epoch ms string — boq entry [2][2]. */
  timestampMs?: string;
  /** Full review body — boq entry [27] (HTML stripped). */
  text?: string;
  /** Truncated preview — boq entry [28]. */
  textPreview?: string;
  language?: string;
  /** Translation metadata — boq entry [26]/[44]. */
  translation?: ReviewTranslation;
  /** Original text when present alongside a translation — boq entry [32]. */
  originalText?: string;
  /** True when Google translation badge is present — boq entry [44][4] === 1. */
  isTranslated?: boolean;
  /** Owner / business reply — boq entry [4]. */
  ownerReply?: ReviewOwnerReply;
  /** Thumbs-up count — boq entry [29]. */
  helpfulCount?: number;
  /** Structured review photos — boq entry [14]. */
  photoItems?: ReviewPhoto[];
  /**
   * Normalized photo URLs (back-compat). Populated from `photoItems` on boq;
   * bare URL strings on older parsers / embedded surface.
   */
  photos?: string[];
  /** Guided-dining / visit chips — boq entry [30]. */
  attributes?: ReviewAttribute[];
  /** Per-review Maps URL — boq entry [12]. */
  permalink?: string;
  visited?: string;
  source?: 'rpc' | 'embedded' | 'preview' | 'boq';
}

export interface ReviewRatingDistribution {
  oneStar: number;
  twoStar: number;
  threeStar: number;
  fourStar: number;
  fiveStar: number;
}

export interface ReviewsResult {
  reviewCount: number;
  reviews: Review[];
  nextPageToken?: string;
  /**
   * Total reviews for the place. Not present in GetLocalBoqProxy responses — it comes
   * from the place preview, so `listBoq` alone leaves this undefined unless
   * `includeAggregates` fetched GetPlaceUgcPostAggregates.
   */
  totalReviews?: number;
  /**
   * Star counts for the reviews in this result only, NOT the place's full histogram.
   * Use `ratingDistribution` for the place-wide histogram from batchexecute aggregates.
   */
  pageRatingDistribution?: ReviewRatingDistribution;
  /**
   * Place-wide star histogram from GetPlaceUgcPostAggregates (batchexecute).
   * Populated when `includeAggregates: true` on list/listAll/listBoq.
   */
  ratingDistribution?: PlaceReviewRatingDistribution;
  /** Mean rating from aggregates RPC when `includeAggregates` is set. */
  aggregateRating?: number;
  /** True when listugcposts returned the 33-byte anonymous stub. */
  unauthenticated?: boolean;
}

export interface EnrichedSearchResult extends SearchResult {
  details?: PlaceDetails;
  reviews?: ReviewsResult;
  localPosts?: LocalPost[];
}

/** Owner update / local post from Maps business profile. */
export interface LocalPost {
  postId?: string;
  title?: string;
  text?: string;
  date?: string;
  imageUrl?: string;
  ctaUrl?: string;
  ctaLabel?: string;
}

/** Options for fetching a complete place profile (details + reviews + photos). */
export interface GetPlaceFullOptions {
  hexId: string;
  /** Optional — improves the referer and enables the `rich` pb template. */
  name?: string;
  /** Optional — omit both to use the hex-only `live` pb template. */
  lat?: number;
  lng?: number;
  ftid?: string;
  /** Reviews per Boq page (default 10). */
  reviewLimit?: number;
  /** Max Boq review pages to fetch (default 1). */
  maxReviewPages?: number;
  reviewSort?: ReviewSortOrder;
  /** Fetch owner local posts when available (default true). */
  includeLocalPosts?: boolean;
  /**
   * Use rich place preview pb (default false — `live` is faster and usually complete).
   * Set true only when you need the richer template explicitly.
   */
  richPreview?: boolean;
  /**
   * Skip incomplete-payload retry on the preview fetch (saves latency when a search
   * row already supplied reviewCount).
   */
  skipIncompleteRetry?: boolean;
}

/** Complete place profile from all working GET surfaces. */
export interface PlaceFullResult {
  details: PlaceDetails;
  reviews: ReviewsResult;
  localPosts?: LocalPost[];
  meta: PlaceFullMeta;
}

export interface PlaceFullMeta {
  fetchedAt: string;
  /** The pb template actually used — `live` when only a hex id was supplied. */
  previewMode: 'detail' | 'rich' | 'live';
  sources: {
    preview: boolean;
    reviewsBoq: boolean;
    reviewsEmbedded: boolean;
    reviewsRpc: boolean;
    localPosts: boolean;
    knowledge?: boolean;
  };
  timingMs?: {
    preview?: number;
    reviews?: number;
    localPosts?: number;
    knowledge?: number;
    total?: number;
  };
}

/** Options for fetching maximum place data from all working surfaces. */
export interface GetPlaceCompleteOptions extends GetPlaceFullOptions {
  /** Include knowledge entity RPC when available (default true). */
  includeKnowledge?: boolean;
}

/** Complete place data from all working GET surfaces. */
export interface PlaceCompleteResult extends PlaceFullResult {
  knowledge?: KnowledgeEntity;
}

export interface KnowledgeEntity {
  name?: string;
  description?: string;
  wikipediaUrl?: string;
  website?: string;
  imageUrl?: string;
  /**
   * Attribute strings about the entity. When `source` is `place-fallback` these are the
   * place's categories and amenities rather than knowledge-graph facts, since the
   * getknowledgeentity RPC is unreachable (see KNOWN_SURFACES.knowledgeRpc).
   */
  facts?: string[];
  /** Which surface produced this entity. */
  source?: 'knowledge-rpc' | 'place-fallback';
  raw?: unknown;
}

export type TravelMode = 'driving' | 'walking' | 'bicycling' | 'transit';

export type {
  DirectionsAvoid,
  DirectionsLeg,
  DirectionsOptions,
  DirectionsResult,
  DirectionsRoute,
  DirectionsStep,
  DirectionsTransitDetails,
  DirectionsUnits,
  DirectionsWaypoint,
  LatLngBounds,
  StepManeuver,
} from './directions.js';

export class GMapsError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'GMapsError';
  }
}

export class GMapsAuthError extends GMapsError {
  constructor(message: string, cause?: unknown) {
    super(message, 401, cause);
    this.name = 'GMapsAuthError';
  }
}

export class GMapsNetworkError extends GMapsError {
  constructor(message: string, cause?: unknown) {
    super(message, undefined, cause);
    this.name = 'GMapsNetworkError';
  }
}

export class GMapsParseError extends GMapsError {
  constructor(message: string, cause?: unknown) {
    super(message, undefined, cause);
    this.name = 'GMapsParseError';
  }
}

/** listentityphotos returned Google's automated-query abuse page (HTTP 403). */
export class GMapsPhotosBlockedError extends GMapsError {
  constructor(
    message = 'Google blocked /maps/rpc/photo/listentityphotos: automated query detection (HTTP 403). Use place_preview source or retry from a different network.',
    cause?: unknown,
  ) {
    super(message, 403, cause);
    this.name = 'GMapsPhotosBlockedError';
  }
}

/** HTTP 429 or explicit rate-limit response. */
export class GMapsThrottleError extends GMapsNetworkError {
  constructor(
    message = 'Google rate-limited this request (HTTP 429). Back off and retry later.',
    public readonly retryAfterMs?: number,
    cause?: unknown,
  ) {
    super(message, cause);
    this.name = 'GMapsThrottleError';
  }
}

/**
 * HTTP 200 with an empty or auth-stub payload — distinct from "no data for this place".
 * Common on cookieless batchexecute and anonymous listugcposts.
 */
export class GMapsEmptyPayloadError extends GMapsError {
  constructor(
    message = 'Response parsed successfully but contained no usable data (possible auth stub or throttle).',
    public readonly kind: 'empty-200' | 'auth-stub' | 'batch-error' = 'empty-200',
    cause?: unknown,
  ) {
    super(message, undefined, cause);
    this.name = 'GMapsEmptyPayloadError';
  }
}

/** Configured session cookies are present but no longer accepted by Google. */
export class GMapsCookiesExpiredError extends GMapsAuthError {
  constructor(
    message = 'Google session cookies expired or invalid. Re-run: npm run auth:login',
    cause?: unknown,
  ) {
    super(message, cause);
    this.name = 'GMapsCookiesExpiredError';
  }
}

/** Known internal Google Maps HTTP surfaces (reverse-engineered). */
export const ENDPOINTS = {
  /** Text/local search — returns protobuf-over-JSON */
  SEARCH: 'https://www.google.com/search',
  /** Full place preview with photos, hours, amenities */
  PLACE_PREVIEW: 'https://www.google.com/maps/preview/place',
  /** User-generated content / reviews */
  REVIEWS: 'https://www.google.com/maps/rpc/listugcposts',
  /** Batch RPC — resolved at runtime from WIZ eptZe (default MapsWizUi) */
  BATCH_EXECUTE: 'https://www.google.com/maps/_/MapsWizUi/data/batchexecute',
  /** Reviews via PrivateLocalSearchUiDataService (no SAPISID required) */
  BOQ_REVIEWS:
    'https://www.google.com/httpservice/web/PrivateLocalSearchUiDataService/GetLocalBoqProxy',
} as const;

/**
 * Review sort order for GetLocalBoqProxy reqpld inner slot [1].
 * Verified live 2026-07-31 (FRNZOb.js sort menu matches):
 * 1 = most relevant, 2 = newest, 3 = highest rating, 4 = lowest rating.
 */
export type ReviewSortOrder = 1 | 2 | 3 | 4;
