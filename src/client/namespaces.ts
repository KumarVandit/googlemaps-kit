/**
 * Domain namespaces for GMapsClient.
 */

import type { HttpClient } from './http-client.js';
import type { GMapsConfig, GetPlaceFullOptions, PlaceFullResult } from '../types/common.js';
import { AskMapsService } from '../services/ask-maps.js';
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
import { PassiveAssistService } from '../services/passiveassist.js';
import { PhotosService } from '../services/photos.js';
import { PlacesService, type GetPlaceOptions, type PlacePreviewFetchResult } from '../services/places.js';
import { ReviewsService } from '../services/reviews.js';
import { RevealService } from '../services/reveal.js';
import { SearchService } from '../services/search.js';
import { StaticMapService } from '../services/static-map.js';
import { SuggestService } from '../services/suggest.js';
import { TilesService } from '../services/tiles.js';
import { TimezoneService } from '../services/timezone.js';
import { TrafficService } from '../services/traffic.js';
import { TransitService } from '../services/transit.js';
import { UgcAggregatesService } from '../services/ugc-aggregates.js';
import type { PlaceDetails } from '../types/common.js';
import { AuthRequiredError } from '../types/common.js';
import type { AskMapsOptions, AskMapsResult } from '../services/ask-maps.js';

export interface ServiceBundle {
  search: SearchService;
  places: PlacesService;
  reviews: ReviewsService;
  suggest: SuggestService;
  photos: PhotosService;
  knowledge: KnowledgeService;
  localPosts: LocalPostsService;
  geocode: GeocodeService;
  timezone: TimezoneService;
  reveal: RevealService;
  passiveAssist: PassiveAssistService;
  directions: DirectionsService;
  distanceMatrix: DistanceMatrixService;
  elevation: ElevationService;
  transit: TransitService;
  traffic: TrafficService;
  tiles: TilesService;
  staticMap: StaticMapService;
  panorama: PanoramaService;
  categories: CategoriesService;
  ugcAggregates: UgcAggregatesService;
  lists: ListsService;
  links: LinksService;
  batchUrl: BatchUrlService;
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

  constructor(s: ServiceBundle) {
    this.search = s.search;
    this.suggest = s.suggest;
    this.details = s.places;
    this.reviews = s.reviews;
    this.photos = s.photos;
    this.knowledge = s.knowledge;
    this.localPosts = s.localPosts;
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

  constructor(s: ServiceBundle) {
    this.geocode = s.geocode;
    this.timezone = s.timezone;
    this.reveal = s.reveal;
    this.passiveAssist = s.passiveAssist;
  }
}

/** Directions, matrix, elevation, transit, traffic. */
export class TravelNamespace {
  readonly directions: DirectionsService;
  readonly distanceMatrix: DistanceMatrixService;
  readonly elevation: ElevationService;
  readonly transit: TransitService;
  readonly traffic: TrafficService;

  constructor(s: ServiceBundle) {
    this.directions = s.directions;
    this.distanceMatrix = s.distanceMatrix;
    this.elevation = s.elevation;
    this.transit = s.transit;
    this.traffic = s.traffic;
  }
}

/** Tiles, static map, Street View. */
export class MapNamespace {
  readonly tiles: TilesService;
  readonly staticMap: StaticMapService;
  readonly panorama: PanoramaService;

  constructor(s: ServiceBundle) {
    this.tiles = s.tiles;
    this.staticMap = s.staticMap;
    this.panorama = s.panorama;
  }
}

/** Categories, aggregates, lists, links, URL RPC. */
export class MetaNamespace {
  readonly categories: CategoriesService;
  readonly ugcAggregates: UgcAggregatesService;
  readonly lists: ListsService;
  readonly links: LinksService;
  readonly batchUrl: BatchUrlService;

  constructor(s: ServiceBundle) {
    this.categories = s.categories;
    this.ugcAggregates = s.ugcAggregates;
    this.lists = s.lists;
    this.links = s.links;
    this.batchUrl = s.batchUrl;
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
  const directions = new DirectionsService(http, config);
  const geocode = new GeocodeService(http, config);
  return {
    search: new SearchService(http, config),
    places: new PlacesService(http, config),
    reviews: new ReviewsService(http, config),
    suggest: new SuggestService(http, config),
    photos: new PhotosService(http, config),
    knowledge: new KnowledgeService(http, config),
    localPosts: new LocalPostsService(http, config),
    geocode,
    timezone: new TimezoneService(geocode, config),
    reveal: new RevealService(http, config),
    passiveAssist: new PassiveAssistService(http, config),
    directions,
    distanceMatrix: new DistanceMatrixService(directions, config),
    elevation: new ElevationService(http, directions, config),
    transit: new TransitService(http, config),
    traffic: new TrafficService(http, config),
    tiles: new TilesService(http, config),
    staticMap: new StaticMapService(http, config),
    panorama: new PanoramaService(http, config),
    categories: new CategoriesService(http, config),
    ugcAggregates: new UgcAggregatesService(http, config),
    lists: new ListsService(http, config),
    links: new LinksService(http, config),
    batchUrl: new BatchUrlService(http, config),
    askMaps: new AskMapsService(http, config),
  };
}
