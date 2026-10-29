export type YouTubeErrorKind = 'http' | 'blocked' | 'auth-required' | 'rate-limit' | 'parse' | 'network' | 'timeout';
export class YouTubeError extends Error {
  constructor(message: string, readonly kind: YouTubeErrorKind, readonly status?: number, readonly retryAfterMs?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'YouTubeError';
  }
}
