/**
 * googlemaps-kit — customer-facing API.
 *
 * App code: `import { sdk } from 'googlemaps-kit'`
 * Wire / protobuf / RPC: `import { … } from 'googlemaps-kit/advanced'`
 */

export { GMapsClient, sdk, GMaps } from './client/gmaps-client.js';
export type { EnrichSearchOptions } from './client/gmaps-client.js';
export type { AuthNamespace, SurfacesNamespace } from './client/product-namespaces.js';
export type { AuthStatusOptions } from './auth/auth-status.js';
export type {
  KnownSurfaceName,
  SurfaceInfo,
  SurfaceStatus,
} from './known-surfaces.js';
export { KNOWN_SURFACES, getSurfaceInfo, listSurfacesByStatus } from './known-surfaces.js';

/** Shareable google.com/maps URLs (not wire request URLs). */
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
export type {
  PopularTimesData,
  PopularTimesDay,
  PopularTimesHour,
  ReviewTag,
  PeopleAlsoSearch,
  OwnerUpdate,
  GasPrice,
  HotelData,
  HotelBookingOffer,
  NearbyHotel,
  RestaurantData,
  TableReservationProvider,
  PlaceMenu,
  MenuItem,
  MenuSection,
  PlaceQAItem,
  PlaceQAAnswer,
  PlaceQAResult,
  StructuredAddress,
  PlaceIdentifiers,
  BusinessOperatingStatus,
  PlaceDetailsExtended,
  SearchResultExtended,
} from './types/place-extended.js';
export type { LocalPostType, LocalPostMedia, WeekdayKey } from './types/common.js';
export type { ParsedMapsUrl } from './types/links.js';
export {
  decodeEncodedPolyline,
  encodePolyline,
  decodePolyline,
  polylineToHumanPath,
  polylineToGeoJSON,
  summarizePolyline,
} from './utils/encoded-polyline.js';
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
export type { SearchClientFilters, SearchRatingFilter, SearchPriceLevel } from './types/search-filters.js';
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
  TransitMode,
  TransitRoutingPreference,
} from './types/directions.js';
export type { AreaTrafficReport, GetAreaTrafficOptions } from './types/traffic.js';
export type {
  CategoryHierarchyResult,
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
  SearchMode,
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
  AuthRequiredError,
  GMapsNetworkError,
  GMapsParseError,
  GMapsPhotosBlockedError,
  GMapsThrottleError,
  GMapsEmptyPayloadError,
  GMapsCookiesExpiredError,
} from './types/common.js';

export type {
  PlaceRef,
  NormalizedPlaceRef,
  SessionMode,
  ProfileDepth,
  ReviewSource,
  ClientCapabilities,
  AuthCapability,
  IntentCallOptions,
  DiscoverOptions,
  DiscoverPagesOptions,
  DiscoverResult,
  ResolveOptions,
  ResolvedPlace,
  ProfileOptions,
  ProfileManyOptions,
  PlaceProfile,
  RouteOptions,
  RouteResult,
  OpinionsOptions,
  OpinionsPagesOptions,
  OpinionsResult,
  MediaOptions,
  MediaManyOptions,
  MediaResult,
  PipelineOptions,
  PipelinePlaceRow,
  PipelineResult,
} from './types/dx.js';

export type {
  GMapsHooks,
  GMapsCacheOptions,
  HookActionEvent,
  HookRetryEvent,
  HookErrorEvent,
  HookActionType,
  ProgressEvent,
  ProgressCallback,
} from './types/hooks.js';

export { createMapsTools } from './client/maps-tools.js';
export type {
  CreateMapsToolsOptions,
  MapsToolDefinition,
  MapsTools,
} from './client/maps-tools.js';

export { toCsv, toGeoJSON } from './utils/export-results.js';
export type { ExportablePlace, GeoJsonFeatureCollection } from './utils/export-results.js';

export {
  normalizePlaceRef,
  resolveRouteEndpoint,
  resolveSearchCenter,
  resolveDirectionsEndpoints,
} from './utils/place-ref.js';
export { applyCoordAliases, toCoordinates } from './utils/coords.js';
export { placeIdToFeatureId, featureIdToPlaceId, parseFeatureId } from './utils/ids.js';

