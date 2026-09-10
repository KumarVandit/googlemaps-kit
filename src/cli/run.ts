/**
 * Intent command runners — used by scripted CLI and TUI.
 */

import type { GMapsClient } from '../client/gmaps-client.js';
import type { PlaceRef } from '../types/dx.js';
import { parseCoords, parseEndpoint, type OutputFormat } from './args.js';
import {
  arrow,
  cross,
  dot,
  ellipsis,
  emdash,
  rule,
} from './output.js';
import {
  formatDiscoverTable,
  formatMediaPretty,
  formatOpinionsTable,
  formatProfilePretty,
  formatResolvePretty,
  formatRoutePretty,
  printJson,
} from './format.js';
import { writeFileSync } from 'node:fs';
import { toCsv, toGeoJSON } from '../utils/export-results.js';

export type ActionId =
  | 'discover'
  | 'resolve'
  | 'profile'
  | 'route'
  | 'opinions'
  | 'media'
  | 'pipeline'
  | 'grid'
  | 'geocode'
  | 'streetview'
  | 'terrain'
  | 'surfaces'
  | 'capabilities';

export interface ActionMeta {
  id: ActionId;
  title: string;
  description: string;
}

export const ACTIONS: ActionMeta[] = [
  { id: 'discover', title: 'Discover', description: 'Search places near a point' },
  { id: 'grid', title: 'Grid search', description: 'Exhaustive area crawl — every result in a box' },
  { id: 'resolve', title: 'Resolve', description: 'Turn a query or URL into a place id' },
  { id: 'profile', title: 'Profile', description: 'Place card — hours, phone, rating' },
  { id: 'route', title: 'Route', description: 'Directions between two places' },
  { id: 'opinions', title: 'Opinions', description: 'Read reviews for a place' },
  { id: 'media', title: 'Media', description: 'Photo URLs for a place' },
  { id: 'geocode', title: 'Geocode', description: 'Address ↔ coordinates' },
  { id: 'streetview', title: 'Street View', description: 'Nearest panorama + thumbnail' },
  { id: 'terrain', title: '3D terrain', description: 'Rocktree mesh/OBJ for an area' },
  { id: 'surfaces', title: 'Surfaces', description: 'Catalog of supported Maps surfaces' },
  { id: 'pipeline', title: 'Pipeline', description: 'Discover → profile in one shot' },
  { id: 'capabilities', title: 'Capabilities', description: 'What this session can do' },
];

export async function resolvePlaceRef(
  maps: GMapsClient,
  options: { hexId?: string; query?: string; name?: string; near?: string },
): Promise<PlaceRef> {
  const { hexId, query, name } = options;
  const near = options.near?.trim() || undefined;

  if (hexId && (hexId.includes('0x') || hexId.startsWith('ChIJ') || /^[0-9a-fx:]+$/i.test(hexId))) {
    return { hexId, name };
  }

  const q = query ?? (hexId && hexId.includes(' ') ? hexId : undefined);
  if (!q) {
    throw new Error('Need a place: pass hexId or query (+ near)');
  }

  const resolved = await maps.resolve({ query: q, near });
  if (!resolved.hexId) {
    throw new Error(`Could not resolve a place id for: ${q}`);
  }
  return {
    hexId: resolved.hexId,
    name: resolved.name ?? name,
    lat: resolved.lat,
    lng: resolved.lng,
    placeId: resolved.placeId,
  };
}

export interface RunDiscoverInput {
  query: string;
  near: string;
  mode?: 'fast' | 'full';
  limit?: number;
  format?: OutputFormat;
}

export async function runDiscover(maps: GMapsClient, input: RunDiscoverInput): Promise<string> {
  const near = input.near.trim();
  if (!near) throw new Error('discover requires --near <lat,lng|place>');
  const result = await maps.discover({
    query: input.query,
    near,
    mode: input.mode ?? 'fast',
    limit: input.limit,
  });
  const format = input.format ?? 'table';
  if (format === 'json') return JSON.stringify(result, null, 2);
  if (format === 'csv') return toCsv(result.places);
  if (format === 'geojson') return JSON.stringify(toGeoJSON(result.places), null, 2);
  return formatDiscoverTable(result);
}

