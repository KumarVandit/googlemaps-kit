import { Agent, setGlobalDispatcher } from 'undici';
import { buildAuthenticatedHeaders } from '../auth/google-auth.js';
import {
  bootstrapSession,
  buildBrowserHeaders,
  randomUserAgent,
  type CookieJarState,
} from '../auth/session.js';
import { parseMapsPageTokens } from '../rpc/app-options.js';
import { GMapsRpcClient } from '../rpc/rpc-client.js';
import {
  GMapsAuthError,
  GMapsEmptyPayloadError,
  GMapsNetworkError,
  GMapsPhotosBlockedError,
  GMapsThrottleError,
  type GMapsConfig,
  type MapsPageTokens,
} from '../types/common.js';
import type { GMapsHooks } from '../types/hooks.js';
import { sleep as sleepAbortable, throwIfAborted } from '../utils/abort.js';
import { fireError, fireRetry } from '../utils/hooks.js';
import { getRequestSignal } from '../utils/request-context.js';
import { RequestScheduler } from '../utils/request-scheduler.js';
import { backoffWithJitter, parseRetryAfterMs } from '../utils/retry-backoff.js';
import { classifyThrottleFailure, isAutomatedQueryBlock } from '../utils/throttle-detection.js';
import { isValidResponseBody, parseGoogleResponse } from '../utils/response-parser.js';

/** Install once — Node's global fetch is undici; this keeps TLS sockets warm. */
let keepAliveInstalled = false;
function installKeepAliveDispatcher(connections: number): void {
  if (keepAliveInstalled) return;
  keepAliveInstalled = true;
  setGlobalDispatcher(
    new Agent({
      keepAliveTimeout: 60_000,
      keepAliveMaxTimeout: 120_000,
      connections: Math.max(8, connections),
      pipelining: 1,
    }),
  );
}

export interface HttpGetOptions {
  referer?: string;
  extraHeaders?: Record<string, string>;
  includeOrigin?: boolean;
  /** Attach SAPISIDHASH auth headers (for listugcposts). */
  authenticated?: boolean;
  /** Skip JSON parse — return raw text. */
  raw?: boolean;
  /** Relax body length check (for small review stubs). */
  allowShortBody?: boolean;
  /** Minimum byte length for {@link HttpClient.getBytes} (default 8). */
  minBytes?: number;
  /** Disable automatic retries (use for endpoints that fail fast with 4xx). */
  noRetry?: boolean;
  /**
   * Reject a successfully parsed response so it is retried with a refreshed session.
   *
   * Google intermittently serves a truncated place payload (~26 KB instead of ~130 KB)
   * that parses fine but omits hours, amenities and review counts. Returning false lets
   * the caller demand a complete one.
   */
  acceptResponse?: (data: unknown) => boolean;
  /**
   * When set, HTTP 200 payloads classified as empty/auth-stub raise
   * {@link GMapsEmptyPayloadError} instead of returning silently.
   */
  rejectEmptyPayload?: boolean;
  /** Abort this request (also reads AsyncLocalStorage request context). */
  signal?: AbortSignal;
}

export interface HttpClientOptions {
  config: GMapsConfig;
}

export interface HttpClientStats {
  /** Completed data requests (get / getBytes). */
  requestCount: number;
  /** Session bootstrap calls (anonymous warming only). */
  sessionWarmCount: number;
  /** In-flight + completed scheduler slots. */
  scheduledCount: number;
}

export class HttpClient {
  private config: GMapsConfig;
  private cookieJar: Record<string, string> = {};
  private readonly suppliedCookies: boolean;
  private sessionUserAgent?: string;
  private sessionFetchedAt = 0;
  private requestCount = 0;
  private sessionWarmCount = 0;
  private scheduler: RequestScheduler;
  private mapsHtmlCache?: string;
  private mapsTokensCache?: { tokens: MapsPageTokens; fetchedAt: number };
  private warming: Promise<void> | null = null;
  private readonly hooks: GMapsHooks | undefined;

  constructor(options: HttpClientOptions) {
    this.config = options.config;
    this.hooks = options.config.hooks;
    this.suppliedCookies = Boolean(options.config.cookies);
    if (options.config.cookies) {
      this.cookieJar = this.parseCookieString(options.config.cookies);
    }
    const concurrency = options.config.concurrency ?? 6;
    this.scheduler = new RequestScheduler({
      requestDelayMs: options.config.requestDelayMs ?? 0,
      concurrency,
    });
    installKeepAliveDispatcher(concurrency);
  }

