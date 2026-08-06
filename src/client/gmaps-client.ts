import { HttpClient } from './http-client.js';
import { loadProjectEnv } from '../utils/load-env.js';
import { GMapsRpcClient } from '../rpc/rpc-client.js';
import { IntentApi } from './intent.js';
import {
  AgentNamespace,
  createServiceBundle,
  LocationNamespace,
  MapNamespace,
  MetaNamespace,
  PlacesNamespace,
  TravelNamespace,
  type ServiceBundle,
} from './namespaces.js';
import { AuthNamespace, SurfacesNamespace } from './product-namespaces.js';
import { searchResultToPlaceDetails } from '../services/search.js';
import type {
  DirectionsOptions,
  DirectionsResult,
  EnrichedSearchResult,
  GetPlaceCompleteOptions,
  GetPlaceFullOptions,
  GMapsConfig,
  KnowledgeEntity,
  PlaceCompleteResult,
  PlaceFullResult,
  SearchOptions,
  SearchResult,
} from '../types/common.js';
import { GMapsAuthError } from '../types/common.js';
import type {
  ClientCapabilities,
  DiscoverOptions,
  DiscoverPagesOptions,
  DiscoverResult,
  MediaManyOptions,
  MediaOptions,
  MediaResult,
  OpinionsOptions,
  OpinionsPagesOptions,
  OpinionsResult,
  PipelineOptions,
  PipelineResult,
  PlaceProfile,
  PlaceRef,
  ProfileManyOptions,
  ProfileOptions,
  ResolveOptions,
  ResolvedPlace,
  RouteOptions,
  RouteResult,
  SessionMode,
} from '../types/dx.js';
import { TtlCache } from '../utils/ttl-cache.js';
import { createMapsTools, type CreateMapsToolsOptions, type MapsTools } from './maps-tools.js';

loadProjectEnv();

export interface EnrichSearchOptions extends SearchOptions {
  /**
   * Prefer search-row fields only (Places Text Search Enterprise parity in 1 RPC).
   * When true, skips place-preview round-trips unless includeReviews is also set.
   */
  fromSearchOnly?: boolean;
  /** Fetch full place details for each result (gallery-scale photos, stub-retry). */
  includeDetails?: boolean;
  /** Fetch reviews for each result */
  includeReviews?: boolean;
  /** Max Boq review pages per place when includeReviews is true */
  maxReviewPages?: number;
  /** Max parallel enrichment requests (default 10) */
  concurrency?: number;
}

function normalizeConfig(config: GMapsConfig = {}): GMapsConfig {
  const hl = config.locale?.hl ?? config.hl ?? process.env.GMAPS_HL ?? 'en';
  const gl = config.locale?.gl ?? config.gl ?? process.env.GMAPS_GL ?? 'us';
  const cookies = config.cookies ?? process.env.GMAPS_COOKIES;
  const session: SessionMode =
    config.session ?? (cookies ? 'authenticated' : 'anonymous');
  const concurrency =
    config.concurrency ??
    config.performance?.concurrency ??
    Number(process.env.GMAPS_CONCURRENCY ?? 6);

  if (session === 'authenticated' && !cookies) {
    throw new GMapsAuthError(
      "session: 'authenticated' requires cookies (config.cookies or GMAPS_COOKIES). " +
        "Use session: 'anonymous' (default) when you do not have signed-in cookies.",
    );
  }

  return {
    ...config,
    hl,
    gl,
    locale: { hl, gl, ...config.locale },
    cookies,
    session,
    debug: config.debug ?? process.env.GMAPS_DEBUG === 'true',
    maxRetries: config.maxRetries ?? 2,
    retryDelay: config.retryDelay ?? 500,
    retryMaxDelay: config.retryMaxDelay ?? 30_000,
    requestDelayMs: config.requestDelayMs ?? Number(process.env.GMAPS_REQUEST_DELAY_MS ?? 0),
    concurrency,
    performance: {
      mode: config.performance?.mode ?? 'fast',
      concurrency,
      ...config.performance,
    },
    warmOnCreate: config.warmOnCreate,
    buildLabel: config.buildLabel ?? process.env.GMAPS_BUILD_LABEL,
    sessionId: config.sessionId ?? process.env.GMAPS_SESSION_ID,
  };
}