export async function runResolve(
  maps: GMapsClient,
  input: { query?: string; url?: string; near?: string; format?: OutputFormat },
): Promise<string> {
  if (!input.query && !input.url) throw new Error('resolve requires query or url');
  const result = await maps.resolve({
    query: input.query,
    url: input.url,
    near: input.near?.trim() || undefined,
  });
  if (input.format === 'json') return JSON.stringify(result, null, 2);
  return formatResolvePretty(result);
}

export async function runProfile(
  maps: GMapsClient,
  input: {
    query?: string;
    hexId?: string;
    name?: string;
    near?: string;
    depth?: 'card' | 'full' | 'complete';
    format?: OutputFormat;
  },
): Promise<string> {
  const ref = await resolvePlaceRef(maps, input);
  const result = await maps.profile(ref, { depth: input.depth ?? 'card' });
  if (input.format === 'json') return JSON.stringify(result, null, 2);
  return formatProfilePretty(result);
}

export async function runRoute(
  maps: GMapsClient,
  input: {
    from: string;
    to: string;
    mode?: 'driving' | 'walking' | 'bicycling' | 'transit';
    format?: OutputFormat;
  },
): Promise<string> {
  const from = parseEndpoint(input.from);
  const to = parseEndpoint(input.to);
  const result = await maps.route({ from, to, mode: input.mode });
  if (input.format === 'json') return JSON.stringify(result, null, 2);
  const label =
    typeof from === 'string' && typeof to === 'string' ? `${from} ${arrow()} ${to}` : undefined;
  return formatRoutePretty(result, label);
}

export async function runOpinions(
  maps: GMapsClient,
  input: {
    query?: string;
    hexId?: string;
    near?: string;
    pages?: number;
    limit?: number;
    aggregates?: boolean;
    format?: OutputFormat;
  },
): Promise<string> {
  const ref = await resolvePlaceRef(maps, input);
  const result = await maps.opinions(ref, {
    pages: input.pages ?? 1,
    limit: input.limit ?? 5,
    includeAggregates: input.aggregates === true,
  });
  if (input.format === 'json') return JSON.stringify(result, null, 2);
  return formatOpinionsTable(result);
}

export async function runMedia(
  maps: GMapsClient,
  input: {
    query?: string;
    hexId?: string;
    near?: string;
    limit?: number;
    format?: OutputFormat;
  },
): Promise<string> {
  const ref = await resolvePlaceRef(maps, input);
  const result = await maps.media(ref, { pageSize: input.limit ?? 8 });
  if (input.format === 'json') return JSON.stringify(result, null, 2);
  return formatMediaPretty(result);
}

