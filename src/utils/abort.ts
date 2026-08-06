/**
 * Abort helpers shared by HTTP, Intent, and CLI.
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
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
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
