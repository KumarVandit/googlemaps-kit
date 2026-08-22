import { safeGet } from '../utils/safe-get.js';
import type { LayerTileResult, SchoolMarker } from '../types/map-layers.js';
import type { PbNode } from '../types/protobuf.js';

export function parseLayerTile(buffer: Buffer, mimeType: string): LayerTileResult {
  return {
    data: buffer,
    mimeType,
    zoom: 0,
    x: 0,
    y: 0,
  };
}

export function extractSchools(data: PbNode): SchoolMarker[] {
  const results: SchoolMarker[] = [];

  const schoolsArray = safeGet<PbNode[]>(data, 1, 0);
  if (!Array.isArray(schoolsArray)) return results;

  for (const item of schoolsArray) {
    if (!Array.isArray(item)) continue;

    const typeStr = safeGet<string>(item, 2);
    const type: 'elementary' | 'middle' | 'high' | 'college' = typeStr === 'elementary'
      ? 'elementary'
      : typeStr === 'middle'
        ? 'middle'
        : typeStr === 'high'
          ? 'high'
          : typeStr === 'college'
            ? 'college'
            : 'elementary';

    const school: SchoolMarker = {
      id: safeGet<string>(item, 0) ?? '',
      name: safeGet<string>(item, 1) ?? '',
      type,
      lat: safeGet<number>(item, 3, 0) ?? 0,
      lng: safeGet<number>(item, 3, 1) ?? 0,
      rating: safeGet<number>(item, 4),
      reviews: safeGet<number>(item, 5),
    };

    if (school.id) results.push(school);
  }

  return results;
}
