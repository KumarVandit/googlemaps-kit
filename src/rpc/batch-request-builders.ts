/**
 * batchexecute request argument builders (field-index JSON arrays from Maps JS).
 */

import { buildSessionContext } from './batch-rpc.js';

export function buildAreaTrafficArgs(params: {
  psi: string;
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
}): unknown[] {
  return [
    buildSessionContext(params.psi, [null, null, null, null, null, null, null, 47126]),
    null,
    [
      null,
      [
        null,
        null,
        [null, null, params.swLat, params.swLng],
        [null, null, params.neLat, params.neLng],
      ],
    ],
  ];
}

/**
 * Maps camera proto as a batchexecute arg array.
 *
 * `!1m3!1d{altitude}!2d{lng}!3d{lat}!2m3!1f{heading}!2f{tilt}!3f{roll}!3m2!1i{w}!2i{h}!4f{fov}`
 * — the same camera the `/maps/@` URL carries. Altitude is the load-bearing
 * field: the server derives zoom from it and rejects a camera without one.
 */
function buildCameraArgs(params: {
  lat: number;
  lng: number;
  altitude: number;
  heading?: number;
  tilt?: number;
  roll?: number;
  width?: number;
  height?: number;
  fov?: number;
}): unknown[] {
  return [
    [params.altitude, params.lng, params.lat],
    [params.heading ?? 0, params.tilt ?? 0, params.roll ?? 0],
    [params.width ?? 1440, params.height ?? 757],
    params.fov ?? 13.1,
  ];
}

/**
 * Camera altitude that renders a given zoom level, inverting the Maps client's
 * `zoom = log2((1 / tan(fov/2)) * (height/2) * 2π / (altitude / (R cos lat) * 256))`.
 */
function altitudeForZoom(params: {
  zoom: number;
  lat: number;
  fov?: number;
  height?: number;
}): number {
  const fov = params.fov ?? 13.1;
  const height = params.height ?? 757;
  const normalized =
    ((1 / Math.tan(((Math.PI / 180) * fov) / 2)) * (height / 2) * (2 * Math.PI)) /
    (Math.pow(2, params.zoom) * 256);
  return normalized * 6_371_010 * Math.cos((Math.PI / 180) * params.lat);
}

/**
 * MapsViewportService.GetViewportMetadata (rpcid T4jwAf).
 *
 * Request is `{1: Camera, 4: repeated int, 5: ClientRequestMetadata}`. Earlier
 * probes failed because the camera carried no altitude — the server answers
 * `[3]` for any camera it cannot derive a zoom from.
 */
export function buildViewportMetadataArgs(params: {
  lat: number;
  lng: number;
  zoom?: number;
  altitude?: number;
  width?: number;
  height?: number;
  fov?: number;
  psi?: string;
}): unknown[] {
  const width = params.width ?? 1440;
  const height = params.height ?? 757;
  const fov = params.fov ?? 13.1;
  const altitude =
    params.altitude ??
    altitudeForZoom({ zoom: params.zoom ?? 14, lat: params.lat, fov, height });

  const camera = buildCameraArgs({
    lat: params.lat,
    lng: params.lng,
    altitude,
    width,
    height,
    fov,
  });

  if (!params.psi) return [camera];
  return [camera, null, null, null, buildSessionContext(params.psi)];
}

function buildMerchantStatusArgs(psi: string): unknown[] {
  return [null, buildSessionContext(psi)];
}

export function buildPlaceUgcAggregatesArgs(hexId: string, psi: string): unknown[] {
  return [hexId, buildSessionContext(psi)];
}

export function buildCategorySuggestionsArgs(query: string): unknown[] {
  return [query];
}

export function buildPlaceInfoArgs(hexId: string): unknown[] {
  return [hexId];
}

export function buildPotentialDuplicatesArgs(hexId: string): unknown[] {
  return [hexId];
}

export function buildSignedUrlArgs(hexId: string): unknown[] {
  return [hexId];
}

export function buildDecodeUrlArgs(url: string): unknown[] {
  return [url];
}

export function buildCreateShortUrlArgs(url: string, psi?: string): unknown[] {
  if (!psi) return [url];
  return [url, buildSessionContext(psi), null, null, null, 1];
}

/** Default photo filter flags from live browser capture (all categories enabled). */
const LIST_ENTITY_PHOTOS_FILTER_FLAGS: unknown[] = [
  [
    [1, 0, 3],
    [2, 1, 2],
    [2, 0, 3],
    [8, 0, 3],
    [10, 0, 3],
    [10, 1, 2],
    [10, 0, 4],
    [9, 1, 2],
  ],
  1,
];

const ENTITY_VE_TYPE = 16698;

/** Nested thumb-size cluster from live ListEntityPhotos capture. */
const ENTITY_PHOTOS_THUMB_CLUSTER: unknown = JSON.parse('[[[[[[2]]],[195,195],20]]]');

export interface ListEntityPhotosBatchParams {
  hexId: string;
  psi: string;
  featureId?: string;
  pageSize?: number;
  pageToken?: string;
  /** Base64 category token from gallery tab (e.g. CgIYIA== for Food & drink). */
  categoryToken?: string;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
}

/**
 * MapsPhotoService.ListEntityPhotos batchexecute args — shape from headless capture 2026-07-31.
 * Mode 2 = entity gallery; arg[4] carries pagination token at [2][2] and category at [24].
 */
export function buildListEntityPhotosBatchArgs(params: ListEntityPhotosBatchParams): unknown[] {
  const pageSize = params.pageSize ?? 20;
  const thumbW = params.thumbnailWidth ?? 203;
  const thumbH = params.thumbnailHeight ?? 100;
  const featureId = params.featureId;

  const entityTail = featureId ? [[null, null, null, featureId]] : null;

  const paginationTail = params.categoryToken
    ? [[params.categoryToken], 1, null, 1]
    : [null, 1, null, 1];

  return [
    2,
    null,
    [
      params.hexId,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      0,
      null,
      null,
      null,
      null,
      null,
      entityTail,
    ],
    null,
    [
      null,
      [thumbW, thumbH],
      [null, pageSize, params.pageToken ?? null, null, 1],
      null,
      null,
      null,
      LIST_ENTITY_PHOTOS_FILTER_FLAGS,
      null,
      0,
      null,
      null,
      null,
      null,
      null,
      ENTITY_PHOTOS_THUMB_CLUSTER,
      buildSessionContext(params.psi, [null, null, null, null, null, null, null, ENTITY_VE_TYPE]),
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      paginationTail,
    ],
  ];
}

/**
 * MapsTransitService.ListTransitLines (rpcid gY1uwe).
 * Request shape from f0N97d.js: repeated Pqh at field 1 — Pqh.Nc enum + Oqh payload;
 * Oqh.rb (field 1) = line hex id, Oqh.U (field 13) = stop list with lat/lng at Nqh paths.
 * Returns error [3] anonymously as of 2026-07-31 — kept for probe scripts.
 */
export function buildListTransitLinesArgs(params: {
  lineHexId: string;
  lat?: number;
  lng?: number;
  requestType?: number;
}): unknown[] {
  const type = params.requestType ?? 1;
  const oqh: unknown[] = [
    params.lineHexId,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ];

  if (params.lat != null && params.lng != null) {
    oqh[13] = [[null, null, null, null, null, null, null, null, null, null, null, null, null, [[params.lat, params.lng]]]];
  }

  return [[[type, oqh]]];
}
