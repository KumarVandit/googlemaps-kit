/**
 * Google Earth "rocktree" protocol — the photorealistic 3D octree behind
 * `kh.google.com/rt/earth`.
 *
 * Reverse-engineered from the Maps web client. The renderer never parses the
 * octree on the main thread: Maps ships a Web Worker as an escaped string
 * literal inside its `f0N97d`/mapcore modules, and that worker holds the
 * BulkMetadata reader (`obbCenters` / `obbExtents` / `obbRotations`) this file
 * reimplements. Three endpoints, all anonymous, all `application/x-protobuffer`:
 *
 *   GET /rt/{planet}/PlanetoidMetadata
 *   GET /rt/{planet}/BulkMetadata/pb=!1m2!1s{path}!2u{epoch}
 *   GET /rt/{planet}/NodeData/pb=!1m2!1s{path}!2u{epoch}!2e{texture}!3u{imagery}!4b0
 *
 * Nodes are addressed by an octant path (digits 0-7, one per level). A bulk
 * covers four levels below its head node, so bulk paths are always a multiple
 * of four digits long.
 */

import { GMapsError } from '../types/common.js';

/** Mean planet radius the Earth rocktree is quantised against. */
export const EARTH_RADIUS_METERS = 6_371_010;

const ROCKTREE_BASE = 'https://kh.google.com/rt/earth';

/**
 * Planets Google serves through the rocktree octree.
 *
 * `mars` and `moon` answer live with their own epochs, radii and octrees —
 * the same three-endpoint protocol as earth. Any other planet name gets a
 * clean HTTP 400 INVALID_ARGUMENT from the server.
 */
export type RocktreePlanet = 'earth' | 'mars' | 'moon';

export const ROCKTREE_PLANETS: readonly RocktreePlanet[] = ['earth', 'mars', 'moon'];

/** Mean radii used when a PlanetoidMetadata payload omits its radius field. */
const PLANET_FALLBACK_RADII: Record<RocktreePlanet, number> = {
  earth: EARTH_RADIUS_METERS,
  mars: 3_389_500,
  moon: 1_737_400,
};

/** Per-planet rocktree host segment. Throws on unsupported planet names. */
export function rocktreeBase(planet: RocktreePlanet = 'earth'): string {
  if (!ROCKTREE_PLANETS.includes(planet)) {
    throw new GMapsError(
      `Unsupported rocktree planet "${planet}". Google serves: ${ROCKTREE_PLANETS.join(', ')}.`,
    );
  }
  return planet === 'earth' ? ROCKTREE_BASE : `https://kh.google.com/rt/${planet}`;
}

/** Node flag bits decoded out of `path_and_flags`. */
export const NODE_FLAGS = {
  /** Node publishes no NodeData — metadata only. */
  NO_DATA: 8,
  /** NodeData must carry `!3u{imageryEpoch}` or the server answers 404. */
  USE_IMAGERY_EPOCH: 16,
} as const;

export type PbField = [number, number | Uint8Array];

function readVarint(bytes: Uint8Array, offset: number): [number, number] {
  let result = 0;
  let scale = 1;
  let i = offset;
  for (;;) {
    const byte = bytes[i++];
    if (byte === undefined) throw new Error('rocktree: truncated varint');
    result += (byte & 0x7f) * scale;
    scale *= 128;
    if ((byte & 0x80) === 0) break;
  }
  return [result, i];
}

/** Split one protobuf message into `[fieldNumber, value]` pairs (no schema). */
export function readFields(bytes: Uint8Array): PbField[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: PbField[] = [];
  let i = 0;
  while (i < bytes.length) {
    const [tag, next] = readVarint(bytes, i);
    i = next;
    const field = tag >> 3;
    const wire = tag & 7;
    if (wire === 0) {
      const [value, n] = readVarint(bytes, i);
      i = n;
      out.push([field, value]);
    } else if (wire === 5) {
      out.push([field, view.getFloat32(i, true)]);
      i += 4;
    } else if (wire === 1) {
      out.push([field, view.getFloat64(i, true)]);
      i += 8;
    } else if (wire === 2) {
      const [len, n] = readVarint(bytes, i);
      i = n;
      out.push([field, bytes.subarray(n, n + len)]);
      i = n + len;
    } else {
      break;
    }
  }
  return out;
}

function num(fields: PbField[], field: number): number | undefined {
  const hit = fields.find((f) => f[0] === field);
  return typeof hit?.[1] === 'number' ? hit[1] : undefined;
}

