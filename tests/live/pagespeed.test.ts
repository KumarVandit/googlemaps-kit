import { describe, expect, it } from 'vitest';
import { pageSpeed } from '../../src/pagespeed.js';

const enabled = process.env.PAGESPEED_LIVE === '1' || process.env.GMAPS_LIVE === '1';

describe.skipIf(!enabled)('PageSpeed web protocol', () => {
  it('creates, polls, and retrieves Lighthouse and field-data jobs without a key', async () => {
    const client = pageSpeed();
    const analysis = await client.analyze(process.env.PAGESPEED_TEST_URL ?? 'https://example.com/', { timeoutMs: 240_000 });
    expect(analysis.status).toBe('complete');
    for (const strategy of ['mobile', 'desktop']) {
      const lighthouse = analysis.results.find(result => result.strategy === strategy && result.type === 'lighthouse');
      expect(lighthouse).toBeDefined();
      expect(lighthouse?.error).toBeUndefined();
      expect(lighthouse?.lighthouse?.categories.performance?.score).toBeTypeOf('number');
      expect(analysis.results.some(result => result.strategy === strategy && result.type === 'page')).toBe(true);
      expect(analysis.results.some(result => result.strategy === strategy && result.type === 'origin')).toBe(true);
    }
    const retrieved = await client.getAnalysis(analysis.reportUrl);
    expect(retrieved.id).toBe(analysis.id);
    expect(retrieved.status).toBe('complete');
  }, 360_000);
});
