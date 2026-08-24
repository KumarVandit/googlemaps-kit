import { describe, it, expect, vi } from 'vitest';
import { Map3dService } from '../../src/services/map-3d.js';
import { HttpClient } from '../../src/client/http-client.js';
import { GMapsError } from '../../src/types/common.js';
import { latLngToEcef, EARTH_RADIUS_METERS } from '../../src/rpc/earth-rocktree.js';

/** A synthetic Earth octree: one node holding a flat plate with a box on it. */
function varint(value: number): number[] {
  const out: number[] = [];
  let v = value;
  do {
    let byte = v % 128;
    v = Math.floor(v / 128);
    if (v > 0) byte |= 0x80;
    out.push(byte);
  } while (v > 0);
  return out;
}

const tag = (field: number, wire: number) => varint(field * 8 + wire);
const varintField = (field: number, value: number) => [...tag(field, 0), ...varint(value)];
const bytesField = (field: number, value: ArrayLike<number>) => [
  ...tag(field, 2),
  ...varint(value.length),
  ...Array.from(value),
];
function floatField(field: number, value: number): number[] {
  const buf = Buffer.alloc(4);
  buf.writeFloatLE(value);
  return [...tag(field, 5), ...buf];
}
function doubles(values: number[]): Buffer {
  const buf = Buffer.alloc(values.length * 8);
  values.forEach((v, i) => buf.writeDoubleLE(v, i * 8));
  return buf;
}
function floats(values: number[]): Buffer {
  const buf = Buffer.alloc(values.length * 4);
  values.forEach((v, i) => buf.writeFloatLE(v, i * 4));
  return buf;
}

const CENTER = { lat: 37.775, lng: -122.419 };
const NODE_MPT = 1;

/** path_and_flags: level-1 bits, then one octal digit per level, then flags. */
function packPath(path: string, flags: number): number {
  let bits = 0;
  for (let i = 0; i < path.length; i++) bits |= Number(path[i]) << (3 * i);
  return (path.length - 1) | (bits << 2) | (flags << (2 + 3 * path.length));
}

/** Axis-aligned OBB (zero Euler angles decode to the identity rotation). */
function packObb(center: number[], extents: number[], metersPerTexel: number): Buffer {
  const buf = Buffer.alloc(15);
  for (let i = 0; i < 3; i++) buf.writeInt16LE(Math.round(center[i]! / metersPerTexel), i * 2);
  for (let i = 0; i < 3; i++) buf.writeUInt8(Math.min(255, Math.round(extents[i]! / metersPerTexel)), 6 + i);
  return buf;
}

function planetoidMetadata(epoch: number): Uint8Array {
  return new Uint8Array([
    ...bytesField(1, varintField(2, epoch)),
    ...floatField(2, EARTH_RADIUS_METERS),
  ]);
}

/**
 * One level-1 node. Its OBB is huge so any probe inside the test bounds lands
 * in it; `metersPerTexel` is already at target so descent stops immediately.
 */
function bulkMetadata(epoch: number): Uint8Array {
  const center = latLngToEcef(CENTER.lat, CENTER.lng);
  // Centres are int16 deltas off the bulk's head-node centre, so the head
  // carries the magnitude and the node itself sits at delta zero.
  const node = [
    ...varintField(1, packPath('0', 0)),
    ...bytesField(3, packObb([0, 0, 0], [200, 200, 200], NODE_MPT)),
    ...floatField(4, NODE_MPT),
  ];
  return new Uint8Array([
    ...bytesField(1, node),
    ...bytesField(2, varintField(2, epoch)),
    ...bytesField(3, doubles(center)),
    ...bytesField(4, floats([NODE_MPT, NODE_MPT, NODE_MPT, NODE_MPT])),
    ...varintField(5, 1030),
    ...varintField(6, 1),
  ]);
}

/**
 * A 60 m plate at 10 m altitude with a 20 m cube standing on it, expressed in
 * the delta-packed byte cube the renderer expects.
 */