  private resolveSignal(options?: HttpGetOptions): AbortSignal | undefined {
    return options?.signal ?? getRequestSignal();
  }

  async get<T = unknown>(url: string, options?: HttpGetOptions): Promise<T> {
    return this.scheduler.run(() => this.getInternal<T>(url, options));
  }

  private async getInternal<T = unknown>(url: string, options?: HttpGetOptions): Promise<T> {
    const maxRetries = options?.noRetry ? 0 : (this.config.maxRetries ?? 2);
    const retryDelay = this.config.retryDelay ?? 500;
    const retryMaxDelay = this.config.retryMaxDelay ?? 30_000;
    let lastError: Error | null = null;
    const signal = this.resolveSignal(options);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      throwIfAborted(signal);
      const incompleteRetry = attempt > 0 && lastError?.message === 'Response rejected as incomplete';
      if (attempt > 0) {
        const delay = incompleteRetry
          ? backoffWithJitter(100, attempt, 1_500)
          : backoffWithJitter(retryDelay, attempt, retryMaxDelay);
        fireRetry(this.hooks, {
          type: 'http.get',
          attempt,
          delayMs: delay,
          error: lastError ?? undefined,
        });
        await this.sleep(delay, signal);
        if (!incompleteRetry) {
          await this.ensureSession(true);
        }
      } else {
        await this.ensureSession();
      }

      try {
        const headers = buildBrowserHeaders({
          userAgent: this.sessionUserAgent,
          cookies: this.cookieJar,
          referer: options?.referer ?? 'https://www.google.com/maps/',
        });

        if (options?.includeOrigin) {
          headers.Origin = 'https://www.google.com';
        }

        if (options?.authenticated) {
          Object.assign(headers, buildAuthenticatedHeaders(this.cookieJar, { referer: options?.referer }));
        }

        if (options?.extraHeaders) {
          Object.assign(headers, options.extraHeaders);
        }

        if (this.config.debug) {
          console.debug(`[googlemaps-kit] GET ${url.slice(0, 120)}...`);
        }

        const start = performance.now();
        const response = await fetch(url, { headers, redirect: 'follow', signal });
        const elapsed = performance.now() - start;

        this.mergeResponseCookies(response.headers);

        if (this.config.debug) {
          console.debug(`[googlemaps-kit] ${response.status} in ${elapsed.toFixed(0)}ms`);
        }

        if (response.url.includes('consent.google.com')) {
          if (attempt < maxRetries) {
            lastError = new GMapsAuthError('Consent redirect — refreshing session');
            continue;
          }
          throw new GMapsAuthError('Google consent page required');
        }

        if (response.status === 429) {
          const retryAfterMs = parseRetryAfterMs(response.headers.get('Retry-After'));
          if (attempt < maxRetries) {
            lastError = new GMapsThrottleError('Rate limited (429)', retryAfterMs);
            if (retryAfterMs) await this.sleep(retryAfterMs, signal);
            continue;
          }
          throw new GMapsThrottleError('Rate limited (429)', retryAfterMs);
        }

        if (!response.ok) {
          const body = await response.text();
          if (response.status === 403) {
            if (isAutomatedQueryBlock(body)) {
              throw new GMapsPhotosBlockedError(undefined, body.slice(0, 500));
            }
            throw new GMapsNetworkError('HTTP 403: Forbidden');
          }
          throw new GMapsNetworkError(`HTTP ${response.status}: ${response.statusText}`);
        }

        const body = await response.text();

        if (!options?.allowShortBody && !isValidResponseBody(body)) {
          const kind = classifyThrottleFailure({ status: 200, bodyText: body });
          if (attempt < maxRetries) {
            lastError = new GMapsNetworkError('Empty or invalid response body');
            if (kind) lastError = this.emptyPayloadError(kind);
            continue;
          }
          if (options?.rejectEmptyPayload && kind) {
            throw this.emptyPayloadError(kind);
          }
          throw new GMapsNetworkError('Empty or invalid response body');
        }

        this.requestCount++;
        if (this.requestCount % 500 === 0 && !this.suppliedCookies) {
          await this.ensureSession(true);
        }

        if (options?.raw) {
          return body as T;
        }

        const parsed = parseGoogleResponse<T>(body);

        if (options?.rejectEmptyPayload) {
          const kind = classifyThrottleFailure({ status: 200, parsed });
          if (kind) {
            if (attempt < maxRetries) {
              lastError = this.emptyPayloadError(kind);
              continue;
            }
            throw this.emptyPayloadError(kind);
          }
        }

        if (options?.acceptResponse && !options.acceptResponse(parsed)) {
          if (attempt < maxRetries) {
            lastError = new GMapsNetworkError('Response rejected as incomplete');
            continue;
          }
          return parsed;
        }

        return parsed;
      } catch (error) {
        if (signal?.aborted) {
          fireError(this.hooks, { type: 'http.get', error });
          throw error;
        }
        if (
          error instanceof GMapsAuthError ||
          error instanceof GMapsNetworkError ||
          error instanceof GMapsPhotosBlockedError ||
          error instanceof GMapsThrottleError ||
          error instanceof GMapsEmptyPayloadError
        ) {
          lastError = error;
          if (attempt < maxRetries) continue;
          fireError(this.hooks, { type: 'http.get', error });
          throw error;
        }
        throw error;
      }
    }

