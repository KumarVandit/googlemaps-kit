/**
 * Async plumbing: abortable sleep, bounded-concurrency pools, TTL cache and
 * per-call request context (AbortSignal via AsyncLocalStorage).
 */

import { GMapsError } from '../types/common.js';

export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal) return;
  if (signal.aborted) {
    const reason = signal.reason;
    if (reason instanceof Error) throw reason;
    throw new GMapsError(typeof reason === 'string' ? reason : 'Aborted', undefined, reason);
  }
}

/** Sleep that rejects when the signal aborts. */
export function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    throwIfAborted(signal);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function abortError(signal?: AbortSignal): Error {
  const reason = signal?.reason;
  if (reason instanceof Error) return reason;
  return new GMapsError(typeof reason === 'string' ? reason : 'Aborted', undefined, reason);
}

export async function pooled<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;

  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]!, index);
    }
  });
  await Promise.all(runners);
}

/** Like {@link pooled} but collects return values in input order. */
export async function pooledMap<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  await pooled(items, limit, async (item, index) => {
    results[index] = await worker(item, index);
  });
  return results;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TtlCache<V> {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly map = new Map<string, { value: V; expiresAt: number }>();

  constructor(options: { ttlMs?: number; maxEntries?: number } = {}) {
    this.ttlMs = options.ttlMs ?? 60_000;
    this.maxEntries = Math.max(1, options.maxEntries ?? 256);
  }

  get(key: string): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    // refresh LRU order
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    while (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest == null) break;
      this.map.delete(oldest);
    }
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  signal?: AbortSignal;
}

const store = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(
  ctx: RequestContext,
  fn: () => Promise<T>,
): Promise<T> {
  return store.run(ctx, fn);
}

export function getRequestSignal(): AbortSignal | undefined {
  return store.getStore()?.signal;
}

/**
 * Run any kit calls inside an abortable scope.
 *
 * Intent methods (`discover`, `profile`, …) take `signal` directly. Service
 * calls (`maps.travel.directions.get(…)`, `maps.map.tiles.getTile(…)`) do not —
 * wrap them in this to make their HTTP requests abortable.
 *
 * @example
 * const ac = new AbortController();
 * const tile = await withAbortSignal(ac.signal, () =>
 *   maps.map.tiles.getTile({ zoom: 14, x: 11871, y: 7576 }),
 * );
 */
export function withAbortSignal<T>(
  signal: AbortSignal | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (!signal) return fn();
  return runWithRequestContext({ signal }, fn);
}