function jarHasSapisid(jar: Record<string, string>): boolean {
  return Boolean(jar.SAPISID || jar['__Secure-1PAPISID'] || jar['__Secure-3PAPISID']);
}

/**
 * Main Google Maps SDK client.
 *
 * Create with `sdk()` or `GMaps.create()`.
 *
 * **Intent:** `discover`, `resolve`, `profile`, `route`, `opinions`, `media`
 * **Namespaces:** `places`, `location`, `travel`, `map`, `meta`, `agent`, `auth`, `surfaces`
 */
export class GMapsClient {
  /** POI discovery & details namespace. */
  readonly places: PlacesNamespace;
  /** Geocode / timezone / reveal. */
  readonly location: LocationNamespace;
  /** Routing & traffic. */
  readonly travel: TravelNamespace;
  /** Tiles, static map, Street View. */
  readonly map: MapNamespace;
  /** Categories, lists, links, aggregates. */
  readonly meta: MetaNamespace;
  /** Signed-in Ask Maps. */
  readonly agent: AgentNamespace;
  /** Session status (cookie presence / live probe — no secrets). */
  readonly auth: AuthNamespace;
  /** Catalog of Maps surfaces this kit supports. */
  readonly surfaces: SurfacesNamespace;

  private http: HttpClient;
  private config: GMapsConfig;
  private services: ServiceBundle;
  private intent: IntentApi;
  private runtimePromise: Promise<import('../rpc/maps-runtime.js').MapsRuntime> | null = null;
  private intentCache?: TtlCache<unknown>;

  constructor(config: GMapsConfig = {}) {
    this.config = normalizeConfig(config);
    this.http = new HttpClient({ config: this.config });
    if (this.config.warmOnCreate !== false && !this.config.cookies) {
      void this.http.warmSession();
    }

    if (this.config.cache) {
      this.intentCache = new TtlCache(this.config.cache);
    }

    this.services = createServiceBundle(this.http, this.config);
    const signedIn = () => this.isSignedIn();

    this.places = new PlacesNamespace(this.services);
    this.location = new LocationNamespace(this.services);
    this.travel = new TravelNamespace(this.services);
    this.map = new MapNamespace(this.services);
    this.meta = new MetaNamespace(this.services);
    this.agent = new AgentNamespace(this.services, signedIn);
    this.auth = new AuthNamespace(this.http, this.config);
    this.surfaces = new SurfacesNamespace();

    this.intent = new IntentApi(
      this.services,
      this.config,
      signedIn,
      (opts) => this.getPlaceComplete(opts),
      this.intentCache,
    );
  }

  // ——— Intent API ———

  /**
   * Find places near a point. Returns `{ places, timingMs, mode, pagination }`.
   * Default mode `fast` (~400 ms warm).
   */
  discover(options: DiscoverOptions): Promise<DiscoverResult> {
    return this.intent.discover(options);
  }

  /** Stream discover pages (deduped). */
  discoverPages(options: DiscoverPagesOptions): AsyncGenerator<DiscoverResult> {
    return this.intent.discoverPages(options);
  }

  /**
   * Resolve URL/query → identity (`hexId`, name, coords when known).
   * Not a full place card — follow with `profile()`.
   */
  resolve(options: ResolveOptions): Promise<ResolvedPlace> {
    return this.intent.resolve(options);
  }

  /**
   * Place profile. Always `{ place, depth, reviews?, … }` — use `place.name`.
   * Default depth `card` (details only).
   */
  profile(ref: PlaceRef, options?: ProfileOptions): Promise<PlaceProfile> {
    return this.intent.profile(ref, options);
  }

  /** Profile many places with bounded concurrency. */
  profileMany(refs: PlaceRef[], options?: ProfileManyOptions): Promise<PlaceProfile[]> {
    return this.intent.profileMany(refs, options);
  }

  /**
   * Directions. Default metrics only; pass `includeSteps: true` for turn-by-turn.
   */
  route(options: RouteOptions): Promise<RouteResult> {
    return this.intent.route(options);
  }

