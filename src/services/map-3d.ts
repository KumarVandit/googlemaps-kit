import { HttpClient } from '../client/http-client.js';
import { GMapsError } from '../types/common.js';
import type { GMapsConfig } from '../types/common.js';
import { readJpegDimensions } from '../parsers/tiles.js';
import {
  EARTH_RADIUS_METERS,
  NODE_FLAGS,
  bulkMetadataUrl,
  ecefToLatLng,
  latLngToEcef,
  nodeDataUrl,
  obbCentrality,
  obbIntersectsSegment,
  parseBulkMetadata,
  parseNodeData,
  parsePlanetoidMetadata,
  readJpegSize,
  planetoidMetadataUrl,
  rocktreeBase,
  stripToTriangles,
  type BulkMetadata,
  type RocktreeNode,
  type RocktreePlanet,
  type Vec3,
} from '../rpc/earth-rocktree.js';
import type {
  Building3d,
  Map3dBounds,
  Map3dBuildingsOptions,
  Map3dDetail,
  Map3dMeshOptions,
  Map3dMeshResult,
  Map3dTerrainOptions,
  Map3dTile,
  Map3dVertex,
  Terrain3dResult,
} from '../types/map-3d.js';

const ATTRIBUTION = 'Imagery ©2026 Google, Airbus, Maxar Technologies';

const DETAIL_METERS_PER_TEXEL: Record<Map3dDetail, number> = {
  low: 40,
  medium: 10,
  high: 2,
  max: 0.25,
};

const RESOLUTION_STEP_METERS = { low: 32, medium: 16, high: 8 } as const;

/** Roof-height jump that splits one flood fill into two structures, in metres. */
const ROOF_STEP_METERS = 6;

/** Octree levels described by a single BulkMetadata payload. */
const BULK_LEVELS = 4;

/** Overlapping siblings to try per level before giving up on a branch. */
const MAX_BRANCHES = 8;

/** Hard cap on sampled terrain-grid cells; beyond this, callers should coarsen the box. */
const MAX_TERRAIN_GRID_CELLS = 4_000_000;

/** Throw when a bounds/step combination would rasterise an unmanageable height grid. */
function assertTerrainGridFits(widthMeters: number, heightMeters: number, step: number): void {
  const cells = Math.ceil(widthMeters / step + 1) * Math.ceil(heightMeters / step + 1);
  if (!Number.isFinite(cells)) {
    throw new GMapsError(`Invalid terrain grid dimensions (${widthMeters} x ${heightMeters} m).`);
  }
  if (cells > MAX_TERRAIN_GRID_CELLS) {
    throw new GMapsError(
      `Requested terrain grid would hold ${(cells / 1e6).toFixed(1)}M cells ` +
        `(${(widthMeters / 1000).toFixed(1)} x ${(heightMeters / 1000).toFixed(1)} km at ${step} m step). ` +
        'Shrink the bounds, raise resolution to "low", or sample with getMesh directly.',
    );
  }
}

/** Child bulks one descent may fetch before settling for what it has. */
const MAX_BULK_FETCHES = 24;

/** Chained bulks to follow; each adds four levels, so this reaches level 32. */
const MAX_BULK_DEPTH = 8;

/** Vertical line through a location, spanning every terrain height on Earth. */
interface Probe {
  low: Vec3;
  high: Vec3;
}

const PROBE_MIN_ALT = -500;
const PROBE_MAX_ALT = 9000;

function verticalProbe(lat: number, lng: number, radius = EARTH_RADIUS_METERS): Probe {
  return {
    low: latLngToEcef(lat, lng, PROBE_MIN_ALT, radius),
    high: latLngToEcef(lat, lng, PROBE_MAX_ALT, radius),
  };
}

/** Sub-segment of `probe` between two parameters, padded so it stays generous. */
function narrowProbe(probe: Probe, tMin: number, tMax: number): Probe {
  const pad = Math.max(0.002, (tMax - tMin) * 0.25);
  const lo = Math.max(0, tMin - pad);
  const hi = Math.min(1, tMax + pad);
  return { low: pointAt(probe, lo), high: pointAt(probe, hi) };
}

