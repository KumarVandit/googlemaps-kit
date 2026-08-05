/**
 * googlemaps-kit public API.
 * Low-level RPC builders, parsers, and registries: import from 'googlemaps-kit/internal'.
 */

export { GMapsClient, createGMapsClient } from './client/gmaps-client.js';
export type { EnrichSearchOptions } from './client/gmaps-client.js';

export { SearchService } from './services/search.js';
export { PlacesService } from './services/places.js';
export type { GetPlaceOptions, PlacePreviewFetchResult } from './services/places.js';
export { ReviewsService } from './services/reviews.js';
export type { GetReviewsOptions } from './services/reviews.js';
export { RevealService } from './services/reveal.js';
export type { RevealPlaceOptions, RevealedPlace, RevealPlaceResult } from './types/reveal.js';
export { PassiveAssistService } from './services/passiveassist.js';
export type {
  MintedViewportPsi,
  PassiveAssistChip,
  PassiveAssistOptions,
  PassiveAssistPsiContext,
  PassiveAssistResult,
} from './types/passiveassist.js';
export { LocalPostsService } from './services/local-posts.js';
export type { GetLocalPostsOptions } from './services/local-posts.js';
export { KnowledgeService } from './services/knowledge.js';
export type { GetKnowledgeOptions } from './services/knowledge.js';
export { DirectionsService } from './services/directions.js';
export { SuggestService } from './services/suggest.js';
export { PanoramaService } from './services/panorama.js';
export { TilesService } from './services/tiles.js';
export { ListsService } from './services/lists.js';
export { GeocodeService } from './services/geocode.js';
export { PhotosService } from './services/photos.js';
export { LinksService } from './services/links.js';
export { TrafficService } from './services/traffic.js';
export { TransitService } from './services/transit.js';
export type {
  GetStationDeparturesOptions,
  ListTransitLinesOptions,
  TransitDeparture,
  TransitModeBoard,
  TransitStationBoard,
} from './types/transit.js';
export { CategoriesService } from './services/categories.js';
export { UgcAggregatesService } from './services/ugc-aggregates.js';
export { BatchUrlService } from './services/batch-url.js';
export { DistanceMatrixService } from './services/distance-matrix.js';
export { ElevationService } from './services/elevation.js';
export { TimezoneService } from './services/timezone.js';
export { StaticMapService } from './services/static-map.js';

export {
  buildPlaceUrl as buildPlaceLink,
  buildSearchUrl as buildSearchLink,
  buildDirectionsUrl as buildDirectionsLink,
  buildViewportUrl as buildViewportLink,
  buildStreetViewUrl as buildStreetViewLink,
  buildEmbedUrl as buildEmbedLink,
  travelModeToCode,
  travelModeFromCode,
} from './rpc/maps-url-builders.js';
export type {
  BuildPlaceUrlOptions,
  BuildSearchUrlOptions,
  BuildDirectionsUrlOptions,
  BuildStreetViewUrlOptions,
  BuildEmbedUrlOptions,
  BuildViewportUrlOptions,
  EmbedUrlResult,
  MapsUrlMapAction,
  MapsUrlLayer,
} from './types/maps-urls.js';

export { parseMapsUrl, isShortMapsLink } from './parsers/maps-url.js';
export type { ParsedMapsUrl } from './types/links.js';
export { decodeEncodedPolyline, encodePolyline } from './utils/encoded-polyline.js';
export { loadProjectEnv } from './utils/load-env.js';

