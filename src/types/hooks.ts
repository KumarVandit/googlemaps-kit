/**
 * Lifecycle hooks + progress events for Intent / HTTP.
 */

export type HookActionType =
  | 'discover'
  | 'discoverPages'
  | 'resolve'
  | 'profile'
  | 'profileMany'
  | 'route'
  | 'opinions'
  | 'opinionsPages'
  | 'media'
  | 'mediaMany'
  | 'pipeline'
  | 'http.get'
  | 'http.getBytes'
  | 'batchexecute';

export interface HookActionEvent {
  type: HookActionType | string;
  status: 'ok' | 'error';
  durationMs: number;
  error?: unknown;
}

export interface HookRetryEvent {
  type: HookActionType | string;
  attempt: number;
  delayMs?: number;
  error?: unknown;
}

export interface HookErrorEvent {
  type: HookActionType | string;
  error: unknown;
}

/** Wire once on `sdk({ hooks })` — fire-and-forget, never blocks the call. */
export interface GMapsHooks {
  onAction?: (event: HookActionEvent) => void;
  onRetry?: (event: HookRetryEvent) => void;
  onError?: (event: HookErrorEvent) => void;
}

export interface ProgressEvent {
  /** Logical operation, e.g. `discover`, `opinions`, `profileMany`. */
  type: string;
  /** 1-based page / item index when known. */
  index?: number;
  /** Total pages / items when known. */
  total?: number;
  /** Items accumulated so far. */
  loaded?: number;
  /** Opaque key (place hexId, page offset, …). */
  key?: string;
  done?: boolean;
}

export type ProgressCallback = (event: ProgressEvent) => void;

/** Optional in-memory TTL cache for Intent reads. */
export interface GMapsCacheOptions {
  /** Entry lifetime in ms (default 60_000). */
  ttlMs?: number;
  /** Max entries before LRU eviction (default 256). */
  maxEntries?: number;
}
