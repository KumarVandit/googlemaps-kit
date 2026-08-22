import { safeGet } from '../utils/safe-get.js';
import type { Building3d, Terrain3dResult } from '../types/map-3d.js';
import type { PbNode } from '../types/protobuf.js';

export function extract3dBuildings(data: PbNode): Building3d[] {
  const results: Building3d[] = [];

  const buildingsArray = safeGet<PbNode[]>(data, 1, 0);
  if (!Array.isArray(buildingsArray)) return results;

  for (const item of buildingsArray) {
    if (!Array.isArray(item)) continue;

    const outline: Array<{ lat: number; lng: number }> = [];
    const polygonArray = safeGet<PbNode[]>(item, 3);
    if (Array.isArray(polygonArray)) {
      for (const point of polygonArray) {
        if (Array.isArray(point)) {
          const lat = safeGet<number>(point, 0);
          const lng = safeGet<number>(point, 1);
          if (lat != null && lng != null) {
            outline.push({ lat, lng });
          }
        }
      }
    }

    const building: Building3d = {
      id: safeGet<string>(item, 0) ?? '',
      outline,
      height: safeGet<number>(item, 1) ?? 0,
      centerLat: safeGet<number>(item, 2, 0) ?? 0,
      centerLng: safeGet<number>(item, 2, 1) ?? 0,
      color: safeGet<string>(item, 4),
      address: safeGet<string>(item, 5),
      buildingType: safeGet<string>(item, 6),
    };

    if (building.id) results.push(building);
  }

  return results;
}

export function extract3dTerrain(data: PbNode, format: 'obj' | 'gltf' | 'ply' = 'gltf'): Terrain3dResult {
  const meshData = safeGet<string | Buffer>(data, 1);
  let mesh: any = Buffer.alloc(0);

  if (meshData) {
    if (typeof meshData === 'string') {
      mesh = Buffer.from(meshData, 'base64') as any;
    } else if (Buffer.isBuffer(meshData)) {
      mesh = meshData as any;
    }
  }

  return {
    mesh: mesh as Buffer,
    format,
    bounds: {
      ne: {
        lat: safeGet<number>(data, 2, 0, 0) ?? 0,
        lng: safeGet<number>(data, 2, 0, 1) ?? 0,
      },
      sw: {
        lat: safeGet<number>(data, 2, 1, 0) ?? 0,
        lng: safeGet<number>(data, 2, 1, 1) ?? 0,
      },
    },
  };
}
