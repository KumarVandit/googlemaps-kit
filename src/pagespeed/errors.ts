export type PageSpeedErrorKind = 'http' | 'rpc' | 'parse' | 'timeout' | 'network';

export class PageSpeedError extends Error {
  constructor(
    message: string,
    readonly kind: PageSpeedErrorKind,
    readonly status?: number,
    readonly rpcCode?: number,
    readonly retryAfterMs?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PageSpeedError';
  }
}
