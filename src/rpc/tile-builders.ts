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
 * Calculate lat/lng from Web Mercator tile coordinates.
 * Useful for converting tile indices back to geographic coordinates.
 */
export function tileToLngLat(
  x: number,
  y: number,
  zoom: number,
): { lng: number; lat: number } {
  const n = Math.pow(2, zoom);
  const lng = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lng, lat };
}

/**
 * Get tile bounds (NE and SW corners) for a given tile.
 */
export function getTileBounds(
  x: number,
  y: number,
  zoom: number,
): { ne: { lat: number; lng: number }; sw: { lat: number; lng: number } } {
  const ne = tileToLngLat(x, y, zoom);
  const sw = tileToLngLat(x + 1, y + 1, zoom);
  return {
    ne: { lat: ne.lat, lng: ne.lng },
    sw: { lat: sw.lat, lng: sw.lng },
  };
}

/**
 * Get all tiles needed to cover a bounding box at a given zoom level.
 */
export function getTilesForBounds(
  neLat: number,
  neLng: number,
  swLat: number,
  swLng: number,
  zoom: number,
): Array<{ x: number; y: number; z: number }> {
  const ne = lngLatToTile(neLng, neLat, zoom);
  const sw = lngLatToTile(swLng, swLat, zoom);

  const tiles: Array<{ x: number; y: number; z: number }> = [];

  for (let x = ne.x; x <= sw.x; x++) {
    for (let y = ne.y; y <= sw.y; y++) {
      tiles.push({ x, y, z: zoom });
    }
  }

  return tiles;
}
