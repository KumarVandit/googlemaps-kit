import type { Coordinates } from '../types/common.js';

/**
 * Decode Google's standard encoded polyline (precision 5).
 * Algorithm: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export function decodeEncodedPolyline(encoded: string, precision = 5): Coordinates[] {
  const coordinates: Coordinates[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const factor = 10 ** precision;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coordinates.push({ lat: lat / factor, lng: lng / factor });
  }

  return coordinates;
}

/** Encode coordinates to Google's standard encoded polyline (precision 5). */
export function encodePolyline(points: Coordinates[], precision = 5): string {
  const factor = 10 ** precision;
  let output = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const point of points) {
    const lat = Math.round(point.lat * factor);
    const lng = Math.round(point.lng * factor);
    output += encodeSigned(lat - prevLat);
    output += encodeSigned(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }

  return output;
}

function encodeSigned(value: number): string {
  let signed = value << 1;
  if (value < 0) signed = ~signed;
  return encodeUnsigned(signed);
}

function encodeUnsigned(value: number): string {
  let remaining = value;
  let output = '';

  while (remaining >= 0x20) {
    output += String.fromCharCode((0x20 | (remaining & 0x1f)) + 63);
    remaining >>= 5;
  }

  output += String.fromCharCode(remaining + 63);
  return output;
}

// ─── Human-readable helpers ────────────────────────────────────────────────

/**
 * Decode an encoded polyline string to an array of `{ lat, lng }` objects.
 * Alias of `decodeEncodedPolyline` with a friendlier name.
 *
 * @example
 * const path = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
 * // [{ lat: 38.5, lng: -120.2 }, { lat: 40.7, lng: -120.95 }, { lat: 43.252, lng: -126.453 }]
 */
export function decodePolyline(encoded: string): Coordinates[] {
  return decodeEncodedPolyline(encoded);
}

/**
 * Decode an encoded polyline and return an array of human-readable strings.
 * Each element is "lat, lng" rounded to 5 decimal places.
 *
 * @example
 * polylineToHumanPath('_p~iF~ps|U_ulLnnqC');
 * // ["38.50000, -120.20000", "40.70000, -120.95000"]
 */
export function polylineToHumanPath(encoded: string): string[] {
  return decodeEncodedPolyline(encoded).map(
    (p) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`,
  );
}

/**
 * Convert an encoded polyline (or a raw `Coordinates[]` path) to a GeoJSON LineString Feature.
 * The result is safe to stringify and pass to any GeoJSON consumer (Mapbox, Leaflet, turf, etc.).
 *
 * @example
 * const geojson = polylineToGeoJSON(route.polyline!);
 * // { type: 'Feature', geometry: { type: 'LineString', coordinates: [[lng, lat], ...] }, properties: {} }
 */
export function polylineToGeoJSON(
  encoded: string | Coordinates[],
): {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  properties: Record<string, never>;
} {
  const points = typeof encoded === 'string'
    ? decodeEncodedPolyline(encoded)
    : encoded;

  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      // GeoJSON uses [lng, lat] order
      coordinates: points.map((p) => [p.lng, p.lat]),
    },
    properties: {},
  };
}

/**
 * Summarize a polyline as a compact human-readable string showing the first point,
 * a middle sample, and the last point, plus total point count.
 *
 * @example
 * summarizePolyline(route.polyline!);
 * // "4 pts: (38.50000, -120.20000) → … → (43.25200, -126.45300)"
 */
export function summarizePolyline(encoded: string | Coordinates[]): string {
  const pts = typeof encoded === 'string'
    ? decodeEncodedPolyline(encoded)
    : encoded;

  if (pts.length === 0) return '(empty polyline)';
  if (pts.length === 1) {
    const p = pts[0]!;
    return `1 pt: (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})`;
  }

  const first = pts[0]!;
  const last  = pts[pts.length - 1]!;

  const fmt = (p: Coordinates) => `(${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})`;

  if (pts.length <= 3) {
    return `${pts.length} pts: ${pts.map(fmt).join(' → ')}`;
  }

  const mid = pts[Math.floor(pts.length / 2)]!;
  return `${pts.length} pts: ${fmt(first)} → ${fmt(mid)} → … → ${fmt(last)}`;
}
