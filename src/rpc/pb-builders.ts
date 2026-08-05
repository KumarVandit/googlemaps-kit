/**
 * Protobuf URL parameter builders for Google Maps internal endpoints.
 *
 * Format: `!{field}{type}{value}` — field order is critical.
 * Pagination: `!7i` = page size, `!8i` = offset (SerpAPI / Maps web client).
 */

import { defaultViewportDist } from '../utils/geo.js';
import type { TravelMode } from '../types/common.js';
import type { DirectionsWaypoint } from '../types/directions.js';

export function buildSearchPb(params: {
  query: string;
  lat: number;
  lng: number;
  resultsCount: number;
  maxRadius: number;
  viewportDist: number;
  offset: number;
  /** Session token (kEI / response psi) — sent by the browser as !22m5 for page 2+. */
  psi?: string;
}): string {
  const queryEncoded = encodeURIComponent(params.query);
  const offsetPart = params.offset > 0 ? `!8i${params.offset}` : '';
  // Live browser capture: !22m5!1s{psi}!7e81!14m1!3s{psi}!15i9937
  const psiPart = params.psi ? `!22m5!1s${params.psi}!7e81!14m1!3s${params.psi}!15i9937` : '';

  return (
    `!1s${queryEncoded}` +
    `!4m8!1m3!1d${params.viewportDist}!2d${params.lng}!3d${params.lat}` +
    `!3m2!1i1024!2i768!4f13.1` +
    `!7i${params.resultsCount}${offsetPart}` +
    `!10b1` +
    `!12m57!1m5!18b1!30b1!31m1!1b1!34e1` +
    `!2m4!5m1!6e2!20e3!39b1` +
    `!6m29!32i1!49b1!63m0!66b1!74i${params.maxRadius}` +
    `!85b1!114b1!149b1!206b1!209b1!212b1!215b1!216b1!222b1!223b1!232b1!234b1!235b1!246b1!253b1!260b1!266b1!270b1!273b1!280b1!281b1!286b1!291m0!302i300!303i100` +
    `!10b1!12b1!13b1!14b1!16b1!17m1!3e1!20m4!5e2!6b1!8b1!14b1!46m1!1b0!96b1!99b1` +
    `!19m4!2m3!1i360!2i120!4i8` +
    psiPart
  );
}

export function buildSearchUrl(params: {
  query: string;
  lat: number;
  lng: number;
  resultsCount: number;
  maxRadius: number;
  viewportDist?: number;
  offset: number;
  hl: string;
  gl: string;
  psi?: string;
  ech?: number;
  zoom?: number;
}): string {
  const queryUrl = encodeURIComponent(params.query).replace(/%20/g, '+');
  const viewportDist =
    params.viewportDist ?? defaultViewportDist(params.lat, params.zoom ?? 15);
  const pb = buildSearchPb({
    query: params.query,
    lat: params.lat,
    lng: params.lng,
    resultsCount: params.resultsCount,
    maxRadius: params.maxRadius,
    viewportDist,
    offset: params.offset,
    psi: params.psi,
  });
  return (
    `https://www.google.com/search` +
    `?tbm=map&authuser=0&hl=${params.hl}&gl=${params.gl}` +
    `&q=${queryUrl}` +
    `&pb=${encodeURIComponent(pb)}`
  );
}

/**
 * Place preview pb — requests photos, hours, phone, categories, embedded review snippets.
 */
export function buildPlaceDetailPb(params: {
  hexId: string;
  lat: number;
  lng: number;
}): string {
  return (
    `!1m14!1s${params.hexId}` +
    `!3m9!1m3!1d5000!2d${params.lng}!3d${params.lat}!2m0!3m2!1i1024!2i768!4f13.1` +
    `!4m2!3d${params.lat}!4d${params.lng}` +
    `!13m1!2m0` +
    `!15m47!1m8!4e2!18m5!3b0!6b0!14b1!17b1!20b1!20e2!4b1` +
    `!10m1!8e3!11m1!3e1!17b1!20m2!1e3!1e6!24b1!25b1!26b1!29b1` +
    `!30m1!2b1!36b1!43b1!52b1!55b1!56m1!1b1` +
    `!65m5!3m4!1m3!1m2!1i224!2i298` +
    `!22m1!1e81!29m0!30m6!3b1!6m1!2b1!7m1!2b1!9b1!32b1!37i771`
  );
}

