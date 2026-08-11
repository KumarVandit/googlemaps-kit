import { describe, expect, it } from 'vitest';
import { backoffWithJitter, parseRetryAfterMs } from '../../../src/utils/net.js';

describe('parseRetryAfterMs', () => {
  it('parses seconds', () => {
    expect(parseRetryAfterMs('2')).toBe(2000);
  });

  it('parses HTTP-date', () => {
    const now = Date.parse('2026-07-31T12:00:00.000Z');
    const header = 'Thu, 31 Jul 2026 12:00:05 GMT';
    expect(parseRetryAfterMs(header, now)).toBe(5000);
  });

  it('returns undefined for invalid header', () => {
    expect(parseRetryAfterMs('not-a-date')).toBeUndefined();
  });
});

describe('backoffWithJitter', () => {
  it('stays within exponential cap', () => {
    let seq = 0;
    const rng = () => [0, 0.5, 1][seq++ % 3]!;
    const d1 = backoffWithJitter(500, 1, 4000, rng);
    const d2 = backoffWithJitter(500, 2, 4000, rng);
    const d3 = backoffWithJitter(500, 3, 4000, rng);
    expect(d1).toBeGreaterThanOrEqual(0);
    expect(d1).toBeLessThanOrEqual(500);
    expect(d2).toBeLessThanOrEqual(1000);
    expect(d3).toBeLessThanOrEqual(2000);
  });

  it('uses jitter so identical attempts differ', () => {
    const a = backoffWithJitter(500, 2, 5000, () => 0.1);
    const b = backoffWithJitter(500, 2, 5000, () => 0.9);
    expect(a).not.toBe(b);
  });
});
