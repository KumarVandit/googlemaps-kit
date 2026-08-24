import { describe, expect, it } from 'vitest';
import {
  MINIMAL_PNG,
  PROTO_PREFIX,
  wrapInProtobuf,
} from '../../helpers/images.js';
import {
  findPngOffset,
  isPngBytes,
  readPngDimensions,
  unwrapTilePng,
} from '../../../src/parsers/tiles.js';
import {
  buildIconUrl,
  buildMapTilePb,
  buildMapTileUrl,
  buildProtoTileUrl,
  buildOverlayTilePb,
  buildOverlayTileUrl,
  DEFAULT_MAP_TILE_VERSION,
} from '../../../src/rpc/tile-builders.js';
import { webMercatorTile } from '../../../src/utils/geo.js';




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
    const url = buildProtoTileUrl({ z: 2, x: 1, y: 1 });
    expect(url).toBe(
      `https://www.google.com/maps/vt/proto?pb=${encodeURIComponent(
        buildMapTilePb({ z: 2, x: 1, y: 1 }),
      )}`,
    );
  });

  it('builds stream endpoint URL', () => {
    const url = buildProtoTileUrl({ z: 2, x: 1, y: 1, endpoint: 'stream' });
    expect(url).toMatch(/^https:\/\/www\.google\.com\/maps\/vt\/stream\?pb=/);
  });

  it('builds icon URL with default scale', () => {
    const url = buildIconUrl({ name: 'assets/icons/poi/tactile/pinlet-2-medium.png' });
    expect(url).toBe(
      'https://www.google.com/maps/vt/icon/name=assets/icons/poi/tactile/pinlet-2-medium.png?scale=2',
    );
  });
});

describe('overlay layer pb builders', () => {
  it('encodes hillshade as the shading descriptor (type 5)', () => {
    const pb = buildOverlayTilePb({ z: 12, x: 663, y: 1583, layer: 'hillshade' });
    expect(pb).toBe('!1m5!1m4!1i12!2i663!3i1583!4i256!2m2!1e5!2sshading');
  });

  it('encodes contours as the contours descriptor (type 6)', () => {
    const pb = buildOverlayTilePb({ z: 14, x: 2613, y: 6329, layer: 'contours' });
    expect(pb).toBe('!1m5!1m4!1i14!2i2613!3i6329!4i256!2m2!1e6!2scontours');
  });

  it('encodes the air quality heatmap as a named data layer (type 2)', () => {
    const pb = buildOverlayTilePb({ z: 9, x: 156, y: 78, layer: 'airQualityHeatmap' });
    expect(pb).toBe('!1m5!1m4!1i9!2i156!3i78!4i256!2m2!1e2!2sair-quality-heatmap');
  });

  it('builds overlay URLs on the proto endpoint', () => {
    const url = buildOverlayTileUrl({ z: 13, x: 331, y: 791, layer: 'contours' });
    expect(url).toBe(
      `https://www.google.com/maps/vt/proto?pb=${encodeURIComponent(
        buildOverlayTilePb({ z: 13, x: 331, y: 791, layer: 'contours' }),
      )}`,
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
