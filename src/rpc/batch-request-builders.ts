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

export function buildViewportMetadataArgs(params: {
  psi: string;
  scale: number;
  lng: number;
  lat: number;
  width?: number;
  height?: number;
  zoom?: number;
}): unknown[] {
  const w = params.width ?? 1440;
  const h = params.height ?? 757;
  const zoom = params.zoom ?? 14;
  return [
    [[params.scale, params.lng, params.lat], [0, 0, 0], [w, h], zoom],
    null,
    null,
    null,
    buildSessionContext(params.psi, [null, null, null, null, null, null, null, 312732]),
  ];
}

export function buildMerchantStatusArgs(psi: string): unknown[] {
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

export function buildKnowledgeEntityArgs(params: {
  entityId: string;
  type?: number;
}): unknown[] {
  return [params.type ?? 1, null, null, null, params.entityId];
}

export function buildListUgcPostsArgs(params: {
  hexId: string;
  psi: string;
  limit?: number;
}): unknown[] {
  const limit = params.limit ?? 10;
  return [null, null, params.hexId, [[1, 1, 0, null, null, null, limit]], buildSessionContext(params.psi), 1];
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