function pointAt(probe: Probe, t: number): Vec3 {
  return [
    probe.low[0] + (probe.high[0] - probe.low[0]) * t,
    probe.low[1] + (probe.high[1] - probe.low[1]) * t,
    probe.low[2] + (probe.high[2] - probe.low[2]) * t,
  ];
}

interface ResolvedNode {
  /** Absolute octant path from the octree root. */
  path: string;
  node: RocktreeNode;
}

/**
 * Photorealistic 3D buildings and terrain.
 *
 * Maps renders 3D from Google Earth's "rocktree" octree at
 * `kh.google.com/rt/earth` — the same mesh the Photorealistic 3D Tiles API
 * bills for, served here without a key. Metadata arrives as an oriented
 * bounding-box tree (`BulkMetadata`); each leaf publishes a `NodeData` payload
 * holding a delta-packed vertex cube, a triangle strip and a 512×512 JPEG.
 * See {@link file://src/rpc/earth-rocktree.ts} for the wire format.
 *
 * The mesh is *fused*: buildings, ground and vegetation are one surface, so
 * {@link Map3dService.getBuildings} segments structures out of it rather than
 * reading a building layer. Treat those footprints as derived, not authored.
 */
export class Map3dService {
  private http: HttpClient;
  /** Per-planet root epochs and reference radii (rocktree serves earth, mars, moon). */
  private planetoids = new Map<RocktreePlanet, { rootEpoch: number; radius: number }>();
  private bulkCache = new Map<string, BulkMetadata | null>();

  constructor(http: HttpClient, _config: GMapsConfig) {
    this.http = http;
  }

  private async fetchProto(url: string): Promise<Uint8Array | null> {
    try {
      const { bytes } = await this.http.getBytes(url, {
        referer: 'https://earth.google.com/',
        noRetry: true,
        minBytes: 4,
      });
      return bytes;
    } catch {
      return null;
    }
  }

  private async getPlanetoid(planet: RocktreePlanet): Promise<{ rootEpoch: number; radius: number }> {
    const cached = this.planetoids.get(planet);
    if (cached) return cached;
    const bytes = await this.fetchProto(planetoidMetadataUrl(rocktreeBase(planet)));
    if (!bytes) {
      throw new GMapsError(
        `${planet} octree unreachable: PlanetoidMetadata returned no payload`,
      );
    }
    const parsed = parsePlanetoidMetadata(bytes, planet);
    const entry = { rootEpoch: parsed.rootEpoch, radius: parsed.radius };
    this.planetoids.set(planet, entry);
    return entry;
  }

  private async getBulk(
    path: string,
    epoch: number,
    planet: RocktreePlanet,
  ): Promise<BulkMetadata | null> {
    const key = `${planet}:${path}@${epoch}`;
    const cached = this.bulkCache.get(key);
    if (cached !== undefined) return cached;
    const bytes = await this.fetchProto(bulkMetadataUrl(path, epoch, rocktreeBase(planet)));
    const parsed = bytes ? parseBulkMetadata(bytes) : null;
    this.bulkCache.set(key, parsed);
    return parsed;
  }

  /**
   * Walk the octree towards a point until the node's ground sampling distance
   * meets `targetMetersPerTexel`, returning the finest node that carries mesh.
   *
   * Sibling octants overlap — their boxes hug the terrain shell instead of
   * tiling space — so a point can sit inside several boxes at one level and
   * only one of those branches continues to street-level detail. The walk
   * therefore tries candidates most-central first and backtracks instead of
   * committing to the first hit.
   */
  private async descend(
    probe: Probe,
    targetMetersPerTexel: number,
    planet: RocktreePlanet,
  ): Promise<ResolvedNode | null> {
    const { rootEpoch } = await this.getPlanetoid(planet);
    return this.descendBulk('', rootEpoch, probe, targetMetersPerTexel, 0, {
      fetches: 0,
    }, planet);
  }

