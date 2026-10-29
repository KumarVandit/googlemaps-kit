export type LensErrorKind = 'http' | 'blocked' | 'auth-required' | 'rate-limit' | 'parse' | 'network' | 'timeout';
export class LensError extends Error {
  constructor(message: string, readonly kind: LensErrorKind, readonly status?: number, readonly retryAfterMs?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LensError';
  }
}
