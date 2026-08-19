/**
 * Extract batchexecute tokens from a Maps HTML bootstrap page.
 */

import { buildBrowserHeaders } from './session.js';
import { parseMapsPageTokens } from '../rpc/descriptors.js';
import type { MapsPageTokens } from '../types/common.js';

export async function extractMapsPageTokens(
  cookies: Record<string, string>,
  userAgent: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MapsPageTokens> {
  const response = await fetchImpl('https://www.google.com/maps', {
    headers: buildBrowserHeaders({
      userAgent,
      cookies,
      mode: 'document',
    }),
    redirect: 'follow',
  });

  const html = await response.text();
  return parseMapsPageTokens(html);
}
