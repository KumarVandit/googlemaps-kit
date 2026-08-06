/**
 * Session bootstrap for Google Maps internal APIs (raw HTTP, no browser).
 *
 * Follows the google.com → consent.google.com → maps cookie chain used by
 * production scrapers to obtain NID/AEC session cookies.
 */

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

export function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]!;
}

export interface CookieJarState {
  cookies: Record<string, string>;
  userAgent: string;
  fetchedAt: number;
  /** Maps HTML from bootstrap — reused for batchexecute token extraction. */
  mapsHtml?: string;
}

let cachedSession: CookieJarState | null = null;

function parseSetCookieHeader(setCookie: string): { name: string; value: string } | null {
  const part = setCookie.split(';')[0];
  const eq = part?.indexOf('=');
  if (!eq || eq <= 0) return null;
  return { name: part!.slice(0, eq), value: part!.slice(eq + 1) };
}

function mergeSetCookies(jar: Record<string, string>, headers: Headers): void {
  const setCookies = headers.getSetCookie?.() ?? [];
  for (const raw of setCookies) {
    const parsed = parseSetCookieHeader(raw);
    if (parsed) jar[parsed.name] = parsed.value;
  }
}

export function cookiesToHeader(jar: Record<string, string>): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

export function buildBrowserHeaders(options?: {
  userAgent?: string;
  referer?: string;
  cookies?: Record<string, string> | string;
  mode?: 'document' | 'cors';
}): Record<string, string> {
  const mode = options?.mode ?? 'cors';
  const headers: Record<string, string> = {
    'User-Agent': options?.userAgent ?? randomUserAgent(),
    Accept: mode === 'document' ? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' : '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  };

  if (mode === 'document') {
    headers['Upgrade-Insecure-Requests'] = '1';
    headers['Sec-Fetch-Dest'] = 'document';
    headers['Sec-Fetch-Mode'] = 'navigate';
    headers['Sec-Fetch-Site'] = 'none';
    headers['Sec-Fetch-User'] = '?1';
  } else {
    headers.Referer = options?.referer ?? 'https://www.google.com/maps/';
    headers['Sec-Fetch-Dest'] = 'empty';
    headers['Sec-Fetch-Mode'] = 'cors';
    headers['Sec-Fetch-Site'] = 'same-origin';
  }

  if (options?.cookies) {
    headers.Cookie =
      typeof options.cookies === 'string' ? options.cookies : cookiesToHeader(options.cookies);
  }

  return headers;
}

/** Default SOCS consent cookie for anonymous Maps sessions. */
export const DEFAULT_SOCS =
  'CAISNQgEEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjYwMTE4LjA5X3AwGgJlbiACGgYIgIu7ywY';

/**
 * Bootstrap cookies for anonymous Maps HTTP calls.
 *
 * Fast path: one Maps document fetch with pre-seeded SOCS consent (usually enough for NID).
 * Fallback: google.com → consent.google.com → maps when the fast path misses NID.
 */
export async function bootstrapSession(
  force = false,
  fetchImpl: typeof fetch = fetch,
): Promise<CookieJarState> {
  if (!force && cachedSession && Date.now() - cachedSession.fetchedAt < 30 * 60 * 1000) {
    return cachedSession;
  }

  const userAgent = randomUserAgent();
  const jar: Record<string, string> = {
    SOCS: DEFAULT_SOCS,
    '__Secure-BUCKET': 'CGA',
  };

  const navHeaders = buildBrowserHeaders({ userAgent, mode: 'document' });
  let mapsHtml: string | undefined;

  const mapsResponse = await fetchImpl('https://www.google.com/maps', {
    headers: { ...navHeaders, Cookie: cookiesToHeader(jar) },
    redirect: 'follow',
  });
  mergeSetCookies(jar, mapsResponse.headers);
  mapsHtml = await mapsResponse.text();

  if (!jar.NID) {
    for (const url of ['https://www.google.com/', 'https://consent.google.com/']) {
      const response = await fetchImpl(url, {
        headers: { ...navHeaders, Cookie: cookiesToHeader(jar) },
        redirect: 'follow',
      });
      mergeSetCookies(jar, response.headers);
    }
    const retryMaps = await fetchImpl('https://www.google.com/maps', {
      headers: { ...navHeaders, Cookie: cookiesToHeader(jar) },
      redirect: 'follow',
    });
    mergeSetCookies(jar, retryMaps.headers);
    mapsHtml = await retryMaps.text();
  }

  cachedSession = {
    cookies: jar,
    userAgent,
    fetchedAt: Date.now(),
    mapsHtml,
  };

  return cachedSession;
}

export function clearSessionCache(): void {
  cachedSession = null;
}

export function getCachedSession(): CookieJarState | null {
  return cachedSession;
}
