import { TrendsError } from './errors.js';
import { buildTrendsEmbedUrl, buildTrendsExploreUrl, trendsGeo, trendsTimezone } from './links.js';
import { parseSuggestions, parseTrendingRss, parseTrendsJson } from './parsers.js';
import type { TrendsConfig, TrendsEmbedType, TrendsExploreOptions, TrendsFeed, TrendsRequestOptions, TrendsSuggestions, TrendingOptions } from './types.js';

function timeout(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > 2_147_483_647) throw new RangeError('timeoutMs must be positive and no greater than 2147483647');
  return value;
}

function retryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

/** Anonymous Trends topic suggestions and the public Trending now RSS feed. */
export class TrendsClient {
  private readonly fetcher: typeof globalThis.fetch;
  private readonly locale: string;
  private readonly timezone: number;
  private readonly timeoutMs: number;

  constructor(config: TrendsConfig = {}) {
    this.fetcher = config.fetch ?? globalThis.fetch;
    this.locale = config.locale ?? 'en-US';
    this.timezone = trendsTimezone(config.timezone ?? 0);
    this.timeoutMs = timeout(config.timeoutMs ?? 30_000);
  }

  /** Resolves search terms to suggested topic IDs, titles, and topic types. */
  async suggestions(keyword: string, options: TrendsRequestOptions = {}): Promise<TrendsSuggestions> {
    if (typeof keyword !== 'string' || keyword.trim().length === 0) throw new TypeError('keyword must be a nonempty string');
    const url = new URL(`https://trends.google.com/trends/api/autocomplete/${encodeURIComponent(keyword)}`);
    url.searchParams.set('hl', this.locale);
    return parseSuggestions(parseTrendsJson(await this.get(url, options)));
  }

  /** Reads the public feed; approximateTraffic retains Google's bucketed display value. */
  async trending(options: TrendingOptions = {}): Promise<TrendsFeed> {
    const url = new URL('https://trends.google.com/trending/rss');
    url.searchParams.set('geo', trendsGeo(options.geo ?? 'US'));
    return parseTrendingRss(await this.get(url, options));
  }

  exploreUrl(options: TrendsExploreOptions): string {
    return buildTrendsExploreUrl(options, { locale: this.locale });
  }

  embedUrl(type: TrendsEmbedType, options: TrendsExploreOptions): string {
    return buildTrendsEmbedUrl(type, options, { locale: this.locale, timezone: this.timezone });
  }

  private async get(url: URL, options: TrendsRequestOptions): Promise<string> {
    if (options.signal?.aborted) throw options.signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal?.reason ?? new DOMException('The operation was aborted', 'AbortError'));
    options.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new TrendsError('Google Trends request timed out', 'timeout')), this.timeoutMs);
    timer.unref?.();
    try {
      const response = await this.fetcher(url.toString(), { signal: controller.signal, headers: { Accept: 'application/json, application/rss+xml, application/xml, text/xml' } });
      const body = await response.text();
      if (controller.signal.aborted) throw controller.signal.reason;
      if (response.status === 429) throw new TrendsError('Google Trends rate limited this request', 'rate-limit', 429, retryAfter(response.headers.get('retry-after')));
      const html = response.headers.get('content-type')?.includes('text/html') || /^\s*<!doctype html|^\s*<html/i.test(body);
      if (html && /unusual traffic|g-recaptcha|recaptcha\/api|\/sorry\/index/i.test(body)) throw new TrendsError('Google Trends returned a traffic challenge', 'blocked', response.status);
      if (!response.ok) throw new TrendsError(`Google Trends returned HTTP ${response.status}`, 'http', response.status, retryAfter(response.headers.get('retry-after')));
      if (html) throw new TrendsError('Google Trends returned an HTML access page', 'blocked', response.status);
      return body;
    } catch (cause) {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (cause instanceof TrendsError) throw cause;
      throw new TrendsError('Google Trends request failed', 'network', undefined, undefined, { cause });
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }
}
