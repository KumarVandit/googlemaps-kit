/**
 * Under-the-hood toolkit: HTTP, auth, protobuf builders, RPC, parsers, services.
 *
 * App code should use `import { sdk } from 'googlemaps-kit'`.
 * Import from this entry when extending the kit, writing probes, or debugging payloads.
 *
 * @example
 * import { HttpClient, buildSearchPb, extractBusinesses } from 'googlemaps-kit/advanced';
 */

export { GMapsClient, sdk, GMaps } from './client/gmaps-client.js';
export type { EnrichSearchOptions } from './client/gmaps-client.js';

// ——— Transport ———
export * from './advanced/http.js';

// ——— Auth / session ———
export * from './advanced/auth.js';

// ——— Protobuf + RPC ———
export * from './advanced/rpc.js';

// ——— Parsers ———
export * from './advanced/parsers.js';

// ——— Service classes ———
export * from './advanced/services.js';

// ——— Helpers + errors ———
export * from './advanced/utils.js';

// ——— Shareable Maps links (distinct from wire build*Url helpers) ———
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

// ——— Product types re-exported for probe scripts ———
export type { RevealPlaceOptions, RevealedPlace, RevealPlaceResult } from './types/reveal.js';
export type {
  MintedViewportPsi,
  PassiveAssistChip,
  PassiveAssistOptions,
  PassiveAssistPsiContext,
  PassiveAssistResult,
} from './types/passiveassist.js';
export type {
  GetStationDeparturesOptions,
  ListTransitLinesOptions,
  TransitDeparture,
  TransitModeBoard,
  TransitStationBoard,
} from './types/transit.js';
export type {
  StaticMapOptions,
  StaticMapBoundsOptions,
  StaticMapResult,
  StaticMapMarker,
  StaticMapPath,
  StaticMapMarkerStyle,
  StaticMapScale,
} from './types/static-map.js';
export type {
  SearchClientFilters,
  SearchFilters,
  SearchRatingFilter,
  SearchPriceLevel,
} from './types/search-filters.js';
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
export type { ParsedMapsUrl } from './types/links.js';
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
  WeekdayKey,
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
  LocalPostMedia,
  KnowledgeEntity,
  DirectionsOptions,
  DirectionsResult,
  DirectionsLeg,
  DirectionsStep,
  TravelMode,
  RPCCall,
  RPCResponse,
  BatchExecuteConfig,
  MapsPageTokens,
  ReviewSortOrder,
  MapsEndpointRegistry,
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

// ——— Wire-level protobuf node types + narrowing helpers ———
export type {
  BoqReviewsResponseRoot,
  DirectionsPreviewResponse,
  KnowledgeEntityResponse,
  ListUgcReviewsResponseRoot,
  LocalPostEntry,
  MapsPreviewPlaceResponse,
  PbNode,
  PbScalar,
  PlaceDataNode,
  RpcArgs,
  SearchMapResponseRoot,
  SearchResultWrapper,
} from './types/protobuf.js';
export {
  asBoqRoot,
  asListUgcRoot,
  asPlaceDataNode,
  asPreviewResponse,
  asSearchRoot,
} from './types/protobuf.js';

// ——— Wire constants ———
export { ENDPOINTS } from './types/common.js';
export {
  OPEN_HOURS_CHIP_VALUE,
  RATING_FILTER_CODE,
  SEARCH_FILTER_SLOT,
} from './types/search-filters.js';
export type { SearchHotelDatesFilter, SearchOpenHoursFilter } from './types/search-filters.js';

// ——— Remaining product types (parity with the root entry) ———
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
export type {
  TransitPreference,
  TransitRoute,
  TransitRouteOptions,
  TransitRouteResult,
  TransitLeg,
  TransitLine,
  TransitStation,
} from './types/transit.js';
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
  Parking,
  ParkingAvailability,
  ParkingPrice,
  ParkingSearchOptions,
  ParkingType,
} from './types/parking.js';
export type {
  NearbyAreasOptions,
  GeoArea,
  AdminRegion,
  AdminLevel,
  AreaType,
} from './types/location-context.js';
export type { Attribute, AttributeCategory } from './types/place-attributes.js';
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
  TrafficIncident,
  TrafficIncidentsOptions,
  IncidentType,
  IncidentSeverity,
} from './types/traffic.js';
export type { MapLayerTileOptions } from './types/tiles.js';
export type { ListBrowseOptions, PlaceListSummary } from './types/lists.js';
export type { PanoramaVideoOptions, PanoramaVideoResult } from './types/panorama.js';
export type { TransitRoutingPreference } from './types/directions.js';

// ——— Abort scope for direct service calls ———
export {
  withAbortSignal,
  runWithRequestContext,
  getRequestSignal,
  type RequestContext,
} from './utils/request-context.js';