/** Extended place pb with amenities and accessibility fields. */
export function buildPlaceRichPb(params: {
  hexId: string;
  name: string;
  lat: number;
  lng: number;
  ftid?: string;
}): string {
  const namePlus = params.name.replace(/ /g, '+');
  const ftidPart = params.ftid ? `!15m2!1m1!4s${params.ftid}` : '';
  // `!1mN` declares how many following groups belong to field 1: 14 for
  // hex+name+viewport+coords, plus 3 more (!15m2!1m1!4s) when an ftid is present.
  // Getting N wrong makes the endpoint reject the request with HTTP 400.
  const groupCount = params.ftid ? 17 : 14;

  return (
    `!1m${groupCount}` +
    `!1s${params.hexId}` +
    `!2s${namePlus}` +
    `!3m8!1m3!1d3022.7!2d${params.lng}!3d${params.lat}!3m2!1i1024!2i768!4f13.1` +
    `!4m2!3d${params.lat}!4d${params.lng}` +
    ftidPart +
    '!12m4!2m3!1i360!2i120!4i8' +
    '!13m57!2m2!1i203!2i100!3m2!2i4!5b1' +
    '!6m6!1m2!1i86!2i86!1m2!1i408!2i240' +
    '!7m33!1m3!1e1!2b0!3e3!1m3!1e2!2b1!3e2!1m3!1e2!2b0!3e3!1m3!1e8!2b0!3e3!1m3!1e10!2b0!3e3!1m3!1e10!2b1!3e2!1m3!1e10!2b0!3e4!1m3!1e9!2b1!3e2!2b1!9b0' +
    '!15m8!1m7!1m2!1m1!1e2!2m2!1i195!2i195!3i20' +
    '!15m108!1m29!13m9!2b1!3b1!4b1!6i1!8b1!9b1!14b1!20b1!25b1' +
    '!18m18!3b1!4b1!5b1!6b1!13b1!14b1!17b1!21b1!22b1!27m1!1b0!28b0!30b1!32b1!33m1!1b1!34b1!36e2' +
    '!10m1!8e3!11m1!3e1!14m1!3b0!17b1!20m2!1e3!1e6!24b1!25b1!26b1!27b1!29b1!30m1!2b1!36b1!37b1' +
    '!39m3!2m2!2i1!3i1!43b1!52b1!54m1!1b1!55b1!56m1!1b1!61m2!1m1!1e1!65m5!3m4!1m3!1m2!1i224!2i298' +
    '!72m22!1m8!2b1!5b1!7b1!12m4!1b1!2b1!4m1!1e1!4b1!8m10!1m6!4m1!1e1!4m1!1e3!4m1!1e4!3sother_user_google_review_posts__and__hotel_and_vr_partner_review_posts!6m1!1e1!9b1' +
    '!89b1!98m3!1b1!2b1!3b1!103b1!113b1!114m3!1b1!2m1!1b1!117b1!122m1!1b1!126b1!127b1' +
    '!21m0!22m1!1e81' +
    '!30m8!3b1!6m2!1b1!2b1!7m2!1e3!2b1!9b1' +
    '!34m5!7b1!10b1!14b1!15m1!1b0' +
    '!37i763'
  );
}

/**
 * Place preview pb captured verbatim from a live browser session.
 *
 * Only the hex id is required — the browser sends no name or coordinates.
 * Captured via `npm run capture:browser-rpc` (see tests/fixtures/live-pb-capture.json).
 */