  private async descendBulk(
    bulkPath: string,
    bulkEpoch: number,
    probe: Probe,
    target: number,
    depth: number,
    budget: { fetches: number },
    planet: RocktreePlanet,
  ): Promise<ResolvedNode | null> {
    if (depth > MAX_BULK_DEPTH) return null;
    // Overlapping siblings make the search a tree, not a path; without a
    // budget a dense city would fan out into thousands of bulk fetches.
    if (depth > 0 && budget.fetches++ >= MAX_BULK_FETCHES) return null;
    const bulk = await this.getBulk(bulkPath, bulkEpoch, planet);
    if (!bulk) return null;

    const finer = (a: ResolvedNode | null, b: ResolvedNode | null): ResolvedNode | null => {
      if (!a) return b;
      if (!b) return a;
      return b.node.metersPerTexel < a.node.metersPerTexel ? b : a;
    };

    const walk = async (
      relPath: string,
      level: number,
      node: RocktreeNode | null,
      probe: Probe,
    ): Promise<ResolvedNode | null> => {
      let best: ResolvedNode | null =
        node && node.hasData ? { path: bulkPath + relPath, node } : null;
      if (node && node.metersPerTexel > 0 && node.metersPerTexel <= target) return best;

      // A bulk only describes four levels; deeper detail lives in a child bulk
      // rooted at this node.
      if (level === BULK_LEVELS) {
        if (!node) return best;
        const deeper = await this.descendBulk(
          bulkPath + relPath,
          node.bulkMetadataEpoch,
          probe,
          target,
          depth + 1,
          budget,
          planet,
        );
        return finer(best, deeper);
      }

      const children = bulk.nodes
        .filter((n) => n.level === level + 1 && n.path.startsWith(relPath))
        .map((n) => ({ node: n, hit: obbIntersectsSegment(n, probe.low, probe.high) }))
        .filter((c) => c.hit.hit)
        .sort(
          (a, b) =>
            obbCentrality(a.node, pointAt(probe, a.hit.t)) -
            obbCentrality(b.node, pointAt(probe, b.hit.t)),
        )
        .slice(0, MAX_BRANCHES);

      for (const { node: child, hit } of children) {
        // Narrow the probe to the slice of the line this box actually covers,
        // so the next level searches the altitude band holding the geometry
        // instead of the whole troposphere.
        const narrowed = narrowProbe(probe, hit.tMin, hit.tMax);
        best = finer(best, await walk(child.path, level + 1, child, narrowed));
        if (best && best.node.metersPerTexel > 0 && best.node.metersPerTexel <= target) break;
      }
      return best;
    };

    return walk('', 0, null, probe);
  }

  /**
   * Fetch the photorealistic mesh covering `bounds`.
   *
   * Sampling walks a grid of probe points across the box so a request wider
   * than one octree node still returns every node it touches, deduped by path.
   */
  async getMesh(options: Map3dMeshOptions): Promise<Map3dMeshResult> {
    const bounds = normalizeBounds(options.bounds);
    const target =
      options.metersPerTexel ?? DETAIL_METERS_PER_TEXEL[options.detail ?? 'high'];
    const maxTiles = options.maxTiles ?? 16;
    const planet = options.planet ?? 'earth';
    const { radius } = await this.getPlanetoid(planet);

    const probes = probeGrid(bounds, maxTiles);
    const resolved = new Map<string, ResolvedNode>();
    for (const probe of probes) {
      if (resolved.size >= maxTiles) break;
      const hit = await this.descend(verticalProbe(probe.lat, probe.lng, radius), target, planet);
      if (hit && !resolved.has(hit.path)) resolved.set(hit.path, hit);
    }

    if (resolved.size === 0) {
      throw new GMapsError(
        `No photorealistic 3D coverage for the requested bounds ` +
          `(${bounds.sw.lat.toFixed(4)},${bounds.sw.lng.toFixed(4)} to ` +
          `${bounds.ne.lat.toFixed(4)},${bounds.ne.lng.toFixed(4)}). ` +
          'Coverage is city-scale; oceans and most rural areas publish terrain only at low detail.',
      );
    }

    const tiles: Map3dTile[] = [];
    for (const entry of resolved.values()) {
      const tile = await this.fetchTile(entry, options.includeTextures ?? false, planet, radius);
      if (tile) tiles.push(tile);
    }

    if (tiles.length === 0) {
      throw new GMapsError('Octree resolved nodes but none returned mesh data');
    }

    return {
      tiles,
      bounds,
      level: Math.max(...tiles.map((t) => t.path.length)),
      vertexCount: tiles.reduce((sum, t) => sum + t.vertices.length, 0),
      triangleCount: tiles.reduce((sum, t) => sum + t.triangles.length, 0),
      attribution: ATTRIBUTION,
    };
  }

