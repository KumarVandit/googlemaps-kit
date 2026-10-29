export type TrendsErrorKind = 'http' | 'rate-limit' | 'blocked' | 'parse' | 'timeout' | 'network';

export class TrendsError extends Error {
  constructor(
    message: string,
    readonly kind: TrendsErrorKind,
    readonly status?: number,
    readonly retryAfterMs?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'TrendsError';
  }
}