function nodeData(): Uint8Array {
  const grid = 12;
  const positions: Array<[number, number, number]> = [];
  const local: Array<[number, number]> = [];
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      positions.push([col * 20, row * 20, 0]);
      local.push([col, row]);
    }
  }
  // The raised block occupies the middle quarter of the plate.
  const heights = positions.map((_, i) => {
    const [col, row] = local[i]!;
    return col >= 4 && col <= 7 && row >= 4 && row <= 7 ? 60 : 0;
  });

  const count = positions.length;
  const packed = Buffer.alloc(count * 3);
  let px = 0;
  let py = 0;
  let pz = 0;
  positions.forEach(([x, y], i) => {
    const vx = Math.round(x / 20) * 20;
    const vy = Math.round(y / 20) * 20;
    const vz = heights[i]!;
    packed[i] = (vx - px) & 0xff;
    packed[count + i] = (vy - py) & 0xff;
    packed[2 * count + i] = (vz - pz) & 0xff;
    px = vx;
    py = vy;
    pz = vz;
  });

  // Row-major triangle strip across the grid, stored as high-water-mark deltas.
  const strip: number[] = [];
  for (let row = 0; row + 1 < grid; row++) {
    for (let col = 0; col < grid; col++) {
      strip.push(row * grid + col, (row + 1) * grid + col);
    }
  }
  const indexBytes: number[] = [...varint(strip.length)];
  let zeros = 0;
  const emitted = new Set<number>();
  for (const index of strip) {
    if (!emitted.has(index)) {
      // A zero delta introduces the next never-seen vertex, in order.
      indexBytes.push(...varint(0));
      emitted.add(index);
      zeros++;
    } else {
      indexBytes.push(...varint(zeros - index));
    }
  }

  // Mesh space is metres east/north/up around the node centre; the matrix
  // rotates that into earth-centred coordinates.
  const lat = (CENTER.lat * Math.PI) / 180;
  const lng = (CENTER.lng * Math.PI) / 180;
  const east = [-Math.sin(lng), Math.cos(lng), 0];
  const north = [-Math.sin(lat) * Math.cos(lng), -Math.sin(lat) * Math.sin(lng), Math.cos(lat)];
  const up = [Math.cos(lat) * Math.cos(lng), Math.cos(lat) * Math.sin(lng), Math.sin(lat)];
  const origin = latLngToEcef(CENTER.lat, CENTER.lng, 10);
  const shift = [origin[0] - 120 * east[0]! - 120 * north[0]!, origin[1] - 120 * east[1]! - 120 * north[1]!, origin[2] - 120 * east[2]! - 120 * north[2]!];
  const matrix = doubles([
    east[0]!, east[1]!, east[2]!, 0,
    north[0]!, north[1]!, north[2]!, 0,
    up[0]!, up[1]!, up[2]!, 0,
    shift[0]!, shift[1]!, shift[2]!, 1,
  ]);

  const texture = [
    ...bytesField(1, Buffer.from([0xff, 0xd8, 0xff, 0xe0])),
    ...varintField(2, 1),
    ...varintField(3, 512),
    ...varintField(4, 512),
  ];
  const mesh = [
    ...bytesField(1, packed),
    ...bytesField(3, Buffer.from(indexBytes)),
    ...bytesField(6, texture),
  ];
  return new Uint8Array([...bytesField(1, matrix), ...bytesField(2, mesh)]);
}

function stubOctree(http: HttpClient, options: { coverage?: boolean } = {}): void {
  vi.spyOn(http, 'getBytes').mockImplementation(async (url: string) => {
    const reply = (bytes: Uint8Array) => ({ bytes, contentType: 'application/x-protobuffer' });
    if (url.includes('/PlanetoidMetadata')) return reply(planetoidMetadata(1013));
    if (options.coverage === false) throw new Error('HTTP 404');
    if (url.includes('/BulkMetadata/')) return reply(bulkMetadata(1013));
    if (url.includes('/NodeData/')) return reply(nodeData());
    throw new Error(`unexpected url ${url}`);
  });
}

const bounds = {
  ne: { lat: CENTER.lat + 0.0009, lng: CENTER.lng + 0.0011 },
  sw: { lat: CENTER.lat - 0.0009, lng: CENTER.lng - 0.0011 },
};