  private async fetchTile(
    entry: ResolvedNode,
    includeTextures: boolean,
    planet: RocktreePlanet,
    radius: number,
  ): Promise<Map3dTile | null> {
    const { node, path } = entry;
    // `!3u{imageryEpoch}` is only honoured when the node flags request it —
    // sending it otherwise makes the server answer 404.
    const bytes = await this.fetchProto(
      nodeDataUrl(
        {
          path,
          epoch: node.epoch,
          textureFormat: 1,
          imageryEpoch:
            (node.flags & NODE_FLAGS.USE_IMAGERY_EPOCH) !== 0 ? node.imageryEpoch : undefined,
        },
        rocktreeBase(planet),
      ),
    );
    if (!bytes) return null;

    const data = parseNodeData(bytes);
    const vertices: Map3dVertex[] = [];
    const triangles: Array<[number, number, number]> = [];
    let uvs: Array<[number, number]> | null = null;
    let texture: Map3dTile['texture'] = null;

    for (const mesh of data.meshes) {
      const base = vertices.length;
      for (const p of mesh.positions) {
        const ll = ecefToLatLng(p, radius);
        vertices.push({ lat: ll.lat, lng: ll.lng, alt: ll.alt });
      }
      for (const [a, b, c] of stripToTriangles(mesh.strip)) {
        triangles.push([base + a, base + b, base + c]);
      }
      if (mesh.uvs) uvs = (uvs ?? ([] as Array<[number, number]>)).concat(mesh.uvs);
      if (includeTextures && !texture && mesh.texture) {
        // Some nodes omit the width/height fields — sniff them from the JPEG SOFn header.
        let width = mesh.texture.width;
        let height = mesh.texture.height;
        if (!width || !height) {
          const dims = readJpegDimensions(mesh.texture.data);
          width = width || dims?.width || 0;
          height = height || dims?.height || 0;
        }
        texture = {
          format: mesh.texture.format === 1 ? 'jpeg' : 'unknown',
          width,
          height,
          bytes: mesh.texture.data,
        };
      }
    }

    if (vertices.length === 0) return null;

    return {
      path,
      metersPerTexel: node.metersPerTexel,
      vertices,
      triangles,
      uvs,
      texture,
      bounds: boundsOf(vertices),
    };
  }

  /**
   * Sample the mesh into a height grid.
   *
   * Heights come off the photorealistic surface, so they include buildings and
   * tree canopy. For bare ground use a low `detail` — coarse nodes carry
   * terrain only.
   */
  async getTerrain(options: Map3dTerrainOptions): Promise<Terrain3dResult> {
    const bounds = normalizeBounds(options.bounds);
    const step = RESOLUTION_STEP_METERS[options.resolution ?? 'medium'];
    const frame0 = localFrame(bounds);
    assertTerrainGridFits(frame0.widthMeters, frame0.heightMeters, step);
    const mesh = await this.getMesh({
      bounds,
      detail: options.detail ?? 'high',
      maxTiles: options.maxTiles ?? 16,
      planet: options.planet,
    });

    const frame = localFrame(bounds);
    const cols = Math.max(2, Math.ceil(frame.widthMeters / step) + 1);
    const rows = Math.max(2, Math.ceil(frame.heightMeters / step) + 1);
    const { top: heights, minAlt, maxAlt } = rasterize(mesh, frame, step, cols, rows);

    const objMesh =
      options.includeMesh === false ? Buffer.alloc(0) : Buffer.from(gridToObj(heights, cols, rows, step), 'utf8');

    return {
      mesh: objMesh,
      format: 'obj',
      bounds,
      grid: { cols, rows, heights, stepMeters: step },
      minAlt: Number.isFinite(minAlt) ? minAlt : 0,
      maxAlt: Number.isFinite(maxAlt) ? maxAlt : 0,
      attribution: ATTRIBUTION,
    };
  }

