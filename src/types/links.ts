import type { Coordinates, TravelMode } from './common.js';

/** Shared coordinate pair extracted from Maps URLs. Alias of {@link Coordinates}. */
export type MapsCoordinates = Coordinates;

/** Base fields present on every successfully classified parse result. */
interface ParsedMapsUrlBase {
  /** Normalized input URL (may differ from raw input after normalization). */
  url: string;
}

/** Full place page URL or expanded short link targeting a single listing. */
export interface ParsedPlaceUrl extends ParsedMapsUrlBase {
  kind: 'place';
  name?: string;
  hexId?: string;
  placeId?: string;
  /** Google feature id path, e.g. `/g/11x8fq7n_z`. */
  featureId?: string;
  /** Decimal ludocid when derivable from hex id or present in a cid URL. */
  cid?: string;
  lat?: number;
  lng?: number;
  zoom?: number;
}

/** Search results viewport URL (`/maps/search/...`). */
export interface ParsedSearchUrl extends ParsedMapsUrlBase {
  kind: 'search';
  query: string;
  lat?: number;
  lng?: number;
  zoom?: number;
}

/** Directions route URL (`/maps/dir/...`). */
export interface ParsedDirectionsUrl extends ParsedMapsUrlBase {
  kind: 'directions';
  origin: string;
  destination: string;
  mode?: TravelMode;
  lat?: number;
  lng?: number;
  zoom?: number;
}

/** Bare map viewport with no place or search context (`/maps/@...`). */
export interface ParsedViewportUrl extends ParsedMapsUrlBase {
  kind: 'viewport';
  lat: number;
  lng: number;
  zoom?: number;
}

/** Curated place list page (`/maps/placelists/list/...`). */
export interface ParsedListUrl extends ParsedMapsUrlBase {
  kind: 'list';
  listId: string;
}

/** Legacy ludocid URL (`?cid=...`) — hex id is not recoverable without the high uint64. */
export interface ParsedCidUrl extends ParsedMapsUrlBase {
  kind: 'cid';
  cid: string;
}

/** Short link that must be expanded before structured fields are available. */
export interface ParsedShortLinkUrl extends ParsedMapsUrlBase {
  kind: 'shortLink';
  code: string;
  host: 'maps.app.goo.gl' | 'goo.gl';
}

/** Unrecognized Maps-related URL — callers may still inspect `url`. */
export interface ParsedUnknownUrl extends ParsedMapsUrlBase {
  kind: 'unknown';
}

/** Discriminated union returned by {@link parseMapsUrl}. */
export type ParsedMapsUrl =
  | ParsedPlaceUrl
  | ParsedSearchUrl
  | ParsedDirectionsUrl
  | ParsedViewportUrl
  | ParsedListUrl
  | ParsedCidUrl
  | ParsedShortLinkUrl
  | ParsedUnknownUrl;
