import { describe, expect, it } from 'vitest';
import {
  findPngOffset,
  isPngBytes,
  readPngDimensions,
  unwrapTilePng,
} from '../src/parsers/tiles.js';
import {
  buildIconUrl,
  buildMapTilePb,
  buildMapTileUrl,
  DEFAULT_MAP_TILE_VERSION,
} from '../src/rpc/tiles-pb.js';
import { webMercatorTile } from '../src/utils/geo.js';

/** Minimal valid 1×1 RGB PNG (IHDR + IDAT + IEND). */
const MINIMAL_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1×1
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
  0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
  0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00,
  0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb4,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, // IEND chunk
  0xae, 0x42, 0x60, 0x82,
]);

/** Simulated protobuf header prefix observed on live vt/proto responses. */
const PROTO_PREFIX = new Uint8Array([0x0a, 0x80, 0x01, 0x1a, 0x80, 0x01]);

function wrapInProtobuf(png: Uint8Array): Uint8Array {
  const wrapped = new Uint8Array(PROTO_PREFIX.length + png.length);
  wrapped.set(PROTO_PREFIX, 0);
  wrapped.set(png, PROTO_PREFIX.length);
  return wrapped;
}

describe('map tile pb builders', () => {
  it('builds the verified Bangalore z14 pb string', () => {
    const { x, y } = webMercatorTile(12.9168, 77.645, 14);
    const pb = buildMapTilePb({ z: 14, x, y });
    expect(pb).toBe(
      `!1m5!1m4!1i14!2i${x}!3i${y}!4i256!2m3!1e0!2sm!3i${DEFAULT_MAP_TILE_VERSION}`,
    );
  });

  it('builds pb with explicit 256px tile size', () => {
    const pb = buildMapTilePb({ z: 12, x: 100, y: 200, size: 256 });
    expect(pb).toContain('!4i256');
    expect(pb).toContain('!1i12!2i100!3i200');
  });

  it('builds proto URL with encoded pb', () => {
    const url = buildMapTileUrl({ z: 2, x: 1, y: 1 });
    expect(url).toBe(
      `https://www.google.com/maps/vt/proto?pb=${encodeURIComponent(
        buildMapTilePb({ z: 2, x: 1, y: 1 }),
      )}`,
    );
  });

  it('builds stream endpoint URL', () => {
    const url = buildMapTileUrl({ z: 2, x: 1, y: 1, endpoint: 'stream' });
    expect(url).toMatch(/^https:\/\/www\.google\.com\/maps\/vt\/stream\?pb=/);
  });

  it('builds icon URL with default scale', () => {
    const url = buildIconUrl({ name: 'assets/icons/poi/tactile/pinlet-2-medium.png' });
    expect(url).toBe(
      'https://www.google.com/maps/vt/icon/name=assets/icons/poi/tactile/pinlet-2-medium.png?scale=2',
    );
  });
});

describe('web mercator tile math', () => {
  it('computes world tile at z2 near (0,0)', () => {
    expect(webMercatorTile(0, 0, 2)).toEqual({ x: 2, y: 2 });
  });

  it('computes Bangalore tile at z14', () => {
    const { x, y } = webMercatorTile(12.9168, 77.645, 14);
    expect(x).toBe(11725);
    expect(y).toBe(7599);
  });

  it('computes NYC tile at z12', () => {
    const { x, y } = webMercatorTile(40.758, -73.9855, 12);
    expect(x).toBe(1206);
    expect(y).toBe(1539);
  });

  it('computes Paris tile at z17', () => {
    const { x, y } = webMercatorTile(48.8584, 2.2945, 17);
    expect(x).toBe(66371);
    expect(y).toBe(45091);
  });

  it('handles antimeridian edge at max longitude', () => {
    const { x, y } = webMercatorTile(0, 179.9, 10);
    expect(x).toBe(1023);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThan(1024);
  });

  it('handles north pole clamping (y=0 at high latitude)', () => {
    const { x, y } = webMercatorTile(85, 0, 5);
    expect(x).toBe(16);
    expect(y).toBe(0);
  });
});

describe('tile PNG envelope parser', () => {
  it('finds PNG offset after protobuf prefix', () => {
    const wrapped = wrapInProtobuf(MINIMAL_PNG);
    expect(findPngOffset(wrapped)).toBe(PROTO_PREFIX.length);
  });

  it('unwraps protobuf envelope to raw PNG bytes', () => {
    const wrapped = wrapInProtobuf(MINIMAL_PNG);
    const png = unwrapTilePng(wrapped);
    expect(png).not.toBeNull();
    expect(png!.length).toBe(MINIMAL_PNG.length);
    expect(png![0]).toBe(0x89);
    expect(png!.slice(-8)).toEqual(MINIMAL_PNG.slice(-8));
  });

  it('reads IHDR dimensions from raw PNG', () => {
    const dims = readPngDimensions(MINIMAL_PNG);
    expect(dims).toEqual({ width: 1, height: 1 });
  });

  it('reads IHDR dimensions from unwrapped PNG', () => {
    const wrapped = wrapInProtobuf(MINIMAL_PNG);
    const png = unwrapTilePng(wrapped)!;
    expect(readPngDimensions(png)).toEqual({ width: 1, height: 1 });
  });

  it('returns null for buffers without PNG magic', () => {
    expect(unwrapTilePng(new Uint8Array([0, 1, 2, 3]))).toBeNull();
    expect(readPngDimensions(new Uint8Array([0, 1, 2, 3]))).toBeNull();
  });

  it('detects PNG in raw and wrapped buffers', () => {
    expect(isPngBytes(MINIMAL_PNG)).toBe(true);
    expect(isPngBytes(wrapInProtobuf(MINIMAL_PNG))).toBe(true);
    expect(isPngBytes(new Uint8Array([1, 2, 3]))).toBe(false);
  });
});