  /**
   * Segment building-like structures out of the fused mesh.
   *
   * The octree publishes no building layer, so this rasterises mesh vertices
   * into a 4 m grid, estimates local ground from the low percentile of a
   * neighbourhood window, and groups connected cells that stand `minHeight`
   * above it. Outlines are convex hulls of the occupied cells — massing, not
   * surveyed footprints.
   */
  async getBuildings(options: Map3dBuildingsOptions): Promise<Building3d[]> {
    const bounds = normalizeBounds(options.bounds);
    const minHeight = options.minHeight ?? 4;
    const frame0 = localFrame(bounds);
    assertTerrainGridFits(frame0.widthMeters, frame0.heightMeters, 4);
    const mesh = await this.getMesh({
      bounds,
      detail: options.detail ?? 'high',
      maxTiles: options.maxTiles ?? 16,
      planet: options.planet,
    });

    const cell = 4;
    const frame = localFrame(bounds);
    const cols = Math.max(2, Math.ceil(frame.widthMeters / cell) + 1);
    const rows = Math.max(2, Math.ceil(frame.heightMeters / cell) + 1);
    const { top, low } = rasterize(mesh, frame, cell, cols, rows);

    // Ground = the lowest surface within a ~40 m window, which survives blocks
    // where every cell is roofed.
    const window = Math.round(20 / cell);
    const ground: Array<number | null> = new Array(cols * rows).fill(null);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        let best: number | null = null;
        for (let dr = -window; dr <= window; dr++) {
          const r = row + dr;
          if (r < 0 || r >= rows) continue;
          for (let dc = -window; dc <= window; dc++) {
            const c = col + dc;
            if (c < 0 || c >= cols) continue;
            const value = low[r * cols + c];
            if (value === null || value === undefined) continue;
            if (best === null || value < best) best = value;
          }
        }
        ground[row * cols + col] = best;
      }
    }

    const elevated = new Uint8Array(cols * rows);
    for (let i = 0; i < top.length; i++) {
      const t = top[i];
      const g = ground[i];
      if (t === null || t === undefined || g === null || g === undefined) continue;
      if (t - g >= minHeight) elevated[i] = 1;
    }

    const buildings: Building3d[] = [];
    const seen = new Uint8Array(cols * rows);
    for (let start = 0; start < elevated.length; start++) {
      if (!elevated[start] || seen[start]) continue;
      const stack = [start];
      seen[start] = 1;
      const component: number[] = [];
      while (stack.length) {
        const i = stack.pop()!;
        component.push(i);
        const row = Math.floor(i / cols);
        const col = i % cols;
        const neighbours = [
          row > 0 ? i - cols : -1,
          row < rows - 1 ? i + cols : -1,
          col > 0 ? i - 1 : -1,
          col < cols - 1 ? i + 1 : -1,
        ];
        const here = top[i];
        for (const n of neighbours) {
          if (n < 0 || seen[n] || !elevated[n]) continue;
          // Adjacent roofs at very different heights are different buildings.
          // Without this, one flood fill swallows a whole city block.
          const there = top[n];
          if (isNumber(here) && isNumber(there) && Math.abs(here - there) > ROOF_STEP_METERS) continue;
          seen[n] = 1;
          stack.push(n);
        }
      }
      // Two cells is noise on a photogrammetric surface; three is a structure.
      if (component.length < 3) continue;

      const points = component.map((i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        return frame.unproject(col * cell, row * cell);
      });
      const groundAlt = median(component.map((i) => ground[i]).filter(isNumber));
      const roof = percentile(component.map((i) => top[i]).filter(isNumber), 0.95);
      const outline = convexHull(points);
      const centerLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
      const centerLng = points.reduce((s, p) => s + p.lng, 0) / points.length;

      buildings.push({
        id: `mesh-${mesh.tiles[0]?.path ?? '0'}-${start}`,
        outline,
        height: Math.round((roof - groundAlt) * 10) / 10,
        centerLat,
        centerLng,
        areaSqM: component.length * cell * cell,
        groundAlt: Math.round(groundAlt * 10) / 10,
      });
    }

    const sort = options.sort ?? 'height';
    buildings.sort((a, b) => {
      if (sort === 'area') return b.areaSqM - a.areaSqM;
      if (sort === 'prominence') return b.height * b.areaSqM - a.height * a.areaSqM;
      return b.height - a.height;
    });
    return buildings;
  }
}

function isNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeBounds(bounds: Map3dBounds): Map3dBounds {
  return {
    ne: { lat: Math.max(bounds.ne.lat, bounds.sw.lat), lng: Math.max(bounds.ne.lng, bounds.sw.lng) },
    sw: { lat: Math.min(bounds.ne.lat, bounds.sw.lat), lng: Math.min(bounds.ne.lng, bounds.sw.lng) },
  };
}

