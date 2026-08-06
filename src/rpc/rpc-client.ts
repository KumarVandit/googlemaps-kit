/**
 * Maps batchexecute RPC client (notebooklm-kit pattern).
 */

import { extractMapsPageTokens } from '../auth/maps-tokens.js';
import { cookiesToHeader } from '../auth/session.js';
import { BatchExecuteClient } from './batch-execute.js';
import { isServicePath } from './batch-services.js';
import { MAPS_WIZ_UI_APP, RPC_INFRA } from './rpc-methods.js';
import { defaultBatchexecuteUrlParams } from './xsrf-bootstrap.js';
import { GMapsAuthError } from '../types/common.js';
import type { BatchExecuteConfig, GMapsConfig, MapsPageTokens, RPCCall } from '../types/common.js';

export interface GMapsRpcClientConfig {
  cookies: string;
  authToken?: string;
  buildLabel?: string;
  sessionId?: string;
  hl?: string;
  gl?: string;
  authUser?: string;
  debug?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  /** Shares the owning HttpClient's pacing and request counter — see BatchExecuteConfig. */
  schedule?: <T>(fn: () => Promise<T>) => Promise<T>;
  hooks?: import('../types/hooks.js').GMapsHooks;
}

export class GMapsRpcClient {
  private batchClient: BatchExecuteClient;
  private config: GMapsRpcClientConfig;
  private readonly batchExecutePath: string;

  constructor(config: GMapsRpcClientConfig & { batchExecutePath?: string }) {
    this.config = config;
    this.batchExecutePath = config.batchExecutePath ?? '/maps/_/MapsWizUi/';

    const batchConfig: BatchExecuteConfig = {
      host: 'www.google.com',
      basePath: this.batchExecutePath,
      app: MAPS_WIZ_UI_APP,
      authToken: config.authToken ?? '',
      cookies: config.cookies,
      headers: {
        Origin: 'https://www.google.com',
        Referer: 'https://www.google.com/maps/',
        'x-same-domain': '1',
        Accept: '*/*',
      },
      urlParams: defaultBatchexecuteUrlParams({
        hl: config.hl,
        gl: config.gl,
        buildLabel: config.buildLabel,
        sessionId: config.sessionId,
      }),
      debug: config.debug,
      maxRetries: config.maxRetries,
      retryDelay: config.retryDelay,
      schedule: config.schedule,
      hooks: config.hooks,
    };

    this.batchClient = new BatchExecuteClient(batchConfig);
  }

  /**
   * Bootstrap RPC client from an HTTP session (scrapes Maps page for SNlM0e / bl / f.sid).
   * Pass `pageTokens` when the HttpClient already cached bootstrap HTML.
   */
  static async fromHttpSession(
    cookieJar: Record<string, string>,
    userAgent: string,
    config: GMapsConfig = {},
    schedule?: <T>(fn: () => Promise<T>) => Promise<T>,
    pageTokens?: MapsPageTokens,
  ): Promise<GMapsRpcClient> {
    const tokens = pageTokens ?? (await extractMapsPageTokens(cookieJar, userAgent));
    return new GMapsRpcClient({
      cookies: cookiesToHeader(cookieJar),
      authToken: config.authToken ?? tokens.authToken,
      buildLabel: config.buildLabel ?? tokens.buildLabel,
      sessionId: config.sessionId ?? tokens.sessionId,
      batchExecutePath: tokens.batchExecutePath,
      hl: config.hl,
      gl: config.gl,
      debug: config.debug,
      maxRetries: config.maxRetries,
      retryDelay: config.retryDelay,
      schedule,
      hooks: config.hooks,
    });
  }

  updateCookies(cookies: string): void {
    this.config.cookies = cookies;
    this.batchClient.updateCookies(cookies);
  }

  updateAuthToken(authToken: string): void {
    this.config.authToken = authToken;
    this.batchClient.updateAuthToken(authToken);
  }

  getAuthToken(): string {
    return this.config.authToken ?? '';
  }

  /**
   * Attempt xsrf bootstrap to obtain a batchexecute auth token when SNlM0e is empty.
   * Posts directly to batchexecute (service-path xsrf omits `at`) — signed-out sessions
   * typically return HTTP 400 with no token; signed-in sessions may succeed.
   * Returns true when a non-empty token was obtained.
   */
  async bootstrapAuth(): Promise<boolean> {
    if (this.getAuthToken().length > 0) return true;
    try {
      const response = await this.batchClient.do({ id: RPC_INFRA.XSRF, args: [] });
      if (response.data) {
        const token = extractXsrfToken(response.data);
        if (token) {
          this.updateAuthToken(token);
          return true;
        }
      }
    } catch {
      // Anonymous sessions reject xsrf with application error 400 — expected.
    }
    return false;
  }

  /**
   * Execute a batchexecute RPC by service path (e.g. `/MapsViewportService.GetViewportMetadata`)
   * or legacy short rpcid (e.g. `AvYl1c`).
   *
   * Service-path calls work anonymously with browser cookies and omit the `at` field.
   * Legacy short rpcids still require WIZ `SNlM0e` (signed-in session only).
   */
  async call(rpcId: string, args: unknown[], urlParams?: Record<string, string>): Promise<unknown> {
    const usesServicePath = isServicePath(rpcId);
    if (!usesServicePath && !this.config.authToken) {
      await this.bootstrapAuth();
      if (!this.config.authToken) {
        throw new GMapsAuthError(
          'Legacy batchexecute rpcids require an XSRF token (WIZ_global_data.SNlM0e), which ' +
            'signed-out Google sessions never issue. Use service-path RPCs (see ' +
            'src/rpc/batch-services.ts) for anonymous access, or pass signed-in cookies ' +
            'via GMAPS_COOKIES / config.cookies.',
        );
      }
    }

    const rpcCall: RPCCall = { id: rpcId, args, urlParams };
    const response = await this.batchClient.do(rpcCall);

    if (rpcId === RPC_INFRA.XSRF && response.data) {
      const token = extractXsrfToken(response.data);
      if (token) {
        this.updateAuthToken(token);
      }
    }

    return response.data;
  }

  getBatchExecutePath(): string {
    return this.batchExecutePath;
  }

  getBatchClient(): BatchExecuteClient {
    return this.batchClient;
  }
}

function extractXsrfToken(data: unknown): string | undefined {
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data) as unknown;
      if (typeof parsed === 'string' && parsed.length > 8) return parsed;
      if (Array.isArray(parsed) && typeof parsed[0] === 'string' && parsed[0].length > 8) {
        return parsed[0];
      }
    } catch {
      if (data.length > 8) return data;
    }
  }
  return undefined;
}
