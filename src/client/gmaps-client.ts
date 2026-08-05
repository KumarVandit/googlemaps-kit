import { HttpClient } from '../client/http-client.js';
import { loadProjectEnv } from '../utils/load-env.js';
import { GMapsRpcClient } from '../rpc/rpc-client.js';
import { BatchUrlService } from '../services/batch-url.js';
import { CategoriesService } from '../services/categories.js';
import { DirectionsService } from '../services/directions.js';
import { DistanceMatrixService } from '../services/distance-matrix.js';
import { ElevationService } from '../services/elevation.js';
import { GeocodeService } from '../services/geocode.js';
import { KnowledgeService } from '../services/knowledge.js';
import { LinksService } from '../services/links.js';
import { ListsService } from '../services/lists.js';
import { LocalPostsService } from '../services/local-posts.js';
import { PanoramaService } from '../services/panorama.js';
import { PhotosService } from '../services/photos.js';
import { PassiveAssistService } from '../services/passiveassist.js';
import { PlacesService } from '../services/places.js';
import { ReviewsService } from '../services/reviews.js';
import { RevealService } from '../services/reveal.js';
import { SearchService, searchResultToPlaceDetails } from '../services/search.js';
import { StaticMapService } from '../services/static-map.js';
import { SuggestService } from '../services/suggest.js';
import { TilesService } from '../services/tiles.js';
import { TimezoneService } from '../services/timezone.js';
import { TrafficService } from '../services/traffic.js';
import { TransitService } from '../services/transit.js';
import { UgcAggregatesService } from '../services/ugc-aggregates.js';
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

/**
 * Main Google Maps SDK client.
 */
export class GMapsClient {
  readonly search: SearchService;
  readonly places: PlacesService;
  readonly reviews: ReviewsService;
  readonly reveal: RevealService;
  readonly passiveAssist: PassiveAssistService;
  readonly localPosts: LocalPostsService;
  readonly knowledge: KnowledgeService;
  readonly directions: DirectionsService;
  readonly suggest: SuggestService;
  readonly panorama: PanoramaService;
  readonly tiles: TilesService;
  readonly lists: ListsService;
  readonly photos: PhotosService;
  readonly links: LinksService;
  readonly traffic: TrafficService;
  readonly transit: TransitService;
  readonly categories: CategoriesService;
  readonly ugcAggregates: UgcAggregatesService;
  readonly batchUrl: BatchUrlService;
  readonly distanceMatrix: DistanceMatrixService;
  readonly elevation: ElevationService;
  readonly timezone: TimezoneService;
  readonly staticMap: StaticMapService;
  readonly geocode: GeocodeService;

  private http: HttpClient;
  private config: GMapsConfig;
  private rpcClient: GMapsRpcClient | null = null;
  private rpcInitPromise: Promise<GMapsRpcClient> | null = null;
  private runtimePromise: Promise<import('../rpc/maps-runtime.js').MapsRuntime> | null = null;

  constructor(config: GMapsConfig = {}) {
    this.config = {
      hl: config.hl ?? process.env.GMAPS_HL ?? 'en',
      gl: config.gl ?? process.env.GMAPS_GL ?? 'us',
      buildLabel: config.buildLabel ?? process.env.GMAPS_BUILD_LABEL,
      sessionId: config.sessionId ?? process.env.GMAPS_SESSION_ID,
      debug: config.debug ?? false,
      maxRetries: config.maxRetries ?? 2,
      retryDelay: config.retryDelay ?? 500,
      retryMaxDelay: config.retryMaxDelay ?? 30_000,
      requestDelayMs: config.requestDelayMs ?? Number(process.env.GMAPS_REQUEST_DELAY_MS ?? 0),
      concurrency: config.concurrency ?? Number(process.env.GMAPS_CONCURRENCY ?? 6),
    };

    this.http = new HttpClient({ config: this.config });
    this.search = new SearchService(this.http, this.config);
    this.places = new PlacesService(this.http, this.config);
    this.reviews = new ReviewsService(this.http, this.config);
    this.reveal = new RevealService(this.http, this.config);
    this.passiveAssist = new PassiveAssistService(this.http, this.config);
    this.localPosts = new LocalPostsService(this.http, this.config);
    this.knowledge = new KnowledgeService(this.http, this.config);
    this.directions = new DirectionsService(this.http, this.config);
    this.suggest = new SuggestService(this.http, this.config);
    this.panorama = new PanoramaService(this.http, this.config);
    this.tiles = new TilesService(this.http, this.config);
    this.lists = new ListsService(this.http, this.config);
    this.photos = new PhotosService(this.http, this.config);
    this.links = new LinksService(this.http, this.config);
    this.traffic = new TrafficService(this.http, this.config);
    this.transit = new TransitService(this.http, this.config);
    this.categories = new CategoriesService(this.http, this.config);
    this.ugcAggregates = new UgcAggregatesService(this.http, this.config);
    this.batchUrl = new BatchUrlService(this.http, this.config);
    this.geocode = new GeocodeService(this.http, this.config);
    this.distanceMatrix = new DistanceMatrixService(this.directions, this.config);
    this.elevation = new ElevationService(this.http, this.directions, this.config);
    this.timezone = new TimezoneService(this.geocode, this.config);
    this.staticMap = new StaticMapService(this.http, this.config);
  }

  async rpc(): Promise<GMapsRpcClient> {
    if (this.rpcClient) {
      return this.rpcClient;
    }

    if (!this.rpcInitPromise) {
      this.rpcInitPromise = GMapsRpcClient.fromHttpSession(
        this.http.getCookieJar(),
        this.http.getUserAgent(),
        this.config,
        (fn) => this.http.runScheduled(fn),
      ).then((client) => {
        this.rpcClient = client;
        return client;
      });
    }

    return this.rpcInitPromise;
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
    return this.places.getFull(options, this.reviews);
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
      const entity = await this.knowledge.get({
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
    return this.directions.get(options);
  }

  /** Request/session counters for harness scripts (no secrets). */
  getHttpStats() {
    return this.http.getStats();
  }

  async searchEnriched(options: EnrichSearchOptions): Promise<EnrichedSearchResult[]> {
    const results = await this.search.search(options);

    // Official Text Search Enterprise parity: one RPC, details lifted from the search row.
    if (options.fromSearchOnly || (!options.includeDetails && !options.includeReviews)) {
      return results.map((result) => ({
        ...result,
        details: searchResultToPlaceDetails(result),
      }));
    }

    const concurrency = options.concurrency ?? 10;
    const enriched: EnrichedSearchResult[] = [];

    for (let i = 0; i < results.length; i += concurrency) {
      const chunk = results.slice(i, i + concurrency);
      const batch = await Promise.all(
        chunk.map((result) => this.enrichSingle(result, options)),
      );
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
      // Always keep search-row details as a non-lossy base; place preview may truncate.
      details: searchResultToPlaceDetails(result),
    };

    if (!result.hexId || !result.name) {
      return enriched;
    }

    const lat = result.latitude ?? options.location.lat;
    const lng = result.longitude ?? options.location.lng;

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
        // Prefer preview photos when present; fall back to search thumbnail.
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
      enriched.reviews = await this.reviews.list({
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

export function createGMapsClient(config?: GMapsConfig): GMapsClient {
  return new GMapsClient(config);
}