describe('Map3dService', () => {
  describe('getMesh', () => {
    it('returns mesh tiles decoded from the Earth octree', async () => {
      const http = new HttpClient({ config: {} });
      stubOctree(http);
      const result = await new Map3dService(http, {}).getMesh({ bounds });

      expect(result.tiles.length).toBeGreaterThan(0);
      expect(result.vertexCount).toBe(144);
      expect(result.triangleCount).toBeGreaterThan(0);
      expect(result.attribution).toMatch(/Google/);
    });

    it('places decoded vertices at the requested location', async () => {
      const http = new HttpClient({ config: {} });
      stubOctree(http);
      const result = await new Map3dService(http, {}).getMesh({ bounds });
      const tile = result.tiles[0]!;

      expect(tile.bounds.sw.lat).toBeCloseTo(CENTER.lat - 0.00108, 3);
      expect(tile.bounds.ne.lat).toBeCloseTo(CENTER.lat + 0.00108, 3);
      expect(tile.bounds.sw.lng).toBeCloseTo(CENTER.lng - 0.00136, 3);
    });

    it('recovers the encoded heights', async () => {
      const http = new HttpClient({ config: {} });
      stubOctree(http);
      const result = await new Map3dService(http, {}).getMesh({ bounds });
      const alts = result.tiles.flatMap((t) => t.vertices.map((v) => v.alt));

      expect(Math.min(...alts)).toBeCloseTo(10, 0);
      expect(Math.max(...alts)).toBeCloseTo(70, 0);
    });

    it('omits texture bytes unless asked', async () => {
      const http = new HttpClient({ config: {} });
      stubOctree(http);
      const service = new Map3dService(http, {});
      const plain = await service.getMesh({ bounds });
      expect(plain.tiles[0]!.texture).toBeNull();

      const http2 = new HttpClient({ config: {} });
      stubOctree(http2);
      const withTexture = await new Map3dService(http2, {}).getMesh({
        bounds,
        includeTextures: true,
      });
      expect(withTexture.tiles[0]!.texture).toMatchObject({
        format: 'jpeg',
        width: 512,
        height: 512,
      });
    });

    it('fails loudly where the octree publishes nothing', async () => {
      const http = new HttpClient({ config: {} });
      stubOctree(http, { coverage: false });
      await expect(new Map3dService(http, {}).getMesh({ bounds })).rejects.toThrow(GMapsError);
      await expect(new Map3dService(http, {}).getMesh({ bounds })).rejects.toThrow(
        /No photorealistic 3D coverage/,
      );
    });
  });

  describe('getTerrain', () => {
    it('samples the mesh into a height grid', async () => {
      const http = new HttpClient({ config: {} });
      stubOctree(http);
      const terrain = await new Map3dService(http, {}).getTerrain({ bounds, resolution: 'high' });

      expect(terrain.format).toBe('obj');
      expect(terrain.grid.stepMeters).toBe(8);
      expect(terrain.grid.heights).toHaveLength(terrain.grid.cols * terrain.grid.rows);
      expect(terrain.grid.heights.some((h) => h !== null)).toBe(true);
      expect(terrain.maxAlt).toBeGreaterThan(terrain.minAlt);
    });

    it('emits a Wavefront OBJ of the sampled surface', async () => {
      const http = new HttpClient({ config: {} });
      stubOctree(http);
      const terrain = await new Map3dService(http, {}).getTerrain({ bounds });
      const text = terrain.mesh.toString('utf8');
      expect(text).toMatch(/^v /m);
      expect(text).toMatch(/^f /m);
    });

    it('skips the OBJ when includeMesh is false', async () => {
      const http = new HttpClient({ config: {} });
      stubOctree(http);
      const terrain = await new Map3dService(http, {}).getTerrain({ bounds, includeMesh: false });
      expect(terrain.mesh).toHaveLength(0);
      expect(terrain.grid.heights.some((h) => h !== null)).toBe(true);
    });
  });

  describe('getBuildings', () => {
    it('segments the raised block out of the fused mesh', async () => {
      const http = new HttpClient({ config: {} });
      stubOctree(http);
      const buildings = await new Map3dService(http, {}).getBuildings({ bounds, minHeight: 10 });

      expect(buildings.length).toBeGreaterThan(0);
      const tallest = buildings[0]!;
      expect(tallest.height).toBeGreaterThan(40);
      expect(tallest.height).toBeLessThan(80);
      expect(tallest.outline.length).toBeGreaterThanOrEqual(3);
      expect(tallest.areaSqM).toBeGreaterThan(0);
      expect(tallest.centerLat).toBeCloseTo(CENTER.lat, 2);
      expect(tallest.centerLng).toBeCloseTo(CENTER.lng, 2);
    });

    it('drops structures below minHeight', async () => {
      const http = new HttpClient({ config: {} });
      stubOctree(http);
      const buildings = await new Map3dService(http, {}).getBuildings({ bounds, minHeight: 200 });
      expect(buildings).toEqual([]);
    });

    it('sorts by the requested key', async () => {
      const http = new HttpClient({ config: {} });
      stubOctree(http);
      const byArea = await new Map3dService(http, {}).getBuildings({
        bounds,
        minHeight: 10,
        sort: 'area',
      });
      for (let i = 1; i < byArea.length; i++) {
        expect(byArea[i - 1]!.areaSqM).toBeGreaterThanOrEqual(byArea[i]!.areaSqM);
      }
    });
  });

  describe('planets', () => {
    it('walks the requested planetoid and decodes against its reference radius', async () => {
      const http = new HttpClient({ config: {} });
      const urls: string[] = [];
      vi.spyOn(http, 'getBytes').mockImplementation(async (url: string) => {
        urls.push(url);
        const reply = (bytes: Uint8Array) => ({ bytes, contentType: 'application/x-protobuffer' });
        if (url.includes('/PlanetoidMetadata')) return reply(planetoidMetadata(209));
        if (url.includes('/BulkMetadata/')) return reply(bulkMetadata(209));
        if (url.includes('/NodeData/')) return reply(nodeData());
        throw new Error(`unexpected url ${url}`);
      });

      const result = await new Map3dService(http, {}).getMesh({ bounds, planet: 'mars' });

      expect(urls.some((u) => u.startsWith('https://kh.google.com/rt/mars/PlanetoidMetadata'))).toBe(true);
      expect(urls.every((u) => !u.startsWith('https://kh.google.com/rt/earth/'))).toBe(true);
      expect(result.tiles.length).toBeGreaterThan(0);
      expect(result.vertexCount).toBe(144);
    });

    it('caches planetoids separately so switching planets refetches', async () => {
      const http = new HttpClient({ config: {} });
      let planetoidFetches = 0;
      vi.spyOn(http, 'getBytes').mockImplementation(async (url: string) => {
        const reply = (bytes: Uint8Array) => ({ bytes, contentType: 'application/x-protobuffer' });
        if (url.includes('/PlanetoidMetadata')) {
          planetoidFetches++;
          return reply(planetoidMetadata(url.includes('/rt/mars/') ? 209 : 1013));
        }
        if (url.includes('/BulkMetadata/')) return reply(bulkMetadata(1013));
        if (url.includes('/NodeData/')) return reply(nodeData());
        throw new Error(`unexpected url ${url}`);
      });

      const service = new Map3dService(http, {});
      await service.getMesh({ bounds });
      await service.getMesh({ bounds }); // same planet: cached
      expect(planetoidFetches).toBe(1);

      await service.getMesh({ bounds, planet: 'mars' }); // different planet: fresh fetch
      expect(planetoidFetches).toBe(2);
    });

    it('rejects unsupported planets before any network call', async () => {
      const http = new HttpClient({ config: {} });
      const spy = vi.spyOn(http, 'getBytes');
      await expect(
        new Map3dService(http, {}).getMesh({
          bounds,
          planet: 'pluto' as never,
        }),
      ).rejects.toBeInstanceOf(GMapsError);
      expect(spy).not.toHaveBeenCalled();
    });

    it('throws a typed error instead of OOM when the terrain grid is absurd', async () => {
      const http = new HttpClient({ config: {} });
      stubOctree(http);
      await expect(
        new Map3dService(http, {}).getTerrain({
          bounds: { ne: { lat: 22.6, lng: 226.2 }, sw: { lat: 17.6, lng: 221.2 } },
          resolution: 'low',
          maxTiles: 4,
          planet: 'mars',
        }),
      ).rejects.toThrow(/terrain grid/);
    });
  });
});
