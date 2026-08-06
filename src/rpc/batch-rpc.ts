/**
 * Shared batchexecute helpers — session context, response parsing, client bootstrap.
 */

import { cookiesToHeader } from '../auth/session.js';
import type { HttpClient } from '../client/http-client.js';
import type { GMapsConfig } from '../types/common.js';
import type { PbNode } from '../types/protobuf.js';
import { parseMapsPageTokens } from './app-options.js';
import { GMapsRpcClient } from './rpc-client.js';

/** Maps APP_OPTIONS psi session token shape (index 0 of context array). */
export function buildSessionContext(psi: string, tail?: unknown[]): unknown[] {
  const ctx: unknown[] = [psi, null, null, null, null, null, 81];
  if (tail) ctx.push(...tail);
  return ctx;
}

/** Parse batchexecute wrb.fr data — often a JSON string. */
export function parseBatchPayload(data: unknown): PbNode {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as PbNode;
    } catch {
      return data;
    }
  }
  return data as PbNode;
}

/** Detect batchexecute application error codes (e.g. ListUgcPosts returns `[3]` unsigned). */
export function isBatchErrorCode(data: unknown): boolean {
  return Array.isArray(data) && data.length === 1 && typeof data[0] === 'number' && data[0] > 0;
}

export async function createRpcClient(
  http: HttpClient,
  config: GMapsConfig = {},
): Promise<GMapsRpcClient> {
  await http.warmSession();
  return http.getRpcClient(config);
}

/**
 * Obtain a batchexecute session token from an HTML Maps page.
 *
 * The token is session-scoped rather than place-scoped, so any rendered Maps
 * page works; anchoring on the subject's coordinates just keeps the response
 * regionally consistent. Must be an HTML page — the /maps/preview/* endpoints
 * return JSON data and carry no bootstrap tokens.
 */
export async function fetchSessionPsi(
  http: HttpClient,
  anchor: { lat?: number; lng?: number; zoom?: number } = {},
): Promise<string | undefined> {
  const { lat, lng, zoom = 14 } = anchor;
  const path =
    lat != null && lng != null
      ? `/maps/place/@${lat.toFixed(4)},${lng.toFixed(4)},${zoom}z`
      : '/maps';
  return fetchPlacePsi(http, path);
}

/**
 * Fetch an HTML Maps page and extract its session token.
 * Falls back to kEI: not every Maps page emits an APP_OPTIONS psi, and the
 * batchexecute services accept kEI as the session token interchangeably.
 */
export async function fetchPlacePsi(
  http: HttpClient,
  placePath: string,
): Promise<string | undefined> {
  const cached = await http.getMapsPageTokens();
  if (cached.psi ?? cached.kEI) {
    return cached.psi ?? cached.kEI;
  }

  const html = await fetch(`https://www.google.com${placePath}`, {
    headers: {
      'User-Agent': http.getUserAgent(),
      Cookie: cookiesToHeader(http.getCookieJar()),
      Accept: 'text/html',
    },
    redirect: 'follow',
  }).then((r) => r.text());
  const tokens = parseMapsPageTokens(html);
  return tokens.psi ?? tokens.kEI;
}
