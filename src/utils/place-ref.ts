/**
 * PlaceRef + route endpoint normalization (shared by Intent API and services).
 */

import type { Coordinates, LocationRef } from '../types/common.js';
import { GMapsError } from '../types/common.js';
import type { NormalizedPlaceRef, PlaceRef } from '../types/dx.js';
import { placeIdToFeatureId } from './ids.js';

const HEX_ID_RE = /^0x[0-9a-f]+:0x[0-9a-f]+$/i;
const PLACE_ID_RE = /^ChIJ[\w-]+$/;
/** Exact `lat,lng` text — not "Indiranagar, Bengaluru". */
const LAT_LNG_STRING_RE = /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/;

function tryPlaceIdToHex(placeId: string): string | undefined {
  try {
    return placeIdToFeatureId(placeId);
  } catch {
    return undefined;
  }
}

/**
 * Normalize a PlaceRef for service calls.
 * Accepts: hexId string, ChIJ placeId string, or object with hexId and/or placeId.
 */
export function normalizePlaceRef(ref: PlaceRef): NormalizedPlaceRef {
  if (typeof ref === 'string') {
    const trimmed = ref.trim();
    if (!trimmed) {
      throw new GMapsError('PlaceRef string must be a non-empty hexId or placeId');
    }
    if (HEX_ID_RE.test(trimmed)) {
      return { hexId: trimmed };
    }
    if (PLACE_ID_RE.test(trimmed)) {
      const hexId = tryPlaceIdToHex(trimmed);
      if (!hexId) {
        throw new GMapsError(`Could not convert placeId to hexId: ${trimmed}`);
      }
      return { hexId, placeId: trimmed };
    }
    throw new GMapsError(
      'PlaceRef string must be a hexId (0x…:0x…) or ChIJ placeId — got an unrecognized id',
    );
  }

  let hexId = ref.hexId?.trim();
  const placeId = ref.placeId?.trim();

  if (!hexId && placeId) {
    hexId = tryPlaceIdToHex(placeId);
    if (!hexId) {
      throw new GMapsError(
        `PlaceRef has placeId but could not convert to hexId: ${placeId}`,
      );
    }
  }

  if (!hexId) {
    throw new GMapsError(
      'PlaceRef requires hexId (0x…:0x…) or placeId (ChIJ…). ' +
        'If you called resolve(), check that the result includes hexId before profile/media/opinions.',
    );
  }

  return {
    hexId,
    name: ref.name,
    lat: ref.lat ?? ref.latitude,
    lng: ref.lng ?? ref.longitude,
    placeId: placeId ?? ref.placeId,
    ftid: ref.ftid,
    reviewCount: ref.reviewCount,
  };
}

/** Resolve route endpoint: address string, coords, or PlaceRef with coords. */
export function resolveRouteEndpoint(
  value: string | Coordinates | PlaceRef | CoordLoose,
): string | Coordinates {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (HEX_ID_RE.test(trimmed)) {
      throw new GMapsError(
        'Route endpoint cannot be a bare hexId — pass { lat, lng }, a PlaceRef with coords, or an address string',
      );
    }
    if (PLACE_ID_RE.test(trimmed)) {
      throw new GMapsError(
        'Route endpoint cannot be a bare placeId — pass { lat, lng } or an address string',
      );
    }
    return value;
  }

  if (typeof value === 'object' && value !== null && 'hexId' in value && value.hexId) {
    const place = normalizePlaceRef(value as PlaceRef);
    if (place.lat == null || place.lng == null) {
      throw new GMapsError(
        'PlaceRef route endpoint requires lat/lng (or latitude/longitude). Profile the place first or pass an address.',
      );
    }
    return { lat: place.lat, lng: place.lng };
  }

  const coords = toCoordinates(value as CoordLoose);
  if (coords) return coords;

  throw new GMapsError(
    'Invalid route endpoint — expected address string, { lat, lng }, or PlaceRef with coordinates',
  );
}