export function buildPlaceLivePb(params: { hexId: string; psi?: string }): string {
  const psiPart = params.psi ? `!14m2!1s${params.psi}!7e81` : '';

  return (
    `!1m1!1s${params.hexId}` +
    '!12m4!2m3!1i360!2i120!4i8' +
    '!13m57!2m2!1i203!2i100!3m2!2i4!5b1' +
    '!6m6!1m2!1i86!2i86!1m2!1i408!2i240' +
    '!7m33!1m3!1e1!2b0!3e3!1m3!1e2!2b1!3e2!1m3!1e2!2b0!3e3!1m3!1e8!2b0!3e3!1m3!1e10!2b0!3e3!1m3!1e10!2b1!3e2!1m3!1e10!2b0!3e4!1m3!1e9!2b1!3e2!2b1!9b0' +
    '!15m8!1m7!1m2!1m1!1e2!2m2!1i195!2i195!3i20' +
    psiPart +
    '!15m110!1m28!13m9!2b1!3b1!4b1!6i1!8b1!9b1!14b1!20b1!25b1' +
    '!18m17!3b1!4b1!5b1!6b1!9b1!13b1!14b1!17b1!20b1!21b1!22b1!30b1!32b1!33m1!1b1!34b1!36e2' +
    '!10m1!8e3!11m1!3e1!17b1!20m2!1e3!1e6!24b1!25b1!26b1!27b1!29b1!30m1!2b1!36b1!37b1' +
    '!39m3!2m2!2i1!3i1!43b1!52b1!54m1!1b1!55b1!56m1!1b1!61m2!1m1!1e1!65m5!3m4!1m3!1m2!1i224!2i298' +
    '!72m22!1m8!2b1!5b1!7b1!12m4!1b1!2b1!4m1!1e1!4b1!8m10!1m6!4m1!1e1!4m1!1e3!4m1!1e4!3sother_user_google_review_posts__and__hotel_and_vr_partner_review_posts!6m1!1e1!9b1' +
    '!89b1!90m2!1m1!1e2!98m3!1b1!2b1!3b1!103b1!113b1!114m3!1b1!2m1!1b1!117b1!122m1!1b1!126b1!127b1!128m1!1b1' +
    '!22m1!1e81' +
    '!29m0' +
    '!30m6!3b1!6m1!2b1!7m1!2b1!9b1' +
    '!34m5!7b1!10b1!14b1!15m1!1b0' +
    '!37i788'
  );
}

/** @deprecated Use buildPlaceDetailPb */
export const buildPlacePb = buildPlaceRichPb;

export type PlacePbMode = 'detail' | 'rich' | 'live';

export function buildPlaceUrl(params: {
  hexId: string;
  name?: string;
  lat?: number;
  lng?: number;
  ftid?: string;
  hl: string;
  gl: string;
  mode?: PlacePbMode;
  psi?: string;
}): string {
  const requested = params.mode ?? 'live';
  const hasCoords = params.lat != null && params.lng != null;
  // `detail`/`rich` templates embed coordinates (and `rich` a name); fall back to
  // the live hex-only template when the caller has just an id.
  const mode: PlacePbMode =
    requested !== 'live' && (!hasCoords || (requested === 'rich' && !params.name))
      ? 'live'
      : requested;

  let pb: string;
  switch (mode) {
    case 'live':
      pb = buildPlaceLivePb({ hexId: params.hexId, psi: params.psi });
      break;
    case 'rich':
      pb = buildPlaceRichPb({
        hexId: params.hexId,
        name: params.name!,
        lat: params.lat!,
        lng: params.lng!,
        ftid: params.ftid,
      });
      break;
    case 'detail':
      pb = buildPlaceDetailPb({ hexId: params.hexId, lat: params.lat!, lng: params.lng! });
      break;
    default: {
      const exhaustive: never = mode;
      throw new Error(`Unhandled place pb mode: ${String(exhaustive)}`);
    }
  }

  const queryPart = params.name ? `&q=${params.name.replace(/ /g, '+')}` : '';

  return (
    `https://www.google.com/maps/preview/place` +
    `?authuser=0&hl=${params.hl}&gl=${params.gl}` +
    queryPart +
    `&pb=${encodeURIComponent(pb)}`
  );
}

export function buildReviewsPb(params: {
  hexId: string;
  limit?: number;
  paginationToken?: string;
}): string {
  const limit = params.limit ?? 10;
  const token = params.paginationToken ?? '';
  return (
    `!1m6!1s${params.hexId}` +
    `!6m4!4m1!1e1!4m1!1e3` +
    `!2m2!1i${limit}!2s${token}` +
    `!5m2!1s!7e81` +
    `!8m9!2b1!3b1!5b1!7b1!12m4!1b1!2b1!4m1!1e1` +
    `!11m4!1e3!2e1!6m1!1i2` +
    `!13m1!1e1`
  );
}

