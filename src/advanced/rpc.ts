/**
 * Protobuf URL builders, batchexecute RPC, and Maps wire constants.
 */

export { BATCH_SERVICES, BATCH_SERVICE_RPCIDS } from '../rpc/batch-services.js';
export {
  buildAreaTrafficArgs,
  buildPlaceUgcAggregatesArgs,
  buildListEntityPhotosBatchArgs,
} from '../rpc/batch-request-builders.js';

export { buildSuggestCameraPb, buildSuggestUrl } from '../rpc/feature-pb.js';
export { buildRevealPb, buildRevealUrl, normalizeRevealFtid } from '../rpc/feature-pb.js';
export {
  buildListEntityPhotosPb,
  buildListEntityPhotosUrl,
  buildPhotometaPb,
  buildPhotometaUrl,
  buildCoverageTilePb,
  buildCoverageTileUrl,
  buildThumbnailUrl,
  buildTileUrl,
} from '../rpc/panorama-pb.js';
export {
  buildMapTilePb,
  buildMapTileUrl,
  buildProtoTileUrl,
  buildIconUrl,
  DEFAULT_MAP_TILE_VERSION,
  DEFAULT_POI_ICON,
} from '../rpc/tile-builders.js';
export { buildGetListPb, buildGetListUrl } from '../rpc/feature-pb.js';
export { buildPlacePhotosPb, buildPlacePhotosUrl } from '../rpc/photos-pb.js';
export {
  CAPTURED_FOOD_CATEGORY_TOKEN,
  CLIENT_FILTERABLE_CATEGORIES,
  encodePhotoCategoryToken,
  filterPhotosByCategory,
  isClientFilterableCategory,
  PHOTO_TAB_ID_LABELS,
} from '../rpc/photos-pb.js';

export {
  buildSearchPb,
  buildSearchUrl,
  buildPlaceDetailPb,
  buildPlaceRichPb,
  buildPlaceUrl,
  buildReviewsPb,
  buildReviewsUrl,
  buildLocalPostsPb,
  buildLocalPostsUrl,
  buildDirectionsPb,
  buildDirectionsUrls,
  buildKnowledgePbVariants,
  buildKnowledgeUrl,
} from '../rpc/pb-builders.js';
export type { PlacePbMode } from '../rpc/pb-builders.js';

export { BatchExecuteClient } from '../rpc/batch-execute.js';
export { GMapsRpcClient } from '../rpc/rpc-client.js';
export type { GMapsRpcClientConfig } from '../rpc/rpc-client.js';
export { MapsRuntime } from '../rpc/maps-runtime.js';
export type { MapsJsBundleInfo, MapsRuntimeSnapshot } from '../rpc/maps-runtime.js';
export {
  buildEndpointRegistry,
  extractClosureModuleIds,
  extractModuleManifest,
  extractPathsFromHtml,
  extractProtoServiceIds,
  parseMapsPageTokens,
  extractAppOptionsPsi,
} from '../rpc/descriptors.js';
export {
  MAPS_WIZ_UI_APP,
  MAPS_WIZ_UI_PATH,
  BATCH_EXECUTE_PATH,
  RPC_LIST_UGC_POSTS,
  RPC_INFRA,
  FEATURE_RPC,
  MAPS_AI_AGENT_RPC,
  PREVIEW,
  RPC_HTTP,
  SERVICE_GET_LOCAL_BOQ_PROXY,
  BOQ_PROXY_MSC,
  REVIEW_SORT,
  INITIAL_MODULES,
} from '../rpc/rpc-methods.js';
export { encodeRpcId, decodeRpcId, isNxaRpcId } from '../rpc/descriptors.js';
export {
  getDescriptorRegistry,
  getRpcMethodById,
  getRpcMethodByField,
  getFeatureService,
  listFeatureServices,
  listMapsAiAgentRpcIds,
  resolveSemanticSurface,
  describeRpcId,
} from '../rpc/descriptors.js';
export type {
  RpcMethodDescriptor,
  FeatureServiceDescriptor,
  DescriptorRegistry,
} from '../rpc/descriptors.js';
export { FeatureRpcService, createFeatureRpcService } from '../rpc/feature-rpc.js';
export type { FeatureRpcName, FeatureRpcCallOptions } from '../rpc/feature-rpc.js';
export { buildBoqReviewsPayload, buildBoqReviewsUrl } from '../rpc/feature-rpc.js';
export type { BoqReviewsRequest } from '../rpc/feature-rpc.js';
