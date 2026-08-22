import { safeGet } from '../utils/safe-get.js';
import type { EarthImageryResult, EarthTileResult } from '../types/map-earth.js';
import type { PbNode } from '../types/protobuf.js';

export function parseEarthTile(buffer: Buffer, tileData?: PbNode): EarthTileResult {
  let zoom = 0;
  let x = 0;
  let y = 0;
  let captureDate: Date | undefined;

  if (tileData) {
    zoom = safeGet<number>(tileData, 0) ?? 0;
    x = safeGet<number>(tileData, 1) ?? 0;
    y = safeGet<number>(tileData, 2) ?? 0;
    const captureMs = safeGet<number>(tileData, 3);
    if (captureMs) captureDate = new Date(captureMs);
  }

  return {
    data: buffer,
    zoom,
    x,
    y,
    captureDate,
  };
}

export function parseEarthImagery(buffer: Buffer, metadata?: PbNode): EarthImageryResult {
  let resolution: 'low' | 'medium' | 'high' = 'high';
  let lastUpdated = new Date();

  if (metadata) {
    const resStr = safeGet<string>(metadata, 0);
    resolution = resStr === 'low'
      ? 'low'
      : resStr === 'medium'
        ? 'medium'
        : 'high';

    const lastUpdateMs = safeGet<number>(metadata, 1);
    if (lastUpdateMs) lastUpdated = new Date(lastUpdateMs);
  }

  return {
    imagery: buffer,
    resolution,
    lastUpdated,
  };
}