function boundsOf(vertices: Map3dVertex[]): Map3dBounds {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const v of vertices) {
    if (v.lat < minLat) minLat = v.lat;
    if (v.lat > maxLat) maxLat = v.lat;
    if (v.lng < minLng) minLng = v.lng;
    if (v.lng > maxLng) maxLng = v.lng;
  }
  return { ne: { lat: maxLat, lng: maxLng }, sw: { lat: minLat, lng: minLng } };
}

/** Probe points spread across the box, centre first so small boxes cost one walk. */
function probeGrid(bounds: Map3dBounds, maxTiles: number): Array<{ lat: number; lng: number }> {
  const side = Math.max(1, Math.min(5, Math.ceil(Math.sqrt(maxTiles))));
  const out: Array<{ lat: number; lng: number }> = [
    { lat: (bounds.ne.lat + bounds.sw.lat) / 2, lng: (bounds.ne.lng + bounds.sw.lng) / 2 },
  ];
  for (let row = 0; row < side; row++) {
    for (let col = 0; col < side; col++) {
      const fy = side === 1 ? 0.5 : (row + 0.5) / side;
      const fx = side === 1 ? 0.5 : (col + 0.5) / side;
      out.push({
        lat: bounds.sw.lat + (bounds.ne.lat - bounds.sw.lat) * fy,
        lng: bounds.sw.lng + (bounds.ne.lng - bounds.sw.lng) * fx,
      });
    }
  }
  return out;
}

type LocalFrame = ReturnType<typeof localFrame>;

/**
 * Rasterise every mesh triangle into a height grid, keeping the highest and
 * lowest surface per cell.
 *
 * Sampling vertices alone leaves holes: the photogrammetric mesh puts few
 * vertices on flat roofs and vertical walls, which breaks a building into
 * disconnected fragments. Filling triangle interiors keeps surfaces contiguous.
 */
function rasterize(
  mesh: Map3dMeshResult,
  frame: LocalFrame,
  cell: number,
  cols: number,
  rows: number,
): { top: Array<number | null>; low: Array<number | null>; minAlt: number; maxAlt: number } {
  const top: Array<number | null> = new Array(cols * rows).fill(null);
  const low: Array<number | null> = new Array(cols * rows).fill(null);
  let minAlt = Infinity;
  let maxAlt = -Infinity;

  const put = (col: number, row: number, alt: number) => {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return;
    const i = row * cols + col;
    const t = top[i];
    if (t === null || t === undefined || alt > t) top[i] = alt;
    const l = low[i];
    if (l === null || l === undefined || alt < l) low[i] = alt;
    if (alt < minAlt) minAlt = alt;
    if (alt > maxAlt) maxAlt = alt;
  };

  for (const tile of mesh.tiles) {
    const projected = tile.vertices.map((v) => {
      const { x, y } = frame.project(v.lat, v.lng);
      return { col: x / cell, row: y / cell, alt: v.alt };
    });

    for (const [ia, ib, ic] of tile.triangles) {
      const a = projected[ia];
      const b = projected[ib];
      const c = projected[ic];
      if (!a || !b || !c) continue;

      const minCol = Math.floor(Math.min(a.col, b.col, c.col));
      const maxCol = Math.ceil(Math.max(a.col, b.col, c.col));
      const minRow = Math.floor(Math.min(a.row, b.row, c.row));
      const maxRow = Math.ceil(Math.max(a.row, b.row, c.row));
      // A triangle spanning the whole grid is a decal or a distant node; it
      // would flatten the raster, so keep it to its corners.
      if ((maxCol - minCol) * (maxRow - minRow) > 4096) {
        put(Math.round(a.col), Math.round(a.row), a.alt);
        put(Math.round(b.col), Math.round(b.row), b.alt);
        put(Math.round(c.col), Math.round(c.row), c.alt);
        continue;
      }

      const area = (b.col - a.col) * (c.row - a.row) - (c.col - a.col) * (b.row - a.row);
      if (Math.abs(area) < 1e-12) {
        put(Math.round(a.col), Math.round(a.row), a.alt);
        put(Math.round(b.col), Math.round(b.row), b.alt);
        put(Math.round(c.col), Math.round(c.row), c.alt);
        continue;
      }

      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          const w0 = ((b.col - col) * (c.row - row) - (c.col - col) * (b.row - row)) / area;
          const w1 = ((c.col - col) * (a.row - row) - (a.col - col) * (c.row - row)) / area;
          const w2 = 1 - w0 - w1;
          // A small negative tolerance keeps shared edges from dropping out.
          if (w0 < -0.05 || w1 < -0.05 || w2 < -0.05) continue;
          put(col, row, w0 * a.alt + w1 * b.alt + w2 * c.alt);
        }
      }
    }
  }

  return {
    top,
    low,
    minAlt: Number.isFinite(minAlt) ? minAlt : 0,
    maxAlt: Number.isFinite(maxAlt) ? maxAlt : 0,
  };
}

