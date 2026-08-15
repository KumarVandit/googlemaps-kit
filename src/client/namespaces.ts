/**
 * Domain namespaces for GMapsClient.
 */

import { AskMapsService } from '../services/ask-maps.js';
import { BatchUrlService } from '../services/meta.js';
import { BikeShareService } from '../services/mobility.js';
import { CategoriesService } from '../services/meta.js';
import { DirectionsService } from '../services/directions.js';
import { DistanceMatrixService } from '../services/distance-matrix.js';
import { ElevationService } from '../services/elevation.js';
import { EvChargingService } from '../services/mobility.js';
import { GeocodeService } from '../services/geocode.js';
import { KnowledgeService } from '../services/knowledge.js';
import { LinksService } from '../services/links.js';
import { ListsService } from '../services/lists.js';
import { LocalPostsService } from '../services/local-posts.js';
import { LocationContextService } from '../services/viewport.js';
import { Map3dService } from '../services/map-3d.js';
import { MapEarthService } from '../services/tiles.js';
import { MapLayersService } from '../services/map-layers.js';
import { PanoramaService } from '../services/panorama.js';
import { ParkingService } from '../services/mobility.js';
import { PassiveAssistService } from '../services/viewport.js';
import { PhotosService } from '../services/photos.js';
import { PlaceAttributesService } from '../services/place-attributes.js';
import { PlacesService, type GetPlaceOptions, type PlacePreviewFetchResult } from '../services/places.js';
import { ReviewsService } from '../services/reviews.js';
import { RevealService } from '../services/viewport.js';
import { SearchAlongRouteService } from '../services/search-along-route.js';
import { SearchService } from '../services/search.js';
import { StaticMapService } from '../services/static-map.js';
import { SuggestService } from '../services/search.js';
import { TilesService } from '../services/tiles.js';
import { TimezoneService } from '../services/geocode.js';
import { TrafficService } from '../services/traffic.js';
import { TransitService } from '../services/transit.js';
import { UgcAggregatesService } from '../services/meta.js';
import { UserPrefsService } from '../services/meta.js';
import { WaypointOptimizerService } from '../services/waypoint-optimizer.js';
import type { PlaceDetails } from '../types/common.js';
import { AuthRequiredError } from '../types/common.js';
import type { AskMapsOptions, AskMapsResult } from '../services/ask-maps.js';
import type { GetBikeAvailabilityOptions } from '../types/mobility.js';
import type { SearchAlongRouteOptions, SearchAlongRouteResult } from '../types/search-along-route.js';
import type { OptimizeWaypointsOptions, OptimizeWaypointsResult } from '../types/route-optimization.js';

/**
 * Auth + surface catalog namespaces — product-facing wrappers over kit internals.
 */

import { AuthService, summarizeAuthStatus, type AuthStatusOptions } from '../auth/auth-status.js';
import type { HttpClient } from './http-client.js';
import type { GetPlaceFullOptions, PlaceFullResult } from '../types/common.js';
import type { AuthStatus, GMapsConfig } from '../types/common.js';
import {
  KNOWN_SURFACES,
  getSurfaceInfo,
  listSurfacesByStatus,
  type KnownSurfaceName,
  type SurfaceInfo,
  type SurfaceStatus,
} from '../known-surfaces.js';

/** Session / cookie status for apps (no secret values returned). */
export class AuthNamespace {
  private readonly auth: AuthService;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.auth = new AuthService(http, {
      cookies: config.cookies,
      authToken: config.authToken,
    });
  }

  /** Live or cached auth probe — cookie names/lengths only, never values. */
  status(options?: AuthStatusOptions): Promise<AuthStatus> {
    return this.auth.getStatus(options);
  }

  /** One-line summary for logs (`signed-in, cookies=12, …`). */
  async summarize(options?: AuthStatusOptions): Promise<string> {
    return summarizeAuthStatus(await this.status(options));
  }
}

/** Catalog of Maps surfaces this kit knows about (working / auth / blocked / …). */
export class SurfacesNamespace {
  /** All surface names. */
  list(): KnownSurfaceName[] {
    return Object.keys(KNOWN_SURFACES) as KnownSurfaceName[];
  }

  /** Surfaces filtered by status (`working`, `auth-required`, …). */
  listByStatus(status: SurfaceStatus): KnownSurfaceName[] {
    return listSurfacesByStatus(status);
  }

  /** Metadata for one surface. */
  get(name: KnownSurfaceName): SurfaceInfo {
    return getSurfaceInfo(name);
  }

  /** Full catalog object (read-only snapshot). */
  catalog(): typeof KNOWN_SURFACES {
    return KNOWN_SURFACES;
  }

