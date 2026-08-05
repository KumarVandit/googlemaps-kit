/** Web Mercator tile indices at a given zoom level. */
export interface TileCoordinates {
  z: number;
  x: number;
  y: number;
}

/**
 * Basemap layer/style marker verified for anonymous `/maps/vt/*` tile fetches.
 *
 * Only `roadmap` is confirmed working — satellite, terrain and traffic overlays
 * either return HTTP 400 or a non-PNG payload when probed without session auth.
 */
export type MapTileLayer = 'roadmap';

/** VT tile endpoint variant — both return protobuf-wrapped PNG for the same pb. */
export type MapTileEndpoint = 'proto' | 'stream';

/** Requested tile edge length in pixels (`!4i{size}` in pb). Only 256 verified live. */
export type MapTileSize = 256;

/** Options for fetching a basemap tile by Web Mercator indices. */
export interface MapTileFetchOptions {
  z: number;
  x: number;
  y: number;
  /** Tile edge length in pixels (default 256). */
  size?: MapTileSize;
  /** Basemap layer/style (default `roadmap`). */
  layer?: MapTileLayer;
  /** `/maps/vt/proto` or `/maps/vt/stream` (default `proto`). */
  endpoint?: MapTileEndpoint;
  /** Tileset version epoch (`!3i{version}`); defaults to the value baked into Maps JS. */
  version?: number;
}

/** Options for fetching a basemap tile by lat/lng (indices computed via Web Mercator). */
export interface MapTileLatLngOptions {
  lat: number;
  lng: number;
  zoom: number;
  size?: MapTileSize;
  layer?: MapTileLayer;
  endpoint?: MapTileEndpoint;
  version?: number;
}

/** Decoded basemap tile returned by {@link TilesService.getTile}. */
export interface MapTileResult {
  /** Raw PNG bytes extracted from the protobuf envelope. */
  bytes: Uint8Array;
  contentType: string;
  width: number;
  height: number;
  coordinates: TileCoordinates;
}

/** Options for fetching a POI icon from `/maps/vt/icon/`. */
export interface MapIconFetchOptions {
  /** Asset path under `assets/icons/…` (e.g. `assets/icons/poi/tactile/pinlet-2-medium.png`). */
  name: string;
  /** Retina scale factor (default 2). */
  scale?: number;
}

/** Decoded POI icon PNG. */
export interface MapIconResult {
  bytes: Uint8Array;
  contentType: string;
  width: number;
  height: number;
}