export function buildReviewsUrl(params: {
  hexId: string;
  limit?: number;
  paginationToken?: string;
  hl: string;
  gl: string;
}): string {
  const pb = buildReviewsPb(params);
  return (
    `https://www.google.com/maps/rpc/listugcposts` +
    `?authuser=0&hl=${params.hl}&gl=${params.gl}` +
    `&pb=${encodeURIComponent(pb)}`
  );
}

export function buildLocalPostsPb(params: { hexId: string; ftid?: string }): string {
  if (params.ftid) {
    return `!1m2!1s${params.hexId}!2s${params.ftid}`;
  }
  return `!1m1!1s${params.hexId}`;
}

export function buildLocalPostsUrl(params: {
  hexId: string;
  ftid?: string;
  hl: string;
  gl: string;
}): string {
  const pb = buildLocalPostsPb(params);
  return (
    `https://www.google.com/maps/preview/localposts` +
    `?authuser=0&hl=${params.hl}&gl=${params.gl}` +
    `&pb=${encodeURIComponent(pb)}`
  );
}

/**
 * Travel-mode codes for the `!20m6!1e{n}` block, verified against Google's own pb by
 * scraping /maps/dir/ with data=!3e{n} for each mode (npm run probe:directions-modes):
 *
 *   1e0 driving   14 min / 4.5 km / 23 steps
 *   1e1 bicycling  (Google itself returns no route for many city pairs)
 *   1e2 walking   58 min / 4.0 km / 17 steps
 *   1e3 transit   34 min / 5.4 km / 15 steps
 *
 * `!2e3` matches what Google emits for every mode; the previous `!2e1` combined with a
 * bogus `1e6` walking code made walking return an empty response.
 */
const DIRECTIONS_MODE_CODE: Record<TravelMode, number> = {
  driving: 0,
  bicycling: 1,
  walking: 2,
  transit: 3,
};

function directionsModeBlock(mode: TravelMode): string {
  return `!20m6!1e${DIRECTIONS_MODE_CODE[mode]}!2e3!5e2!6b1!8b1!14b1!46m1!1b0!96b1!99b1`;
}

/** `data=!3e{n}` suffix for /maps/dir/ page URLs — same code space as `!1e{n}`. */
export function directionsDataSuffix(mode: TravelMode): string {
  return `data=!4m2!4m1!3e${DIRECTIONS_MODE_CODE[mode]}`;
}

const DIRECTIONS_COMMON_SUFFIX =
  '!6m60!1m5!18b1!30b1!31m1!1b1!34e1!2m4!5m1!6e2!20e3!39b1' +
  '!6m30!32i1!49b1!63m0!66b1!85b1!114b1!149b1!206b1!209b1!212b1!216b1!222b1!223b1!232b1!234b1!235b1!239b1!246b1!253b1!260b1!266b1!270b1!273b1!277b1!280b1!281b1!286b1!291m0!302i300!303i100' +
  '!10b1!12b1!13b1!14b1!16b1!17m1!3e1';

const DIRECTIONS_PANEL_SUFFIX =
  '!20m28!1m6!1m2!1i0!2i0!2m2!1i530!2i768!1m6!1m2!1i974!2i0!2m2!1i1024!2i768!1m6!1m2!1i0!2i0!2m2!1i1024!2i20!1m6!1m2!1i0!2i748!2m2!1i1024!2i768!27b1!40i788!47m2!8b1!10e2';

