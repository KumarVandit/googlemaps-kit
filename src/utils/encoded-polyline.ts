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