export async function runPipeline(
  maps: GMapsClient,
  input: {
    query: string;
    near: string;
    max?: number;
    profile?: 'card' | 'full' | 'complete' | false;
    opinions?: boolean;
    format?: OutputFormat;
  },
): Promise<string> {
  const near = input.near.trim();
  if (!near) throw new Error('pipeline requires --near <lat,lng|place>');
  const profileDepth = input.profile === false ? false : { depth: input.profile ?? 'card' };
  const result = await maps.pipeline({
    discover: { query: input.query, near, mode: 'fast' },
    maxPlaces: input.max ?? 3,
    profile: profileDepth,
    opinions: input.opinions ? { pages: 1, limit: 3 } : false,
  });
  if (input.format === 'json') return JSON.stringify(result, null, 2);

  const lines = [
    `pipeline ${dot()} ${result.places.length} places ${dot()} ${Math.round(result.timingMs)}ms`,
    rule(56),
  ];
  for (const row of result.places) {
    const p = row.profile?.place ?? row.hit;
    const rating = p.rating != null ? `★ ${p.rating.toFixed(1)}` : `★ ${emdash()}`;
    const reviews = p.reviewCount != null ? `(${p.reviewCount})` : '';
    lines.push(`${p.name ?? emdash()}  ${rating} ${reviews}`.trim());
    if (p.address) lines.push(`  ${p.address}`);
    const snippet = row.opinions?.reviews?.[0]?.text ?? row.opinions?.reviews?.[0]?.textPreview;
    if (snippet) {
      const t = snippet.replace(/\s+/g, ' ').trim().slice(0, 70);
      lines.push(`  "${t}${t.length >= 70 ? ellipsis() : ''}"`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

export async function runCapabilities(
  maps: GMapsClient,
  input: { format?: OutputFormat } = {},
): Promise<string> {
  const caps = await maps.capabilities();
  if (input.format === 'json') return JSON.stringify(caps, null, 2);
  return [
    `session   ${caps.session}${caps.signedIn ? ' (signed in)' : ''}`,
    `search    yes`,
    `details   yes`,
    `reviews   boq${caps.reviewsRpc ? ' + rpc' : ''}`,
    `photos    yes`,
    `directions yes`,
    `askMaps   ${caps.askMaps ? 'yes' : 'no (needs cookies)'}`,
  ].join('\n');
}

/** Parse "N,S,E,W" (north,south,east,west order) into a bounds object. */
export function parseBounds(value: string | undefined): {
  north: number;
  south: number;
  east: number;
  west: number;
} | undefined {
  if (!value) return undefined;
  const parts = value.split(',').map((s) => Number(s.trim()));
  const [north, south, east, west] = parts as [number, number, number, number];
  if (
    parts.length !== 4 ||
    parts.some((n) => Number.isNaN(n)) ||
    north <= south ||
    east <= west
  ) {
    throw new Error(`Invalid --bounds "${value}" (expected north,south,east,west with N>S and E>W)`);
  }
  return { north, south, east, west };
}

function boundsSummary(bounds: {
  north: number;
  south: number;
  east: number;
  west: number;
}): string {
  return `N${bounds.north.toFixed(4)} S${bounds.south.toFixed(4)} E${bounds.east.toFixed(4)} W${bounds.west.toFixed(4)}`;
}

export async function runGrid(
  maps: GMapsClient,
  input: {
    query: string;
    near?: string;
    spanKm?: number;
    bounds?: { north: number; south: number; east: number; west: number };
    cellZoom?: number;
    maxResults?: number;
    maxCells?: number;
    pagesPerCell?: number;
    format?: OutputFormat;
  },
): Promise<string> {
  if (!input.bounds && !input.near) {
    throw new Error('grid requires --bounds "N,S,E,W" or --near <lat,lng|place> (+ optional --span km)');
  }
  const result = await maps.grid({
    query: input.query,
    bounds: input.bounds,
    near: input.near?.trim() || undefined,
    spanKm: input.spanKm,
    cellZoom: input.cellZoom,
    maxResults: input.maxResults,
    maxCells: input.maxCells,
    pagesPerCell: input.pagesPerCell,
  });

  const places = result.places;
  if (input.format === 'csv') return toCsv(places);
  if (input.format === 'geojson') return JSON.stringify(toGeoJSON(places), null, 2);
  if (input.format === 'json') return JSON.stringify(result, null, 2);

  const lines = [
    `grid ${dot()} ${result.places.length} unique places ${dot()} ${result.cellsSearched}/${result.cellsTotal} cells ${dot()} ${result.requestsMade} requests ${dot()} ${Math.round(result.timingMs)}ms`,
    rule(56),
  ];
  places.slice(0, 30).forEach((p, i) => {
    const rating = p.rating != null ? `★ ${p.rating.toFixed(1)}` : `  ${emdash()}`;
    const revs = p.reviewCount != null ? ` (${p.reviewCount})` : '';
    const where =
      p.lat != null && p.lng != null ? `  ${p.lat.toFixed(5)},${p.lng.toFixed(5)}` : '';
    lines.push(`${String(i + 1).padStart(3)}. ${rating}${revs}  ${p.name ?? emdash()}${where}`);
    if (p.address) lines.push(`     ${truncateInline(p.address, 66)}`);
  });
  if (places.length > 30) lines.push(`${ellipsis()} +${places.length - 30} more`);
  lines.push(`area  ${boundsSummary(input.bounds ?? { north: NaN, south: NaN, east: NaN, west: NaN })}`);
  return lines.join('\n');
}

function truncateInline(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, Math.max(0, max - 1))}${ellipsis()}`;
}

export async function runGeocode(
  maps: GMapsClient,
  input: { query?: string; reverse?: string; format?: OutputFormat },
): Promise<string> {
  if (!input.query && !input.reverse) throw new Error('geocode requires an address or --reverse lat,lng');

  let payload: Record<string, unknown>;
  if (input.reverse) {
    const coords = parseCoords(input.reverse);
    if (!coords) throw new Error('--reverse expects lat,lng');
    const { result } = await maps.location.geocode.reverseGeocode(coords.lat, coords.lng);
    payload = result
      ? {
          query: input.reverse,
          name: result.name,
          address: result.formattedAddress,
          hexId: result.hexId,
          lat: result.lat,
          lng: result.lng,
          timezone: result.timezone,
          plusCode: result.plusCodeAddress ?? result.plusCode,
        }
      : { query: input.reverse, lat: coords.lat, lng: coords.lng, address: null };
  } else {
    const { result } = await maps.location.geocode.geocode(input.query!);
    payload = result
      ? {
          query: input.query,
          name: result.name,
          address: result.formattedAddress,
          hexId: result.hexId,
          lat: result.lat,
          lng: result.lng,
          timezone: result.timezone,
          category: result.category,
        }
      : { query: input.query, address: null };
  }

  if (input.format === 'json') return JSON.stringify(payload, null, 2);
  if (!payload.lat && !payload.lng && !payload.address) {
    return `No match for: ${input.query ?? input.reverse}`;
  }
  const lines = [
    String(payload.address ?? payload.name ?? emdash()),
    payload.name !== payload.address && payload.name ? String(payload.name) : undefined,
    payload.lat != null ? `coords ${payload.lat}, ${payload.lng}` : undefined,
    payload.hexId ? `hex    ${payload.hexId}` : undefined,
    payload.plusCode ? `plus   ${payload.plusCode}` : undefined,
    payload.timezone ? `tz     ${payload.timezone}` : undefined,
  ].filter(Boolean);
  return lines.join('\n');
}

export async function runStreetView(
  maps: GMapsClient,
  input: { at?: string; query?: string; radiusMeters?: number; headingYaw?: number; format?: OutputFormat },
): Promise<string> {
  let lat: number | undefined;
  let lng: number | undefined;

  if (input.at) {
    const c = await maps.location.geocode.resolveBias(input.at);
    ({ lat, lng } = c);
  } else if (input.query) {
    const resolved = await maps.resolve({ query: input.query });
    if (resolved.lat == null || resolved.lng == null) {
      throw new Error(`Could not resolve coordinates for: ${input.query}`);
    }
    lat = resolved.lat;
    lng = resolved.lng;
  } else {
    throw new Error('streetview requires --at lat,lng or a place query');
  }

  const meta = await maps.map.panorama.getByLocation(lat, lng, {
    radiusMeters: input.radiusMeters ?? 200,
  });
  if (!meta) {
    const msg = `No Street View coverage within ${input.radiusMeters ?? 200} m of ${lat},${lng}`;
    if (input.format === 'json') return JSON.stringify({ found: false, message: msg }, null, 2);
    return msg;
  }

  const yaw = input.headingYaw ?? 0;
  const thumbnail = maps.map.panorama.buildThumbnailUrl({
    panoId: meta.panoId,
    width: 640,
    height: 400,
    yaw,
  });

  if (input.format === 'json') {
    return JSON.stringify({ ...meta, thumbnail }, (_k, v) => (v instanceof Uint8Array ? undefined : v), 2);
  }

  const lines = [
    meta.panoId,
    meta.captureDate ? `captured ${meta.captureDate}` : undefined,
    meta.lat != null && meta.lng != null ? `${meta.lat.toFixed(6)}, ${meta.lng.toFixed(6)}` : undefined,
    meta.links?.length ? `${meta.links.length} linked panoramas` : undefined,
    `thumb  ${thumbnail}`,
  ].filter(Boolean);
  return lines.join('\n');
}

export async function runTerrain(
  maps: GMapsClient,
  input: {
    bounds?: { north: number; south: number; east: number; west: number };
    planet?: 'earth' | 'mars' | 'moon';
    resolution?: 'low' | 'medium' | 'high';
    detail?: 'low' | 'medium' | 'high' | 'max';
    out?: string;
    format?: OutputFormat;
  },
): Promise<string> {
  if (!input.bounds) throw new Error('terrain requires --bounds "N,S,E,W"');
  const result = await maps.map.map3d.getTerrain({
    bounds: {
      ne: { lat: input.bounds.north, lng: input.bounds.east },
      sw: { lat: input.bounds.south, lng: input.bounds.west },
    },
    planet: input.planet,
    resolution: input.resolution,
    detail: input.detail,
  });

  let outPath: string | undefined;
  if (input.out) {
    writeFileSync(input.out, result.mesh);
    outPath = input.out;
  }

  if (input.format === 'json') {
    return JSON.stringify(
      {
        planet: input.planet ?? 'earth',
        bounds: input.bounds,
        grid: { cols: result.grid.cols, rows: result.grid.rows, stepMeters: result.grid.stepMeters },
        minAltMeters: Number(result.minAlt.toFixed(1)),
        maxAltMeters: Number(result.maxAlt.toFixed(1)),
        objBytes: result.mesh.length,
        writtenTo: outPath,
      },
      null,
      2,
    );
  }

  const lines = [
    `${input.planet ?? 'earth'} terrain ${dot()} ${boundsSummary(input.bounds)}`,
    `grid   ${result.grid.cols}${cross()}${result.grid.rows} @ ${result.grid.stepMeters} m step`,
    `alt    ${result.minAlt.toFixed(0)} ${arrow()} ${result.maxAlt.toFixed(0)} m`,
    `obj    ${result.mesh.length} bytes${outPath ? ` ${arrow()} ${outPath}` : ' (pass --out to save)'}`,
  ];
  return lines.join('\n');
}

const SURFACE_STATUS_ORDER = ['working', 'fallback', 'auth-required', 'blocked', 'unverified', 'not-used-by-web'];

export async function runSurfaces(
  maps: GMapsClient,
  input: { status?: string; format?: OutputFormat } = {},
): Promise<string> {
  const catalog: Record<string, { status: string; method: string; path: string; notes?: string }> = maps.surfaces.catalog();
  const statusFilter = input.status?.toLowerCase();
  if (statusFilter && !SURFACE_STATUS_ORDER.includes(statusFilter)) {
    throw new Error(`Invalid --status "${input.status}" (expected ${SURFACE_STATUS_ORDER.join('|')})`);
  }
  const rows = Object.entries(catalog)
    .filter(([, info]) => !statusFilter || info.status === statusFilter)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  if (input.format === 'json') return JSON.stringify(Object.fromEntries(rows), null, 2);

  const counts = Object.entries(catalog).reduce<Record<string, number>>((acc, [, info]) => {
    acc[info.status] = (acc[info.status] ?? 0) + 1;
    return acc;
  }, {});
  const countLine = SURFACE_STATUS_ORDER.filter((s) => counts[s]).map((s) => `${counts[s]} ${s}`).join(` ${dot()} `);

  const width = Math.min(28, Math.max(...rows.map(([name]) => name.length)));
  const lines = [`surfaces ${dot()} ${rows.length} shown ${dot()} ${countLine}`, rule(56)];
  for (const [name, info] of rows) {
    lines.push(`${name.padEnd(width)}  ${info.status.padEnd(15)} ${info.path}`);
  }
  lines.push('');
  lines.push('details: googlemaps-kit surfaces --format json');
  return lines.join('\n');
}

/** Print helper for scripted CLI stdout — runners return fully-rendered text. */
export function emit(text: string): void {
  console.log(text);
}

export { printJson };