function bin(fields: PbField[], field: number): Uint8Array | undefined {
  const hit = fields.find((f) => f[0] === field);
  return hit && hit[1] instanceof Uint8Array ? hit[1] : undefined;
}

function allBin(fields: PbField[], field: number): Uint8Array[] {
  return fields.filter((f) => f[0] === field && f[1] instanceof Uint8Array).map((f) => f[1] as Uint8Array);
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export type Vec3 = [number, number, number];

/** Geodetic (spherical) lat/lng/alt to planet-centred metres. */
export function latLngToEcef(lat: number, lng: number, alt = 0, radius = EARTH_RADIUS_METERS): Vec3 {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lng * Math.PI) / 180;
  const r = radius + alt;
  return [r * Math.cos(phi) * Math.cos(lambda), r * Math.cos(phi) * Math.sin(lambda), r * Math.sin(phi)];
}

/** Planet-centred metres back to lat/lng plus height above the reference sphere. */
export function ecefToLatLng(
  p: Vec3,
  radius = EARTH_RADIUS_METERS,
): { lat: number; lng: number; alt: number } {
  const r = Math.hypot(p[0], p[1], p[2]);
  return {
    lat: (Math.asin(p[2] / r) * 180) / Math.PI,
    lng: (Math.atan2(p[1], p[0]) * 180) / Math.PI,
    alt: r - radius,
  };
}

export interface PlanetoidMetadata {
  /** Epoch to seed the root BulkMetadata request with. */
  rootEpoch: number;
  radius: number;
}

export function parsePlanetoidMetadata(
  bytes: Uint8Array,
  planet: RocktreePlanet = 'earth',
): PlanetoidMetadata {
  const top = readFields(bytes);
  const key = bin(top, 1);
  const rootEpoch = key ? (num(readFields(key), 2) ?? 0) : 0;
  return { rootEpoch, radius: num(top, 2) ?? PLANET_FALLBACK_RADII[planet] };
}

export function planetoidMetadataUrl(base = ROCKTREE_BASE): string {
  return `${base}/PlanetoidMetadata`;
}

export interface RocktreeNode {
  /** Octant path relative to the bulk head node (1-4 digits). */
  path: string;
  /** Depth below the bulk head node (1-4). */
  level: number;
  flags: number;
  /** Epoch for this node's NodeData request. */
  epoch: number;
  /** Epoch for the child BulkMetadata request rooted at this node. */
  bulkMetadataEpoch: number;
  imageryEpoch: number;
  textureFormat: number;
  /** Ground sampling distance of this node's texture, in metres. */
  metersPerTexel: number;
  /** Oriented bounding box centre, earth-centred metres. */
  center: Vec3 | null;
  /** Oriented bounding box half-extents along its own axes, metres. */
  extents: Vec3 | null;
  /** Row-major 3x3; column i is OBB axis i. */
  rotation: number[] | null;
  /** True when the node publishes no mesh. */
  hasData: boolean;
}

export interface BulkMetadata {
  headPath: string;
  headEpoch: number;
  nodes: RocktreeNode[];
}

export function bulkMetadataUrl(path: string, epoch: number, base = ROCKTREE_BASE): string {
  return `${base}/BulkMetadata/pb=!1m2!1s${path}!2u${epoch}`;
}

/**
 * Decode a BulkMetadata payload.
 *
 * Field layout (from the Maps octree worker):
 *   1 repeated NodeMetadata   3 head node centre (3 doubles)
 *   2 head node key           4 metres-per-texel per level (4 floats)
 *   5 default imagery epoch   6 default texture format
 *
 * NodeMetadata: 1 path_and_flags, 2 epoch, 3 packed OBB, 4 metres-per-texel,
 * 5 child bulk epoch, 7 imagery epoch, 8 texture format.
 */