  /**
   * Reviews. Default one page, no aggregates RPC (set `includeAggregates: true` for histogram).
   */
  opinions(ref: PlaceRef, options?: OpinionsOptions): Promise<OpinionsResult> {
    return this.intent.opinions(ref, options);
  }

  /** Stream review pages. */
  opinionsPages(
    ref: PlaceRef,
    options?: OpinionsPagesOptions,
  ): AsyncGenerator<OpinionsResult> {
    return this.intent.opinionsPages(ref, options);
  }

  /**
   * Photos (+ optional Street View). Flat `photos[]` array.
   */
  media(ref: PlaceRef, options?: MediaOptions): Promise<MediaResult> {
    return this.intent.media(ref, options);
  }

  /** Media for many places with bounded concurrency. */
  mediaMany(refs: PlaceRef[], options?: MediaManyOptions): Promise<MediaResult[]> {
    return this.intent.mediaMany(refs, options);
  }

  /** Discover → profile → optional opinions pipeline. */
  pipeline(options: PipelineOptions): Promise<PipelineResult> {
    return this.intent.pipeline(options);
  }

  /** Ready-made Intent tools for agents. */
  tools(options?: CreateMapsToolsOptions): MapsTools {
    return createMapsTools(this, options);
  }

  /** Clear Intent TTL cache (no-op when cache disabled). */
  clearCache(): void {
    this.intentCache?.clear();
  }

  /** Capability flags for anonymous vs signed-in surfaces. */
  async capabilities(): Promise<ClientCapabilities> {
    const signedIn = this.isSignedIn();
    const session: SessionMode = signedIn ? 'authenticated' : 'anonymous';
    return {
      session,
      signedIn,
      search: true,
      placeDetails: true,
      reviewsBoq: true,
      reviewsRpc: signedIn,
      photos: true,
      directions: true,
      askMaps: signedIn,
      askMapsHistory: signedIn,
      privateLists: signedIn,
      legacyRpc: signedIn,
    };
  }

  private isSignedIn(): boolean {
    if (jarHasSapisid(this.http.getCookieJar())) return true;
    if (this.config.cookies && /SAPISID=/i.test(this.config.cookies)) return true;
    return false;
  }

  async rpc(): Promise<GMapsRpcClient> {
    return this.http.getRpcClient(this.config);
  }

  async features(): Promise<import('../rpc/feature-rpc.js').FeatureRpcService> {
    const { createFeatureRpcService } = await import('../rpc/feature-rpc.js');
    return createFeatureRpcService(await this.rpc());
  }

  async runtime(): Promise<import('../rpc/maps-runtime.js').MapsRuntime> {
    if (!this.runtimePromise) {
      const { MapsRuntime } = await import('../rpc/maps-runtime.js');
      this.runtimePromise = MapsRuntime.bootstrap(this.config);
    }
    return this.runtimePromise;
  }

  async getPlaceFull(options: GetPlaceFullOptions): Promise<PlaceFullResult> {
    return this.places.getFull(options);
  }

  /**
   * Fetch maximum available place data: rich preview, paginated Boq reviews,
   * local posts, and knowledge entity (when available).
   */
  async getPlaceComplete(options: GetPlaceCompleteOptions): Promise<PlaceCompleteResult> {
    const includeKnowledge = options.includeKnowledge !== false;
    const maxReviewPages = options.maxReviewPages ?? 3;

    const full = await this.getPlaceFull({
      ...options,
      maxReviewPages,
      richPreview: options.richPreview === true,
      includeLocalPosts: options.includeLocalPosts !== false,
    });

    let knowledge: KnowledgeEntity | undefined;
    if (includeKnowledge) {
      const start = performance.now();
      const entity = await this.places.knowledge.get({
        hexId: options.hexId,
        ftid: options.ftid,
        placeId: full.details.placeId,
        fallbackDetails: full.details,
      });
      full.meta.timingMs = full.meta.timingMs ?? {};
      full.meta.timingMs.knowledge = performance.now() - start;
      full.meta.sources.knowledge = entity != null;
      knowledge = entity ?? undefined;
    }

    return { ...full, knowledge };
  }