  /** Names marked working (anonymous or with documented path). */
  working(): KnownSurfaceName[] {
    return listSurfacesByStatus('working');
  }
}
export interface ServiceBundle {
  search: SearchService;
  places: PlacesService;
  reviews: ReviewsService;
  suggest: SuggestService;
  photos: PhotosService;
  knowledge: KnowledgeService;
  localPosts: LocalPostsService;
  placeAttributes: PlaceAttributesService;
  geocode: GeocodeService;
  timezone: TimezoneService;
  reveal: RevealService;
  passiveAssist: PassiveAssistService;
  context: LocationContextService;
  directions: DirectionsService;
  distanceMatrix: DistanceMatrixService;
  elevation: ElevationService;
  transit: TransitService;
  traffic: TrafficService;
  parking: ParkingService;
  ev: EvChargingService;
  bikeShare: BikeShareService;
  searchAlongRoute: SearchAlongRouteService;
  waypointOptimizer: WaypointOptimizerService;
  tiles: TilesService;
  layers: MapLayersService;
  staticMap: StaticMapService;
  panorama: PanoramaService;
  map3d: Map3dService;
  earth: MapEarthService;
  categories: CategoriesService;
  ugcAggregates: UgcAggregatesService;
  lists: ListsService;
  links: LinksService;
  batchUrl: BatchUrlService;
  userPrefs: UserPrefsService;
  askMaps: AskMapsService;
}

/** Search, place details, reviews, photos, and related POI surfaces. */
export class PlacesNamespace {
  readonly search: SearchService;
  readonly suggest: SuggestService;
  /** Raw place-preview / enrichment service. */
  readonly details: PlacesService;
  readonly reviews: ReviewsService;
  readonly photos: PhotosService;
  readonly knowledge: KnowledgeService;
  readonly localPosts: LocalPostsService;
  readonly attributes: PlaceAttributesService;

  constructor(s: ServiceBundle) {
    this.search = s.search;
    this.suggest = s.suggest;
    this.details = s.places;
    this.reviews = s.reviews;
    this.photos = s.photos;
    this.knowledge = s.knowledge;
    this.localPosts = s.localPosts;
    this.attributes = s.placeAttributes;
  }

  /** Place card (preview + parallel UGC/photo enrichment). */
  get(options: GetPlaceOptions): Promise<PlaceDetails> {
    return this.details.get(options);
  }

  getMany(places: GetPlaceOptions[], concurrency?: number): Promise<PlaceDetails[]> {
    return this.details.getMany(places, concurrency);
  }

  getFull(options: GetPlaceFullOptions): Promise<PlaceFullResult> {
    return this.details.getFull(options, this.reviews);
  }

  fetchPreview(options: GetPlaceOptions & { mode?: GetPlaceOptions['mode'] }): Promise<PlacePreviewFetchResult> {
    return this.details.fetchPreview(options);
  }
}

/** Geocode, timezone, map-click reveal, viewport chips. */
export class LocationNamespace {
  readonly geocode: GeocodeService;
  readonly timezone: TimezoneService;
  readonly reveal: RevealService;
  readonly passiveAssist: PassiveAssistService;
  readonly context: LocationContextService;

  constructor(s: ServiceBundle) {
    this.geocode = s.geocode;
    this.timezone = s.timezone;
    this.reveal = s.reveal;
    this.passiveAssist = s.passiveAssist;
    this.context = s.context;
  }
}

/** Directions, matrix, elevation, transit, traffic, bikes, corridor search, tour optimization. */
export class TravelNamespace {
  readonly directions: DirectionsService;
  readonly distanceMatrix: DistanceMatrixService;
  readonly elevation: ElevationService;
  readonly transit: TransitService;
  readonly traffic: TrafficService;
  readonly parking: ParkingService;
  readonly ev: EvChargingService;
  /** Live bike-share dock availability. */
  readonly bikeShare: BikeShareService;
  /** Corridor (search-along-route) queries. */
  readonly searchAlongRoute: SearchAlongRouteService;
  /** Multi-stop tour optimization over the directions-fan-out matrix. */
  readonly waypointOptimizer: WaypointOptimizerService;

  constructor(s: ServiceBundle) {
    this.directions = s.directions;
    this.distanceMatrix = s.distanceMatrix;
    this.elevation = s.elevation;
    this.transit = s.transit;
    this.traffic = s.traffic;
    this.parking = s.parking;
    this.ev = s.ev;
    this.bikeShare = s.bikeShare;
    this.searchAlongRoute = s.searchAlongRoute;
    this.waypointOptimizer = s.waypointOptimizer;
  }

  /** Convenience passthrough to {@link BikeShareService.getAvailability}. */
  bikeAvailability(options: GetBikeAvailabilityOptions) {
    return this.bikeShare.getAvailability(options);
  }

