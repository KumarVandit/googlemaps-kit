/**
 * Web Mercator tile grid math for static map composition.
 *
 * Pixel coordinates use the same 256 px tile grid as Google Maps basemap tiles.
 * Fractional offsets within the origin tile centre the requested viewport.
 */

import { altitudeFromZoom } from './geo.js';

export const MAP_TILE_PX = 256;

/** World pixel position at a zoom level (top-left origin). */
export function latLngToWorldPixel(
  lat: number,
  lng: number,
  zoom: number,
): { x: number; y: number } {
  const scale = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * scale * MAP_TILE_PX,
    y:
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      scale *
      MAP_TILE_PX,
  };
}

/** Inverse of {@link latLngToWorldPixel}. */
export function worldPixelToLatLng(
  x: number,
  y: number,
  zoom: number,
): { lat: number; lng: number } {
  const scale = 2 ** zoom;
  const n = Math.PI - (2 * Math.PI * y) / (scale * MAP_TILE_PX);
  return {
    lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))),
    lng: (x / (scale * MAP_TILE_PX)) * 360 - 180,
  };
}

export interface TileGridPlan {
  zoom: number;
  /** Top-left corner of the output viewport in world pixels. */
  worldLeft: number;
  worldTop: number;
  outputWidth: number;
  outputHeight: number;
  /** Inclusive tile index range to fetch. */
  tileXStart: number;
  tileYStart: number;
  tileXEnd: number;
  tileYEnd: number;
  centerLat: number;
  centerLng: number;
}

/** Compute tile coverage for a centre-based viewport. */
export function planCenterViewport(params: {
  lat: number;
  lng: number;
  zoom: number;
  width: number;
  height: number;
  scale?: 1 | 2;
}): TileGridPlan {
  const scale = params.scale ?? 1;
  const effectiveZoom = params.zoom + (scale === 2 ? 1 : 0);
  const outputWidth = params.width * scale;
  const outputHeight = params.height * scale;

  const center = latLngToWorldPixel(params.lat, params.lng, effectiveZoom);
  const worldLeft = center.x - outputWidth / 2;
  const worldTop = center.y - outputHeight / 2;

  const tileXStart = Math.floor(worldLeft / MAP_TILE_PX);
  const tileYStart = Math.floor(worldTop / MAP_TILE_PX);
  const tileXEnd = Math.floor((worldLeft + outputWidth - 1) / MAP_TILE_PX);
  const tileYEnd = Math.floor((worldTop + outputHeight - 1) / MAP_TILE_PX);

  const centerLatLng = worldPixelToLatLng(
    worldLeft + outputWidth / 2,
    worldTop + outputHeight / 2,
    effectiveZoom,
  );

  return {
    zoom: effectiveZoom,
    worldLeft,
    worldTop,
    outputWidth,
    outputHeight,
    tileXStart,
    tileYStart,
    tileXEnd,
    tileYEnd,
    centerLat: centerLatLng.lat,
    centerLng: centerLatLng.lng,
  };
}

/** Pick the highest zoom whose tile span fits the pixel dimensions. */
export function zoomForBounds(
  sw: { lat: number; lng: number },
  ne: { lat: number; lng: number },
  width: number,
  height: number,
  scale: 1 | 2 = 1,
): number {
  const outputWidth = width * scale;
  const outputHeight = height * scale;
  const minLat = Math.min(sw.lat, ne.lat);
  const maxLat = Math.max(sw.lat, ne.lat);
  const minLng = Math.min(sw.lng, ne.lng);
  const maxLng = Math.max(sw.lng, ne.lng);

  for (let z = 21; z >= 0; z--) {
    const swPx = latLngToWorldPixel(minLat, minLng, z);
    const nePx = latLngToWorldPixel(maxLat, maxLng, z);
    const spanX = Math.abs(nePx.x - swPx.x);
    const spanY = Math.abs(nePx.y - swPx.y);
    if (spanX <= outputWidth && spanY <= outputHeight) {
      return z - (scale === 2 ? 1 : 0);
    }
  }
  return 0;
}

/** Compute tile coverage fitting a lat/lng bounding box. */
export function planBoundsViewport(params: {
  sw: { lat: number; lng: number };
  ne: { lat: number; lng: number };
  width: number;
  height: number;
  scale?: 1 | 2;
}): TileGridPlan {
  const scale = params.scale ?? 1;
  const zoom = zoomForBounds(params.sw, params.ne, params.width, params.height, scale);
  const centerLat = (params.sw.lat + params.ne.lat) / 2;
  const centerLng = (params.sw.lng + params.ne.lng) / 2;
  return planCenterViewport({
    lat: centerLat,
    lng: centerLng,
    zoom,
    width: params.width,
    height: params.height,
    scale,
  });
}

/** Convert lat/lng to pixel coordinates within a planned viewport. */
export function latLngToViewportPixel(
  lat: number,
  lng: number,
  plan: TileGridPlan,
): { x: number; y: number } {
  const world = latLngToWorldPixel(lat, lng, plan.zoom);
  return {
    x: Math.round(world.x - plan.worldLeft),
    y: Math.round(world.y - plan.worldTop),
  };
}

/** Viewport altitude (`!1d`) for embed pb builders. */
export function viewportAltitude(lat: number, zoom: number): number {
  return altitudeFromZoom(zoom, lat);
}