    throw lastError ?? new GMapsNetworkError('Request failed after retries');
  }

  async getBytes(
    url: string,
    options?: HttpGetOptions,
  ): Promise<{ bytes: Uint8Array; contentType: string }> {
    return this.scheduler.run(() => this.getBytesInternal(url, options));
  }

  private async getBytesInternal(
    url: string,
    options?: HttpGetOptions,
  ): Promise<{ bytes: Uint8Array; contentType: string }> {
    const maxRetries = options?.noRetry ? 0 : (this.config.maxRetries ?? 2);
    const retryDelay = this.config.retryDelay ?? 500;
    const retryMaxDelay = this.config.retryMaxDelay ?? 30_000;
    const minBytes = options?.minBytes ?? 8;
    let lastError: Error | null = null;
    const signal = this.resolveSignal(options);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      throwIfAborted(signal);
      if (attempt > 0) {
        const delay = backoffWithJitter(retryDelay, attempt, retryMaxDelay);
        fireRetry(this.hooks, {
          type: 'http.getBytes',
          attempt,
          delayMs: delay,
          error: lastError ?? undefined,
        });
        await this.sleep(delay, signal);
        await this.ensureSession(true);
      } else {
        await this.ensureSession();
      }

      try {
        const headers = buildBrowserHeaders({
          userAgent: this.sessionUserAgent,
          cookies: this.cookieJar,
          referer: options?.referer ?? 'https://www.google.com/maps/',
        });

        if (options?.includeOrigin) {
          headers.Origin = 'https://www.google.com';
        }

        if (options?.authenticated) {
          Object.assign(headers, buildAuthenticatedHeaders(this.cookieJar, { referer: options?.referer }));
        }

        if (options?.extraHeaders) {
          Object.assign(headers, options.extraHeaders);
        }

        if (this.config.debug) {
          console.debug(`[googlemaps-kit] GET (bytes) ${url.slice(0, 120)}...`);
        }

        const start = performance.now();
        const response = await fetch(url, { headers, redirect: 'follow', signal });
        const elapsed = performance.now() - start;

        this.mergeResponseCookies(response.headers);

        if (this.config.debug) {
          console.debug(`[googlemaps-kit] ${response.status} in ${elapsed.toFixed(0)}ms`);
        }

        if (response.url.includes('consent.google.com')) {
          if (attempt < maxRetries) {
            lastError = new GMapsAuthError('Consent redirect — refreshing session');
            continue;
          }
          throw new GMapsAuthError('Google consent page required');
        }

        if (response.status === 429) {
          const retryAfterMs = parseRetryAfterMs(response.headers.get('Retry-After'));
          if (attempt < maxRetries) {
            lastError = new GMapsThrottleError('Rate limited (429)', retryAfterMs);
            if (retryAfterMs) await this.sleep(retryAfterMs, signal);
            continue;
          }
          throw new GMapsThrottleError('Rate limited (429)', retryAfterMs);
        }

        if (!response.ok) {
          const body = await response.text();
          if (response.status === 403) {
            if (isAutomatedQueryBlock(body)) {
              throw new GMapsPhotosBlockedError(undefined, body.slice(0, 500));
            }
            throw new GMapsNetworkError('HTTP 403: Forbidden');
          }
          throw new GMapsNetworkError(`HTTP ${response.status}: ${response.statusText}`);
        }

        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const contentType = response.headers.get('content-type') ?? 'application/octet-stream';

        if (!options?.allowShortBody && bytes.length < minBytes) {
          if (attempt < maxRetries) {
            lastError = new GMapsNetworkError('Empty or invalid response body');
            continue;
          }
          throw new GMapsNetworkError('Empty or invalid response body');
        }

        this.requestCount++;
        if (this.requestCount % 500 === 0 && !this.suppliedCookies) {
          await this.ensureSession(true);
        }

        return { bytes, contentType };
      } catch (error) {
        if (signal?.aborted) {
          fireError(this.hooks, { type: 'http.getBytes', error });
          throw error;
        }
        if (
          error instanceof GMapsAuthError ||
          error instanceof GMapsNetworkError ||
          error instanceof GMapsPhotosBlockedError ||
          error instanceof GMapsThrottleError ||
          error instanceof GMapsEmptyPayloadError
        ) {
          lastError = error;
          if (attempt < maxRetries) continue;
          fireError(this.hooks, { type: 'http.getBytes', error });
          throw error;
        }
        throw error;
      }
    }

    throw lastError ?? new GMapsNetworkError('Request failed after retries');
  }

  /**
   * Session cookie jar for outbound Google requests.
   *
   * **Security:** values are secrets (SID/SAPISID). Do not log, serialize to clients,
   * or include in error reports. Prefer {@link listCookieNames} / `auth.getStatus()`.
   */
  getCookieJar(): Record<string, string> {
    return { ...this.cookieJar };
  }

  /**
   * Cookie **names** only — safe for logs / auth status. Never returns values.
   */
  listCookieNames(): string[] {
    return Object.keys(this.cookieJar).sort();
  }

  /**
   * Run an externally-issued request under this client's pacing and request counter.
   *
   * The batchexecute RPC client owns its own `fetch` (it needs a bespoke body and token
   * handling), so without this it would escape `requestDelayMs`/`concurrency` and go
   * unrecorded in `getStats()` — measured as 0 requests for five live surfaces.
   */
  async runScheduled<T>(fn: () => Promise<T>): Promise<T> {
    return this.scheduler.run(async () => {
      this.requestCount++;
      return fn();
    });
  }

  getConfiguredAuthToken(): string | undefined {
    return this.config.authToken;
  }

  getStats(): HttpClientStats {
    return {
      requestCount: this.requestCount,
      sessionWarmCount: this.sessionWarmCount,
      scheduledCount: this.requestCount,
    };
  }

  async warmSession(): Promise<void> {
    await this.ensureSession();
    void this.prewarmSearchSurface();
  }

  /**
   * Open a keep-alive connection to the Maps search surface (limit-1 probe).
   * Hides first-search TLS/TTFB from user-facing calls.
   */
  prewarmSearchSurface(hl = 'en', gl = 'us'): Promise<void> {
    if (!this.searchSurfacePromise) {
      this.searchSurfacePromise = this.runSearchSurfacePrewarm(hl, gl);
    }
    return this.searchSurfacePromise;
  }

  private searchSurfacePromise: Promise<void> | null = null;

  private async runSearchSurfacePrewarm(hl: string, gl: string): Promise<void> {
    try {
      await this.ensureSession();
      const { buildSearchUrl } = await import('../rpc/pb-builders.js');
      const url = buildSearchUrl({
        query: 'maps',
        lat: 0,
        lng: 0,
        resultsCount: 1,
        maxRadius: 50_000,
        offset: 0,
        hl,
        gl,
        zoom: 2,
      });
      await this.get(url, {
        referer: 'https://www.google.com/maps/',
        noRetry: true,
        allowShortBody: true,
      });
    } catch {
      // Non-fatal — search still works without the warm probe.
    }
  }

  /** Session token used by Maps UI RPC envelopes. */
  async resolvePsi(): Promise<string> {
    const tokens = await this.getMapsPageTokens();
    const psi = tokens.psi ?? tokens.kEI;
    if (!psi) {
      throw new GMapsAuthError('Maps session token unavailable');
    }
    return psi;
  }

  private rpcClient: GMapsRpcClient | null = null;
  private rpcInit: Promise<GMapsRpcClient> | null = null;

  /** Cached batchexecute client (one per HTTP session). */
  async getRpcClient(config: GMapsConfig = {}): Promise<GMapsRpcClient> {
    if (this.rpcClient) return this.rpcClient;
    if (!this.rpcInit) {
      this.rpcInit = (async () => {
        await this.ensureSession();
        const pageTokens = await this.getMapsPageTokens();
        const client = await GMapsRpcClient.fromHttpSession(
          this.getCookieJar(),
          this.getUserAgent(),
          config,
          (fn) => this.runScheduled(fn),
          pageTokens,
        );
        this.rpcClient = client;
        return client;
      })();
    }
    return this.rpcInit;
  }

  /**
   * batchexecute tokens from the cached Maps bootstrap HTML (no extra fetch when warm).
   */
  peekMapsPageTokens(): MapsPageTokens | null {
    const ttl = 30 * 60 * 1000;
    if (this.mapsTokensCache && Date.now() - this.mapsTokensCache.fetchedAt < ttl) {
      return this.mapsTokensCache.tokens;
    }
    return null;
  }

  async getMapsPageTokens(): Promise<MapsPageTokens> {
    const ttl = 30 * 60 * 1000;
    if (this.mapsTokensCache && Date.now() - this.mapsTokensCache.fetchedAt < ttl) {
      return this.mapsTokensCache.tokens;
    }

    await this.ensureSession();
    if (this.mapsHtmlCache) {
      const tokens = parseMapsPageTokens(this.mapsHtmlCache);
      this.mapsTokensCache = { tokens, fetchedAt: Date.now() };
      return tokens;
    }

    const { extractMapsPageTokens } = await import('../auth/maps-tokens.js');
    const tokens = await extractMapsPageTokens(
      this.cookieJar,
      this.sessionUserAgent ?? randomUserAgent(),
    );
    this.mapsTokensCache = { tokens, fetchedAt: Date.now() };
    return tokens;
  }

  getUserAgent(): string {
    return this.sessionUserAgent ?? 'Mozilla/5.0';
  }

  hasAuthCookies(): boolean {
    return Boolean(
      this.cookieJar.SAPISID ||
        this.cookieJar['__Secure-1PAPISID'] ||
        this.cookieJar['__Secure-3PAPISID'],
    );
  }

  hasSuppliedCookies(): boolean {
    return this.suppliedCookies;
  }

  private async ensureSession(force = false): Promise<void> {
    if (this.suppliedCookies) {
      this.sessionUserAgent ??= randomUserAgent();
      return;
    }

    const ttl = 30 * 60 * 1000;
    if (
      !force &&
      this.sessionFetchedAt &&
      Date.now() - this.sessionFetchedAt < ttl &&
      this.cookieJar.NID
    ) {
      return;
    }

    if (!force && this.warming) {
      await this.warming;
      return;
    }

    this.warming = this.bootstrapSession(force);
    try {
      await this.warming;
    } finally {
      this.warming = null;
    }
  }

  private async bootstrapSession(force: boolean): Promise<void> {
    this.sessionWarmCount++;
    const session: CookieJarState = await bootstrapSession(force);
    if (this.suppliedCookies) {
      this.cookieJar = { ...session.cookies, ...this.cookieJar };
    } else {
      this.cookieJar = { ...this.cookieJar, ...session.cookies };
    }
    this.sessionUserAgent = session.userAgent;
    this.sessionFetchedAt = session.fetchedAt;
    if (session.mapsHtml) {
      this.mapsHtmlCache = session.mapsHtml;
      this.mapsTokensCache = {
        tokens: parseMapsPageTokens(session.mapsHtml),
        fetchedAt: session.fetchedAt,
      };
    }
  }

  private mergeResponseCookies(headers: Headers): void {
    const setCookies = headers.getSetCookie?.() ?? [];
    for (const raw of setCookies) {
      const part = raw.split(';')[0];
      const eq = part?.indexOf('=');
      if (eq && eq > 0) {
        this.cookieJar[part!.slice(0, eq)] = part!.slice(eq + 1);
      }
    }
  }

  private parseCookieString(cookies: string): Record<string, string> {
    const jar: Record<string, string> = {};
    for (const part of cookies.split(';')) {
      const trimmed = part.trim();
      const eq = trimmed.indexOf('=');
      if (eq > 0) {
        jar[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
      }
    }
    return jar;
  }

  private emptyPayloadError(kind: NonNullable<ReturnType<typeof classifyThrottleFailure>>): GMapsEmptyPayloadError {
    switch (kind) {
      case 'auth-stub':
        return new GMapsEmptyPayloadError(
          'HTTP 200 auth stub — session cookies may be missing or expired.',
          'auth-stub',
        );
      case 'batch-error':
        return new GMapsEmptyPayloadError(
          'batchexecute application error envelope (e.g. [3]) — surface blocked or args invalid.',
          'batch-error',
        );
      case 'empty-200':
        return new GMapsEmptyPayloadError(
          'HTTP 200 with empty payload — possible throttle or missing session context.',
          'empty-200',
        );
      case 'http-403':
      case 'http-429':
        return new GMapsEmptyPayloadError('Unexpected throttle classification on HTTP 200.', 'empty-200');
      default: {
        const _exhaustive: never = kind;
        return new GMapsEmptyPayloadError(String(_exhaustive));
      }
    }
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return sleepAbortable(ms, signal);
  }
}
