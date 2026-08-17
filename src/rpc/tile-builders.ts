

/**
 * Tile URL builders for Google Maps tile services.
 * Constructs URLs for fetching various map tile types (raster, terrain, 3D, Earth).
 */

/**
 * Build a standard map tile URL.
 * Format: https://mt.google.com/vt?x={x}&y={y}&z={z}&style={style}
 */
export function buildMapTileUrl(options: {
  x: number;
  y: number;
  zoom: number;
  style?: 'roadmap' | 'satellite' | 'terrain' | 'hybrid';
  scale?: 1 | 2;
}): string {
  const style = options.style ?? 'roadmap';
  const scale = options.scale ?? 1;
  const params = new URLSearchParams({
    x: String(options.x),
    y: String(options.y),
    z: String(options.zoom),
    style,
  });

  if (scale > 1) {
    params.set('scale', String(scale));
  }

  return `https://mt.google.com/vt?${params.toString()}`;
}

/**
 * Build a traffic overlay tile URL.
  * Format: https://mt.google.com/vt?lyrs=h,traffic&x={x}&y={y}&z={z}
 */
export function buildTrafficTileUrl(options: {
  x: number;
  y: number;
  zoom: number;
  scale?: 1 | 2;
}): string {
  const params = new URLSearchParams({
    // `traffic` on its own renders a fully transparent tile — mt.google.com only
    // paints the congestion overlay when it is composited onto a base layer.
    lyrs: 'h,traffic',
    x: String(options.x),
    y: String(options.y),
    z: String(options.zoom),
  });

  if (options.scale && options.scale > 1) {
    params.set('scale', String(options.scale));
  }

  return `https://mt.google.com/vt?${params.toString()}`;
}

/**
 * Build a transit overlay tile URL.
 * Format: https://mt.google.com/vt?lyrs=transit&x={x}&y={y}&z={z}
 */
export function buildTransitTileUrl(options: {
  x: number;
  y: number;
  zoom: number;
  scale?: 1 | 2;
}): string {
  const params = new URLSearchParams({
    lyrs: 'transit',
    x: String(options.x),
    y: String(options.y),
    z: String(options.zoom),
  });

  if (options.scale && options.scale > 1) {
    params.set('scale', String(options.scale));
  }

  return `https://mt.google.com/vt?${params.toString()}`;
}

/**
 * Build a terrain overlay tile URL.
 * Format: https://mt.google.com/vt?lyrs=p&x={x}&y={y}&z={z}
 */
export function buildTerrainTileUrl(options: {
  x: number;
  y: number;
  zoom: number;
  scale?: 1 | 2;
}): string {
  const params = new URLSearchParams({
    lyrs: 'p',
    x: String(options.x),
    y: String(options.y),
    z: String(options.zoom),
  });

  if (options.scale && options.scale > 1) {
    params.set('scale', String(options.scale));
  }

  return `https://mt.google.com/vt?${params.toString()}`;
}

/**
 * Build a satellite / hybrid imagery tile URL.
 *
 * `earth.google.com` has no public tile API — the imagery the Maps web client
 * renders comes from the same `mt.google.com/vt` host as the basemap, keyed
 * `s` (satellite only) or `y` (satellite + roads and labels). Both answer JPEG.
 */
export function buildEarthTileUrl(options: {
  x: number;
  y: number;
  zoom: number;
  imageType?: 'aerial' | 'satellite';
  scale?: 1 | 2;
}): string {
  const params = new URLSearchParams({
    lyrs: options.imageType === 'satellite' ? 'y' : 's',
    x: String(options.x),
    y: String(options.y),
    z: String(options.zoom),
  });

  if (options.scale && options.scale > 1) {
    params.set('scale', String(options.scale));
  }

  return `https://mt.google.com/vt?${params.toString()}`;
}

/**
 * Calculate Web Mercator tile coordinates from lat/lng.
 * Useful for converting geographic coordinates to tile indices.
 */
export function lngLatToTile(
  lng: number,
  lat: number,
  zoom: number,
): { x: number; y: number; z: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n,
  );
  return { x, y, z: zoom };
}

/**
 * Protobuf URL builders for Google Maps vector-tile endpoints.
 *
 * Pb slot semantics (verified against live probes + the Maps JS vt module):
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

/** Full URL for a pb-wrapped vector/basemap tile from the proto or stream endpoints. */
export function buildProtoTileUrl(options: MapTileFetchOptions): string {
  const endpoint = options.endpoint ?? 'proto';
  const pb = buildMapTilePb(options);
  return `${VT_BASE}${vtPath(endpoint)}?pb=${encodeURIComponent(pb)}`;
}

/**
 * Pb for a named overlay layer tile.
 *
 * The Maps JS layer descriptor (`_.er`) serialises into the `!2m` block as
 * field 1 = type enum, field 2 = layer name string. Hillshade publishes as
 * type 5 ("shading"), contour lines as type 6 ("contours") and the air
 * quality heatmap as a named data layer of type 2.
 */
export function buildOverlayTilePb(params: {
  z: number;
  x: number;
  y: number;
  size?: number;
  layer: 'hillshade' | 'contours' | 'airQualityHeatmap';
}): string {
  const size = params.size ?? 256;
  const descriptor =
    params.layer === 'hillshade'
      ? '!1e5!2sshading'
      : params.layer === 'contours'
        ? '!1e6!2scontours'
        : '!1e2!2sair-quality-heatmap';
  return (
    `!1m5!1m4!1i${params.z}!2i${params.x}!3i${params.y}!4i${size}` +
    `!2m2${descriptor}`
  );
}

/** Full URL for an overlay layer tile (no network I/O). */
export function buildOverlayTileUrl(options: {
  z: number;
  x: number;
  y: number;
  size?: number;
  layer: 'hillshade' | 'contours' | 'airQualityHeatmap';
}): string {
  const pb = buildOverlayTilePb(options);
  return `${VT_BASE}/proto?pb=${encodeURIComponent(pb)}`;
}

/** Full URL for a POI icon asset (no network I/O). */
export function buildIconUrl(params: {
  name: string;
  scale?: number;
}): string {
  const scale = params.scale ?? 2;
  return `${VT_BASE}/icon/name=${params.name}?scale=${scale}`;
}
