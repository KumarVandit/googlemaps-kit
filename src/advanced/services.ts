/**
 * Service classes — prefer `sdk()` namespaces in app code; use these when wiring custom clients.
 */

export { AskMapsService, buildAskMapsArgs, MAPS_AI_CAPABILITIES, PLATFORM_AI_FIELD_MASKS } from '../services/ask-maps.js';
export type {
  AskMapsOptions,
  AskMapsResult,
  AskMapsPlaceRef,
  AskMapsHistoryThread,
  MapsAiCapability,
  PlatformAiFieldMask,
} from '../services/ask-maps.js';
export { SearchService, searchResultToPlaceDetails } from '../services/search.js';
export { PlacesService } from '../services/places.js';
export type { GetPlaceOptions, PlacePreviewFetchResult } from '../services/places.js';
export { ReviewsService } from '../services/reviews.js';
export type { GetReviewsOptions } from '../services/reviews.js';
export { RevealService } from '../services/viewport.js';
export { PassiveAssistService } from '../services/viewport.js';
export { LocalPostsService } from '../services/local-posts.js';
export type { GetLocalPostsOptions } from '../services/local-posts.js';
export { KnowledgeService } from '../services/knowledge.js';
export type { GetKnowledgeOptions } from '../services/knowledge.js';
export { DirectionsService } from '../services/directions.js';
export { SuggestService } from '../services/search.js';
export { PanoramaService } from '../services/panorama.js';
export { TilesService } from '../services/tiles.js';
export { ListsService } from '../services/lists.js';
export { GeocodeService } from '../services/geocode.js';
export { PhotosService } from '../services/photos.js';
export { LinksService } from '../services/links.js';
export { TrafficService } from '../services/traffic.js';
export { TransitService } from '../services/transit.js';
export { CategoriesService } from '../services/meta.js';
export { UgcAggregatesService } from '../services/meta.js';
export { BatchUrlService } from '../services/meta.js';
export { DistanceMatrixService } from '../services/distance-matrix.js';
export { ElevationService } from '../services/elevation.js';
export { TimezoneService } from '../services/geocode.js';
export { StaticMapService } from '../services/static-map.js';
export { EvChargingService } from '../services/mobility.js';
export { BikeShareService } from '../services/mobility.js';
export { SearchAlongRouteService } from '../services/search-along-route.js';
export { WaypointOptimizerService } from '../services/waypoint-optimizer.js';
export { ParkingService } from '../services/mobility.js';
export { LocationContextService } from '../services/viewport.js';
export { PlaceAttributesService } from '../services/place-attributes.js';
export { Map3dService } from '../services/map-3d.js';
export {
  rocktreeBase,
  ROCKTREE_PLANETS,
  type RocktreePlanet,
} from '../rpc/earth-rocktree.js';
export { MapEarthService } from '../services/tiles.js';
export { MapLayersService } from '../services/map-layers.js';
