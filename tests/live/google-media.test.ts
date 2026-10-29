import { describe, expect, it } from 'vitest';
import { youtube } from '../../src/youtube.js';

const enabled = process.env.GOOGLE_MEDIA_LIVE === '1' || process.env.GMAPS_LIVE === '1';

describe.skipIf(!enabled)('YouTube anonymous consumer metadata', () => {
  it('reads watch metadata and public caption-track metadata without downloading streams', async () => {
    const video = await youtube().video(process.env.YOUTUBE_TEST_VIDEO ?? 'bC8fvcpocBU');
    expect(video.id).toBe(process.env.YOUTUBE_TEST_VIDEO ?? 'bC8fvcpocBU');
    expect(video.playability.status).toBeTypeOf('string');
    expect(video.title?.length).toBeGreaterThan(0);
  }, 40_000);

  it('retrieves public oEmbed metadata', async () => {
    const response = await youtube().oembed(process.env.YOUTUBE_TEST_VIDEO ?? 'bC8fvcpocBU');
    expect(response.title.length).toBeGreaterThan(0);
    expect(response.provider_name).toBe('YouTube');
  }, 40_000);

  it('retrieves search results and follows an anonymous continuation', async () => {
    const client = youtube();
    const first = await client.search('Google for Developers');
    expect(first.items.length).toBeGreaterThan(0);
    expect(first.continuation).toBeDefined();
    const second = await client.continueSearch(first.continuation!);
    expect(second.items.length).toBeGreaterThan(0);
  }, 60_000);
});
