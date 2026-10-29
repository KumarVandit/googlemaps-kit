import { GoogleSearchError } from './errors.js';
import { parseGoogleAutocomplete, parseGoogleSearchHtml } from './parsers.js';
import type { GoogleAutocompleteResponse, GoogleSearchConfig, GoogleSearchOptions, GoogleSearchResponse, GoogleSuggestOptions } from './types.js';

function positive(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > 2_147_483_647) throw new RangeError('timeoutMs must be positive and no greater than 2147483647');
  return value;
}

function queryValue(query: string): string {
  if (typeof query !== 'string' || !query.trim()) throw new TypeError('A nonempty search query is required');
  return query;
}

function retryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value) * 1000;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : undefined;
}

/** Anonymous public Search and autocomplete requests; access challenges are returned explicitly. */
export class GoogleSearchClient {
  private readonly fetcher: typeof globalThis.fetch;
  private readonly language: string;
  private readonly country: string;
  private readonly timeoutMs: number;

  constructor(config: GoogleSearchConfig = {}) {
    this.fetcher = config.fetch ?? globalThis.fetch;
    this.language = config.language ?? 'en';
    this.country = config.country ?? 'us';
    this.timeoutMs = positive(config.timeoutMs ?? 20_000);
  }

  /** Requests Search HTML; JavaScript challenges and unsupported markup are not treated as empty results. */
  async search(query: string, options: GoogleSearchOptions = {}): Promise<GoogleSearchResponse> {
    const endpoint = new URL('https://www.google.com/search');
    endpoint.searchParams.set('q', queryValue(query));
    endpoint.searchParams.set('hl', options.language ?? this.language);
    endpoint.searchParams.set('gl', options.country ?? this.country);
    if (options.start !== undefined) {
      if (!Number.isSafeInteger(options.start) || options.start < 0) throw new RangeError('start must be a nonnegative safe integer');
      endpoint.searchParams.set('start', String(options.start));
    }
    if (options.safe !== undefined) {
      if (options.safe !== 'active' && options.safe !== 'off') throw new TypeError('safe must be active or off');
      endpoint.searchParams.set('safe', options.safe);
    }
    const { response, body } = await this.request(endpoint, options.signal, true);
    const report = parseGoogleSearchHtml(body, {
      sourceUrl: response.url || endpoint.toString(), query, httpStatus: response.status, includeRawHtml: options.includeRawHtml,
    });
    const delay = retryAfter(response.headers.get('Retry-After'));
    if (delay !== undefined) report.retryAfterMs = delay;
    return report;
  }

  /** Fetches Google's anonymous public autocomplete suggestions without a Search page or API key. */
  async suggest(query: string, options: GoogleSuggestOptions = {}): Promise<GoogleAutocompleteResponse> {
    const endpoint = new URL('https://suggestqueries.google.com/complete/search');
    endpoint.searchParams.set('client', 'firefox');
    endpoint.searchParams.set('q', queryValue(query));
    endpoint.searchParams.set('hl', options.language ?? this.language);
    endpoint.searchParams.set('gl', options.country ?? this.country);
    const { body } = await this.request(endpoint, options.signal);
    let raw: unknown;
    try { raw = JSON.parse(body) as unknown; } catch (cause) {
      throw new GoogleSearchError('Invalid autocomplete JSON', 'parse', undefined, undefined, { cause });
    }
    return parseGoogleAutocomplete(raw);
  }

  private async request(url: URL, signal?: AbortSignal, allowBlocked = false): Promise<{ response: Response; body: string }> {
    if (signal?.aborted) throw signal.reason;
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new GoogleSearchError('Google Search request timed out', 'timeout')), this.timeoutMs);
    timer.unref?.();
    let rejectAbort: ((reason: unknown) => void) | undefined;
    const interrupted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    const abortRequest = () => rejectAbort?.(controller.signal.reason);
    controller.signal.addEventListener('abort', abortRequest, { once: true });
    try {
      const { response, body } = await Promise.race([
        (async () => {
          const response = await this.fetcher(url.toString(), { method: 'GET', signal: controller.signal });
          return { response, body: await response.text() };
        })(),
        interrupted,
      ]);
      if (!response.ok && !(allowBlocked && [403, 429].includes(response.status))) {
        throw new GoogleSearchError(`Google Search HTTP ${response.status}`, 'http', response.status, retryAfter(response.headers.get('Retry-After')));
      }
      return { response, body };
    } catch (cause) {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (cause instanceof GoogleSearchError) throw cause;
      throw new GoogleSearchError('Google Search network request failed', 'network', undefined, undefined, { cause });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      controller.signal.removeEventListener('abort', abortRequest);
    }
  }
}

export function googleSearch(config: GoogleSearchConfig = {}): GoogleSearchClient {
  return new GoogleSearchClient(config);
}
