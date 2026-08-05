/**
 * Advanced exports: RPC builders, parsers, registries, and wire-level helpers.
 * Prefer the public API from 'googlemaps-kit' for application code.
 */

export { GMapsClient, createGMapsClient } from './client/gmaps-client.js';
export type { EnrichSearchOptions } from './client/gmaps-client.js';

export { HttpClient } from './client/http-client.js';

export { AskMapsService, buildAskMapsArgs, MAPS_AI_CAPABILITIES, PLATFORM_AI_FIELD_MASKS } from './services/ask-maps.js';
export type {
  AskMapsOptions,
  AskMapsResult,
  AskMapsPlaceRef,
  AskMapsHistoryThread,
  MapsAiCapability,
  PlatformAiFieldMask,
} from './services/ask-maps.js';
export { SearchService, searchResultToPlaceDetails } from './services/search.js';
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
export type { GetStationDeparturesOptions, ListTransitLinesOptions, TransitDeparture, TransitModeBoard, TransitStationBoard } from './types/transit.js';
export { CategoriesService } from './services/categories.js';
export { UgcAggregatesService } from './services/ugc-aggregates.js';
export { BatchUrlService } from './services/batch-url.js';
export { DistanceMatrixService } from './services/distance-matrix.js';
export { ElevationService } from './services/elevation.js';
export { TimezoneService } from './services/timezone.js';
export { StaticMapService } from './services/static-map.js';
/**
 * Shareable google.com/maps links. Named *Link to avoid colliding with the
 * build*Url helpers below, which build internal API request URLs.
 */
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
  StaticMapOptions,
  StaticMapBoundsOptions,
  StaticMapResult,
  StaticMapMarker,
  StaticMapPath,
  StaticMapMarkerStyle,
  StaticMapScale,
} from './types/static-map.js';
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
export type { SearchClientFilters, SearchFilters, SearchRatingFilter, SearchPriceLevel } from './types/search-filters.js';
export { decodeEncodedPolyline, encodePolyline } from './utils/encoded-polyline.js';
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
export { BATCH_SERVICES, BATCH_SERVICE_RPCIDS } from './rpc/batch-services.js';
export { buildAreaTrafficArgs, buildPlaceUgcAggregatesArgs } from './rpc/batch-request-builders.js';
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

export { buildSuggestCameraPb, buildSuggestUrl } from './rpc/suggest-pb.js';
export { buildRevealPb, buildRevealUrl, normalizeRevealFtid } from './rpc/reveal-pb.js';
export {
  buildListEntityPhotosPb,
  buildListEntityPhotosUrl,
  buildPhotometaPb,
  buildPhotometaUrl,
  buildCoverageTilePb,
  buildCoverageTileUrl,
  buildThumbnailUrl,
  buildTileUrl,
} from './rpc/panorama-pb.js';
export {
  buildMapTilePb,
  buildMapTileUrl,
  buildIconUrl,
  DEFAULT_MAP_TILE_VERSION,
  DEFAULT_POI_ICON,
} from './rpc/tiles-pb.js';
export { buildGetListPb, buildGetListUrl } from './rpc/lists-pb.js';
export { buildPlacePhotosPb, buildPlacePhotosUrl } from './rpc/photos-pb.js';
export { buildListEntityPhotosBatchArgs } from './rpc/batch-request-builders.js';
export {
  CAPTURED_FOOD_CATEGORY_TOKEN,
  CLIENT_FILTERABLE_CATEGORIES,
  encodePhotoCategoryToken,
  filterPhotosByCategory,
  isClientFilterableCategory,
  PHOTO_TAB_ID_LABELS,
} from './rpc/photo-category-tokens.js';