export type {
  StaticMapOptions,
  StaticMapBoundsOptions,
  StaticMapResult,
  StaticMapMarker,
  StaticMapPath,
  StaticMapMarkerStyle,
  StaticMapScale,
} from './types/static-map.js';
export type { SearchClientFilters, SearchFilters, SearchRatingFilter, SearchPriceLevel } from './types/search-filters.js';
export type {
  DistanceMatrixOptions,
  DistanceMatrixResult,
  DistanceMatrixCell,
} from './types/distance-matrix.js';
export type {
  ElevationPointOptions,
  ElevationPointResult,
  ElevationPathOptions,
  ElevationPathResult,
} from './types/elevation.js';
export type { TimezoneOptions, TimezoneResult } from './types/timezone.js';
export type {
  DirectionsRoute,
  DirectionsWaypoint,
  DirectionsTransitDetails,
  LatLngBounds,
  StepManeuver,
  DirectionsUnits,
  DirectionsAvoid,
} from './types/directions.js';
export type { AreaTrafficReport, GetAreaTrafficOptions } from './types/traffic.js';
export type {
  CategoryNode,
  CategorySuggestion,
  PotentialDuplicate,
  PlaceInfoResult,
  SignedPlaceUrl,
} from './types/categories.js';
export type { PlaceUgcAggregates, GetPlaceUgcAggregatesOptions } from './types/ugc-aggregates.js';
export type { DecodedMapsUrl, DecodeUrlOptions } from './types/batch-url.js';
export type {
  SuggestOptions,
  Suggestion,
  SuggestionKind,
  SuggestResult,
} from './types/suggest.js';
export type {
  PanoramaSearchOptions,
  PanoramaGetOptions,
  PanoramaLocationOptions,
  PanoramaImageOptions,
  PanoramaRef,
  PanoramaLink,
  PanoramaMetadata,
  PanoramaHistoricalCapture,
} from './types/panorama.js';
export type {
  TileCoordinates,
  MapTileLayer,
  MapTileEndpoint,
  MapTileSize,
  MapTileFetchOptions,
  MapTileLatLngOptions,
  MapTileResult,
  MapIconFetchOptions,
  MapIconResult,
} from './types/tiles.js';
export type { GetListOptions, PlaceList, PlaceListEntry } from './types/lists.js';
export type {
  GeocodeOptions,
  ReverseGeocodeOptions,
  GeocodeResult,
  GeocodeResponse,
  AddressComponent,
} from './types/geocode.js';
export type {
  PhotoCategory,
  PhotosSource,
  PlacePhoto,
  PhotosListResult,
  ListPlacePhotosOptions,
  ListAllPlacePhotosOptions,
  PhotoCategoryCount,
} from './types/photos.js';
export { PHOTOS_SOURCE_METADATA } from './types/photos.js';

export type {
  GMapsConfig,
  Coordinates,
  AuthStatus,
  AuthCapabilities,
  SearchOptions,
  SearchResult,
  SearchPageResult,
  SearchFieldMask,
  SearchTextOptions,
  SearchTextResult,
  PlaceDetails,
  BusinessHours,
  PlaceOpeningSchedule,
  PlaceDaySchedule,
  PlaceHoursInterval,
  PlaceAttribute,
  PlaceAttributeGroup,
  PlaceAccessibilityFeature,
  WeekdayIndex,
  WeekdayName,
  Review,
  ReviewsResult,
  ReviewRatingDistribution,
  EnrichedSearchResult,
  GetPlaceFullOptions,
  GetPlaceCompleteOptions,
  PlaceFullResult,
  PlaceCompleteResult,
  PlaceFullMeta,
  LocalPost,
  KnowledgeEntity,
  DirectionsOptions,
  DirectionsResult,
  DirectionsLeg,
  DirectionsStep,
  TravelMode,
  ReviewSortOrder,
} from './types/common.js';
export type {
  PlaceReviewRatingDistribution,
  ReviewAttribute,
  ReviewClientFilters,
  ReviewOwnerReply,
  ReviewPhoto,
  ReviewerCredibility,
  ReviewTranslation,
} from './types/reviews.js';

export {
  GMapsError,
  GMapsAuthError,
  GMapsNetworkError,
  GMapsParseError,
  GMapsPhotosBlockedError,
  GMapsThrottleError,
  GMapsEmptyPayloadError,
  GMapsCookiesExpiredError,
} from './types/common.js';
