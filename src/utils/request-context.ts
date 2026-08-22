/**
 * Per-async-call request context (AbortSignal) without threading through every service.
 */

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
