/**
 * Google Maps viewport altitude ↔ zoom conversion.
 * Reverse-engineered from Maps JS (see SerpAPI pagination article).
 */

const EARTH_RADIUS_METERS = 6_371_010;
const TILE_SIZE = 256;
const SCREEN_PIXEL_HEIGHT = 768;
const RADIUS_X_PIXEL_HEIGHT = 27.3611 * EARTH_RADIUS_METERS * SCREEN_PIXEL_HEIGHT;

/** Convert map zoom level to viewport altitude (`!1d` in search pb). */
export function altitudeFromZoom(zoom: number, latitude: number): number {
  return (RADIUS_X_PIXEL_HEIGHT * Math.cos((latitude * Math.PI) / 180)) / (2 ** zoom * TILE_SIZE);
}

/** Convert viewport altitude to approximate zoom level. */
export function zoomFromAltitude(altitude: number, latitude: number): number {
  const ratio =
    (RADIUS_X_PIXEL_HEIGHT * Math.cos((latitude * Math.PI) / 180)) / (TILE_SIZE * altitude);
  return Math.log2(ratio);
}

/** Default viewport distance for local search (~5km). */
export function defaultViewportDist(lat: number, zoom = 15): number {
  return altitudeFromZoom(zoom, lat);
}

/** Web Mercator tile indices, the coordinate space Street View coverage tiles use. */
export function webMercatorTile(
  lat: number,
  lng: number,
  zoom: number,
): { x: number; y: number } {
  const scale = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  return {
    x: Math.floor(((lng + 180) / 360) * scale),
    y: Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale),
  };
}

/** Inverse of {@link webMercatorTile} — centre point of a tile, clamped to valid latitude. */
export function webMercatorTileCenter(
  x: number,
  y: number,
  zoom: number,
): { lat: number; lng: number } {
  const scale = 2 ** zoom;
  const n = Math.PI - (2 * Math.PI * (y + 0.5)) / scale;
  return {
    lng: ((x + 0.5) / scale) * 360 - 180,
    lat: (Math.atan(Math.sinh(n)) * 180) / Math.PI,
  };
}

/** Great-circle distance in metres, used to rank panoramas by proximity. */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Square bounding box of the given full width around a centre point. */
export function boundsAround(
  lat: number,
  lng: number,
  spanKm: number,
): { north: number; south: number; east: number; west: number } {
  const halfLat = spanKm / 2 / 111.32;
  const halfLng = spanKm / 2 / (111.32 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return {
    north: lat + halfLat,
    south: lat - halfLat,
    east: lng + halfLng,
    west: lng - halfLng,
  };
}
