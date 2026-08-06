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
