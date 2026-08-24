/**
 * Ready-made Intent tools for agents (Vercel AI SDK / OpenAI-style).
 *
 * @example
 * import { sdk, createMapsTools } from 'googlemaps-kit';
 * const maps = sdk();
 * const tools = createMapsTools(maps);
 * await tools.discover.execute({ query: 'coffee', nearLat: 12.98, nearLng: 77.64 });
 */

import type { GMapsClient } from './gmaps-client.js';
import type { TravelMode } from '../types/common.js';
import type { ProfileDepth } from '../types/dx.js';

export interface MapsToolDefinition<TArgs extends Record<string, unknown>, TResult> {
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute: (args: TArgs) => Promise<TResult>;
}

export interface CreateMapsToolsOptions {
  /**
   * When true for a tool name, execute throws until the host confirms.
   * Hosts should check `requireApproval` before calling execute.
   */
  requireApproval?: Partial<
    Record<
      'discover' | 'resolve' | 'profile' | 'route' | 'opinions' | 'media' | 'pipeline' | 'gridSearch',
      boolean
    >
  >;
}

function nearFromArgs(args: { nearLat?: number; nearLng?: number }) {
  if (args.nearLat != null && args.nearLng != null) {
    return { lat: args.nearLat, lng: args.nearLng };
  }
  return undefined;
}

function assertApproval(
  requireApproval: CreateMapsToolsOptions['requireApproval'],
  name: keyof NonNullable<CreateMapsToolsOptions['requireApproval']>,
): void {
  if (requireApproval?.[name]) {
    throw new Error(
      `Tool "${name}" requires host approval before execute (createMapsTools requireApproval).`,
    );
  }
}

