/**
 * Ask Maps + Maps AI surfaces.
 *
 * Consumer Maps:
 *   - MapsAiAgentService.CallAskMapsAgent (rpcid EGR9cd) — Gemini conversational search
 *   - MapsAskMapsHistoryService.* — thread history (signed-in)
 *   - MapsGenAiSearchService.SubmitUserFeedback — telemetry only
 *
 * Places API (New) AI field masks are Platform-only (API key). They do **not** appear in
 * anonymous consumer place-preview payloads:
 *   generativeSummary | reviewSummary | neighborhoodSummary | evChargeAmenitySummary
 *
 * Desktop Maps often shows “Ask Maps is coming soon” and routes users to mobile; anonymous
 * batchexecute returns HTTP 500 for every probed arg shape. Signed-in cookies
 * (`GMAPS_COOKIES`) are required to exercise the agent.
 */

import { HttpClient } from '../client/http-client.js';
import { createRpcClient, isBatchErrorCode, parseBatchPayload } from '../rpc/batch-rpc.js';
import { BATCH_SERVICES } from '../rpc/batch-services.js';
import {
  GMapsAuthError,
  GMapsError,
  type Coordinates,
  type GMapsConfig,
} from '../types/common.js';
import { safeGet } from '../utils/safe-get.js';

export interface AskMapsOptions {
  /** Natural-language query, e.g. "best vegetarian restaurants near HSR". */
  query: string;
  /** Viewport bias (improves local answers when the arg shape is accepted). */
  location?: Coordinates;
  zoom?: number;
  /** Opaque conversation / thread id when continuing a chat. */
  threadId?: string;
}

export interface AskMapsPlaceRef {
  name?: string;
  hexId?: string;
  placeId?: string;
  lat?: number;
  lng?: number;
  rating?: number;
}

export interface AskMapsResult {
  /** Free-text answer chunks from the agent (when present). */
  text: string[];
  /** Places the agent cited, when parseable. */
  places: AskMapsPlaceRef[];
  /** Raw batchexecute payload for debugging. */
  raw?: unknown;
  /** Wall time for the RPC. */
  timingMs: number;
}

export interface AskMapsHistoryThread {
  id?: string;
  title?: string;
  raw?: unknown;
}

/** Official Places API (New) AI field masks — not served on consumer Maps preview. */
export const PLATFORM_AI_FIELD_MASKS = [
  'generativeSummary',
  'reviewSummary',
  'neighborhoodSummary',
  'evChargeAmenitySummary',
] as const;

export type PlatformAiFieldMask = (typeof PLATFORM_AI_FIELD_MASKS)[number];

export interface MapsAiCapability {
  id: string;
  surface: 'consumer-batchexecute' | 'places-platform' | 'telemetry';
  status: 'auth-required' | 'platform-only' | 'telemetry-only';
  notes: string;
}

export const MAPS_AI_CAPABILITIES: MapsAiCapability[] = [
  {
    id: 'CallAskMapsAgent',
    surface: 'consumer-batchexecute',
    status: 'auth-required',
    notes:
      'MapsAiAgentService.CallAskMapsAgent (EGR9cd). Anonymous → HTTP 500; desktop often gated to mobile.',
  },
  {
    id: 'AskMapsHistory',
    surface: 'consumer-batchexecute',
    status: 'auth-required',
    notes: 'MapsAskMapsHistoryService List/Get/Delete/Share threads — signed-in only.',
  },
  {
    id: 'SubmitUserFeedback',
    surface: 'telemetry',
    status: 'telemetry-only',
    notes: 'MapsGenAiSearchService.SubmitUserFeedback — not a data API.',
  },
  {
    id: 'generativeSummary',
    surface: 'places-platform',
    status: 'platform-only',
    notes: 'Places API (New) field mask; requires Cloud API key. Absent from consumer preview.',
  },
  {
    id: 'reviewSummary',
    surface: 'places-platform',
    status: 'platform-only',
    notes: 'Places API (New) field mask; Gemini review themes. Absent from consumer preview.',
  },
  {
    id: 'neighborhoodSummary',
    surface: 'places-platform',
    status: 'platform-only',
    notes: 'Places API (New) area summary field mask.',
  },
  {
    id: 'evChargeAmenitySummary',
    surface: 'places-platform',
    status: 'platform-only',
    notes: 'Places API (New) EV amenity summary field mask.',
  },
];

/**
 * Build CallAskMapsAgent args from the Maps JS `yXd` request layout:
 * R7b{1: context(81), 2: Q7b{2: P7b{1: [O7b{query}]}, 3?: viewport}}.
 */
export function buildAskMapsArgs(options: AskMapsOptions): unknown[] {
  const query = options.query.trim();
  const o7b = [null, query];
  const p7b = [null, [o7b]];
  const viewport =
    options.location != null
      ? [null, null, [options.location.lat, options.location.lng, options.zoom ?? 14]]
      : null;
  const q7b = [null, null, p7b, viewport];
  const r7b = [[null, 81], q7b];
  if (options.threadId) {
    return [[options.threadId, r7b]];
  }
  return [r7b];
}

