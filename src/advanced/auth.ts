/**
 * Session bootstrap, cookies, and auth headers.
 */
export {
  bootstrapSession,
  buildBrowserHeaders,
  clearSessionCache,
  randomUserAgent,
  cookiesToHeader,
  DEFAULT_SOCS,
  getCachedSession,
} from '../auth/session.js';
export type { CookieJarState } from '../auth/session.js';

export { AuthService, summarizeAuthStatus } from '../auth/auth-status.js';
export type { AuthStatusOptions } from '../auth/auth-status.js';

export {
  buildGoogleAuthorization,
  buildAuthenticatedHeaders,
} from '../auth/google-auth.js';

export { extractMapsPageTokens } from '../auth/maps-tokens.js';
