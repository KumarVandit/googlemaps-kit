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
import { fetchPlaceComplete, enrichSearchResults } from './place-workflows.js';
import { AerialViewService } from '../services/aerial-view.js';
import { buildEmbedUrl } from '../rpc/maps-url-builders.js';
import { AirQualityService } from '../services/environment/air-quality.js';
import { WeatherService } from '../services/environment/weather.js';
import {
  AddressValidationService,
  GeolocationService,
  PollenService,
  RoadsService,
  SolarService,
} from '../services/keyed.js';
import { NearbySearchService } from '../services/nearby-search.js';
import {
  getPlatformProduct,
  listPlatformProducts,
  type PlatformCategory,
  type PlatformProduct,
} from '../platform/catalog.js';
import { summarizePlatformCoverage, type PlatformCoverageSummary } from '../platform/parity.js';
import type {
  EnrichSearchOptions,
  EnrichedSearchResult,
  GetPlaceCompleteOptions,
  GMapsConfig,
  PlaceCompleteResult,
  PlaceDetails,
} from '../types/common.js';
import type { BuildEmbedUrlOptions, EmbedUrlResult } from '../types/maps-urls.js';
import { AuthRequiredError } from '../types/common.js';
import type { AskMapsOptions, AskMapsResult } from '../services/ask-maps.js';

/**
 * Auth + surface catalog namespaces — product-facing wrappers over kit internals.
 */

import { AuthService, summarizeAuthStatus, type AuthStatusOptions } from '../auth/auth-status.js';
import type { HttpClient } from './http-client.js';
import type { GetPlaceFullOptions, PlaceFullResult } from '../types/common.js';
import type { AuthStatus } from '../types/common.js';
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

/**
 * Discovery helpers — wire surfaces (RPC paths) and platform products (kitPath index).
 * Runtime calls use the domain namespaces (`places`, `travel`, `map`, …).
 */
export class SurfacesNamespace {
  /** Wire surface names (`search`, `reviewsBoq`, `panorama`, …). */
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

  /** Wire-level surface catalog (endpoints, auth gates). */
  catalog(): typeof KNOWN_SURFACES {
    return KNOWN_SURFACES;
  }

  /** Names marked working (anonymous or with documented path). */
  working(): KnownSurfaceName[] {
    return listSurfacesByStatus('working');
  }

  /** mapsplatform.google.com product index — each entry points at a kit namespace path. */
  products(category?: PlatformCategory): readonly PlatformProduct[] {
    return listPlatformProducts(category);
  }

  product(id: string): PlatformProduct {
    return getPlatformProduct(id);
  }

  coverage(): PlatformCoverageSummary {
    return summarizePlatformCoverage();
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
  nearbySearch: NearbySearchService;
  aerialView: AerialViewService;
  roads: RoadsService;
  addressValidation: AddressValidationService;
  geolocation: GeolocationService;
  airQuality: AirQualityService;
  weather: WeatherService;
  solar: SolarService;
  pollen: PollenService;
}

/** Search, place details, reviews, photos, and related POI surfaces. */
export class PlacesNamespace {
  readonly search: SearchService;
  readonly suggest: SuggestService;
  readonly reviews: ReviewsService;
  readonly photos: PhotosService;
  readonly knowledge: KnowledgeService;
  readonly localPosts: LocalPostsService;
  readonly attributes: PlaceAttributesService;
  readonly nearbySearch: NearbySearchService;

  private readonly store: PlacesService;
  private readonly bundle: ServiceBundle;
  private readonly config: GMapsConfig;

  constructor(s: ServiceBundle, config: GMapsConfig) {
    this.bundle = s;
    this.config = config;
    this.store = s.places;
    this.search = s.search;
    this.suggest = s.suggest;
    this.reviews = s.reviews;
    this.photos = s.photos;
    this.knowledge = s.knowledge;
    this.localPosts = s.localPosts;
    this.attributes = s.placeAttributes;
    this.nearbySearch = s.nearbySearch;
  }

  /** Place card (preview + parallel UGC/photo enrichment). */
  get(options: GetPlaceOptions): Promise<PlaceDetails> {
    return this.store.get(options);
  }