export type {
  PlacesNamespace,
  LocationNamespace,
  TravelNamespace,
  MapNamespace,
  MetaNamespace,
  AgentNamespace,
} from './client/namespaces.js';

export type {
  AskMapsOptions,
  AskMapsResult,
  AskMapsPlaceRef,
} from './services/ask-maps.js';

export type { GetPlaceOptions, PlacePreviewFetchResult } from './services/places.js';
export type { GetReviewsOptions } from './services/reviews.js';
export type { RevealPlaceOptions, RevealedPlace, RevealPlaceResult } from './types/reveal.js';
export type {
  MintedViewportPsi,
  PassiveAssistChip,
  PassiveAssistOptions,
  PassiveAssistPsiContext,
  PassiveAssistResult,
} from './types/passiveassist.js';
export type { GetLocalPostsOptions } from './services/local-posts.js';
export type { GetKnowledgeOptions } from './services/knowledge.js';
export type {
  GetStationDeparturesOptions,
  ListTransitLinesOptions,
  TransitDeparture,
  TransitModeBoard,
  TransitStationBoard,
  TransitRouteOptions,
  TransitRouteResult,
  TransitRoute,
  TransitLeg,
  TransitStation,
  TransitLine,
} from './types/transit.js';
export type {
  Parking,
  ParkingAvailability,
  ParkingPrice,
  ParkingSearchOptions,
  ParkingType,
} from './types/parking.js';
export type {
  EvChargingStation,
  EvCharger,
  EvChargerStatus,
  EvChargingPrice,
  EvChargingSearchOptions,
  ConnectorType,
  ChargerStatus,
} from './types/ev-charging.js';
export type {
  LayerTileOptions,
  LayerTileResult,
  LayerSearchOptions,
  SchoolMarker,
} from './types/map-layers.js';
export type {
  Map3dBuildingsOptions,
  Building3d,
  Map3dTerrainOptions,
  Terrain3dResult,
} from './types/map-3d.js';
export type {
  EarthTileOptions,
  EarthTileResult,
  EarthImageryOptions,
  EarthImageryResult,
} from './types/map-earth.js';
export type {
  NearbyAreasOptions,
  GeoArea,
  AdminRegion,
  AdminLevel,
  AreaType,
} from './types/location-context.js';
export type {
  AttributeCategory,
  Attribute,
} from './types/place-attributes.js';
export type {
  TrafficIncident,
  TrafficIncidentsOptions,
  IncidentType,
  IncidentSeverity,
} from './types/traffic.js';
export type {
  PanoramaVideoOptions,
  PanoramaVideoResult,
} from './types/panorama.js';
export type {
  ListBrowseOptions,
  PlaceListSummary,
} from './types/lists.js';
export type {
  MapLayerTileOptions,
} from './types/tiles.js';

// ——— Remaining public option / result types ———
export type { CreateShortUrlOptions, CreateShortUrlResult } from './types/batch-url.js';
export type {
  GetCategorySuggestionsOptions,
  GetPlaceInfoOptions,
  GetPotentialDuplicatesOptions,
  GetSignedUrlOptions,
  PlaceInfoEntry,
} from './types/categories.js';
export type {
  DistanceMatrixElementStatus,
  DistanceMatrixLocation,
} from './types/distance-matrix.js';
export type {
  ElevationProfileSample,
  ElevationStatus,
  ElevationSummary,
} from './types/elevation.js';
export type { TimezoneIdSource, TimezoneOffsetSource } from './types/timezone.js';
export type { TransitPreference } from './types/transit.js';
export type { SearchFilters, SearchHotelDatesFilter, SearchOpenHoursFilter } from './types/search-filters.js';
/** Discriminated members of {@link ParsedMapsUrl} — narrow on `kind`. */
export type {
  MapsCoordinates,
  ParsedCidUrl,
  ParsedDirectionsUrl,
  ParsedListUrl,
  ParsedPlaceUrl,
  ParsedSearchUrl,
  ParsedShortLinkUrl,
  ParsedUnknownUrl,
  ParsedViewportUrl,
} from './types/links.js';

/** Make direct service calls abortable (Intent methods take `signal` directly). */
export { withAbortSignal } from './utils/request-context.js';

/** Transit itineraries, service alerts, fares, and operating agencies. */
export type {
  TransitAgency,
  TransitAlert,
  TransitFare,
  TransitVehicleFilter,
} from './types/transit.js';