function directionsEndpointPart(value: string | { lat: number; lng: number }): string {
  if (typeof value === 'string') {
    const pipe = value.indexOf('|');
    if (pipe > 0) {
      const hexId = value.slice(0, pipe);
      const ftid = value.slice(pipe + 1);
      return `!1m2!1s${hexId}!2s${encodeURIComponent(ftid)}`;
    }
    if (value.includes(':')) {
      return `!1m2!1s${value}!2s${encodeURIComponent(value)}`;
    }
    if (value.startsWith('/g/')) {
      const encoded = encodeURIComponent(value);
      return `!1m2!1s${encoded}!2s${encoded}`;
    }
    return `!1s${encodeURIComponent(value.replace(/ /g, '+'))}`;
  }
  return `!1m4!3m2!3d${value.lat}!4d${value.lng}!6e2`;
}

function directionsViewportBlock(
  endpoints: Array<string | { lat: number; lng: number }>,
  mode: TravelMode,
): string {
  const coords = endpoints.filter((e): e is { lat: number; lng: number } => typeof e === 'object');
  if (coords.length >= 2) {
    const lats = coords.map((c) => c.lat);
    const lngs = coords.map((c) => c.lng);
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const midLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    const span = Math.max(
      Math.max(...lats) - Math.min(...lats),
      Math.max(...lngs) - Math.min(...lngs),
    );
    const dist = Math.max(defaultViewportDist(midLat, 13) * 4, span * 111_000 * 2);
    if (mode === 'walking') {
      return (
        `!3m12!1m3!1d${dist}!2d${midLng}!3d${midLat}` +
        `!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1`
      );
    }
    return `!3m8!1m3!1d${dist}!2d${midLng}!3d${midLat}!3m2!1i1024!2i768!4f13.1`;
  }
  return `!3m8!1m3!1d5000!2d0!3d0!3m2!1i1024!2i768!4f13.1`;
}

function directionsEndpointChain(
  origin: string | { lat: number; lng: number },
  destination: string | { lat: number; lng: number },
  waypoints?: DirectionsWaypoint[],
): string {
  const parts = [directionsEndpointPart(origin)];
  for (const waypoint of waypoints ?? []) {
    parts.push(directionsEndpointPart(waypoint.location));
  }
  parts.push(directionsEndpointPart(destination));
  return parts.join('');
}

export function buildDirectionsPb(params: {
  origin: string | { lat: number; lng: number };
  destination: string | { lat: number; lng: number };
  waypoints?: DirectionsWaypoint[];
  mode?: TravelMode;
}): string {
  const mode = params.mode ?? 'driving';
  const modeBlock = directionsModeBlock(mode);
  const chain = directionsEndpointChain(params.origin, params.destination, params.waypoints);
  const endpoints = [
    params.origin,
    ...(params.waypoints ?? []).map((w) => w.location),
    params.destination,
  ];
  const viewport = directionsViewportBlock(endpoints, mode);

  return chain + viewport + DIRECTIONS_COMMON_SUFFIX + modeBlock + DIRECTIONS_PANEL_SUFFIX;
}

export function buildDirectionsUrls(params: {
  origin: string | { lat: number; lng: number };
  destination: string | { lat: number; lng: number };
  waypoints?: DirectionsWaypoint[];
  mode?: TravelMode;
  hl: string;
  gl: string;
}): string[] {
  return [
    `https://www.google.com/maps/preview/directions` +
      `?authuser=0&hl=${params.hl}&gl=${params.gl}` +
      `&pb=${encodeURIComponent(buildDirectionsPb(params))}`,
  ];
}

export function buildKnowledgePbVariants(params: {
  hexId: string;
  ftid?: string;
  placeId?: string;
}): string[] {
  const variants = [`!1m1!1s${params.hexId}`];
  if (params.ftid) {
    variants.push(`!1m2!1s${params.hexId}!2s${params.ftid}`);
    variants.push(`!1m2!1s${params.ftid}!2s${params.hexId}`);
  }
  if (params.placeId) {
    variants.push(`!1m1!1s${params.placeId}`);
  }
  return variants;
}

export function buildKnowledgeUrl(params: {
  hexId: string;
  ftid?: string;
  placeId?: string;
  hl: string;
  gl: string;
}): string[] {
  return buildKnowledgePbVariants(params).map(
    (pb) =>
      `https://www.google.com/maps/rpc/getknowledgeentity` +
      `?authuser=0&hl=${params.hl}&gl=${params.gl}` +
      `&pb=${encodeURIComponent(pb)}`,
  );
}