export function parseBulkMetadata(bytes: Uint8Array): BulkMetadata {
  const top = readFields(bytes);

  const headCenterBytes = bin(top, 3);
  const headCenter: Vec3 = headCenterBytes
    ? [
        viewOf(headCenterBytes).getFloat64(0, true),
        viewOf(headCenterBytes).getFloat64(8, true),
        viewOf(headCenterBytes).getFloat64(16, true),
      ]
    : [0, 0, 0];

  const mptBytes = bin(top, 4);
  const levelMetersPerTexel = mptBytes
    ? [0, 1, 2, 3].map((i) => viewOf(mptBytes).getFloat32(i * 4, true))
    : [0, 0, 0, 0];

  const keyBytes = bin(top, 2);
  const keyFields = keyBytes ? readFields(keyBytes) : [];
  const headPathBytes = bin(keyFields, 1);
  const headPath = headPathBytes ? Buffer.from(headPathBytes).toString('utf8') : '';
  const headEpoch = num(keyFields, 2) ?? 0;

  const defaultImageryEpoch = num(top, 5) ?? 0;
  const defaultTextureFormat = num(top, 6) ?? 6;

  const nodes = allBin(top, 1).map((nodeBytes) => {
    const f = readFields(nodeBytes);
    const packed = num(f, 1) ?? 0;
    const level = (packed & 3) + 1;
    const pathBits = (packed >> 2) & ((1 << (3 * level)) - 1);
    let path = '';
    for (let i = 0; i < level; i++) path += String((pathBits >> (3 * i)) & 7);
    const flags = packed >> (2 + 3 * level);

    let metersPerTexel = num(f, 4) ?? 0;
    if (!metersPerTexel) metersPerTexel = levelMetersPerTexel[level - 1] ?? 0;

    const obb = bin(f, 3);
    let center: Vec3 | null = null;
    let extents: Vec3 | null = null;
    let rotation: number[] | null = null;
    if (obb && obb.length >= 15) {
      const dv = viewOf(obb);
      center = [
        dv.getInt16(0, true) * metersPerTexel + headCenter[0],
        dv.getInt16(2, true) * metersPerTexel + headCenter[1],
        dv.getInt16(4, true) * metersPerTexel + headCenter[2],
      ];
      extents = [obb[6]! * metersPerTexel, obb[7]! * metersPerTexel, obb[8]! * metersPerTexel];
      // Three quantised Euler angles, not a quaternion — note the differing scales.
      const yaw = (dv.getUint16(9, true) * Math.PI) / 32768;
      const pitch = (dv.getUint16(11, true) * Math.PI) / 65536;
      const roll = (dv.getUint16(13, true) * Math.PI) / 32768;
      const c0 = Math.cos(yaw);
      const s0 = Math.sin(yaw);
      const c1 = Math.cos(pitch);
      const s1 = Math.sin(pitch);
      const c2 = Math.cos(roll);
      const s2 = Math.sin(roll);
      const m = [
        c0 * c2 - c1 * s0 * s2,
        c1 * c0 * s2 + c2 * s0,
        s2 * s1,
        -c0 * s2 - c2 * c1 * s0,
        c0 * c1 * c2 - s0 * s2,
        c2 * s1,
        s1 * s0,
        -c0 * s1,
        c1,
      ];
      rotation = [m[0]!, m[3]!, m[6]!, m[1]!, m[4]!, m[7]!, m[2]!, m[5]!, m[8]!];
    }

    return {
      path,
      level,
      flags,
      epoch: num(f, 2) ?? headEpoch,
      bulkMetadataEpoch: num(f, 5) ?? headEpoch,
      imageryEpoch: num(f, 7) ?? defaultImageryEpoch,
      textureFormat: num(f, 8) ?? defaultTextureFormat,
      metersPerTexel,
      center,
      extents,
      rotation,
      hasData: (flags & NODE_FLAGS.NO_DATA) === 0,
    } satisfies RocktreeNode;
  });

  return { headPath, headEpoch, nodes };
}

/** Point coordinates in a node's own OBB frame, normalised to its half-extents. */
function obbNormalizedOffset(node: RocktreeNode, p: Vec3): Vec3 | null {
  if (!node.center || !node.extents || !node.rotation) return null;
  const d: Vec3 = [p[0] - node.center[0], p[1] - node.center[1], p[2] - node.center[2]];
  const r = node.rotation;
  const local = [
    d[0] * r[0]! + d[1] * r[3]! + d[2] * r[6]!,
    d[0] * r[1]! + d[1] * r[4]! + d[2] * r[7]!,
    d[0] * r[2]! + d[1] * r[5]! + d[2] * r[8]!,
  ];
  return [
    node.extents[0] === 0 ? Infinity : local[0]! / node.extents[0],
    node.extents[1] === 0 ? Infinity : local[1]! / node.extents[1],
    node.extents[2] === 0 ? Infinity : local[2]! / node.extents[2],
  ];
}

/** True when the point falls inside the node's oriented bounding box. */
export function obbContains(node: RocktreeNode, p: Vec3): boolean {
  const n = obbNormalizedOffset(node, p);
  return n !== null && Math.abs(n[0]) <= 1 && Math.abs(n[1]) <= 1 && Math.abs(n[2]) <= 1;
}

