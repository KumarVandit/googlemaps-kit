/**
 * Shared helpers used when probing or extending wire surfaces.
 */
export {
  altitudeFromZoom,
  zoomFromAltitude,
  defaultViewportDist,
  webMercatorTile,
  haversineMeters,
} from '../utils/geo.js';
export { dedupePhotos, normalizePhotoUrl } from '../utils/photo-url.js';
export { loadProjectEnv } from '../utils/load-env.js';
export { safeGet } from '../utils/safe-get.js';
export { parseReviewCountLabel } from '../utils/feature-id.js';
export {
  parseFeatureId,
  toFeatureId,
  placeIdToFeatureId,
  placeIdToFeatureParts,
  featureIdToPlaceId,
  featureIdToLudocid,
  featurePartsToPlaceId,
} from '../utils/ids.js';
export type { FeatureIdParts } from '../utils/ids.js';
export { decodeEncodedPolyline, encodePolyline } from '../utils/encoded-polyline.js';

export {
  KNOWN_SURFACES,
  getSurfaceInfo,
  listSurfacesByStatus,
} from '../known-surfaces.js';
export type { KnownSurfaceName, SurfaceInfo, SurfaceStatus } from '../known-surfaces.js';

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
} from '../types/common.js';