export { extractSuggestions } from './parsers/suggest.js';
export { extractRevealPlace } from './parsers/reveal.js';
export {
  extractCoveragePanoramas,
  extractNearbyPanoramas,
  extractPanoramaMetadata,
  isPanoramaMetadataStub,
} from './parsers/panorama.js';
export {
  findPngOffset,
  unwrapTilePng,
  readPngDimensions,
  isPngBytes,
} from './parsers/tiles.js';
export {
  extractPlaceList,
  detectListErrorEnvelope,
  parseListIdFromInput,
} from './parsers/lists.js';

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

export { extractPlacePhotos, extractPlacePreviewPhotos, resizePhotoUrl } from './parsers/photos.js';
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

export { parseMapsUrl, isShortMapsLink } from './parsers/maps-url.js';
export type { ParsedMapsUrl } from './types/links.js';

export {
  buildSearchPb,
  buildSearchUrl,
  buildPlaceDetailPb,
  buildPlaceRichPb,
  buildPlacePb,
  buildPlaceUrl,
  buildReviewsPb,
  buildReviewsUrl,
  buildLocalPostsPb,
  buildLocalPostsUrl,
  buildDirectionsPb,
  buildDirectionsUrls,
  buildKnowledgePbVariants,
  buildKnowledgeUrl,
} from './rpc/pb-builders.js';
export type { PlacePbMode } from './rpc/pb-builders.js';

export { BatchExecuteClient } from './rpc/batch-execute.js';
export { GMapsRpcClient } from './rpc/rpc-client.js';
export type { GMapsRpcClientConfig } from './rpc/rpc-client.js';
export { MapsRuntime } from './rpc/maps-runtime.js';
export type { MapsJsBundleInfo, MapsRuntimeSnapshot } from './rpc/maps-runtime.js';
export {
  buildEndpointRegistry,
  extractClosureModuleIds,
  extractModuleManifest,
  extractPathsFromHtml,
  extractProtoServiceIds,
  parseMapsPageTokens,
} from './rpc/app-options.js';
export {
  MAPS_WIZ_UI_APP,
  MAPS_WIZ_UI_PATH,
  BATCH_EXECUTE_PATH,
  MAPS_UI_APP,
  RPC_LIST_UGC_POSTS,
  RPC_INFRA,
  FEATURE_RPC,
  MAPS_AI_AGENT_RPC,
  RPC_CANDIDATES,
  PREVIEW,
  RPC_HTTP,
  SERVICE_GET_LOCAL_BOQ_PROXY,
  BOQ_PROXY_MSC,
  REVIEW_SORT,
  PROTO_SERVICE_IDS,
  INITIAL_MODULES,
} from './rpc/rpc-methods.js';
export {
  encodeRpcId,
  decodeRpcId,
  isNxaRpcId,
} from './rpc/nxa.js';
export {
  getDescriptorRegistry,
  getRpcMethodById,
  getRpcMethodByField,
  getFeatureService,
  listFeatureServices,
  listMapsAiAgentRpcIds,
  resolveSemanticSurface,
  describeRpcId,
} from './rpc/descriptor-registry.js';
export type { RpcMethodDescriptor, FeatureServiceDescriptor, DescriptorRegistry } from './rpc/descriptor-registry.js';
export { FeatureRpcService, createFeatureRpcService } from './rpc/feature-rpc.js';
export type { FeatureRpcName, FeatureRpcCallOptions } from './rpc/feature-rpc.js';
export { buildBoqReviewsPayload, buildBoqReviewsUrl } from './rpc/boq-reviews.js';
export type { BoqReviewsRequest } from './rpc/boq-reviews.js';