  /** Convenience passthrough to {@link SearchAlongRouteService.find}. */
  alongRoute(options: SearchAlongRouteOptions): Promise<SearchAlongRouteResult> {
    return this.searchAlongRoute.find(options);
  }

  /** Convenience passthrough to {@link WaypointOptimizerService.optimize}. */
  optimizeWaypoints(options: OptimizeWaypointsOptions): Promise<OptimizeWaypointsResult> {
    return this.waypointOptimizer.optimize(options);
  }
}

/** Tiles, static map, Street View. */
export class MapNamespace {
  readonly tiles: TilesService;
  readonly staticMap: StaticMapService;
  readonly panorama: PanoramaService;
  readonly layers: MapLayersService;
  readonly map3d: Map3dService;
  readonly earth: MapEarthService;

  constructor(s: ServiceBundle) {
    this.tiles = s.tiles;
    this.staticMap = s.staticMap;
    this.panorama = s.panorama;
    this.layers = s.layers;
    this.map3d = s.map3d;
    this.earth = s.earth;
  }
}

/** Categories, aggregates, lists, links, URL RPC. */
export class MetaNamespace {
  readonly categories: CategoriesService;
  readonly ugcAggregates: UgcAggregatesService;
  readonly lists: ListsService;
  readonly links: LinksService;
  readonly batchUrl: BatchUrlService;
  /** Signed-in account preferences (units, home/work, region). */
  readonly userPrefs: UserPrefsService;

  constructor(s: ServiceBundle) {
    this.categories = s.categories;
    this.ugcAggregates = s.ugcAggregates;
    this.lists = s.lists;
    this.links = s.links;
    this.batchUrl = s.batchUrl;
    this.userPrefs = s.userPrefs;
  }
}

/** Signed-in Ask Maps agent (gated). */
export class AgentNamespace {
  readonly askMaps: AskMapsService;
  private readonly isSignedIn: () => boolean;

  constructor(s: ServiceBundle, isSignedIn: () => boolean) {
    this.askMaps = s.askMaps;
    this.isSignedIn = isSignedIn;
  }

  async ask(options: AskMapsOptions): Promise<AskMapsResult> {
    if (!this.isSignedIn()) {
      throw new AuthRequiredError(
        'Ask Maps requires a signed-in session. Pass cookies via sdk({ session: \'authenticated\', cookies }) or GMAPS_COOKIES.',
        'askMaps',
      );
    }
    return this.askMaps.ask(options);
  }

  listHistoryThreads() {
    if (!this.isSignedIn()) {
      throw new AuthRequiredError(
        'Ask Maps history requires a signed-in session (GMAPS_COOKIES).',
        'askMapsHistory',
      );
    }
    return this.askMaps.listHistoryThreads();
  }
}

export function createServiceBundle(http: HttpClient, config: GMapsConfig): ServiceBundle {
  const geocode = new GeocodeService(http, config);
  const directions = new DirectionsService(http, config);
  const distanceMatrix = new DistanceMatrixService(directions, config);
  const search = new SearchService(http, config);
  return {
    search,
    places: new PlacesService(http, config),
    reviews: new ReviewsService(http, config),
    suggest: new SuggestService(http, config),
    photos: new PhotosService(http, config),
    knowledge: new KnowledgeService(http, config),
    localPosts: new LocalPostsService(http, config),
    placeAttributes: new PlaceAttributesService(http, config),
    geocode,
    timezone: new TimezoneService(geocode, config),
    reveal: new RevealService(http, config),
    passiveAssist: new PassiveAssistService(http, config),
    context: new LocationContextService(http, config),
    directions,
    distanceMatrix,
    elevation: new ElevationService(http, directions, config),
    transit: new TransitService(http, config),
    traffic: new TrafficService(http, config),
    parking: new ParkingService(http, config),
    ev: new EvChargingService(http, config),
    bikeShare: new BikeShareService(http, config),
    searchAlongRoute: new SearchAlongRouteService(search, directions, geocode),
    waypointOptimizer: new WaypointOptimizerService(
      new DistanceMatrixService(directions, config),
      directions,
      geocode,
    ),
    tiles: new TilesService(http, config),
    layers: new MapLayersService(http, config),
    staticMap: new StaticMapService(http, config),
    panorama: new PanoramaService(http, config),
    map3d: new Map3dService(http, config),
    earth: new MapEarthService(http, config),
    categories: new CategoriesService(http, config),
    ugcAggregates: new UgcAggregatesService(http, config),
    lists: new ListsService(http, config),
    links: new LinksService(http, config),
    batchUrl: new BatchUrlService(http, config),
    userPrefs: new UserPrefsService(http, config),
    askMaps: new AskMapsService(http, config),
  };
}