type CoordLoose = {
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
};

/**
 * Parse `"12.98,77.64"` into coords. Place names return undefined.
 */
export function parseLatLngString(value: string): Coordinates | undefined {
  const trimmed = value.trim();
  if (!LAT_LNG_STRING_RE.test(trimmed)) return undefined;
  const [lat, lng] = trimmed.split(',').map((s) => Number(s.trim()));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat: lat!, lng: lng! };
}

/**
 * Resolve a bias center. Coords and `"lat,lng"` strings are sync;
 * place names call `geocode` and use the first hit.
 */
export async function resolveBiasCenter(
  value: LocationRef | CoordLoose | null | undefined,
  geocode: (query: string) => Promise<Coordinates | null>,
): Promise<Coordinates> {
  if (value == null || value === '') {
    throw new GMapsError(
      'Search requires a bias center — pass near: { lat, lng } or a place name',
    );
  }
  if (typeof value === 'string') {
    const parsed = parseLatLngString(value);
    if (parsed) return parsed;
    const hit = await geocode(value.trim());
    if (!hit) {
      throw new GMapsError(
        `Could not geocode near "${value.trim()}" — pass lat,lng or a more specific place name`,
      );
    }
    return hit;
  }
  const coords = toCoordinates(value);
  if (!coords) {
    throw new GMapsError(
      'Search requires a bias center — pass near: { lat, lng } or a place name',
    );
  }
  return coords;
}

/**
 * Resolve search bias center from Intent (`near`) or service (`location`) spelling.
 * Sync — coords or `"lat,lng"` only. Place names need `resolveBiasCenter`.
 */
export function resolveSearchCenter(options: {
  near?: LocationRef | CoordLoose;
  location?: LocationRef | CoordLoose;
}): Coordinates {
  const raw = options.near ?? options.location;
  if (typeof raw === 'string') {
    const parsed = parseLatLngString(raw);
    if (parsed) return parsed;
    throw new GMapsError(
      'Place names as near/location must be geocoded (resolveBiasCenter). Pass { lat, lng } into resolveSearchCenter.',
    );
  }
  const coords = toCoordinates(raw);
  if (!coords) {
    throw new GMapsError(
      'Search requires a bias center — pass near: { lat, lng } (Intent) or location: { lat, lng } (search service)',
    );
  }
  return coords;
}

/**
 * Resolve directions endpoints from Intent (`from`/`to`) or service (`origin`/`destination`).
 */
export function resolveDirectionsEndpoints(options: {
  from?: string | Coordinates | PlaceRef;
  to?: string | Coordinates | PlaceRef;
  origin?: string | Coordinates | PlaceRef;
  destination?: string | Coordinates | PlaceRef;
}): { origin: string | Coordinates; destination: string | Coordinates } {
  const originRaw = options.from ?? options.origin;
  const destRaw = options.to ?? options.destination;
  if (originRaw == null || destRaw == null) {
    throw new GMapsError(
      'Directions require from/to (Intent) or origin/destination (directions service)',
    );
  }
  return {
    origin: resolveRouteEndpoint(originRaw),
    destination: resolveRouteEndpoint(destRaw),
  };
}

/**
 * Build a `google.com/maps/place/…` referer for a place name.
 *
 * Percent-encodes the name so non-ASCII titles (accents, CJK, Indic scripts)
 * cannot produce a header value `fetch` refuses to serialise as a ByteString.
 */
export function buildPlaceReferer(name?: string): string {
  if (!name) return 'https://www.google.com/maps/';
  const slug = encodeURIComponent(name.trim()).replace(/%20/g, '+');
  return `https://www.google.com/maps/place/${slug}/`;
}

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
  value: CoordFields | { lat: number; lng: number } | string | null | undefined,
): CoordinatesLike | undefined {
  if (typeof value === 'string') return parseLatLngString(value);
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

