/**
 * Auth + surface catalog namespaces — product-facing wrappers over kit internals.
 */

import { AuthService, summarizeAuthStatus, type AuthStatusOptions } from '../auth/auth-status.js';
import type { HttpClient } from './http-client.js';
import type { AuthStatus, GMapsConfig } from '../types/common.js';
import {
  KNOWN_SURFACES,
  getSurfaceInfo,
  listSurfacesByStatus,
  type KnownSurfaceName,
  type SurfaceInfo,
  type SurfaceStatus,
} from '../known-surfaces.js';

/** Session / cookie status for apps (no secret values returned). */
export class AuthNamespace {
  private readonly auth: AuthService;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.auth = new AuthService(http, {
      cookies: config.cookies,
      authToken: config.authToken,
    });
  }

  /** Live or cached auth probe — cookie names/lengths only, never values. */
  status(options?: AuthStatusOptions): Promise<AuthStatus> {
    return this.auth.getStatus(options);
  }

  /** One-line summary for logs (`signed-in, cookies=12, …`). */
  async summarize(options?: AuthStatusOptions): Promise<string> {
    return summarizeAuthStatus(await this.status(options));
  }
}

/** Catalog of Maps surfaces this kit knows about (working / auth / blocked / …). */
export class SurfacesNamespace {
  /** All surface names. */
  list(): KnownSurfaceName[] {
    return Object.keys(KNOWN_SURFACES) as KnownSurfaceName[];
  }

  /** Surfaces filtered by status (`working`, `auth-required`, …). */
  listByStatus(status: SurfaceStatus): KnownSurfaceName[] {
    return listSurfacesByStatus(status);
  }

  /** Metadata for one surface. */
  get(name: KnownSurfaceName): SurfaceInfo {
    return getSurfaceInfo(name);
  }

  /** Full catalog object (read-only snapshot). */
  catalog(): typeof KNOWN_SURFACES {
    return KNOWN_SURFACES;
  }

  /** Names marked working (anonymous or with documented path). */
  working(): KnownSurfaceName[] {
    return listSurfacesByStatus('working');
  }
}