/** Build Intent-backed tools for coding agents. */
export function createMapsTools(maps: GMapsClient, options: CreateMapsToolsOptions = {}) {
  const { requireApproval } = options;

  const discover: MapsToolDefinition<
    {
      query: string;
      nearLat?: number;
      nearLng?: number;
      mode?: 'fast' | 'full';
      limit?: number;
    },
    unknown
  > = {
    description:
      'Search Google Maps places near a bias point. Returns places with name, hexId, rating, lat/lng.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query, e.g. cafes in indiranagar' },
        nearLat: { type: 'number' },
        nearLng: { type: 'number' },
        mode: { type: 'string', enum: ['fast', 'full'] },
        limit: { type: 'number' },
      },
      required: ['query', 'nearLat', 'nearLng'],
    },
    execute: async (args) => {
      assertApproval(requireApproval, 'discover');
      const near = nearFromArgs(args);
      if (!near) throw new Error('discover requires nearLat and nearLng');
      return maps.discover({
        query: args.query,
        near,
        mode: args.mode,
        limit: args.limit,
      });
    },
  };

  const resolve: MapsToolDefinition<
    { query?: string; url?: string; nearLat?: number; nearLng?: number },
    unknown
  > = {
    description: 'Resolve a Maps URL or query to place identity (hexId/name/coords). Not a full card.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        url: { type: 'string' },
        nearLat: { type: 'number' },
        nearLng: { type: 'number' },
      },
    },
    execute: async (args) => {
      assertApproval(requireApproval, 'resolve');
      return maps.resolve({
        query: args.query,
        url: args.url,
        near: nearFromArgs(args),
      });
    },
  };

  const profile: MapsToolDefinition<
    { hexId: string; name?: string; lat?: number; lng?: number; depth?: ProfileDepth },
    unknown
  > = {
    description:
      'Fetch a place profile. Always read fields under place (place.name, place.rating).',
    parameters: {
      type: 'object',
      properties: {
        hexId: { type: 'string' },
        name: { type: 'string' },
        lat: { type: 'number' },
        lng: { type: 'number' },
        depth: { type: 'string', enum: ['card', 'full', 'complete'] },
      },
      required: ['hexId'],
    },
    execute: async (args) => {
      assertApproval(requireApproval, 'profile');
      return maps.profile(
        {
          hexId: args.hexId,
          name: args.name,
          lat: args.lat,
          lng: args.lng,
        },
        { depth: args.depth ?? 'card' },
      );
    },
  };

  const route: MapsToolDefinition<
    {
      fromLat: number;
      fromLng: number;
      toLat: number;
      toLng: number;
      mode?: TravelMode;
      includeSteps?: boolean;
    },
    unknown
  > = {
    description: 'Get directions between two coordinates. Default metrics only.',
    parameters: {
      type: 'object',
      properties: {
        fromLat: { type: 'number' },
        fromLng: { type: 'number' },
        toLat: { type: 'number' },
        toLng: { type: 'number' },
        mode: { type: 'string', enum: ['driving', 'walking', 'bicycling', 'transit'] },
        includeSteps: { type: 'boolean' },
      },
      required: ['fromLat', 'fromLng', 'toLat', 'toLng'],
    },
    execute: async (args) => {
      assertApproval(requireApproval, 'route');
      return maps.route({
        from: { lat: args.fromLat, lng: args.fromLng },
        to: { lat: args.toLat, lng: args.toLng },
        mode: args.mode,
        includeSteps: args.includeSteps,
      });
    },
  };

  const opinions: MapsToolDefinition<
    { hexId: string; name?: string; pages?: number; includeAggregates?: boolean },
    unknown
  > = {
    description: 'List place reviews. reviewCount is page size; totalReviews needs includeAggregates.',
    parameters: {
      type: 'object',
      properties: {
        hexId: { type: 'string' },
        name: { type: 'string' },
        pages: { type: 'number' },
        includeAggregates: { type: 'boolean' },
      },
      required: ['hexId'],
    },
    execute: async (args) => {
      assertApproval(requireApproval, 'opinions');
      return maps.opinions(
        { hexId: args.hexId, name: args.name },
        { pages: args.pages, includeAggregates: args.includeAggregates },
      );
    },
  };

  const media: MapsToolDefinition<{ hexId: string; name?: string; streetView?: boolean }, unknown> = {
    description: 'List place photos (PlacePhoto[]). Optional nearby Street View.',
    parameters: {
      type: 'object',
      properties: {
        hexId: { type: 'string' },
        name: { type: 'string' },
        streetView: { type: 'boolean' },
      },
      required: ['hexId'],
    },
    execute: async (args) => {
      assertApproval(requireApproval, 'media');
      return maps.media(
        { hexId: args.hexId, name: args.name },
        { streetView: args.streetView },
      );
    },
  };

  const pipeline: MapsToolDefinition<
    {
      query: string;
      nearLat: number;
      nearLng: number;
      maxPlaces?: number;
      depth?: ProfileDepth;
      includeOpinions?: boolean;
    },
    unknown
  > = {
    description: 'Discover places then profile each (optional opinions). One-shot lead scrape.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        nearLat: { type: 'number' },
        nearLng: { type: 'number' },
        maxPlaces: { type: 'number' },
        depth: { type: 'string', enum: ['card', 'full', 'complete'] },
        includeOpinions: { type: 'boolean' },
      },
      required: ['query', 'nearLat', 'nearLng'],
    },
    execute: async (args) => {
      assertApproval(requireApproval, 'pipeline');
      return maps.pipeline({
        discover: {
          query: args.query,
          near: { lat: args.nearLat, lng: args.nearLng },
        },
        maxPlaces: args.maxPlaces ?? 5,
        profile: { depth: args.depth ?? 'card' },
        opinions: args.includeOpinions ? {} : false,
      });
    },
  };

  const gridSearch: MapsToolDefinition<
    {
      query: string;
      north?: number;
      south?: number;
      east?: number;
      west?: number;
      nearLat?: number;
      nearLng?: number;
      spanKm?: number;
      cellZoom?: number;
      maxResults?: number;
    },
    unknown
  > = {
    description:
      'Exhaustively search an area: splits the bounding box into ~2 km cells and merges ' +
      'deduped results. Use instead of discover when coverage matters (lead lists, market ' +
      'mapping). Pass bounds (north/south/east/west) OR nearLat/nearLng + spanKm.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        north: { type: 'number' },
        south: { type: 'number' },
        east: { type: 'number' },
        west: { type: 'number' },
        nearLat: { type: 'number' },
        nearLng: { type: 'number' },
        spanKm: { type: 'number', description: 'Square box width in km when using nearLat/nearLng (default 3)' },
        cellZoom: { type: 'number', description: 'Grid subdivision zoom 10-18; 14 districts, 17 blocks (default 15)' },
        maxResults: { type: 'number' },
      },
      required: ['query'],
    },
    execute: async (args) => {
      assertApproval(requireApproval, 'gridSearch');
      const hasBounds =
        args.north != null && args.south != null && args.east != null && args.west != null;
      if (!hasBounds && (args.nearLat == null || args.nearLng == null)) {
        throw new Error('gridSearch requires bounds (north/south/east/west) or nearLat/nearLng');
      }
      return maps.grid({
        query: args.query,
        ...(hasBounds
          ? {
              bounds: {
                north: args.north!,
                south: args.south!,
                east: args.east!,
                west: args.west!,
              },
            }
          : { near: { lat: args.nearLat!, lng: args.nearLng! }, spanKm: args.spanKm }),
        cellZoom: args.cellZoom,
        maxResults: args.maxResults,
      });
    },
  };

  return {
    discover,
    resolve,
    profile,
    route,
    opinions,
    media,
    pipeline,
    gridSearch,
  } as const;
}

export type MapsTools = ReturnType<typeof createMapsTools>;
