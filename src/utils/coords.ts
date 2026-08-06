/**
 * Shared coordinate helpers — aliases between lat/lng and latitude/longitude.
 */

export interface CoordFields {
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
}

export interface CoordinatesLike {
  lat: number;
  lng: number;
}

/** Copy latitude↔lat and longitude↔lng so both spellings are populated. */
export function applyCoordAliases<T extends CoordFields>(obj: T): T {
  const lat = obj.lat ?? obj.latitude;
  const lng = obj.lng ?? obj.longitude;
  if (lat != null) {
    obj.lat = lat;
    obj.latitude = lat;
  }
  if (lng != null) {
    obj.lng = lng;
    obj.longitude = lng;
  }
  return obj;
}

/**
 * Normalize any coords-shaped object to `{ lat, lng }`.
 * Accepts `lat`/`lng` or `latitude`/`longitude`.
 */
export function toCoordinates(
  value: CoordFields | { lat: number; lng: number } | null | undefined,
): CoordinatesLike | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const lat =
    'lat' in value && typeof (value as { lat?: unknown }).lat === 'number'
      ? (value as { lat: number }).lat
      : (value as CoordFields).latitude;
  const lng =
    'lng' in value && typeof (value as { lng?: unknown }).lng === 'number'
      ? (value as { lng: number }).lng
      : (value as CoordFields).longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return undefined;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat, lng };
}
