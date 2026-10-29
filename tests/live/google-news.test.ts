import { describe, expect, it } from 'vitest';
import { googleNews } from '../../src/news.js';

describe.skipIf(process.env.GMAPS_LIVE !== '1')('Google News feeds', () => {
  it('reads public query and headline feeds', async () => {
    const client = googleNews();
    for (const feed of [await client.search('Google'), await client.headlines()]) {
      expect(feed.articles.length).toBeGreaterThan(0);
      expect(feed.articles[0]?.url).toMatch(/^https:\/\/news.google.com\//);
      expect(feed.articles[0]?.source?.name).toBeTruthy();
    }
  }, 60_000);
});
