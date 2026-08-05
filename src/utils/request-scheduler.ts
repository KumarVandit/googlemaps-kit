/**
 * Global request pacing for a single HttpClient — bounded concurrency + minimum interval.
 */

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
