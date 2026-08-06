/**
 * PlaceRef + route endpoint normalization (shared by Intent API and services).
 */

import type { Coordinates } from '../types/common.js';
import { GMapsError } from '../types/common.js';
import type { NormalizedPlaceRef, PlaceRef } from '../types/dx.js';
import { placeIdToFeatureId } from './ids.js';
import { toCoordinates } from './coords.js';

const HEX_ID_RE = /^0x[0-9a-f]+:0x[0-9a-f]+$/i;
const PLACE_ID_RE = /^ChIJ[\w-]+$/;

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
 * Resolve search bias center from Intent (`near`) or service (`location`) spelling.
 */
export function resolveSearchCenter(options: {
  near?: Coordinates | CoordLoose;
  location?: Coordinates | CoordLoose;
}): Coordinates {
  const coords = toCoordinates(options.near) ?? toCoordinates(options.location);
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
