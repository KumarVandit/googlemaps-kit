import { PREVIEW } from './rpc-methods.js';
import { altitudeFromZoom } from '../utils/geo.js';

/**
 * Protobuf URL builders for Google Maps entitylist/getlist.
 *
 * Verified minimal pb: `!1m1!1s{LIST_ID}!2e2!3e2!4i500`
 * — `!1m1!1s` wrapper, `!2e2` + `!3e2` fetch mode, and `!4i500` page size are all
 * required to receive place entries (metadata-only without them).
 */

const GET_LIST_BASE =
  'https://www.google.com/maps/preview/entitylist/getlist?authuser=0';

/** Build the getlist pb parameter for a list id. */
export function buildGetListPb(params: {
  listId: string;
  pageSize?: number;
}): string {
  const pageSize = params.pageSize ?? 500;
  return `!1m1!1s${params.listId}!2e2!3e2!4i${pageSize}`;
}

/** Build the full getlist URL for a list id. */
export function buildGetListUrl(params: {
  listId: string;
  pageSize?: number;
  hl: string;
  gl: string;
}): string {
  const pb = buildGetListPb(params);
  return (
    `${GET_LIST_BASE}&hl=${params.hl}&gl=${params.gl}` +
    `&pb=${encodeURIComponent(pb)}`
  );
}

export interface BuildRevealPbParams {
  camLat: number;
  camLng: number;
  camZoom?: number;
  hitLat: number;
  hitLng: number;
  ftid: string;
  width?: number;
  height?: number;
  tileX?: number;
  tileY?: number;
  tileScale?: number;
  tileLayer?: number;
}

/** Strip leading `/g/` or `/m/` — reveal pb uses bare ftid tokens. */
export function normalizeRevealFtid(ftid: string): string {
  return ftid.replace(/^\/g\//, '').replace(/^\/m\//, '').replace(/^\//, '');
}

/**
 * Build pb for GET /maps/preview/reveal.
 * Wire format from live browser capture (live-flows.json, poi-pin-click flow).
 */
export function buildRevealPb(params: BuildRevealPbParams): string {
  const zoom = params.camZoom ?? 14;
  const alt = altitudeFromZoom(zoom, params.camLat);
  const w = params.width ?? 1440;
  const h = params.height ?? 900;
  const tx = params.tileX ?? 96;
  const ty = params.tileY ?? 64;
  const ts = params.tileScale ?? 1;
  const tl = params.tileLayer ?? 8;
  const ftid = normalizeRevealFtid(params.ftid);

  return (
    `!2m9!1m3!1d${alt}!2d${params.camLng}!3d${params.camLat}` +
    `!2m0!3m2!1i${w}!2i${h}!4f13.1` +
    `!3m2!2d${params.hitLng}!3d${params.hitLat}` +
    `!4m2!1s${ftid}!7e81` +
    `!5m5!2m4!1i${tx}!2i${ty}!3i${ts}!4i${tl}`
  );
}

export function buildRevealUrl(params: BuildRevealPbParams & { hl: string; gl: string }): string {
  const pb = buildRevealPb(params);
  return (
    `https://www.google.com${PREVIEW.REVEAL}?authuser=0&hl=${params.hl}&gl=${params.gl}` +
    `&pb=${encodeURIComponent(pb)}`
  );
}

export interface PassiveAssistPbParams {
  lat: number;
  lng: number;
  zoom?: number;
  psi: string;
  width?: number;
  height?: number;
  chipLimit?: number;
}

/**
 * Browser-captured pb shape (2026-07-31 headless live-flows + probe-target-surfaces).
 *
 * Uses the shorter `!1m10!2m9` camera block — the legacy `!1m16!2m15` builder
 * with `!6m2!1f0!2f0` returns the cache-metadata stub for the same psi.
 */
export function buildPassiveAssistPb(params: PassiveAssistPbParams): string {
  const zoom = params.zoom ?? 14;
  const alt = altitudeFromZoom(zoom, params.lat);
  const w = params.width ?? 1440;
  const h = params.height ?? 900;
  const limit = params.chipLimit ?? 50;
  return (
    `!1m10!2m9!1m3!1d${alt}!2d${params.lng}!3d${params.lat}` +
    `!2m0!3m2!1i${w}!2i${h}!4f13.1` +
    `!3m3!1s${params.psi}!7e81!15i312935!7m1!58b1` +
    `!35m6!1i${limit}!3m3!3b1!26b1!29b1!44e11`
  );
}

export function buildPassiveAssistUrl(params: PassiveAssistPbParams & { hl: string; gl: string }): string {
  const pb = buildPassiveAssistPb(params);
  return `https://www.google.com${PREVIEW.PASSIVE_ASSIST}?authuser=0&hl=${params.hl}&gl=${params.gl}&pb=${encodeURIComponent(pb)}`;
}

/**
 * Protobuf URL builders for Maps omnibox autocomplete (`/s?suggest=p`).
 *
 * The endpoint rejects requests without a camera viewport pb (HTTP 500).
 */

const SUGGEST_BASE =
  'https://www.google.com/s?tbm=map&gs_ri=maps&suggest=p&authuser=0';

/** Default viewport used when no location is supplied. */
export const DEFAULT_SUGGEST_LAT = 12.9168;
export const DEFAULT_SUGGEST_LNG = 77.645;

/**
 * Build the camera viewport pb that scopes autocomplete to a map area.
 *
 * Format verified by ablation: only `q` and this `pb` are required on the endpoint.
 */
export function buildSuggestCameraPb(params: {
  lat: number;
  lng: number;
  altitude: number;
  screenWidth: number;
  screenHeight: number;
}): string {
  return (
    `!4m12!1m3!1d${params.altitude}!2d${params.lng}!3d${params.lat}` +
    `!2m3!1f0!2f0!3f0!3m2!1i${params.screenWidth}!2i${params.screenHeight}!4f13.1`
  );
}

/** Assemble the full suggest URL with query, locale, and camera pb. */
export function buildSuggestUrl(params: {
  query: string;
  lat: number;
  lng: number;
  altitude?: number;
  zoom?: number;
  screenWidth?: number;
  screenHeight?: number;
  hl: string;
  gl: string;
  sessionToken?: string;
}): string {
  const lat = params.lat;
  const lng = params.lng;
  const altitude =
    params.altitude ??
    (params.zoom != null ? altitudeFromZoom(params.zoom, lat) : 10_000);
  const screenWidth = params.screenWidth ?? 1440;
  const screenHeight = params.screenHeight ?? 757;

  const pb = buildSuggestCameraPb({
    lat,
    lng,
    altitude,
    screenWidth,
    screenHeight,
  });

  const q = encodeURIComponent(params.query);
  let url = `${SUGGEST_BASE}&hl=${params.hl}&gl=${params.gl}&q=${q}&pb=${encodeURIComponent(pb)}`;

  if (params.sessionToken) {
    url += `&psi=${encodeURIComponent(params.sessionToken)}`;
  }

  return url;
}
