import type { Coordinates } from './common.js';
import type { RocktreePlanet } from '../rpc/earth-rocktree.js';

/**
 * Bounding box in the Earth octree's native `ne`/`sw` corner spelling
 * (distinct from {@link LatLngBounds} in `types/directions.ts`, which uses `southwest`/`northeast`).
 *
 * Coordinates are geodetic lat/lng regardless of planet — mars/moon octrees
 * use the same spherical mapping.
 */
export interface Map3dBounds {
  ne: Coordinates;
  sw: Coordinates;
}

/** How finely to sample the photorealistic octree. */
export type Map3dDetail = 'low' | 'medium' | 'high' | 'max';

export interface Map3dMeshOptions {
  bounds: Map3dBounds;
  /**
   * Target ground sampling distance. `low` ≈ 40 m/texel (city block massing),
   * `high` ≈ 2 m/texel (individual buildings), `max` descends as deep as the
   * octree publishes. Defaults to `high`.
   */
  detail?: Map3dDetail;
  /** Explicit target metres-per-texel; overrides `detail`. */
  metersPerTexel?: number;
  /** Include the node's 512×512 JPEG texture bytes. Defaults to false. */
  includeTextures?: boolean;
  /** Cap on nodes fetched. Defaults to 16. */
  maxTiles?: number;
  /**
   * Which rocktree planetoid to walk. `earth` (default), `mars` or `moon` —
   * all three serve the same octree protocol anonymously.
   */
  planet?: RocktreePlanet;
}

export interface Map3dVertex {
  lat: number;
  lng: number;
  /** Height above the 6 371 010 m reference sphere, in metres. */
  alt: number;
}

export interface Map3dTile {
  /** Octant path identifying this node in the Earth octree. */
  path: string;
  /** Ground sampling distance of this node, in metres. */
  metersPerTexel: number;
  vertices: Map3dVertex[];
  /** Triangle vertex indices, three per face. */
  triangles: Array<[number, number, number]>;
  /** Per-vertex texture coordinates in [0,1], when the node carries them. */
  uvs: Array<[number, number]> | null;
  texture: { format: 'jpeg' | 'unknown'; width: number; height: number; bytes: Uint8Array } | null;
  bounds: Map3dBounds;
}

export interface Map3dMeshResult {
  tiles: Map3dTile[];
  bounds: Map3dBounds;
  /** Deepest octree level reached. */
  level: number;
  vertexCount: number;
  triangleCount: number;
  attribution: string;
}

export interface Map3dBuildingsOptions {
  bounds: Map3dBounds;
  /** Ignore structures shorter than this, in metres. Defaults to 4. */
  minHeight?: number;
  sort?: 'height' | 'prominence' | 'area';
  detail?: Map3dDetail;
  maxTiles?: number;
  /** Rocktree planetoid to walk (default earth). */
  planet?: RocktreePlanet;
}

export interface Building3d {
  id: string;
  outline: Array<{ lat: number; lng: number }>;
  /** Height above local ground, in metres. */
  height: number;
  centerLat: number;
  centerLng: number;
  /** Footprint area in square metres. */
  areaSqM: number;
  /** Ground height above the reference sphere, in metres. */
  groundAlt: number;
  color?: string;
  address?: string;
  buildingType?: string;
}

export interface Map3dTerrainOptions {
  bounds: Map3dBounds;
  /** Grid step: `low` 32 m, `medium` 16 m, `high` 8 m. Defaults to medium. */
  resolution?: 'low' | 'medium' | 'high';
  detail?: Map3dDetail;
  maxTiles?: number;
  /** Emit a Wavefront OBJ of the sampled surface. Defaults to true. */
  includeMesh?: boolean;
  /** Rocktree planetoid to walk (default earth). */
  planet?: RocktreePlanet;
}

export interface Terrain3dGrid {
  cols: number;
  rows: number;
  /** Row-major heights above the reference sphere; `null` where unsampled. */
  heights: Array<number | null>;
  /** Grid step in metres. */
  stepMeters: number;
}

export interface Terrain3dResult {
  /** Wavefront OBJ of the sampled surface (empty when `includeMesh` is false). */
  mesh: Buffer;
  format: 'obj';
  bounds: Map3dBounds;
  grid: Terrain3dGrid;
  minAlt: number;
  maxAlt: number;
  attribution: string;
}
