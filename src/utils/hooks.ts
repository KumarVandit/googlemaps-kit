/**
 * Fire lifecycle hooks without letting user callbacks break the call path.
 */

import type {
  GMapsHooks,
  HookActionEvent,
  HookActionType,
  HookErrorEvent,
  HookRetryEvent,
} from '../types/hooks.js';

function fireAction(hooks: GMapsHooks | undefined, event: HookActionEvent): void {
  try {
    hooks?.onAction?.(event);
  } catch {
    // ignore hook failures
  }
}

export function fireRetry(hooks: GMapsHooks | undefined, event: HookRetryEvent): void {
  try {
    hooks?.onRetry?.(event);
  } catch {
    // ignore
  }
}

export function fireError(hooks: GMapsHooks | undefined, event: HookErrorEvent): void {
  try {
    hooks?.onError?.(event);
  } catch {
    // ignore
  }
}

/** Wrap an Intent call with onAction / onError timing. */
export async function withActionHook<T>(
  hooks: GMapsHooks | undefined,
  type: HookActionType,
  fn: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    fireAction(hooks, { type, status: 'ok', durationMs: performance.now() - start });
    return result;
  } catch (error) {
    fireAction(hooks, {
      type,
      status: 'error',
      durationMs: performance.now() - start,
      error,
    });
    fireError(hooks, { type, error });
    throw error;
  }
}
