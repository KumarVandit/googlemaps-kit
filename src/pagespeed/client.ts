import { PageSpeedError } from './errors.js';
import { parseAnalysis, parseReportId, parseResult } from './parsers.js';
import { buildRpcBody, decodeRpcResponse, parseSession, type PageSpeedSession } from './wire.js';
import type {
  AnalyzeOptions, CreateAnalysisOptions, PageSpeedAnalysis, PageSpeedConfig,
  PageSpeedRequestOptions, RunPagespeedOptions, RunPagespeedResponse, WaitForAnalysisOptions,
} from './types.js';

const WEB_ORIGIN = 'https://pagespeed.web.dev';
const API_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const CATEGORIES = new Set(['performance', 'accessibility', 'best-practices', 'seo']);

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0 || value > 2_147_483_647) throw new RangeError(`${name} must be a positive number no greater than 2147483647`);
  return value;
}

function targetUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new TypeError('PageSpeed requires an absolute HTTP or HTTPS URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new TypeError('PageSpeed requires an HTTP or HTTPS URL without credentials');
  return url.toString();
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal);
}

function deadline(timeoutMs: number, parent?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const abort = () => controller.abort(parent ? abortReason(parent) : undefined);
  if (parent?.aborted) abort();
  else parent?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new PageSpeedError('PageSpeed operation timed out', 'timeout')), timeoutMs);
  timer.unref?.();
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent?.removeEventListener('abort', abort); } };
}

async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  checkAbort(signal);
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(abortReason(signal)); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

function retryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value) * 1000;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : undefined;
}

/** A keyless PageSpeed web client with an explicit official API method. */
export class PageSpeedClient {
  private readonly fetcher: typeof globalThis.fetch;
  private readonly locale: string;
  private readonly requestTimeoutMs: number;
  private readonly apiKey?: string;
  private session?: PageSpeedSession;
  private requestId = Math.floor(Math.random() * 90000) + 10000;

  constructor(config: PageSpeedConfig = {}) {
    this.fetcher = config.fetch ?? globalThis.fetch;
    this.locale = config.locale ?? 'en-US';
    this.apiKey = config.apiKey;
    this.requestTimeoutMs = positive(config.timeoutMs ?? 120_000, 'timeoutMs');
  }

  /** Starts the website's mobile and desktop Lighthouse, URL CrUX, and origin CrUX jobs. */
  async createAnalysis(url: string, options: CreateAnalysisOptions = {}): Promise<PageSpeedAnalysis> {
    const normalized = targetUrl(url);
    const session = await this.bootstrap(options.signal);
    const args: unknown[] = [normalized, session.location];
    if (options.useOriginalUrl !== undefined) args.push(null, options.useOriginalUrl);
    const raw = await this.rpc('nqfuif', args, options, { 'X-Rawurl': normalized });
    if (!Array.isArray(raw)) throw new PageSpeedError('Invalid PageSpeed create response', 'parse');
    return parseAnalysis(raw[0]);
  }

  /** Retrieves an existing analysis by ID or a pagespeed.web.dev report URL. */
  async getAnalysis(idOrReportUrl: string, options: PageSpeedRequestOptions = {}): Promise<PageSpeedAnalysis> {
    const id = parseReportId(idOrReportUrl);
    return parseAnalysis(await this.rpc('CBayme', [id], options));
  }

  /** Refreshes pending jobs once and merges them by result ID. */
  async pollAnalysis(analysisOrId: PageSpeedAnalysis | string, options: PageSpeedRequestOptions = {}): Promise<PageSpeedAnalysis> {
    checkAbort(options.signal);
    const analysis = typeof analysisOrId === 'string' ? await this.getAnalysis(analysisOrId, options) : analysisOrId;
    const pending = analysis.results.filter(result => result.status === 'pending').map(result => result.id);
    if (pending.length === 0) return analysis;
    const raw = await this.rpc('LsX2he', [analysis.id, pending], options);
    if (!Array.isArray(raw) || !Array.isArray(raw[0])) throw new PageSpeedError('Invalid PageSpeed poll response', 'parse');
    const updates = new Map(raw[0].map(value => { const result = parseResult(value); return [result.id, result] as const; }));
    const results = analysis.results.map(result => { const update = updates.get(result.id); updates.delete(result.id); return update ?? result; });
    results.push(...updates.values());
    const complete = results.length > 0 && results.every(result => result.status === 'complete');
    const merged = [...analysis.raw];
    merged[2] = complete ? 2 : analysis.statusCode;
    merged[4] = results.map(result => result.raw);
    return parseAnalysis(merged);
  }

