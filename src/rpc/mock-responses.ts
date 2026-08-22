/**
 * Mock RPC response generators for testing tile and imagery services.
 * These utilities help create realistic protobuf responses for validation.
 */

import type { PbNode } from '../types/protobuf.js';

/**
 * Generate a mock tile response for testing.
 * Returns a minimal protobuf-like structure matching tile response format.
 */
export function mockTileResponse(options: {
  zoom: number;
  x: number;
  y: number;
  mimeType?: string;
}): PbNode {
  return [
    options.zoom,
    options.x,
    options.y,
    options.mimeType || 'image/png',
  ];
}

/**
 * Generate a mock school marker response for testing.
 */
export function mockSchoolsResponse(schools: Array<{
  id: string;
  name: string;
  type?: string;
  lat: number;
  lng: number;
  rating?: number;
}>): any {
  return [
    null,
    [
      schools.map(s => [
        s.id,
        s.name,
        s.type || 'elementary',
        [s.lat, s.lng],
        s.rating,
      ]),
    ],
  ];
}

/**
 * Generate a mock attribute catalog response for testing.
 */
export function mockAttributeCatalogResponse(categories: Array<{
  id: string;
  name: string;
  attributes: Array<{
    id: string;
    name: string;
    icon?: string;
  }>;
}>): any {
  return [
    null,
    categories.map(cat => [
      cat.id,
      cat.name,
      cat.attributes.map(attr => [
        attr.id,
        attr.name,
        null,
        null,
        attr.icon,
      ]),
    ]),
  ];
}

/**
 * Generate a mock parking search response.
 */
export function mockParkingResponse(results: Array<{
  id: string;
  name: string;
  type?: string;
  lat: number;
  lng: number;
  distance?: number;
  rating?: number;
}>): any {
  return [
    null,
    [
      results.map(p => [
        p.id,
        p.name,
        p.type || 'surface',
        [p.lat, p.lng],
        p.distance || 0,
        p.rating,
      ]),
    ],
  ];
}

/**
 * Generate a mock traffic incidents response.
 */
export function mockTrafficIncidentsResponse(incidents: Array<{
  id: string;
  type: string;
  severity: string;
  lat: number;
  lng: number;
  title: string;
}>): any {
  return [
    null,
    [
      incidents.map(i => [
        i.id,
        i.type,
        i.severity,
        [i.lat, i.lng],
        i.title,
      ]),
    ],
  ];
}

/**
 * Generate a mock location context response for nearby areas.
 */
export function mockLocationContextResponse(areas: Array<{
  id: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  distance?: number;
}>): any {
  return [
    null,
    [
      areas.map(a => [
        a.id,
        a.name,
        a.type,
        [a.lat, a.lng],
        a.distance || 0,
      ]),
    ],
  ];
}

/**
 * Create a mock tile buffer (PNG placeholder).
 * Returns minimal PNG header + placeholder data.
 */
export function mockTileBuffer(): Buffer {
  // Minimal PNG signature + IHDR chunk (1x1 transparent pixel)
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, // IHDR length
    0x49, 0x48, 0x44, 0x52, // IHDR
    0x00, 0x00, 0x00, 0x01, // width: 1
    0x00, 0x00, 0x00, 0x01, // height: 1
    0x08, 0x06, 0x00, 0x00, 0x00, // bit depth, color type, etc.
    0x1f, 0x15, 0xc4, 0x89, // CRC
  ]);
  return png;
}

/**
 * Create a mock terrain mesh buffer.
 * Returns minimal GLTF or OBJ placeholder.
 */
export function mockTerrainMesh(format: 'gltf' | 'obj' | 'ply' = 'gltf'): Buffer {
  if (format === 'obj') {
    // Minimal OBJ file (single triangle)
    return Buffer.from(
      `# Placeholder OBJ\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n`,
      'utf8'
    );
  } else if (format === 'ply') {
    // Minimal PLY file
    return Buffer.from(
      `ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n1 0 0\n0 1 0\n3 0 1 2\n`,
      'utf8'
    );
  }
  // Minimal GLTF binary
  return Buffer.from([
    0x67, 0x6c, 0x54, 0x46, // glTF magic
    0x02, 0x00, 0x00, 0x00, // version 2
    0x00, 0x00, 0x00, 0x00, // length (will be invalid, but ok for testing)
  ]);
}