  getMany(places: GetPlaceOptions[], concurrency?: number): Promise<PlaceDetails[]> {
    return this.store.getMany(places, concurrency);
  }

  getFull(options: GetPlaceFullOptions): Promise<PlaceFullResult> {
    return this.store.getFull(options, this.reviews);
  }

  /** Preview + reviews + local posts + optional knowledge entity. */
  getComplete(options: GetPlaceCompleteOptions): Promise<PlaceCompleteResult> {
    return fetchPlaceComplete(this.bundle, options);
  }

  fetchPreview(options: GetPlaceOptions & { mode?: GetPlaceOptions['mode'] }): Promise<PlacePreviewFetchResult> {
    return this.store.fetchPreview(options);
  }

  /** Search then optionally hydrate each row with preview and/or reviews. */
  enrichSearch(options: EnrichSearchOptions): Promise<EnrichedSearchResult[]> {
    return enrichSearchResults(this.bundle, this.config, options);
  }
}

/** Geocode, timezone, map-click reveal, viewport chips. */
export class LocationNamespace {
  readonly geocode: GeocodeService;
  readonly timezone: TimezoneService;
  readonly reveal: RevealService;
  readonly passiveAssist: PassiveAssistService;
  readonly context: LocationContextService;
  readonly addressValidation: AddressValidationService;
  readonly geolocation: GeolocationService;

  constructor(s: ServiceBundle) {
    this.geocode = s.geocode;
    this.timezone = s.timezone;
    this.reveal = s.reveal;
    this.passiveAssist = s.passiveAssist;
    this.context = s.context;
    this.addressValidation = s.addressValidation;
    this.geolocation = s.geolocation;
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
  readonly roads: RoadsService;

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
    this.roads = s.roads;
  }

}

/** Tiles, static map, Street View, embed URLs, aerial view. */
export class MapNamespace {
  readonly tiles: TilesService;
  readonly staticMap: StaticMapService;
  readonly panorama: PanoramaService;
  readonly layers: MapLayersService;
  readonly map3d: Map3dService;
  readonly earth: MapEarthService;
  readonly aerialView: AerialViewService;

  constructor(s: ServiceBundle) {
    this.tiles = s.tiles;
    this.staticMap = s.staticMap;
    this.panorama = s.panorama;
    this.layers = s.layers;
    this.map3d = s.map3d;
    this.earth = s.earth;
    this.aerialView = s.aerialView;
  }

  /** Build a Maps Embed iframe URL (no network I/O). */
  buildEmbedUrl(options: BuildEmbedUrlOptions): EmbedUrlResult {
    return buildEmbedUrl(options);
  }
}

/** Air quality, weather, solar, pollen. */
export class EnvironmentNamespace {
  readonly airQuality: AirQualityService;
  readonly weather: WeatherService;
  readonly solar: SolarService;
  readonly pollen: PollenService;

  constructor(s: ServiceBundle) {
    this.airQuality = s.airQuality;
    this.weather = s.weather;
    this.solar = s.solar;
    this.pollen = s.pollen;
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
  private readonly askMaps: AskMapsService;
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
  const search = new SearchService(http, config, geocode);
  const panorama = new PanoramaService(http, config);
  return {
    search,
    places: new PlacesService(http, config),
    reviews: new ReviewsService(http, config),
    suggest: new SuggestService(http, config, geocode),
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
    elevation: new ElevationService(http, directions, panorama, config),
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
    panorama,
    map3d: new Map3dService(http, config),
    earth: new MapEarthService(http, config),
    categories: new CategoriesService(http, config),
    ugcAggregates: new UgcAggregatesService(http, config),
    lists: new ListsService(http, config),
    links: new LinksService(http, config),
    batchUrl: new BatchUrlService(http, config),
    userPrefs: new UserPrefsService(http, config),
    askMaps: new AskMapsService(http, config),
    nearbySearch: new NearbySearchService(http, config),
    aerialView: new AerialViewService(http, config),
    roads: new RoadsService(http, config),
    addressValidation: new AddressValidationService(http, config),
    geolocation: new GeolocationService(http, config),
    airQuality: new AirQualityService(http, config),
    weather: new WeatherService(http, config),
    solar: new SolarService(http, config),
    pollen: new PollenService(http, config),
  };
}
