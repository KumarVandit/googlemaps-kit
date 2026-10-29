import { describe, expect, it } from 'vitest';
import { trends } from '../../src/trends.js';

const enabled = process.env.TRENDS_LIVE === '1' || process.env.GMAPS_LIVE === '1';

describe.skipIf(!enabled)('Google Trends anonymous public surfaces', () => {
  it('retrieves topic suggestions from the live endpoint', async () => {
    const result = await trends().suggestions('coffee');
    expect(result.topics.length).toBeGreaterThan(0);
    expect(result.topics.every(topic => topic.mid.length > 0 && topic.title.length > 0 && topic.type.length > 0)).toBe(true);
  }, 40_000);

  it('retrieves the live US Trending now RSS feed', async () => {
    const feed = await trends().trending({ geo: 'US' });
    expect(feed.title.length).toBeGreaterThan(0);
    expect(feed.items.length).toBeGreaterThan(0);
    expect(feed.items.every(item => item.title.length > 0)).toBe(true);
  }, 40_000);
});
