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
export { RevealService } from '../services/reveal.js';
export { PassiveAssistService } from '../services/passiveassist.js';
export { LocalPostsService } from '../services/local-posts.js';
export type { GetLocalPostsOptions } from '../services/local-posts.js';
export { KnowledgeService } from '../services/knowledge.js';
export type { GetKnowledgeOptions } from '../services/knowledge.js';
export { DirectionsService } from '../services/directions.js';
export { SuggestService } from '../services/suggest.js';
export { PanoramaService } from '../services/panorama.js';
export { TilesService } from '../services/tiles.js';
export { ListsService } from '../services/lists.js';
export { GeocodeService } from '../services/geocode.js';
export { PhotosService } from '../services/photos.js';
export { LinksService } from '../services/links.js';
export { TrafficService } from '../services/traffic.js';
export { TransitService } from '../services/transit.js';
export { CategoriesService } from '../services/categories.js';
export { UgcAggregatesService } from '../services/ugc-aggregates.js';
export { BatchUrlService } from '../services/batch-url.js';
export { DistanceMatrixService } from '../services/distance-matrix.js';
export { ElevationService } from '../services/elevation.js';
export { TimezoneService } from '../services/timezone.js';
export { StaticMapService } from '../services/static-map.js';
export { EvChargingService } from '../services/ev-charging.js';
export { ParkingService } from '../services/parking.js';
export { LocationContextService } from '../services/location-context.js';
export { PlaceAttributesService } from '../services/place-attributes.js';
export { Map3dService } from '../services/map-3d.js';
export { MapEarthService } from '../services/map-earth.js';
export { MapLayersService } from '../services/map-layers.js';