  async getDirections(options: DirectionsOptions): Promise<DirectionsResult> {
    return this.travel.directions.get(options);
  }

  /** Wait until the client is ready for requests. */
  ready(): Promise<void> {
    return this.http.warmSession();
  }

  /** Request/session counters for harness scripts (no secrets). */
  getHttpStats() {
    return this.http.getStats();
  }

  async searchEnriched(options: EnrichSearchOptions): Promise<EnrichedSearchResult[]> {
    const results = await this.places.search.search(options);

    if (options.fromSearchOnly || (!options.includeDetails && !options.includeReviews)) {
      return results.map((result) => ({
        ...result,
        details: searchResultToPlaceDetails(result),
      }));
    }

    const concurrency = options.concurrency ?? this.config.concurrency ?? 10;
    const enriched: EnrichedSearchResult[] = [];

    for (let i = 0; i < results.length; i += concurrency) {
      const chunk = results.slice(i, i + concurrency);
      const batch = await Promise.all(chunk.map((result) => this.enrichSingle(result, options)));
      enriched.push(...batch);
    }

    return enriched;
  }

  private async enrichSingle(
    result: SearchResult,
    options: EnrichSearchOptions,
  ): Promise<EnrichedSearchResult> {
    const enriched: EnrichedSearchResult = {
      ...result,
      details: searchResultToPlaceDetails(result),
    };

    if (!result.hexId || !result.name) {
      return enriched;
    }

    const lat = result.lat ?? result.latitude ?? options.location?.lat ?? options.near?.lat;
    const lng = result.lng ?? result.longitude ?? options.location?.lng ?? options.near?.lng;

    if (options.includeDetails && options.includeReviews) {
      const full = await this.getPlaceFull({
        hexId: result.hexId,
        name: result.name,
        lat,
        lng,
        ftid: result.ftid,
        maxReviewPages: options.maxReviewPages ?? 1,
      });
      enriched.details = {
        ...enriched.details,
        ...full.details,
        photos:
          full.details.photos && full.details.photos.length > 0
            ? full.details.photos
            : enriched.details?.photos,
        reviewCount: full.details.reviewCount ?? enriched.details?.reviewCount,
        phone: full.details.phone ?? enriched.details?.phone,
        openStatus: full.details.openStatus ?? enriched.details?.openStatus,
        openingSchedule: full.details.openingSchedule ?? enriched.details?.openingSchedule,
      };
      enriched.reviews = full.reviews;
      enriched.localPosts = full.localPosts;
      return enriched;
    }

    if (options.includeDetails) {
      const preview = await this.places.get({
        hexId: result.hexId,
        name: result.name,
        lat,
        lng,
        ftid: result.ftid,
        mode: 'live',
      });
      enriched.details = {
        ...enriched.details,
        ...preview,
        photos:
          preview.photos && preview.photos.length > 0
            ? preview.photos
            : enriched.details?.photos,
        reviewCount: preview.reviewCount ?? enriched.details?.reviewCount,
        phone: preview.phone ?? enriched.details?.phone,
        openStatus: preview.openStatus ?? enriched.details?.openStatus,
        openingSchedule: preview.openingSchedule ?? enriched.details?.openingSchedule,
      };
    }

    if (options.includeReviews) {
      enriched.reviews = await this.places.reviews.list({
        hexId: result.hexId,
        name: result.name,
        lat,
        lng,
        ftid: result.ftid,
        limit: 10,
      });
    }

    return enriched;
  }
}

/**
 * Create a Maps SDK client.
 *
 * @example
 * import { sdk } from 'googlemaps-kit';
 * const maps = sdk({ locale: { hl: 'en', gl: 'in' } });
 * const { places } = await maps.discover({ query: 'coffee', near: { lat, lng } });
 */
export function sdk(config?: GMapsConfig): GMapsClient {
  return new GMapsClient(config);
}

/** Namespace-style entry: `GMaps.create(config)` / `GMaps.Client`. */
export const GMaps = {
  create: sdk,
  Client: GMapsClient,
} as const;

export { createMapsTools } from './maps-tools.js';
export type { CreateMapsToolsOptions, MapsToolDefinition, MapsTools } from './maps-tools.js';