export { extractBusinesses } from './parsers/search.js';
export { extractGeocodeResults, toGeocodeResponse } from './parsers/geocode.js';
export {
  extractPlaceDetails,
  extractEmbeddedReviews,
  extractPhotosDeep,
} from './parsers/place.js';
export {
  extractOpeningSchedule,
  extractAttributeGroups,
  extractAccessibilityFeatures,
  extractPlaceAggregateAttributes,
  extractPlusCode,
  extractTimezone,
  flattenAttributeLabels,
} from './parsers/place-attributes.js';
export { extractListUgcReviews, extractReviews } from './parsers/reviews.js';
export { extractBoqReviews } from './parsers/boq-reviews.js';
export { applyReviewClientFilters } from './parsers/review-client-filters.js';
export {
  placeAggregatesToRatingDistribution,
  sumRatingDistribution,
} from './parsers/review-aggregates.js';
export { extractLocalPosts } from './parsers/local-posts.js';
export { extractKnowledgeEntity, extractKnowledgeFromPlaceDetails } from './parsers/knowledge.js';
export { extractDirections } from './parsers/directions.js';
export { extractSearchPagination } from './parsers/search-pagination.js';
export type { SearchPaginationMeta } from './parsers/search-pagination.js';
export {
  KNOWN_SURFACES,
  getSurfaceInfo,
  listSurfacesByStatus,
} from './known-surfaces.js';
export type { KnownSurfaceName, SurfaceInfo, SurfaceStatus } from './known-surfaces.js';
export {
  asPlaceDataNode,
  asSearchRoot,
  asPreviewResponse,
  asBoqRoot,
  asListUgcRoot,
} from './types/protobuf.js';
export type {
  PbNode,
  PlaceDataNode,
  MapsPreviewPlaceResponse,
  SearchMapResponseRoot,
  BoqReviewsResponseRoot,
  ListUgcReviewsResponseRoot,
  DirectionsPreviewResponse,
  KnowledgeEntityResponse,
} from './types/protobuf.js';
export {
  parseReviewCount,
  parseReviewCountFromBlock,
  parsePriceRange,
  parseWebsiteFromContact,
  collectHourDayEntries,
} from './parsers/shared.js';
export type { HourDayEntry, RatingBlockNode } from './parsers/shared.js';
export {
  altitudeFromZoom,
  zoomFromAltitude,
  defaultViewportDist,
  webMercatorTile,
  haversineMeters,
} from './utils/geo.js';
export { extractAppOptionsPsi } from './rpc/app-options.js';
export { dedupePhotos, normalizePhotoUrl } from './utils/photo-url.js';

export { loadProjectEnv } from './utils/load-env.js';
export { parseGoogleResponse, isValidResponseBody } from './utils/response-parser.js';
export {
  isListUgcUnauthenticatedStub,
  isBatchAuthStub,
  isEmptySuccessPayload,
  classifyThrottleFailure,
} from './utils/throttle-detection.js';
export { backoffWithJitter, parseRetryAfterMs } from './utils/retry-backoff.js';
export { RequestScheduler } from './utils/request-scheduler.js';
export type { HttpClientStats } from './client/http-client.js';
export { safeGet } from './utils/safe-get.js';
export { parseReviewCountLabel } from './utils/feature-id.js';
export {
  parseFeatureId,
  toFeatureId,
  placeIdToFeatureId,
  placeIdToFeatureParts,
  featureIdToPlaceId,
  featureIdToLudocid,
  featurePartsToPlaceId,
} from './utils/ids.js';
export type { FeatureIdParts } from './utils/ids.js';

export {
  bootstrapSession,
  buildBrowserHeaders,
  clearSessionCache,
  randomUserAgent,
  cookiesToHeader,
  DEFAULT_SOCS,
  getCachedSession,
} from './auth/session.js';
export type { CookieJarState } from './auth/session.js';

export { AuthService, summarizeAuthStatus } from './auth/auth-status.js';
export type { AuthStatusOptions } from './auth/auth-status.js';

export {
  buildGoogleAuthorization,
  buildAuthenticatedHeaders,
} from './auth/google-auth.js';

export { extractMapsPageTokens } from './auth/maps-tokens.js';

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

export {
  ENDPOINTS,
  GMapsError,
  GMapsAuthError,
  GMapsNetworkError,
  GMapsParseError,
  GMapsPhotosBlockedError,
  GMapsThrottleError,
  GMapsEmptyPayloadError,
  GMapsCookiesExpiredError,
} from './types/common.js';
