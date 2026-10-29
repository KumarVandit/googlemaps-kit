import { YouTubeError } from './errors.js';
import { extractYouTubeClient, extractYouTubeJson, parseSearch, parseVideo, parseYouTubeVideoId, youtubeObject } from './parsers.js';
import type { YouTubeConfig, YouTubeOEmbed, YouTubeRequestOptions, YouTubeSearchCursor, YouTubeSearchPage, YouTubeVideo } from './types.js';

/** Reads anonymous watch metadata, search results, continuations, and oEmbed responses. */
export class YouTubeClient {
  private readonly fetcher: typeof globalThis.fetch;
  private readonly locale: string;
  private readonly region: string;
  private readonly timeoutMs: number;

  constructor(config: YouTubeConfig = {}) {
    this.fetcher = config.fetch ?? globalThis.fetch;
    this.locale = config.locale ?? 'en';
    this.region = config.region ?? 'US';
    this.timeoutMs = config.timeoutMs ?? 30_000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > 2_147_483_647) throw new RangeError('timeoutMs must be positive and no greater than 2147483647');
    if (!/^[A-Za-z]{2}$/.test(this.region)) throw new TypeError('region must be a two-letter country code');
  }

  /** Returns metadata and explicit playability status; it never fetches audio or video streams. */
  async video(idOrUrl: string, options: YouTubeRequestOptions = {}): Promise<YouTubeVideo> {
    const id = parseYouTubeVideoId(idOrUrl);
    const url = this.webUrl('/watch');
    url.searchParams.set('v', id);
    const html = await this.request(url, options);
    const raw = extractYouTubeJson(html, 'ytInitialPlayerResponse');
    if (!raw) throw new YouTubeError('YouTube did not provide a player response', 'parse');
    return parseVideo(raw, id, extractYouTubeJson(html, 'ytInitialData'));
  }

  async search(query: string, options: YouTubeRequestOptions = {}): Promise<YouTubeSearchPage> {
    if (typeof query !== 'string' || query.trim().length === 0) throw new TypeError('query must be a nonempty string');
    const url = this.webUrl('/results');
    url.searchParams.set('search_query', query);
    const html = await this.request(url, options);
    const raw = extractYouTubeJson(html, 'ytInitialData');
    if (!raw) throw new YouTubeError('YouTube did not provide search data', 'parse');
    return parseSearch(raw, extractYouTubeClient(html));
  }

  /** Uses the opaque continuation and anonymous client context returned by search. */
  async continueSearch(cursor: YouTubeSearchCursor, options: YouTubeRequestOptions = {}): Promise<YouTubeSearchPage> {
    if (!cursor || typeof cursor.token !== 'string' || cursor.token.length === 0 || !cursor.client || cursor.client.clientName !== 'WEB' || typeof cursor.client.clientVersion !== 'string' || !cursor.client.clientVersion) throw new TypeError('A search continuation with its client context is required');
    const client = { clientName: cursor.client.clientName, clientVersion: cursor.client.clientVersion, hl: cursor.client.hl, gl: cursor.client.gl, visitorData: cursor.client.visitorData };
    const text = await this.request(new URL('https://www.youtube.com/youtubei/v1/search?prettyPrint=false'), options, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Youtube-Client-Name': '1', 'X-Youtube-Client-Version': client.clientVersion },
      body: JSON.stringify({ context: { client }, continuation: cursor.token }),
    });
    return parseSearch(this.json(text), client);
  }

  async oembed(idOrUrl: string, options: YouTubeRequestOptions = {}): Promise<YouTubeOEmbed> {
    const id = parseYouTubeVideoId(idOrUrl);
    const url = new URL('https://www.youtube.com/oembed');
    url.searchParams.set('url', `https://www.youtube.com/watch?v=${id}`);
    url.searchParams.set('format', 'json');
    const raw = this.json(await this.request(url, options));
    if (!youtubeObject(raw) || ['title', 'author_name', 'author_url', 'type', 'version', 'provider_name', 'provider_url', 'thumbnail_url', 'html'].some(key => typeof raw[key] !== 'string') || ['height', 'width', 'thumbnail_height', 'thumbnail_width'].some(key => typeof raw[key] !== 'number' || !Number.isFinite(raw[key]))) throw new YouTubeError('Malformed YouTube oEmbed response', 'parse');
    return raw as unknown as YouTubeOEmbed;
  }

  private webUrl(path: string): URL {
    const url = new URL(path, 'https://www.youtube.com');
    url.searchParams.set('hl', this.locale);
    url.searchParams.set('gl', this.region.toUpperCase());
    return url;
  }

  private json(text: string): unknown {
    try { return JSON.parse(text.replace(/^\)\]\}'\s*/, '')); }
    catch (cause) { throw new YouTubeError('Malformed YouTube JSON response', 'parse', undefined, undefined, { cause }); }
  }

  private async request(url: URL, options: YouTubeRequestOptions, init: RequestInit = {}): Promise<string> {
    if (options.signal?.aborted) throw options.signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal?.reason ?? new DOMException('The operation was aborted', 'AbortError'));
    options.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new YouTubeError('YouTube request timed out', 'timeout')), this.timeoutMs);
    timer.unref?.();
    try {
      const response = await this.fetcher(url.toString(), { ...init, signal: controller.signal });
      const body = await response.text();
      if (controller.signal.aborted) throw controller.signal.reason;
      const retry = response.headers.get('retry-after');
      const retryAfterMs = retry && /^\d+(?:\.\d+)?$/.test(retry) ? Number(retry) * 1000 : retry && Number.isFinite(Date.parse(retry)) ? Math.max(0, Date.parse(retry) - Date.now()) : undefined;
      if (response.status === 429) throw new YouTubeError('YouTube rate limited this request', 'rate-limit', 429, retryAfterMs);
      if (/\/sorry\/|consent\.youtube\.com|consent\.google\.com/.test(response.url) || /<(?:form|div)[^>]+(?:captcha|consent)|<title[^>]*>[^<]*(?:unusual traffic|consent)/i.test(body)) throw new YouTubeError('YouTube returned a consent or traffic challenge', 'blocked', response.status);
      if (response.status === 401) throw new YouTubeError('YouTube requires authentication', 'auth-required', 401);
      if (!response.ok) throw new YouTubeError(`YouTube returned HTTP ${response.status}`, 'http', response.status, retryAfterMs);
      return body;
    } catch (cause) {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (cause instanceof YouTubeError) throw cause;
      throw new YouTubeError('YouTube request failed', 'network', undefined, undefined, { cause });
    } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
  }
}
