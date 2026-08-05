/**
 * Protobuf URL builders for Google Maps Street View / panorama endpoints.
 *
 * Verified against live probes — all four photometa pb blocks are required;
 * omitting any block returns HTTP 400.
 */

const PHOTOMETA_SUFFIX_457 =
  '!4m57!1e1!1e2!1e3!1e4!1e5!1e6!1e8!1e12!2m1!1e1!4m1!1i48!5m1!1e1!5m1!1e2!6m1!1e1!6m1!1e2';
const PHOTOMETA_SUFFIX_936 =
  '!9m36!1m3!1e2!2b1!3e2!1m3!1e2!2b0!3e3!1m3!1e3!2b1!3e2!1m3!1e3!2b0!3e3!1m3!1e8!2b0!3e3!1m3!1e1!2b0!3e3!1m3!1e4!2b0!3e3!1m3!1e10!2b1!3e2!1m3!1e10!2b0!3e3';

const LIST_ENTITY_PHOTOS_SUFFIX =
  '!1e3!5m46!2m2!1i203!2i100!3m2!2i40!5b1!7m33!1m3!1e1!2b0!3e3!1m3!1e2!2b1!3e2!1m3!1e2!2b0!3e3!1m3!1e8!2b0!3e3!1m3!1e10!2b0!3e3!1m3!1e10!2b1!3e2!1m3!1e10!2b0!3e4!1m3!1e9!2b1!3e2!2b1!8m2!1m1!1e2!9b0!11m1!4b1';

const IMAGERY_BASE = 'https://streetviewpixels-pa.googleapis.com/v1';
const IMAGERY_CLIENT = 'maps_sv.tactile';

/** Build locale segment embedded in photometa ctx (`!2m2!1s{hl}!2s{gl}`). */
function buildPhotometaLocale(hl: string, gl: string): string {
  return `!1m4!1smaps_sv.tactile!11m2!2m1!1b1!2m2!1s${hl}!2s${gl}`;
}

/** Pb for `/maps/rpc/photo/listentityphotos` — panoramas near a point. */
export function buildListEntityPhotosPb(params: {
  lat: number;
  lng: number;
  radiusMeters: number;
}): string {
  return (
    LIST_ENTITY_PHOTOS_SUFFIX +
    `!9m2!2d${params.lng}!3d${params.lat}!10d${params.radiusMeters}`
  );
}

/** Pb for `/maps/photometa/v1` — full metadata for a panorama id. */
export function buildPhotometaPb(params: {
  panoId: string;
  hl?: string;
  gl?: string;
}): string {
  const hl = params.hl ?? 'en';
  const gl = params.gl ?? 'us';
  const ctx = buildPhotometaLocale(hl, gl);
  return `${ctx}!3m3!1m2!1e2!2s${params.panoId}${PHOTOMETA_SUFFIX_457}${PHOTOMETA_SUFFIX_936}`;
}

/** Pb for `/maps/photometa/ac/v1` — coverage tile at Web Mercator z17. */
export function buildCoverageTilePb(params: {
  tileX: number;
  tileY: number;
}): string {
  return `!1m1!1smaps_sv.tactile!6m3!1i${params.tileX}!2i${params.tileY}!3i17!8b1`;
}

/** Full URL for nearby panorama search. */
export function buildListEntityPhotosUrl(params: {
  lat: number;
  lng: number;
  radiusMeters: number;
  hl: string;
  gl: string;
}): string {
  const pb = buildListEntityPhotosPb(params);
  return (
    `https://www.google.com/maps/rpc/photo/listentityphotos` +
    `?authuser=0&hl=${params.hl}&gl=${params.gl}` +
    `&pb=${encodeURIComponent(pb)}`
  );
}

/** Full URL for panorama metadata. */
export function buildPhotometaUrl(params: {
  panoId: string;
  hl: string;
  gl: string;
}): string {
  const pb = buildPhotometaPb({ panoId: params.panoId, hl: params.hl, gl: params.gl });
  return (
    `https://www.google.com/maps/photometa/v1` +
    `?authuser=0&hl=${params.hl}&gl=${params.gl}` +
    `&pb=${encodeURIComponent(pb)}`
  );
}

/** Full URL for z17 coverage tile lookup. */
export function buildCoverageTileUrl(params: {
  tileX: number;
  tileY: number;
  hl: string;
  gl: string;
}): string {
  const pb = buildCoverageTilePb(params);
  return (
    `https://www.google.com/maps/photometa/ac/v1` +
    `?authuser=0&hl=${params.hl}&gl=${params.gl}` +
    `&pb=${encodeURIComponent(pb)}`
  );
}

/** Street View thumbnail URL — returns JPEG bytes without auth. */
export function buildThumbnailUrl(params: {
  panoId: string;
  width?: number;
  height?: number;
  pitch?: number;
  yaw?: number;
}): string {
  const w = params.width ?? 640;
  const h = params.height ?? 480;
  const pitch = params.pitch ?? 0;
  const yaw = params.yaw ?? 0;
  return (
    `${IMAGERY_BASE}/thumbnail` +
    `?w=${w}&h=${h}&pitch=${pitch}&panoid=${params.panoId}&yaw=${yaw}` +
    `&cb_client=${IMAGERY_CLIENT}`
  );
}

/** Street View tile URL — zoom 0..5, x/y are tile indices at that zoom. */
export function buildTileUrl(params: {
  panoId: string;
  x?: number;
  y?: number;
  zoom?: number;
}): string {
  const x = params.x ?? 0;
  const y = params.y ?? 0;
  const zoom = params.zoom ?? 0;
  return (
    `${IMAGERY_BASE}/tile` +
    `?cb_client=${IMAGERY_CLIENT}&panoid=${params.panoId}&x=${x}&y=${y}&zoom=${zoom}`
  );
}
