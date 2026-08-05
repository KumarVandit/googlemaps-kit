import { describe, expect, it } from 'vitest';
import {
  createRgbaCanvas,
  cropRgba,
  decodePng,
  encodePng,
  pixelVariance,
} from '../src/utils/png.js';
import {
  latLngToWorldPixel,
  planBoundsViewport,
  planCenterViewport,
  worldPixelToLatLng,
  zoomForBounds,
} from '../src/utils/static-map-grid.js';

/** Minimal valid 1×1 RGB PNG from tiles.test.ts. */
const MINIMAL_RGB_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
  0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54,
  0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00,
  0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb4,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
  0xae, 0x42, 0x60, 0x82,
]);

describe('PNG encode/decode round-trip', () => {
  it('round-trips a solid RGBA canvas', () => {
    const original = createRgbaCanvas(4, 3, [10, 20, 30, 255]);
    original.data[16] = 255;
    original.data[17] = 0;
    original.data[18] = 0;

    const encoded = encodePng(original);
    const decoded = decodePng(encoded);

    expect(decoded.width).toBe(4);
    expect(decoded.height).toBe(3);
    expect(decoded.data).toEqual(original.data);
  });

  it('decodes RGB PNG and promotes to RGBA', () => {
    const decoded = decodePng(MINIMAL_RGB_PNG);
    expect(decoded.width).toBe(1);
    expect(decoded.height).toBe(1);
    expect(decoded.data[3]).toBe(255);
  });

  it('detects low variance on uniform images', () => {
    const uniform = createRgbaCanvas(32, 32, [200, 200, 200, 255]);
    expect(pixelVariance(uniform)).toBe(0);
  });

  it('detects high variance on varied images', () => {
    const varied = createRgbaCanvas(32, 32);
    for (let i = 0; i < varied.data.length; i += 4) {
      varied.data[i] = (i / 4) % 256;
    }
    expect(pixelVariance(varied)).toBeGreaterThan(100);
  });
});

describe('cropRgba', () => {
  it('extracts a sub-rectangle', () => {
    const src = createRgbaCanvas(4, 4, [0, 0, 0, 255]);
    const idx = (1 * 4 + 1) * 4;
    src.data[idx] = 255;
    src.data[idx + 1] = 0;
    src.data[idx + 2] = 0;

    const cropped = cropRgba(src, 1, 1, 2, 2);
    expect(cropped.width).toBe(2);
    expect(cropped.height).toBe(2);
    expect(cropped.data[0]).toBe(255);
  });
});

describe('static map grid math', () => {
  it('centres the viewport on the requested lat/lng', () => {
    const plan = planCenterViewport({
      lat: 12.9121263,
      lng: 77.6499775,
      zoom: 14,
      width: 400,
      height: 300,
    });

    expect(plan.outputWidth).toBe(400);
    expect(plan.outputHeight).toBe(300);
    expect(plan.centerLat).toBeCloseTo(12.9121263, 4);
    expect(plan.centerLng).toBeCloseTo(77.6499775, 4);

    const centrePx = latLngToWorldPixel(12.9121263, 77.6499775, plan.zoom);
    expect(centrePx.x - plan.worldLeft).toBeCloseTo(200, 0);
    expect(centrePx.y - plan.worldTop).toBeCloseTo(150, 0);
  });

  it('doubles output dimensions at scale 2', () => {
    const plan = planCenterViewport({
      lat: 40.758,
      lng: -73.9855,
      zoom: 15,
      width: 200,
      height: 200,
      scale: 2,
    });
    expect(plan.outputWidth).toBe(400);
    expect(plan.outputHeight).toBe(400);
    expect(plan.zoom).toBe(16);
  });

  it('limits tile count for modest viewports', () => {
    const plan = planCenterViewport({
      lat: 0,
      lng: 0,
      zoom: 10,
      width: 512,
      height: 512,
    });
    const tilesX = plan.tileXEnd - plan.tileXStart + 1;
    const tilesY = plan.tileYEnd - plan.tileYStart + 1;
    expect(tilesX * tilesY).toBeLessThanOrEqual(9);
  });

  it('round-trips world pixel projection', () => {
    const lat = 48.8584;
    const lng = 2.2945;
    const zoom = 12;
    const px = latLngToWorldPixel(lat, lng, zoom);
    const back = worldPixelToLatLng(px.x, px.y, zoom);
    expect(back.lat).toBeCloseTo(lat, 5);
    expect(back.lng).toBeCloseTo(lng, 5);
  });

  it('picks a zoom that fits bounds in pixel dimensions', () => {
    const sw = { lat: 12.9, lng: 77.6 };
    const ne = { lat: 12.95, lng: 77.65 };
    const z = zoomForBounds(sw, ne, 400, 400);
    expect(z).toBeGreaterThan(10);
    expect(z).toBeLessThanOrEqual(21);

    const plan = planBoundsViewport({ sw, ne, width: 400, height: 400 });
    expect(plan.outputWidth).toBe(400);
    expect(plan.tileXEnd - plan.tileXStart).toBeLessThanOrEqual(4);
  });
});
