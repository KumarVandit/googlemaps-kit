import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import { GMapsError } from '../../../src/types/common.js';

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

import {
  EARTH_RADIUS_METERS,
  NODE_FLAGS,
  ROCKTREE_PLANETS,
  bulkMetadataUrl,
  ecefToLatLng,
  latLngToEcef,
  nodeDataUrl,
  obbCentrality,
  obbContains,
  parseBulkMetadata,
  parseNodeData,
  parsePlanetoidMetadata,
  planetoidMetadataUrl,
  readFields,
  rocktreeBase,
  stripToTriangles,
} from '../../../src/rpc/earth-rocktree.js';

function fixture(name: string): Uint8Array {
  const raw = JSON.parse(readFileSync(`tests/fixtures/earth/${name}.json`, 'utf8')) as {
    base64: string;
  };
  return new Uint8Array(Buffer.from(raw.base64, 'base64'));
}

/**
 * Live captures from kh.google.com on 2026-08-23. The octree republishes with
 * new epochs, so these assert wire-format decoding, not current content.
 */
describe('earth rocktree wire format', () => {
  describe('URL builders', () => {
    it('encodes a bulk request as !1m2!1s{path}!2u{epoch}', () => {
      expect(bulkMetadataUrl('2052', 1013)).toBe(
        'https://kh.google.com/rt/earth/BulkMetadata/pb=!1m2!1s2052!2u1013',
      );
    });

    it('encodes the root bulk with an empty path', () => {
      expect(bulkMetadataUrl('', 1013)).toContain('!1s!2u1013');
    });

    it('omits the imagery epoch when the node does not request one', () => {
      const url = nodeDataUrl({ path: '3162', epoch: 1008, textureFormat: 1 });
      expect(url).toBe('https://kh.google.com/rt/earth/NodeData/pb=!1m2!1s3162!2u1008!2e1!4b0');
    });

    it('appends !3u when an imagery epoch is supplied', () => {
      const url = nodeDataUrl({ path: '3162', epoch: 1008, textureFormat: 1, imageryEpoch: 1030 });
      expect(url).toContain('!2e1!3u1030!4b0');
    });

    it('exposes the planetoid endpoint', () => {
      expect(planetoidMetadataUrl()).toBe('https://kh.google.com/rt/earth/PlanetoidMetadata');
    });
  });

  describe('parsePlanetoidMetadata', () => {
    it('reads the root epoch and planet radius', () => {
      const meta = parsePlanetoidMetadata(fixture('planetoid-metadata'));
      expect(meta.rootEpoch).toBeGreaterThan(0);
      expect(meta.radius).toBeCloseTo(EARTH_RADIUS_METERS, 0);
    });
  });

  describe('parseBulkMetadata', () => {
    const bulk = parseBulkMetadata(fixture('bulk-metadata-root'));

    it('reads the head node key', () => {
      expect(bulk.headPath).toBe('');
      expect(bulk.headEpoch).toBe(1013);
    });

    it('covers four octree levels below the head node', () => {
      const levels = new Set(bulk.nodes.map((n) => n.level));
      expect([...levels].sort()).toEqual([1, 2, 3, 4]);
    });

    it('unpacks octant paths one digit per level', () => {
      for (const node of bulk.nodes) {
        expect(node.path).toHaveLength(node.level);
        expect(node.path).toMatch(/^[0-7]+$/);
      }
    });

    it('gives every node an oriented bounding box', () => {
      for (const node of bulk.nodes) {
        expect(node.center).not.toBeNull();
        expect(node.extents).not.toBeNull();
        expect(node.rotation).toHaveLength(9);
      }
    });

    it('places node centres near the surface of the globe', () => {
      for (const node of bulk.nodes.filter((n) => n.level === 4)) {
        const r = Math.hypot(...(node.center as [number, number, number]));
        // Level-4 boxes are hundreds of km across, so the centre sits well
        // inside the sphere — but nowhere near its core.
        expect(r).toBeGreaterThan(EARTH_RADIUS_METERS * 0.5);
        expect(r).toBeLessThan(EARTH_RADIUS_METERS * 1.1);
      }
    });

    it('shrinks metres-per-texel with depth', () => {
      const byLevel = (level: number) =>
        bulk.nodes.filter((n) => n.level === level).map((n) => n.metersPerTexel);
      expect(Math.max(...byLevel(4))).toBeLessThan(Math.min(...byLevel(1)));
    });

    it('marks metadata-only nodes with the NO_DATA flag', () => {
      const noData = bulk.nodes.filter((n) => (n.flags & NODE_FLAGS.NO_DATA) !== 0);
      expect(noData.length).toBeGreaterThan(0);
      for (const node of noData) expect(node.hasData).toBe(false);
    });

    it('defaults a missing child-bulk epoch to the head epoch', () => {
      for (const node of bulk.nodes) {
        expect(node.bulkMetadataEpoch).toBeGreaterThan(0);
      }
    });
  });

  describe('oriented bounding boxes', () => {
    const bulk = parseBulkMetadata(fixture('bulk-metadata-root'));
    const sanFrancisco = latLngToEcef(37.7749, -122.4194);

    it('finds a containing node at every level down to four', () => {
      for (let level = 1; level <= 4; level++) {
        const hits = bulk.nodes.filter((n) => n.level === level && obbContains(n, sanFrancisco));
        expect(hits.length).toBeGreaterThan(0);
      }
    });

    it('descends the path 2 -> 20 -> 205 -> 2052 for San Francisco', () => {
      let path = '';
      for (let level = 1; level <= 4; level++) {
        const hits = bulk.nodes
          .filter((n) => n.level === level && n.path.startsWith(path) && obbContains(n, sanFrancisco))
          .sort((a, b) => obbCentrality(a, sanFrancisco) - obbCentrality(b, sanFrancisco));
        expect(hits[0]).toBeDefined();
        path = hits[0]!.path;
      }
      expect(path).toBe('2052');
    });

    it('rejects a point on the far side of the globe', () => {
      const antipode = latLngToEcef(-37.7749, 57.5806);
      const node = bulk.nodes.find((n) => n.path === '2052')!;
      expect(obbContains(node, antipode)).toBe(false);
    });
  });

  describe('coordinate round trip', () => {
    it('recovers lat/lng/alt from earth-centred metres', () => {
      for (const [lat, lng, alt] of [
        [37.7749, -122.4194, 0],
        [51.5074, -0.1278, 120],
        [-33.8688, 151.2093, -15],
        [0, 0, 0],
      ] as Array<[number, number, number]>) {
        const back = ecefToLatLng(latLngToEcef(lat, lng, alt));
        expect(back.lat).toBeCloseTo(lat, 6);
        expect(back.lng).toBeCloseTo(lng, 6);
        expect(back.alt).toBeCloseTo(alt, 6);
      }
    });
  });

  describe('readFields', () => {
    it('splits varint, fixed and length-delimited fields', () => {
      // field 1 varint 300, field 2 bytes "hi", field 3 float 1.5
      const bytes = new Uint8Array([0x08, 0xac, 0x02, 0x12, 0x02, 0x68, 0x69, 0x1d, 0, 0, 0xc0, 0x3f]);
      const fields = readFields(bytes);
      expect(fields[0]).toEqual([1, 300]);
      expect(Buffer.from(fields[1]![1] as Uint8Array).toString()).toBe('hi');
      expect(fields[2]).toEqual([3, 1.5]);
    });
  });

  describe('stripToTriangles', () => {
    it('alternates winding across the strip', () => {
      expect(stripToTriangles([0, 1, 2, 3])).toEqual([
        [0, 1, 2],
        [1, 3, 2],
      ]);
    });

    it('drops degenerate stitches', () => {
      expect(stripToTriangles([0, 1, 1, 2, 3])).toEqual([[1, 2, 3]]);
    });

    it('returns nothing for a strip shorter than three', () => {
      expect(stripToTriangles([0, 1])).toEqual([]);
    });
  });

  describe('parseNodeData', () => {
    it('returns an empty result for an empty payload', () => {
      const data = parseNodeData(new Uint8Array(0));
      expect(data.meshes).toEqual([]);
      expect(data.matrixGlobeFromMesh).toEqual([]);
    });
  });

  describe('planets', () => {
    it('builds per-planet base URLs', () => {
      expect(rocktreeBase('earth')).toBe('https://kh.google.com/rt/earth');
      expect(rocktreeBase('mars')).toBe('https://kh.google.com/rt/mars');
      expect(rocktreeBase('moon')).toBe('https://kh.google.com/rt/moon');
      expect(rocktreeBase()).toBe('https://kh.google.com/rt/earth');
    });

    it('rejects unsupported planet names with a typed error naming the options', () => {
      try {
        rocktreeBase('pluto' as never);
        throw new Error('expected GMapsError');
      } catch (error) {
        expect(error).toBeInstanceOf(GMapsError);
        expect((error as GMapsError).message).toContain('pluto');
        expect((error as GMapsError).message).toContain('earth, mars, moon');
      }
    });

    it('lists exactly the served planets', () => {
      expect(ROCKTREE_PLANETS).toEqual(['earth', 'mars', 'moon']);
    });

    it('falls back to the planet reference radius when the payload omits it', () => {
      const bytes = new Uint8Array([
        ...bytesField(1, varintField(2, 209)),
        ...floatField(2, EARTH_RADIUS_METERS),
      ]);
      // Payload carries a radius: used regardless of planet.
      expect(parsePlanetoidMetadata(bytes, 'earth').radius).toBeCloseTo(EARTH_RADIUS_METERS, -2);
      expect(parsePlanetoidMetadata(bytes, 'mars').radius).toBeCloseTo(EARTH_RADIUS_METERS, -2);

      // Radius omitted: the planet's own mean radius is the fallback.
      const bare = new Uint8Array([...bytesField(1, varintField(2, 209))]);
      expect(parsePlanetoidMetadata(bare, 'earth').radius).toBe(EARTH_RADIUS_METERS);
      expect(parsePlanetoidMetadata(bare, 'mars').radius).toBe(3_389_500);
      expect(parsePlanetoidMetadata(bare, 'moon').radius).toBe(1_737_400);
    });

    it('round-trips coordinates through a non-Earth radius', () => {
      const marsRadius = 3_389_500;
      const p = latLngToEcef(18.65, 226.2, 21_900, marsRadius);
      const ll = ecefToLatLng(p, marsRadius);
      expect(ll.lat).toBeCloseTo(18.65, 6);
      // atan2 is canonical in (-180, 180] — 226.2°E wraps to -133.8°.
      expect(ll.lng).toBeCloseTo(-133.8, 6);
      expect(ll.alt).toBeCloseTo(21_900, 0);
    });
  });
});