/** Local east/north metre frame anchored at the box's south-west corner. */
function localFrame(bounds: Map3dBounds) {
  const lat0 = bounds.sw.lat;
  const lng0 = bounds.sw.lng;
  const metersPerDegLat = (Math.PI / 180) * EARTH_RADIUS_METERS;
  const metersPerDegLng = metersPerDegLat * Math.cos(((bounds.ne.lat + bounds.sw.lat) / 2 / 180) * Math.PI);
  return {
    widthMeters: Math.abs(bounds.ne.lng - lng0) * metersPerDegLng,
    heightMeters: Math.abs(bounds.ne.lat - lat0) * metersPerDegLat,
    project(lat: number, lng: number) {
      return { x: (lng - lng0) * metersPerDegLng, y: (lat - lat0) * metersPerDegLat };
    },
    unproject(x: number, y: number) {
      return { lat: lat0 + y / metersPerDegLat, lng: lng0 + x / metersPerDegLng };
    },
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[index]!;
}

/** Monotone chain hull over lat/lng treated as a plane — fine at block scale. */
function convexHull(points: Array<{ lat: number; lng: number }>): Array<{ lat: number; lng: number }> {
  if (points.length < 3) return boundingRect(points);
  if (points.length === 3) return points;
  const sorted = [...points].sort((a, b) => (a.lng === b.lng ? a.lat - b.lat : a.lng - b.lng));
  const cross = (
    o: { lat: number; lng: number },
    a: { lat: number; lng: number },
    b: { lat: number; lng: number },
  ) => (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);

  const build = (input: Array<{ lat: number; lng: number }>) => {
    const chain: Array<{ lat: number; lng: number }> = [];
    for (const p of input) {
      while (chain.length >= 2 && cross(chain[chain.length - 2]!, chain[chain.length - 1]!, p) <= 0) {
        chain.pop();
      }
      chain.push(p);
    }
    chain.pop();
    return chain;
  };

  const hull = [...build(sorted), ...build([...sorted].reverse())];
  // Collinear cells collapse the chain; a footprint still has to be a polygon,
  // so fall back to the bounding rectangle.
  return hull.length >= 3 ? hull : boundingRect(points);
}

function boundingRect(points: Array<{ lat: number; lng: number }>): Array<{ lat: number; lng: number }> {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return [
    { lat: minLat, lng: minLng },
    { lat: minLat, lng: maxLng },
    { lat: maxLat, lng: maxLng },
    { lat: maxLat, lng: minLng },
  ];
}

function gridToObj(heights: Array<number | null>, cols: number, rows: number, step: number): string {
  const lines: string[] = ['# googlemaps-kit terrain sample (Google Earth photorealistic mesh)'];
  const index = new Array<number>(cols * rows).fill(0);
  let n = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const h = heights[row * cols + col];
      if (h === null || h === undefined) continue;
      lines.push(`v ${(col * step).toFixed(2)} ${h.toFixed(2)} ${(row * step).toFixed(2)}`);
      index[row * cols + col] = ++n;
    }
  }
  for (let row = 0; row + 1 < rows; row++) {
    for (let col = 0; col + 1 < cols; col++) {
      const a = index[row * cols + col]!;
      const b = index[row * cols + col + 1]!;
      const c = index[(row + 1) * cols + col + 1]!;
      const d = index[(row + 1) * cols + col]!;
      if (!a || !b || !c || !d) continue;
      lines.push(`f ${a} ${b} ${c}`);
      lines.push(`f ${a} ${c} ${d}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
