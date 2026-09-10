import { describe, expect, it, vi } from 'vitest';
import { AerialViewService } from '../../../src/services/aerial-view.js';
import { GMapsError } from '../../../src/types/common.js';
import type { HttpClient } from '../../../src/client/http-client.js';

describe('AerialViewService', () => {
  it('requires an API key', async () => {
    const http = { get: vi.fn() } as unknown as HttpClient;
    const aerial = new AerialViewService(http, {});
    await expect(
      aerial.lookupVideo({ address: '600 Montgomery St, San Francisco, CA' }),
    ).rejects.toBeInstanceOf(GMapsError);
  });

  it('parses an ACTIVE lookupVideo response', async () => {
    const payload = JSON.stringify({
      state: 'ACTIVE',
      metadata: { videoId: 'abc', duration: '40s' },
      uris: {
        MP4_HIGH: {
          landscapeUri: 'https://example.com/video.mp4',
        },
      },
    });
    const http = {
      get: vi.fn().mockResolvedValue(payload),
    } as unknown as HttpClient;

    const aerial = new AerialViewService(http, { aerialViewApiKey: 'test-key' });
    const result = await aerial.lookupVideo({
      address: '600 Montgomery St, San Francisco, CA',
    });

    expect(result.state).toBe('ACTIVE');
    expect(result.metadata?.videoId).toBe('abc');
    expect(result.uris?.MP4_HIGH?.landscapeUri).toContain('example.com');
    expect(http.get).toHaveBeenCalledWith(
      expect.stringContaining('aerialview.googleapis.com/v1/videos:lookupVideo'),
      expect.objectContaining({ extraHeaders: { 'X-Goog-Api-Key': 'test-key' } }),
    );
  });

  it('returns structured error for HTTP failures', async () => {
    const http = {
      get: vi.fn().mockRejectedValue(new Error('HTTP 404: Not Found')),
    } as unknown as HttpClient;

    const aerial = new AerialViewService(http, { aerialViewApiKey: 'test-key' });
    const result = await aerial.lookupVideo({ videoId: 'missing-id' });
    expect(result.error).toContain('404');
    expect(result.statusCode).toBe(404);
  });
});
