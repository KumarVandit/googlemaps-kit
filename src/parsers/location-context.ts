import { safeGet } from '../utils/safe-get.js';
import type { PbNode } from '../types/protobuf.js';
import type {
  AdminLevel,
  AdminRegion,
  AreaType,
  GeoArea,
} from '../types/location-context.js';

export function extractNearbyAreas(data: PbNode): GeoArea[] {
  const results: GeoArea[] = [];

  // Extract areas array from [1][0][*]
  const areasArray = safeGet<PbNode[]>(data, 1, 0);
  if (!Array.isArray(areasArray)) return results;

  for (const item of areasArray) {
    if (!Array.isArray(item)) continue;

    const area: GeoArea = {
      id: safeGet<string>(item, 0) ?? '',
      name: safeGet<string>(item, 1) ?? '',
      type: (safeGet<string>(item, 2) as AreaType) ?? 'region',
      lat: safeGet<number>(item, 3, 0) ?? 0,
      lng: safeGet<number>(item, 3, 1) ?? 0,
      distanceMeters: safeGet<number>(item, 4) ?? 0,
      bounds: safeGet<PbNode>(item, 5)
        ? {
            ne: {
              lat: safeGet<number>(item, 5, 0, 0) ?? 0,
              lng: safeGet<number>(item, 5, 0, 1) ?? 0,
            },
            sw: {
              lat: safeGet<number>(item, 5, 1, 0) ?? 0,
              lng: safeGet<number>(item, 5, 1, 1) ?? 0,
            },
          }
        : undefined,
      population: safeGet<number>(item, 6),
    };

    if (area.id) results.push(area);
  }

  return results;
}

export function extractAdminRegions(data: PbNode): AdminRegion[] {
  const results: AdminRegion[] = [];

  // Extract regions from nested structure [1][*]
  const regionsArray = safeGet<PbNode[]>(data, 1);
  if (!Array.isArray(regionsArray)) return results;

  for (const item of regionsArray) {
    if (!Array.isArray(item)) continue;

    const levelStr = safeGet<string>(item, 1);
    const level: AdminLevel =
      levelStr === 'country'
        ? 'country'
        : levelStr === 'state'
          ? 'state'
          : levelStr === 'county'
            ? 'county'
            : levelStr === 'city'
              ? 'city'
              : 'neighborhood';

    const region: AdminRegion = {
      name: safeGet<string>(item, 0) ?? '',
      type: level,
      code: safeGet<string>(item, 2),
      bounds: {
        ne: {
          lat: safeGet<number>(item, 3, 0, 0) ?? 0,
          lng: safeGet<number>(item, 3, 0, 1) ?? 0,
        },
        sw: {
          lat: safeGet<number>(item, 3, 1, 0) ?? 0,
          lng: safeGet<number>(item, 3, 1, 1) ?? 0,
        },
      },
    };

    results.push(region);
  }

  return results;
}