  /** Waits for jobs to finish; per-job errors remain available on the returned results. */
  async waitForAnalysis(analysisOrId: PageSpeedAnalysis | string, options: WaitForAnalysisOptions = {}): Promise<PageSpeedAnalysis> {
    const timeoutMs = positive(options.timeoutMs ?? 180_000, 'timeoutMs');
    const interval = positive(options.pollIntervalMs ?? 3000, 'pollIntervalMs');
    const operation = deadline(timeoutMs, options.signal);
    try {
      checkAbort(operation.signal);
      let analysis = typeof analysisOrId === 'string' ? await this.getAnalysis(analysisOrId, operation) : analysisOrId;
      options.onProgress?.(analysis);
      while (analysis.status === 'pending' || analysis.results.some(result => result.status === 'pending')) {
        checkAbort(operation.signal);
        await sleep(interval, operation.signal);
        analysis = await this.pollAnalysis(analysis, operation);
        options.onProgress?.(analysis);
      }
      checkAbort(operation.signal);
      return analysis;
    } finally { operation.cleanup(); }
  }

  /** Creates an analysis and waits for both strategies and their field-data jobs. */
  async analyze(url: string, options: AnalyzeOptions = {}): Promise<PageSpeedAnalysis> {
    return this.waitForAnalysis(await this.createAnalysis(url, options), options);
  }

  /** Calls the documented v5 API; categories and API keys apply only to this method. */
  async runPagespeed(url: string, options: RunPagespeedOptions = {}): Promise<RunPagespeedResponse> {
    const normalized = targetUrl(url);
    if (options.strategy !== undefined && options.strategy !== 'mobile' && options.strategy !== 'desktop') throw new TypeError('strategy must be mobile or desktop');
    const endpoint = new URL(API_ENDPOINT);
    endpoint.searchParams.set('url', normalized);
    endpoint.searchParams.set('strategy', options.strategy ?? 'desktop');
    endpoint.searchParams.set('locale', options.locale ?? this.locale);
    for (const category of options.categories ?? []) {
      if (!CATEGORIES.has(category)) throw new TypeError(`Unsupported PageSpeed API category: ${category}`);
      endpoint.searchParams.append('category', category);
    }
    if (this.apiKey) endpoint.searchParams.set('key', this.apiKey);
    for (const [key, value] of [['captchaToken', options.captchaToken], ['utm_campaign', options.utmCampaign], ['utm_source', options.utmSource]] as const) {
      if (value !== undefined) endpoint.searchParams.set(key, value);
    }
    const body = await this.request(endpoint, { method: 'GET' }, options.signal);
    let data: unknown;
    try { data = JSON.parse(body) as unknown; } catch (cause) {
      throw new PageSpeedError('Invalid PageSpeed API JSON response', 'parse', undefined, undefined, undefined, { cause });
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new PageSpeedError('Invalid PageSpeed API response', 'parse');
    const error = (data as { error?: { code?: number; message?: string } }).error;
    if (error) throw new PageSpeedError(error.message ?? 'PageSpeed API failed', 'rpc', undefined, error.code);
    return data as RunPagespeedResponse;
  }

  private async bootstrap(signal?: AbortSignal): Promise<PageSpeedSession> {
    checkAbort(signal);
    if (!this.session) {
      const url = new URL(WEB_ORIGIN);
      url.searchParams.set('hl', this.locale);
      this.session = parseSession(await this.request(url, { method: 'GET' }, signal));
    }
    return this.session;
  }

  private async rpc(id: string, args: unknown[], options: PageSpeedRequestOptions, headers: Record<string, string> = {}): Promise<unknown> {
    const session = await this.bootstrap(options.signal);
    const url = new URL('/_/PagespeedUi/data/batchexecute', WEB_ORIGIN);
    for (const [key, value] of Object.entries({ rpcids: id, 'source-path': '/analysis', 'f.sid': session.sessionId, bl: session.build, hl: this.locale, _reqid: String(this.requestId += 100000), rt: 'c' })) url.searchParams.set(key, value);
    return decodeRpcResponse(await this.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', ...headers },
      body: buildRpcBody(id, args, session.token),
    }, options.signal), id);
  }

  private async request(url: URL, init: RequestInit, signal?: AbortSignal): Promise<string> {
    checkAbort(signal);
    const operation = deadline(this.requestTimeoutMs, signal);
    try {
      const response = await this.fetcher(url.toString(), { ...init, signal: operation.signal });
      const body = await response.text();
      checkAbort(operation.signal);
      if (!response.ok) {
        let message = `PageSpeed HTTP ${response.status}`;
        try { const error = (JSON.parse(body) as { error?: { message?: unknown } }).error; if (typeof error?.message === 'string') message += `: ${error.message}`; } catch {}
        throw new PageSpeedError(message, 'http', response.status, undefined, retryAfter(response.headers.get('Retry-After')));
      }
      return body;
    } catch (cause) {
      checkAbort(operation.signal);
      if (cause instanceof PageSpeedError) throw cause;
      throw new PageSpeedError('PageSpeed network request failed', 'network', undefined, undefined, undefined, { cause });
    } finally { operation.cleanup(); }
  }
}

export function pageSpeed(config: PageSpeedConfig = {}): PageSpeedClient {
  return new PageSpeedClient(config);
}