/**
 * How deep inside its OBB a point sits. Sibling octants overlap because the
 * boxes hug the terrain shell rather than tiling space, so descent picks the
 * most central candidate rather than the first hit.
 */
export function obbCentrality(node: RocktreeNode, p: Vec3): number {
  const n = obbNormalizedOffset(node, p);
  if (!n) return Infinity;
  return Math.max(Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2]));
}

/**
 * Slab test of the segment `a`→`b` against a node's box.
 *
 * Deep nodes are thin shells wrapped around the actual ground, so testing a
 * single point at sea level walks straight past any city that is not at sea
 * level. Testing the vertical line through a location instead keeps the
 * descent alive whatever the terrain height, and returns the parameter of the
 * segment's midpoint inside the box for the centrality tie-break.
 *
 * `tMin`/`tMax` bound the part of the segment inside the box, which lets a
 * descent narrow its probe to the altitude band the geometry actually occupies.
 */
export function obbIntersectsSegment(
  node: RocktreeNode,
  a: Vec3,
  b: Vec3,
): { hit: boolean; t: number; tMin: number; tMax: number } {
  const miss = { hit: false, t: 0, tMin: 0, tMax: 0 };
  if (!node.center || !node.extents || !node.rotation) return miss;
  const la = obbNormalizedOffset(node, a)!;
  const lb = obbNormalizedOffset(node, b)!;

  let tMin = 0;
  let tMax = 1;
  for (let axis = 0; axis < 3; axis++) {
    const start = la[axis]!;
    const delta = lb[axis]! - start;
    if (Math.abs(delta) < 1e-12) {
      if (Math.abs(start) > 1) return miss;
      continue;
    }
    const t1 = (-1 - start) / delta;
    const t2 = (1 - start) / delta;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
    if (tMin > tMax) return miss;
  }
  return { hit: true, t: (tMin + tMax) / 2, tMin, tMax };
}

export interface RocktreeTexture {
  /** Encoded image bytes — JPEG when `format` is 1. */
  data: Uint8Array;
  format: number;
  width: number;
  height: number;
}

export interface RocktreeMesh {
  /** Vertex positions in earth-centred metres. */
  positions: Vec3[];
  /** Triangle-strip vertex indices. */
  strip: number[];
  /** Per-vertex texture coordinates in [0,1], parallel to `positions`. */
  uvs: Array<[number, number]> | null;
  texture: RocktreeTexture | null;
}

export interface NodeData {
  /** Column-major 4x4 mesh-space to earth-centred-metres transform. */
  matrixGlobeFromMesh: number[];
  meshes: RocktreeMesh[];
  copyrightIds: number[];
}

export function nodeDataUrl(
  params: { path: string; epoch: number; textureFormat?: number; imageryEpoch?: number },
  base = ROCKTREE_BASE,
): string {
  const texture = params.textureFormat ?? 1;
  const imagery = params.imageryEpoch !== undefined ? `!3u${params.imageryEpoch}` : '';
  return `${base}/NodeData/pb=!1m2!1s${params.path}!2u${params.epoch}!2e${texture}${imagery}!4b0`;
}

/**
 * Positions are three byte planes of running deltas (x plane, then y, then z),
 * each wrapping at 256 — the renderer expands them straight into the
 * mesh-space cube the node matrix maps onto the globe.
 */
function decodeVertices(packed: Uint8Array): Array<[number, number, number]> {
  const count = Math.floor(packed.length / 3);
  const out: Array<[number, number, number]> = [];
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < count; i++) {
    x = (x + packed[i]!) & 0xff;
    y = (y + packed[count + i]!) & 0xff;
    z = (z + packed[2 * count + i]!) & 0xff;
    out.push([x, y, z]);
  }
  return out;
}

/**
 * Indices are a triangle strip stored as "distance back from the running high
 * water mark": a zero delta pushes a fresh vertex, anything else reuses one.
 */
function decodeIndices(packed: Uint8Array): number[] {
  let [count, offset] = readVarint(packed, 0);
  const strip: number[] = [];
  let zeros = 0;
  for (let i = 0; i < count; i++) {
    const [delta, next] = readVarint(packed, offset);
    offset = next;
    strip.push(zeros - delta);
    if (delta === 0) zeros++;
  }
  return strip;
}

