import { describe, expect, it } from 'vitest';
import { RequestScheduler } from '../src/utils/request-scheduler.js';

describe('RequestScheduler', () => {
  it('enforces minimum interval between starts', async () => {
    let now = 0;
    const starts: number[] = [];
    const scheduler = new RequestScheduler({
      requestDelayMs: 100,
      concurrency: 1,
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
    });

    await Promise.all([
      scheduler.run(async () => {
        starts.push(now);
      }),
      scheduler.run(async () => {
        starts.push(now);
      }),
      scheduler.run(async () => {
        starts.push(now);
      }),
    ]);

    expect(starts).toHaveLength(3);
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(100);
    expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(100);
  });

  it('caps concurrency', async () => {
    let active = 0;
    let maxActive = 0;
    const scheduler = new RequestScheduler({
      requestDelayMs: 0,
      concurrency: 2,
    });

    const hold = (ms: number) =>
      new Promise<void>((resolve) => {
        active++;
        maxActive = Math.max(maxActive, active);
        setTimeout(() => {
          active--;
          resolve();
        }, ms);
      });

    await Promise.all([
      scheduler.run(() => hold(30)),
      scheduler.run(() => hold(30)),
      scheduler.run(() => hold(30)),
      scheduler.run(() => hold(30)),
    ]);

    expect(maxActive).toBeLessThanOrEqual(2);
  });
});
