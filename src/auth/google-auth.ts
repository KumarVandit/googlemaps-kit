import { createHash } from 'node:crypto';

const GOOGLE_ORIGIN = 'https://www.google.com';

const SAPISID_COOKIES: Array<{ name: string; label: string }> = [
  { name: 'SAPISID', label: 'SAPISIDHASH' },
  { name: '__Secure-1PAPISID', label: 'SAPISID1PHASH' },
  { name: '__Secure-3PAPISID', label: 'SAPISID3PHASH' },
];

function sapisidHash(timestampMs: number, sapisid: string, origin: string): string {
  const payload = `${timestampMs} ${sapisid} ${origin}`;
  const digest = createHash('sha1').update(payload).digest('hex');
  return `${timestampMs}_${digest}`;
}

/**
 * Build Google SAPISIDHASH Authorization header required by /maps/rpc/listugcposts.
 */
export function buildGoogleAuthorization(
  cookies: Record<string, string>,
  now = Date.now(),
): string | undefined {
  const parts: string[] = [];

  for (const { name, label } of SAPISID_COOKIES) {
    const value = cookies[name];
    if (!value) continue;
    parts.push(`${label} ${sapisidHash(now, value, GOOGLE_ORIGIN)}`);
  }

  return parts.length > 0 ? parts.join(' ') : undefined;
}

export function buildAuthenticatedHeaders(
  cookies: Record<string, string>,
  options?: { referer?: string; now?: number },
): Record<string, string> {
  const headers: Record<string, string> = {
    Origin: GOOGLE_ORIGIN,
    Referer: options?.referer ?? `${GOOGLE_ORIGIN}/maps/`,
    'X-Goog-AuthUser': '0',
    'X-Same-Domain': '1',
    'x-maps-diversion-context-bin': 'CAE=',
  };

  const auth = buildGoogleAuthorization(cookies, options?.now);
  if (auth) {
    headers.Authorization = auth;
  }

  return headers;
}