/**
 * Texture coordinates are two byte-pair planes of running deltas taken modulo
 * a per-mesh wrap value carried in the first four bytes.
 */
function decodeTexCoords(packed: Uint8Array, count: number): Array<[number, number]> | null {
  if (packed.length < 4 + count * 4) return null;
  const dv = viewOf(packed);
  const uMod = 1 + dv.getUint16(0, true);
  const vMod = 1 + dv.getUint16(2, true);
  const data = packed.subarray(4);
  const out: Array<[number, number]> = [];
  let u = 0;
  let v = 0;
  for (let i = 0; i < count; i++) {
    u = (u + data[i]! + (data[i + 2 * count]! << 8)) % uMod;
    v = (v + data[i + count]! + (data[i + 3 * count]! << 8)) % vMod;
    out.push([(u + 0.5) / uMod, (v + 0.5) / vMod]);
  }
  return out;
}

/**
 * Decode a NodeData payload.
 *
 * Field layout: 1 globe-from-mesh matrix (16 doubles), 2 repeated Mesh,
 * 3 repeated copyright id. Mesh: 1 vertices, 3 indices, 6 texture,
 * 7 texture coordinates.
 */
export function parseNodeData(bytes: Uint8Array): NodeData {
  const top = readFields(bytes);

  const matrixBytes = bin(top, 1);
  const matrix: number[] = [];
  if (matrixBytes && matrixBytes.length >= 128) {
    const dv = viewOf(matrixBytes);
    for (let i = 0; i < 16; i++) matrix.push(dv.getFloat64(i * 8, true));
  }

  const apply = (v: [number, number, number]): Vec3 => {
    if (matrix.length !== 16) return [v[0], v[1], v[2]];
    return [
      matrix[0]! * v[0] + matrix[4]! * v[1] + matrix[8]! * v[2] + matrix[12]!,
      matrix[1]! * v[0] + matrix[5]! * v[1] + matrix[9]! * v[2] + matrix[13]!,
      matrix[2]! * v[0] + matrix[6]! * v[1] + matrix[10]! * v[2] + matrix[14]!,
    ];
  };

  const meshes = allBin(top, 2).map((meshBytes) => {
    const mf = readFields(meshBytes);
    const vertexBytes = bin(mf, 1);
    const local = vertexBytes ? decodeVertices(vertexBytes) : [];
    const indexBytes = bin(mf, 3);
    const uvBytes = bin(mf, 7);
    const textureBytes = bin(mf, 6);

    let texture: RocktreeTexture | null = null;
    if (textureBytes) {
      const tf = readFields(textureBytes);
      const data = bin(tf, 1);
      if (data) {
        texture = {
          data,
          format: num(tf, 2) ?? 0,
          width: num(tf, 3) ?? 0,
          height: num(tf, 4) ?? 0,
        };
      }
    }

    return {
      positions: local.map(apply),
      strip: indexBytes ? decodeIndices(indexBytes) : [],
      uvs: uvBytes ? decodeTexCoords(uvBytes, local.length) : null,
      texture,
    } satisfies RocktreeMesh;
  });

  const copyrightIds = top.filter((f) => f[0] === 3 && typeof f[1] === 'number').map((f) => f[1] as number);

  return { matrixGlobeFromMesh: matrix, meshes, copyrightIds };
}

/**
 * Pixel dimensions from a JPEG's SOF marker.
 *
 * Node textures sometimes omit a dimension on the wire, and the image itself
 * is the authority — a square 512 texture that reports only its height would
 * otherwise be read as 256 wide.
 */
export function readJpegSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1]!;
    // Standalone markers carry no length; everything else does.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    // SOF0-SOF15, excluding the DHT/JPG/DAC markers interleaved in that range.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        height: (bytes[i + 5]! << 8) | bytes[i + 6]!,
        width: (bytes[i + 7]! << 8) | bytes[i + 8]!,
      };
    }
    if (length < 2) return undefined;
    i += 2 + length;
  }
  return undefined;
}

/** Expand a triangle strip into independent triangles, dropping degenerates. */
export function stripToTriangles(strip: number[]): Array<[number, number, number]> {
  const tris: Array<[number, number, number]> = [];
  for (let i = 0; i + 2 < strip.length; i++) {
    const a = strip[i]!;
    const b = strip[i + 1]!;
    const c = strip[i + 2]!;
    if (a === b || b === c || a === c) continue;
    tris.push(i % 2 === 0 ? [a, b, c] : [a, c, b]);
  }
  return tris;
}
