import { HttpClient } from './http-client.js';
import { loadProjectEnv } from '../utils/env.js';
import { GMapsRpcClient } from '../rpc/rpc-client.js';
import { IntentApi } from './intent.js';
import {
  AgentNamespace,
  AuthNamespace,
  createServiceBundle,
  EnvironmentNamespace,
  LocationNamespace,
  MapNamespace,
  MetaNamespace,
  PlacesNamespace,
  SurfacesNamespace,
  TravelNamespace,
  type ServiceBundle,
} from './namespaces.js';
import type { GMapsConfig } from '../types/common.js';
import { GMapsAuthError, GMapsError } from '../types/common.js';
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
  GridOptions,
  GridResult,
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
import { TtlCache } from '../utils/async.js';
import { boundsAround } from '../utils/geo.js';
import { createMapsTools, type CreateMapsToolsOptions, type MapsTools } from './maps-tools.js';

loadProjectEnv();

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
 * **Intent (app flows):** `discover`, `resolve`, `profile`, `route`, `opinions`, `media`, `grid`
 * **Namespaces (full control):** `places`, `location`, `travel`, `map`, `environment`, `meta`, `agent`, `auth`, `surfaces`
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
  /** Air quality, weather, solar, pollen. */
  readonly environment: EnvironmentNamespace;
  /** Categories, lists, links, aggregates. */
  readonly meta: MetaNamespace;
  /** Signed-in Ask Maps. */
  readonly agent: AgentNamespace;
  /** Session status (cookie presence / live probe — no secrets). */
  readonly auth: AuthNamespace;
  /** Catalog of Maps surfaces and platform products this kit supports. */
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

    this.places = new PlacesNamespace(this.services, this.config);
    this.location = new LocationNamespace(this.services);
    this.travel = new TravelNamespace(this.services);
    this.map = new MapNamespace(this.services);
    this.environment = new EnvironmentNamespace(this.services);
    this.meta = new MetaNamespace(this.services);
    this.agent = new AgentNamespace(this.services, signedIn);
    this.auth = new AuthNamespace(this.http, this.config);
    this.surfaces = new SurfacesNamespace();

    this.intent = new IntentApi(this.services, this.config, signedIn, this.intentCache);
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

  /**
   * Area-coverage search: split a bounding box into zoom cells and merge the
   * per-cell results, deduped. Beats single-query pagination caps in dense
   * cities — pass `bounds`, or `near` + `spanKm` (default 3 km square).
   */
  async grid(options: GridOptions): Promise<GridResult> {
    const start = performance.now();
    let bounds = options.bounds;
    if (!bounds && options.near) {
      const pin = await this.location.geocode.resolveBias(options.near);
      bounds = boundsAround(pin.lat, pin.lng, options.spanKm ?? 3);
    }
    if (!bounds) {
      throw new GMapsError('grid() requires bounds or near (+ optional spanKm)');
    }
    const { onProgress } = options;
    const result = await this.services.search.grid({
      ...options,
      bounds,
      onProgress: onProgress
        ? (p) =>
            onProgress({
              type: 'grid',
              index: p.cell,
              total: p.totalCells,
              loaded: p.uniqueResults,
              key: `${p.x}/${p.y}`,
            })
        : undefined,
    });
    return {
      places: result.results,
      cellsSearched: result.cellsSearched,
      cellsTotal: result.cellsTotal,
      requestsMade: result.requestsMade,
      cellZoom: result.cellZoom,
      timingMs: performance.now() - start,
    };
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
      userPrefs: signedIn,
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

  /** Wait until the client is ready for requests. */
  ready(): Promise<void> {
    return this.http.warmSession();
  }

  /** Request/session counters for harness scripts (no secrets). */
  getHttpStats() {
    return this.http.getStats();
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