function extractAskText(root: unknown): string[] {
  const out: string[] = [];
  const walk = (node: unknown, depth = 0): void => {
    if (depth > 12) return;
    if (
      typeof node === 'string' &&
      node.length > 40 &&
      !node.startsWith('http') &&
      !/^[A-Za-z0-9+/=_-]{40,}$/.test(node)
    ) {
      out.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node.slice(0, 40)) walk(child, depth + 1);
    }
  };
  walk(root);
  return [...new Set(out)].slice(0, 20);
}

function extractAskPlaces(root: unknown): AskMapsPlaceRef[] {
  const places: AskMapsPlaceRef[] = [];
  const walk = (node: unknown, depth = 0): void => {
    if (depth > 10 || !Array.isArray(node)) return;
    const hex = safeGet<string>(node, 10);
    const name = safeGet<string>(node, 11);
    if (typeof hex === 'string' && hex.includes('0x') && typeof name === 'string' && name.length > 1) {
      places.push({
        name,
        hexId: hex,
        placeId: safeGet<string>(node, 78),
        lat: safeGet<number>(node, 9, 2),
        lng: safeGet<number>(node, 9, 3),
        rating: safeGet<number>(node, 4, 7),
      });
    }
    for (const child of node.slice(0, 30)) {
      if (Array.isArray(child)) walk(child, depth + 1);
    }
  };
  walk(root);
  return places;
}

function authRequired(message: string): never {
  throw new GMapsAuthError(message);
}

export class AskMapsService {
  constructor(
    private readonly http: HttpClient,
    private readonly config: GMapsConfig,
  ) {}

  /** Catalog of Maps AI surfaces (consumer + Places Platform). */
  listCapabilities(): MapsAiCapability[] {
    return MAPS_AI_CAPABILITIES;
  }

  /**
   * Official Places generative / review / neighborhood summaries.
   * These exist only on `places.googleapis.com` with an API key — not on consumer Maps.
   */
  getPlatformAiSummaries(_options: {
    placeId?: string;
    hexId?: string;
    fields?: PlatformAiFieldMask[];
  }): never {
    throw new GMapsError(
      'Places AI summaries (generativeSummary, reviewSummary, neighborhoodSummary, ' +
        'evChargeAmenitySummary) are Places API (New) field masks only. Consumer Maps ' +
        'place-preview does not embed them. Use an official API key, or maps.askMaps.ask() ' +
        'for the signed-in Ask Maps agent.',
      501,
    );
  }

  /**
   * Call the Ask Maps agent (CallAskMapsAgent).
   *
   * @throws {GMapsAuthError} when the anonymous session is rejected (typical).
   * @throws {GMapsError} on other batchexecute application errors.
   */
  async ask(options: AskMapsOptions): Promise<AskMapsResult> {
    if (!options.query.trim()) {
      throw new GMapsError('Ask Maps query must be non-empty');
    }

    const rpc = await createRpcClient(this.http, this.config);
    const start = performance.now();
    let data: unknown;
    try {
      data = await rpc.call(BATCH_SERVICES.CALL_ASK_MAPS, buildAskMapsArgs(options));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/500|401|auth/i.test(message)) {
        authRequired(
          'Ask Maps (CallAskMapsAgent) requires a signed-in Maps session (set GMAPS_COOKIES). ' +
            'Anonymous batchexecute returns HTTP 500 for all probed arg shapes. ' +
            'Desktop Maps often shows “Ask Maps is coming soon” and pushes mobile. ' +
            'Official Places generativeSummary/reviewSummary are Platform-API-only field masks.',
        );
      }
      throw error;
    }

    const root = parseBatchPayload(data);
    const timingMs = performance.now() - start;

    if (isBatchErrorCode(root)) {
      const code = Array.isArray(root) ? root[0] : root;
      if (code === 3 || code === 7 || code === 500) {
        authRequired(`Ask Maps blocked with error [${String(code)}] — signed-in cookies required`);
      }
      throw new GMapsError(`Ask Maps batchexecute error [${String(code)}]`, 200);
    }

    return {
      text: extractAskText(root),
      places: extractAskPlaces(root),
      raw: root,
      timingMs,
    };
  }

  /** List Ask Maps history threads (signed-in). */
  async listHistoryThreads(): Promise<AskMapsHistoryThread[]> {
    const rpc = await createRpcClient(this.http, this.config);
    try {
      const data = await rpc.call(BATCH_SERVICES.LIST_ASK_MAPS_HISTORY, [[[null, 81]]]);
      const root = parseBatchPayload(data);
      if (isBatchErrorCode(root)) {
        authRequired('Ask Maps history requires a signed-in Maps session (set GMAPS_COOKIES)');
      }
      return [{ raw: root }];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/500|401|auth|\[3\]|\[7\]/i.test(message)) {
        authRequired('Ask Maps history requires a signed-in Maps session (set GMAPS_COOKIES)');
      }
      throw error;
    }
  }
}
