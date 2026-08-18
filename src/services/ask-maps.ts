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
import { extractPlaceIdentifiers, extractStructuredAddress } from '../parsers/place-extended.js';
import {
  GMapsAuthError,
  GMapsError,
  type Coordinates,
  type GMapsConfig,
} from '../types/common.js';
import type { PlaceIdentifiers } from '../types/place-extended.js';
import { safeGet } from '../utils/payload.js';

/**
 * Agent variants Maps offers, from the client's own model table.
 *
 * `mars` is what the web client sends by default. The two `-dev-` ids are
 * flagged internal-only in that table and are listed for completeness.
 */
export type AskMapsModel = 'mars' | 'mars-p13n' | 'mars-p13n-dev-a' | 'mars-p13n-dev-b';

export interface AskMapsOptions {
  /** Natural-language query, e.g. "best vegetarian restaurants near HSR". */
  query: string;
  /** Viewport bias (improves local answers when the arg shape is accepted). */
  location?: Coordinates;
  zoom?: number;
  /** Opaque conversation / thread id when continuing a chat. */
  threadId?: string;
  /** Agent variant; defaults to `mars`, the web client's own default. */
  model?: AskMapsModel;
}

export interface AskMapsPlaceRef extends PlaceIdentifiers {
  name?: string;
  ownerId?: string;
  address?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  countryCode?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  reviewCount?: number;
  category?: string;
  categories?: string[];
  raw?: unknown;
}

