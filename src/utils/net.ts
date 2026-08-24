/**
 * Network pacing and failure classification: retry backoff with jitter,
 * the concurrency/delay request scheduler, and throttle/block detection.
 */

import { sleepAbortable } from './async.js';

export function parseRetryAfterMs(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    const delta = dateMs - now;
    return delta > 0 ? delta : undefined;
  }
  return undefined;
}

/** Exponential backoff with full jitter (AWS-style). */
export function backoffWithJitter(
  baseDelayMs: number,
  attempt: number,
  maxDelayMs?: number,
  rng: () => number = Math.random,
): number {
  const cap = maxDelayMs ?? baseDelayMs * Math.pow(2, Math.max(attempt, 4));
  const exp = Math.min(baseDelayMs * Math.pow(2, attempt - 1), cap);
  return Math.round(rng() * exp);
}

export interface RequestSchedulerOptions {
  /** Minimum ms between request starts (0 = no pacing). */
  requestDelayMs?: number;
  /** Max in-flight requests (default 6). */
  concurrency?: number;
  /** Injectable clock for tests. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class RequestScheduler {
  private readonly requestDelayMs: number;
  private readonly concurrency: number;
  private readonly now: () => number;
  private readonly sleepFn: (ms: number) => Promise<void>;

  private active = 0;
  private waiters: Array<() => void> = [];
  private lastStartAt = 0;
  private hasScheduled = false;

  constructor(options: RequestSchedulerOptions = {}) {
    this.requestDelayMs = options.requestDelayMs ?? 0;
    this.concurrency = Math.max(1, options.concurrency ?? 6);
    this.now = options.now ?? (() => Date.now());
    this.sleepFn =
      options.sleep ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    while (this.active >= this.concurrency) {
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
      });
    }
    this.active++;
    await this.waitForPacing();
  }

  private release(): void {
    this.active--;
    const next = this.waiters.shift();
    if (next) next();
  }

  private async waitForPacing(): Promise<void> {
    if (this.requestDelayMs <= 0) return;
    if (this.hasScheduled) {
      const elapsed = this.now() - this.lastStartAt;
      if (elapsed < this.requestDelayMs) {
        await this.sleepFn(this.requestDelayMs - elapsed);
      }
    }
    this.hasScheduled = true;
    this.lastStartAt = this.now();
  }
}

import { isBatchErrorCode } from '../rpc/batch-rpc.js';

/** listugcposts anonymous stub: `[null,null,null,null,null,1]`. */
export function isListUgcUnauthenticatedStub(data: unknown): boolean {
  return (
    Array.isArray(data) &&
    data.length >= 6 &&
    data[0] === null &&
    data[1] === null &&
    data[2] === null &&
    data[3] === null &&
    data[4] === null &&
    data[5] === 1
  );
}

/** batchexecute auth stub: `[null,null,null,null,null,true]` (~199 B). */
export function isBatchAuthStub(data: unknown): boolean {
  if (!Array.isArray(data)) return false;
  const json = JSON.stringify(data);
  if (data.length === 6 && data[5] === true && json.length < 280) return true;
  if (json.length < 20) return true;
  return false;
}

/** batchexecute application error envelope (e.g. `[3]`). */
function isBatchBlocked(data: unknown): boolean {
  return isBatchErrorCode(data);
}

/** HTTP 200 body that parses but carries no usable rows (cookieless batchexecute trap). */
export function isEmptySuccessPayload(data: unknown): boolean {
  if (data == null) return true;
  if (typeof data === 'string') {
    const trimmed = data.trim();
    return trimmed.length === 0 || trimmed === '[]' || trimmed === '[3]';
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return true;
    if (isBatchErrorCode(data)) return true;
    if (isListUgcUnauthenticatedStub(data)) return true;
    if (isBatchAuthStub(data)) return true;
  }
  return false;
}

/** Google abuse-page markers in an HTTP 403 body. */
export function isAutomatedQueryBlock(body: string): boolean {
  return (
    body.includes('automated queries') ||
    body.includes("can't process your request right now")
  );
}

export type ThrottleKind = 'http-403' | 'http-429' | 'empty-200' | 'auth-stub' | 'batch-error';

export function classifyThrottleFailure(options: {
  status?: number;
  bodyText?: string;
  parsed?: unknown;
}): ThrottleKind | undefined {
  if (options.status === 429) return 'http-429';
  if (options.status === 403 && options.bodyText && isAutomatedQueryBlock(options.bodyText)) {
    return 'http-403';
  }
  if (options.parsed != null) {
    if (isBatchBlocked(options.parsed)) return 'batch-error';
    if (isListUgcUnauthenticatedStub(options.parsed)) return 'auth-stub';
    if (isBatchAuthStub(options.parsed)) return 'auth-stub';
    if (isEmptySuccessPayload(options.parsed)) return 'empty-200';
  }
  return undefined;
}

