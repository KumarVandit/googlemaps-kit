/**
 * Intent command runners — used by scripted CLI and TUI.
 */

import type { GMapsClient } from '../client/gmaps-client.js';
import type { PlaceRef } from '../types/dx.js';
import { parseCoords, parseEndpoint, type OutputFormat } from './args.js';
import {
  formatDiscoverTable,
  formatMediaPretty,
  formatOpinionsTable,
  formatProfilePretty,
  formatResolvePretty,
  formatRoutePretty,
  printJson,
} from './format.js';
import { toCsv, toGeoJSON } from '../utils/export-results.js';

export type ActionId =
  | 'discover'
  | 'resolve'
  | 'profile'
  | 'route'
  | 'opinions'
  | 'media'
  | 'pipeline'
  | 'capabilities';

export interface ActionMeta {
  id: ActionId;
  title: string;
  description: string;
}

export const ACTIONS: ActionMeta[] = [
  { id: 'discover', title: 'Discover', description: 'Search places near a point' },
  { id: 'resolve', title: 'Resolve', description: 'Turn a query or URL into a place id' },
  { id: 'profile', title: 'Profile', description: 'Place card — hours, phone, rating' },
  { id: 'route', title: 'Route', description: 'Directions between two places' },
  { id: 'opinions', title: 'Opinions', description: 'Read reviews for a place' },
  { id: 'media', title: 'Media', description: 'Photo URLs for a place' },
  { id: 'pipeline', title: 'Pipeline', description: 'Discover → profile in one shot' },
  { id: 'capabilities', title: 'Capabilities', description: 'What this session can do' },
];

export async function resolvePlaceRef(
  maps: GMapsClient,
  options: { hexId?: string; query?: string; name?: string; near?: string },
): Promise<PlaceRef> {
  const { hexId, query, name } = options;
  const near = parseCoords(options.near);

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
  const near = parseCoords(input.near);
  if (!near) throw new Error('discover requires near lat,lng');
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
    near: parseCoords(input.near),
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
    typeof from === 'string' && typeof to === 'string' ? `${from} → ${to}` : undefined;
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
  const near = parseCoords(input.near);
  if (!near) throw new Error('pipeline requires near lat,lng');
  const profileDepth = input.profile === false ? false : { depth: input.profile ?? 'card' };
  const result = await maps.pipeline({
    discover: { query: input.query, near, mode: 'fast' },
    maxPlaces: input.max ?? 3,
    profile: profileDepth,
    opinions: input.opinions ? { pages: 1, limit: 3 } : false,
  });
  if (input.format === 'json') return JSON.stringify(result, null, 2);

  const lines = [
    `pipeline · ${result.places.length} places · ${Math.round(result.timingMs)}ms`,
    '─'.repeat(56),
  ];
  for (const row of result.places) {
    const p = row.profile?.place ?? row.hit;
    const rating = p.rating != null ? `★ ${p.rating.toFixed(1)}` : '★ —';
    const reviews = p.reviewCount != null ? `(${p.reviewCount})` : '';
    lines.push(`${p.name ?? '—'}  ${rating} ${reviews}`.trim());
    if (p.address) lines.push(`  ${p.address}`);
    const snippet = row.opinions?.reviews?.[0]?.text ?? row.opinions?.reviews?.[0]?.textPreview;
    if (snippet) {
      const t = snippet.replace(/\s+/g, ' ').trim().slice(0, 70);
      lines.push(`  “${t}${t.length >= 70 ? '…' : ''}”`);
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

/** Print helper for scripted CLI stdout. */
export function emit(text: string, format: OutputFormat): void {
  if (format === 'json') {
    // already JSON string from runners
    console.log(text);
    return;
  }
  console.log(text);
}

export { printJson };
