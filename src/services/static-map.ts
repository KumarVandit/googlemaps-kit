import { HttpClient } from '../client/http-client.js';
import { GMapsError, type GMapsConfig } from '../types/common.js';
import type {
  StaticMapBoundsOptions,
  StaticMapMarker,
  StaticMapOptions,
  StaticMapPath,
  StaticMapResult,
} from '../types/static-map.js';
import {
  blitRgba,
  createRgbaCanvas,
  cropRgba,
  decodePng,
  encodePng,
  type RgbaImage,
} from '../utils/png.js';
import { pooled, sleep } from '../utils/async.js';
import {
  latLngToViewportPixel,
  MAP_TILE_PX,
  planBoundsViewport,
  planCenterViewport,
  type TileGridPlan,
} from '../utils/static-map-grid.js';
import { TilesService } from './tiles.js';

const DEFAULT_CONCURRENCY = 8;
const DEFAULT_FETCH_DELAY_MS = 0;
const MAX_TILES = 25;

export class StaticMapService {
  private tiles: TilesService;
  private fetchDelayMs: number;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.tiles = new TilesService(http, config);
    this.fetchDelayMs = DEFAULT_FETCH_DELAY_MS;
  }

  /** Render a static map centred on lat/lng. */
  async getStaticMap(options: StaticMapOptions): Promise<StaticMapResult> {
    validateDimensions(options.width, options.height);
    const plan = planCenterViewport({
      lat: options.lat,
      lng: options.lng,
      zoom: options.zoom,
      width: options.width,
      height: options.height,
      scale: options.scale,
    });
    return this.renderPlan(plan, options);
  }

  /** Render a static map fitted to a bounding box. */
  async getStaticMapForBounds(options: StaticMapBoundsOptions): Promise<StaticMapResult> {
    validateDimensions(options.width, options.height);
    const plan = planBoundsViewport({
      sw: options.sw,
      ne: options.ne,
      width: options.width,
      height: options.height,
      scale: options.scale,
    });
    return this.renderPlan(plan, options);
  }

  private async renderPlan(
    plan: TileGridPlan,
    options: StaticMapOptions | StaticMapBoundsOptions,
  ): Promise<StaticMapResult> {
    const tileCount =
      (plan.tileXEnd - plan.tileXStart + 1) * (plan.tileYEnd - plan.tileYStart + 1);
    if (tileCount > MAX_TILES) {
      throw new GMapsError(
        `Static map requires ${tileCount} tiles (max ${MAX_TILES}) — reduce size or zoom`,
      );
    }

    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    const delayMs = options.fetchDelayMs ?? this.fetchDelayMs;

    const mosaicWidth = (plan.tileXEnd - plan.tileXStart + 1) * MAP_TILE_PX;
    const mosaicHeight = (plan.tileYEnd - plan.tileYStart + 1) * MAP_TILE_PX;
    const mosaicImage = createRgbaCanvas(mosaicWidth, mosaicHeight, [0xe8, 0xea, 0xe8, 255]);

    const tileCoords: Array<{ x: number; y: number }> = [];
    for (let ty = plan.tileYStart; ty <= plan.tileYEnd; ty++) {
      for (let tx = plan.tileXStart; tx <= plan.tileXEnd; tx++) {
        tileCoords.push({ x: tx, y: ty });
      }
    }

    let fetched = 0;
    await pooled(tileCoords, concurrency, async (coord) => {
      if (fetched > 0) await sleep(delayMs);
      const tile = await this.tiles.getTile({ z: plan.zoom, x: coord.x, y: coord.y });
      fetched++;
      const decoded = decodePng(tile.bytes);
      const dx = (coord.x - plan.tileXStart) * MAP_TILE_PX;
      const dy = (coord.y - plan.tileYStart) * MAP_TILE_PX;
      blitRgba(mosaicImage, decoded, dx, dy);
    });

    const cropX = Math.round(plan.worldLeft - plan.tileXStart * MAP_TILE_PX);
    const cropY = Math.round(plan.worldTop - plan.tileYStart * MAP_TILE_PX);
    let output = cropRgba(mosaicImage, cropX, cropY, plan.outputWidth, plan.outputHeight);

    if (options.path) {
      output = drawPath(output, options.path, plan);
    }
    if (options.markers) {
      for (const marker of options.markers) {
        output = drawMarker(output, marker, plan);
      }
    }

    const bytes = encodePng(output);
    return {
      bytes,
      width: plan.outputWidth,
      height: plan.outputHeight,
      zoom: plan.zoom,
      center: { lat: plan.centerLat, lng: plan.centerLng },
      tilesFetched: tileCoords.length,
    };
  }
}

function validateDimensions(width: number, height: number): void {
  if (width < 1 || height < 1 || width > 1280 || height > 1280) {
    throw new GMapsError('Static map width/height must be between 1 and 1280');
  }
}

function drawMarker(image: RgbaImage, marker: StaticMapMarker, plan: TileGridPlan): RgbaImage {
  const { x, y } = latLngToViewportPixel(marker.lat, marker.lng, plan);
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
    return image;
  }

  const style = marker.style ?? 'pin';
  const color = marker.color ?? [234, 67, 53, 255];

  if (style === 'circle') {
    const radius = marker.radius ?? 6;
    fillCircle(image, x, y, radius, color);
    return image;
  }

  fillCircle(image, x, y - 4, 7, color);
  fillCircle(image, x, y - 4, 5, [255, 255, 255, 255]);
  fillCircle(image, x, y - 4, 3, color);
  fillTriangle(image, x, y + 2, 6, color);
  return image;
}

function drawPath(image: RgbaImage, path: StaticMapPath, plan: TileGridPlan): RgbaImage {
  if (path.points.length < 2) return image;
  const color = path.color ?? [66, 133, 244, 255];
  const width = path.width ?? 3;

  for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1]!;
    const b = path.points[i]!;
    const p0 = latLngToViewportPixel(a.lat, a.lng, plan);
    const p1 = latLngToViewportPixel(b.lat, b.lng, plan);
    drawLine(image, p0.x, p0.y, p1.x, p1.y, width, color);
  }
  return image;
}

function fillCircle(
  image: RgbaImage,
  cx: number,
  cy: number,
  radius: number,
  color: [number, number, number, number],
): void {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      setPixel(image, cx + dx, cy + dy, color);
    }
  }
}

function fillTriangle(
  image: RgbaImage,
  cx: number,
  cy: number,
  halfWidth: number,
  color: [number, number, number, number],
): void {
  for (let row = 0; row <= halfWidth; row++) {
    const w = halfWidth - row;
    for (let dx = -w; dx <= w; dx++) {
      setPixel(image, cx + dx, cy + row, color);
    }
  }
}

function drawLine(
  image: RgbaImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  strokeWidth: number,
  color: [number, number, number, number],
): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  const half = Math.floor(strokeWidth / 2);

  while (true) {
    for (let oy = -half; oy <= half; oy++) {
      for (let ox = -half; ox <= half; ox++) {
        setPixel(image, x + ox, y + oy, color);
      }
    }
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

function setPixel(
  image: RgbaImage,
  x: number,
  y: number,
  color: [number, number, number, number],
): void {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const idx = (y * image.width + x) * 4;
  image.data[idx] = color[0];
  image.data[idx + 1] = color[1];
  image.data[idx + 2] = color[2];
  image.data[idx + 3] = color[3];
}
