/**
 * Signed-in session detection for googlemaps-kit.
 *
 * Never logs or returns cookie/token values — only names and lengths.
 */

import { buildGoogleAuthorization, buildAuthenticatedHeaders } from './google-auth.js';
import { extractMapsPageTokens } from './maps-tokens.js';
import { cookiesToHeader, randomUserAgent } from './session.js';
import type { HttpClient } from '../client/http-client.js';
import { GMapsCookiesExpiredError, type AuthStatus } from '../types/common.js';
import { buildReviewsUrl } from '../rpc/pb-builders.js';
import { isListUgcUnauthenticatedStub } from '../utils/net.js';
import { parseGoogleResponse } from '../utils/payload.js';
import type { PbNode } from '../types/protobuf.js';

export interface AuthStatusOptions {
  liveCheck?: boolean;
  hl?: string;
  gl?: string;
}

function redactCookieNames(jar: Record<string, string>): string[] {
  return Object.keys(jar);
}

function hasSapisidFamily(jar: Record<string, string>): boolean {
  return Boolean(jar.SAPISID || jar['__Secure-1PAPISID'] || jar['__Secure-3PAPISID']);
}

export class AuthService {
  private http: HttpClient;
  private configuredCookies?: string;
  private configuredAuthToken?: string;
  private lastStatus: AuthStatus | null = null;
  private lastCheckedAt = 0;
  private readonly statusTtlMs = 5 * 60 * 1000;

  constructor(
    http: HttpClient,
    options: { cookies?: string; authToken?: string } = {},
  ) {
    this.http = http;
    this.configuredCookies = options.cookies;
    this.configuredAuthToken = options.authToken;
  }

  async getStatus(options: AuthStatusOptions = {}): Promise<AuthStatus> {
    const runLive = options.liveCheck !== false;
    if (
      !runLive &&
      this.lastStatus &&
      Date.now() - this.lastCheckedAt < this.statusTtlMs
    ) {
      return this.lastStatus;
    }

    const jar = this.http.getCookieJar();
    const cookieNames = redactCookieNames(jar);
    const cookiesPresent = cookieNames.length > 0 || Boolean(this.configuredCookies);
    const authToken =
      this.configuredAuthToken ?? this.http.getConfiguredAuthToken() ?? '';
    const authTokenPresent = authToken.length > 0;
    const sapisidHash = hasSapisidFamily(jar) && Boolean(buildGoogleAuthorization(jar));
    const batchexecuteXsrf = authTokenPresent;

    const base: AuthStatus = {
      signedIn: false,
      cookiesPresent,
      cookieNames,
      authTokenPresent,
      authTokenLength: authToken.length,
      capabilities: {
        sapisidHash,
        batchexecuteXsrf,
        batchUgcPosts: sapisidHash && batchexecuteXsrf,
      },
    };

    if (!cookiesPresent) {
      base.message =
        'No signed-in cookies configured. Anonymous mode is active — run `npm run auth:login` to upgrade.';
      this.cacheStatus(base);
      return base;
    }

    if (!runLive) {
      base.signedIn = sapisidHash;
      base.message = sapisidHash
        ? 'Auth cookies present (live check skipped).'
        : 'Cookies present but no SAPISID — listugcposts will not work.';
      this.cacheStatus(base);
      return base;
    }

    try {
      const tokens = await extractMapsPageTokens(jar, this.http.getUserAgent());
      if (tokens.authToken && tokens.authToken.length > 0 && !authTokenPresent) {
        base.authTokenPresent = true;
        base.authTokenLength = tokens.authToken.length;
        base.capabilities.batchexecuteXsrf = true;
        base.capabilities.batchUgcPosts = sapisidHash;
      }

      const listUgc = await this.probeListUgc(options);
      if (listUgc === 'valid') {
        base.signedIn = true;
        base.liveCheck = 'valid';
        base.message = 'Signed-in session is valid.';
      } else if (listUgc === 'expired') {
        base.signedIn = false;
        base.liveCheck = 'expired';
        base.message =
          'Cookies expired or rejected — re-run: npm run auth:login';
      } else if (sapisidHash && tokens.authToken.length > 0) {
        base.signedIn = true;
        base.liveCheck = 'valid';
        base.message = 'Signed-in (SAPISID + SNlM0e present; listugcposts stub not re-probed).';
      } else {
        base.signedIn = false;
        base.liveCheck = 'anonymous';
        base.message =
          'Cookies present but session behaves as anonymous — re-run: npm run auth:login';
      }
    } catch {
      base.liveCheck = 'error';
      base.message = 'Live auth check failed — cookies may be stale.';
    }

    this.cacheStatus(base);
    return base;
  }

  async assertSignedIn(options: AuthStatusOptions = {}): Promise<AuthStatus> {
    const status = await this.getStatus(options);
    if (!this.configuredCookies && !status.cookiesPresent) {
      return status;
    }
    if (status.liveCheck === 'expired' || (status.cookiesPresent && !status.signedIn)) {
      throw new GMapsCookiesExpiredError(status.message);
    }
    return status;
  }

  private cacheStatus(status: AuthStatus): void {
    this.lastStatus = status;
    this.lastCheckedAt = Date.now();
  }

  private async probeListUgc(
    options: AuthStatusOptions,
  ): Promise<'valid' | 'expired' | 'anonymous'> {
    if (!hasSapisidFamily(this.http.getCookieJar())) {
      return 'anonymous';
    }

    const url = buildReviewsUrl({
      hexId: '0x3bae1500315fdff7:0x9fe54cd44a84f1c7',
      limit: 3,
      hl: options.hl ?? 'en',
      gl: options.gl ?? 'in',
    });

    const jar = this.http.getCookieJar();
    const response = await fetch(url, {
      headers: {
        'User-Agent': this.http.getUserAgent() || randomUserAgent(),
        Cookie: cookiesToHeader(jar),
        Accept: '*/*',
        ...buildAuthenticatedHeaders(jar, { referer: 'https://www.google.com/' }),
      },
      redirect: 'follow',
    });

    const body = await response.text();
    if (response.url.includes('accounts.google.com')) {
      return 'expired';
    }

    const parsed = parseGoogleResponse<PbNode>(body);
    const root = Array.isArray(parsed) && Array.isArray(parsed[0]) ? (parsed[0] as PbNode) : parsed;
    if (isListUgcUnauthenticatedStub(root)) {
      return 'expired';
    }

    if (Array.isArray(root) && JSON.stringify(root).length > 40) {
      return 'valid';
    }

    return 'anonymous';
  }
}

export function summarizeAuthStatus(status: AuthStatus): string {
  const parts = [
    status.signedIn ? 'signed-in' : 'anonymous',
    `cookies=${status.cookieNames.length}`,
    `authTokenLen=${status.authTokenLength}`,
  ];
  if (status.liveCheck) parts.push(`live=${status.liveCheck}`);
  return parts.join(', ');
}
