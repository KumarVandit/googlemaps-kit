/**
 * Protobuf URL builders for Google Maps vector-tile endpoints.
 *
 * Pb slot semantics (reverse-engineered from live probes + Maps JS vt module):
 *
 * ```
 * !1m5!1m4!1i{z}!2i{x}!3i{y}!4i{size}!2m3!1e{layerEnum}!2s{style}!3i{version}
 * ```
 *
 * | Slot | Example | Meaning |
 * |------|---------|---------|
 * | `!1m5!1m4` | — | Outer tile-index wrapper (5-field group containing a 4-field coord block) |
 * | `!1i{z}` | `!1i14` | Zoom level (Web Mercator pyramid) |
 * | `!2i{x}` | `!2i9362` | Tile column (X index, increases eastward) |
 * | `!3i{y}` | `!3i7623` | Tile row (Y index, increases southward) |
 * | `!4i{size}` | `!4i256` | Requested tile edge length in pixels (512 returns HTTP 400) |
 * | `!2m3` | — | Layer/style sub-message (3 fields) |
 * | `!1e{layerEnum}` | `!1e0` | Layer type enum — `0` is the default basemap roadmap layer |
 * | `!2s{style}` | `!2sm` | Style marker string — `m` is the default roadmap style in Maps JS |
 * | `!3i{version}` | `!3i707476520` | Tileset version epoch; static in Maps JS, may drift on deploys |
 *
 * Adding a locale suffix (`!3m8!2s{hl}!3s{gl}!…`) after the version slot causes HTTP 400.
 */

import type { MapTileEndpoint, MapTileFetchOptions, MapTileLayer, MapTileSize } from '../types/tiles.js';

/** Default tileset version epoch observed in Maps JS (Jul 2026). */
export const DEFAULT_MAP_TILE_VERSION = 707_476_520;

const VT_BASE = 'https://www.google.com/maps/vt';

/** Default POI pin icon from Maps JS (`RFjZgc.js` asset registry). */
export const DEFAULT_POI_ICON =
  'assets/icons/poi/tactile/pinlet-2-medium.png';

interface LayerPbParts {
  layerEnum: number;
  styleMarker: string;
}

function layerPbParts(layer: MapTileLayer): LayerPbParts {
  switch (layer) {
    case 'roadmap':
      return { layerEnum: 0, styleMarker: 'm' };
    default: {
      const exhaustive: never = layer;
      throw new Error(`Unhandled map tile layer: ${String(exhaustive)}`);
    }
  }
}

/** Build the pb string for a basemap tile request. */
export function buildMapTilePb(params: {
  z: number;
  x: number;
  y: number;
  size?: MapTileSize;
  layer?: MapTileLayer;
  version?: number;
}): string {
  const size = params.size ?? 256;
  const layer = params.layer ?? 'roadmap';
  const version = params.version ?? DEFAULT_MAP_TILE_VERSION;
  const { layerEnum, styleMarker } = layerPbParts(layer);

  return (
    `!1m5!1m4!1i${params.z}!2i${params.x}!3i${params.y}!4i${size}` +
    `!2m3!1e${layerEnum}!2s${styleMarker}!3i${version}`
  );
}

function vtPath(endpoint: MapTileEndpoint): string {
  switch (endpoint) {
    case 'proto':
      return '/proto';
    case 'stream':
      return '/stream';
    default: {
      const exhaustive: never = endpoint;
      throw new Error(`Unhandled map tile endpoint: ${String(exhaustive)}`);
    }
  }
}

/** Full URL for a basemap tile (no network I/O). */
export function buildMapTileUrl(options: MapTileFetchOptions): string {
  const endpoint = options.endpoint ?? 'proto';
  const pb = buildMapTilePb(options);
  return `${VT_BASE}${vtPath(endpoint)}?pb=${encodeURIComponent(pb)}`;
}

/** Full URL for a POI icon asset (no network I/O). */
export function buildIconUrl(params: {
  name: string;
  scale?: number;
}): string {
  const scale = params.scale ?? 2;
  return `${VT_BASE}/icon/name=${params.name}?scale=${scale}`;
}