export interface AskMapsResult {
  /** Conversation id, echoed as the first element of every streamed chunk. */
  threadId?: string;
  /** Status labels the agent emits while it works ("Thinking...", ...). */
  progress: string[];
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

function extractHistoryThreads(root: unknown): AskMapsHistoryThread[] {
  const threads: AskMapsHistoryThread[] = [];
  const walk = (node: unknown, depth = 0): void => {
    if (depth > 8 || !Array.isArray(node)) return;
    const id = safeGet<string>(node, 0);
    const title = safeGet<string>(node, 1);
    if (typeof id === 'string' && id.length > 0) {
      threads.push({
        id,
        title: typeof title === 'string' ? title : undefined,
        raw: node,
      });
    }
    for (const child of node.slice(0, 20)) {
      if (Array.isArray(child)) walk(child, depth + 1);
    }
  };
  walk(root);
  return threads;
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
 * Agent variant enum values, as the client's model table assigns them.
 *
 * The table pairs each id with the number it puts in the request's model
 * field: `mars` is 4, `mars-p13n` is 3, and the two eval builds are 6 and 7.
 */
const ASK_MAPS_MODEL_IDS: Record<AskMapsModel, number> = {
  mars: 4,
  'mars-p13n': 3,
  'mars-p13n-dev-a': 6,
  'mars-p13n-dev-b': 7,
};

/**
 * Build CallAskMapsAgent args.
 *
 * Mirrors the client's own request builder: a `ClientRequestMetadata` at
 * field 1 tagged with client 81, then an input message at field 2 holding the
 * query (field 2, first repeated turn), a context block carrying the camera
 * (field 3), the model selection (field 4) and the same camera again at
 * fields 7 and 9 — the agent reads viewport from all three.
 */
export function buildAskMapsArgs(options: AskMapsOptions): unknown[] {
  const query = options.query.trim();
  const modelId = ASK_MAPS_MODEL_IDS[options.model ?? 'mars'];

  // r8b: repeated turn at field 1, each a oneof whose first slot is the text.
  const turns = [[[query]]];

  const camera =
    options.location != null
      ? [
          [null, options.location.lng, options.location.lat],
          [0, 0, 0],
          [1440, 757],
          options.zoom ?? 14,
        ]
      : null;

  const input: unknown[] = [
    null,
    turns,
    camera ? [null, null, camera] : null,
    [[modelId]],
    null,
    null,
    camera ? [camera] : null,
    null,
    camera ? [camera] : null,
  ];

  const request: unknown[] = [[null, null, null, null, null, null, 81], input];
  if (options.threadId) {
    return [[options.threadId, request]];
  }
  return [request];
}

/**
 * Pull the answer text out of a streamed Ask Maps chunk.
 *
 * Chunk shape, from the client's own recorded fixtures:
 * `[[threadId, {"1000": [[[ …, [[[null,null,null,"text"]]] ]]] }]]` with the
 * text at event slot 8 and progress labels at slot 21.
 */
export function extractStreamChunks(root: unknown): {
  threadId?: string;
  text: string[];
  progress: string[];
} {
  const text: string[] = [];
  const progress: string[] = [];
  let threadId: string | undefined;

  const chunks = Array.isArray(root) ? root : [];
  for (const chunk of chunks) {
    if (!Array.isArray(chunk)) continue;
    const id = chunk[0];
    if (typeof id === 'string' && !threadId) threadId = id;

    const events = chunk[1];
    if (!events || typeof events !== 'object') continue;
    for (const group of Object.values(events as Record<string, unknown>)) {
      if (!Array.isArray(group)) continue;
      for (const outer of group) {
        if (!Array.isArray(outer)) continue;
        for (const event of outer) {
          if (!Array.isArray(event)) continue;
          const answer = safeGet<string>(event, 8, 0, 0, 3);
          if (typeof answer === 'string' && answer.length > 0) text.push(answer);
          const label = safeGet<string>(event, 21, 0, 0, 0);
          if (typeof label === 'string' && label.length > 0) progress.push(label);
        }
      }
    }
  }

  return { threadId, text, progress };
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
  const seen = new Set<string>();
  const walk = (node: unknown, depth = 0): void => {
    if (depth > 10 || !Array.isArray(node)) return;
    const hex = safeGet<string>(node, 10);
    const name = safeGet<string>(node, 11);
    if (typeof hex === 'string' && hex.includes('0x') && typeof name === 'string' && name.length > 1) {
      const { cid, kgmid, ownerId } = extractPlaceIdentifiers(node);
      const address = safeGet<string>(node, 18);
      const structuredAddress = extractStructuredAddress(node, address);
      const categories = safeGet<unknown[]>(node, 13)?.filter(
        (value): value is string => typeof value === 'string' && value.length > 0,
      );
      const key = safeGet<string>(node, 78) ?? hex;
      if (!seen.has(key)) {
        seen.add(key);
        places.push({
          name,
          hexId: hex,
          placeId: safeGet<string>(node, 78),
          cid,
          kgmid,
          ownerId,
          ftid: safeGet<string>(node, 89),
          address,
          neighborhood: structuredAddress.neighborhood,
          city: structuredAddress.city,
          state: structuredAddress.state,
          postalCode: structuredAddress.postalCode,
          countryCode: structuredAddress.countryCode,
          lat: safeGet<number>(node, 9, 2),
          lng: safeGet<number>(node, 9, 3),
          rating: safeGet<number>(node, 4, 7),
          reviewCount: safeGet<number>(node, 4, 8),
          category: categories?.[0],
          categories,
          raw: node,
        });
      }
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
        'place-preview does not embed them. Use an official API key, or maps.agent.ask() ' +
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

    const stream = extractStreamChunks(root);
    return {
      threadId: stream.threadId,
      progress: [...new Set(stream.progress)],
      // The schema-aware read wins when the payload is a stream of chunks;
      // otherwise fall back to scavenging long strings out of the tree.
      text: stream.text.length > 0 ? stream.text : extractAskText(root),
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
      const threads = extractHistoryThreads(root);
      return threads.length > 0 ? threads : [{ raw: root }];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/500|401|auth|\[3\]|\[7\]/i.test(message)) {
        authRequired('Ask Maps history requires a signed-in Maps session (set GMAPS_COOKIES)');
      }
      throw error;
    }
  }
}
