import { describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../../../src/client/http-client.js';
import { GMapsEmptyPayloadError, GMapsThrottleError } from '../../../src/types/common.js';

describe('HttpClient hardening', () => {
  it('honours Retry-After on 429', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('rate limited', {
          status: 429,
          headers: { 'Retry-After': '1' },
        }),
      )
      .mockResolvedValueOnce(new Response(")]}'\n[[1]]", { status: 200 }));

    vi.stubGlobal('fetch', fetchMock);

    const client = new HttpClient({
      config: { cookies: 'NID=test', maxRetries: 1, retryDelay: 10, requestDelayMs: 0 },
    });

    const data = await client.get<unknown[]>('https://example.com/test', { allowShortBody: true });
    expect(Array.isArray(data)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws GMapsThrottleError when retries exhausted on 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('rate limited', { status: 429, headers: { 'Retry-After': '60' } }),
      ),
    );

    const client = new HttpClient({
      config: { cookies: 'NID=test', maxRetries: 0, requestDelayMs: 0 },
    });
    await expect(
      client.get('https://example.com/test', { noRetry: true }),
    ).rejects.toBeInstanceOf(GMapsThrottleError);
  });

  it('raises GMapsEmptyPayloadError when rejectEmptyPayload is set', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(")]}'\n[3]", { status: 200 })),
    );

    const client = new HttpClient({
      config: { cookies: 'NID=test', maxRetries: 0, requestDelayMs: 0 },
    });
    await expect(
      client.get('https://example.com/test', {
        allowShortBody: true,
        rejectEmptyPayload: true,
        noRetry: true,
      }),
    ).rejects.toBeInstanceOf(GMapsEmptyPayloadError);
  });

  it('does not clobber supplied cookies on warm', async () => {
    const client = new HttpClient({
      config: { cookies: 'SAPISID=caller-sapisid; NID=caller-nid', requestDelayMs: 0 },
    });

    await client.warmSession();
    const jar = client.getCookieJar();
    expect(jar.SAPISID).toBe('caller-sapisid');
    expect(jar.NID).toBe('caller-nid');
    expect(client.getStats().sessionWarmCount).toBe(0);
  });

  it('tracks session warm count for anonymous clients', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          new Response(")]}'\n[[1]]", {
            status: 200,
            headers: { 'set-cookie': 'NID=warm; Path=/' },
          }),
      ),
    );

    const client = new HttpClient({ config: { requestDelayMs: 0, maxRetries: 0 } });
    await client.get('https://example.com/a', { allowShortBody: true, noRetry: true });
    const stats = client.getStats();
    expect(stats.sessionWarmCount).toBeGreaterThanOrEqual(1);
    expect(stats.requestCount).toBe(1);
  });

  describe('runScheduled — pacing for externally-issued requests', () => {
    it('counts scheduled work so batchexecute traffic is visible in stats', async () => {
      const client = new HttpClient({ config: { cookies: 'NID=test', requestDelayMs: 0 } });

      await client.runScheduled(async () => 'ok');
      await client.runScheduled(async () => 'ok');

      expect(client.getStats().requestCount).toBe(2);
    });

    it('applies requestDelayMs to scheduled work', async () => {
      const client = new HttpClient({ config: { cookies: 'NID=test', requestDelayMs: 60 } });

      const start = Date.now();
      await client.runScheduled(async () => 'first');
      await client.runScheduled(async () => 'second');
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(50);
    });

    it('caps in-flight scheduled requests at the configured concurrency', async () => {
      const client = new HttpClient({
        config: { cookies: 'NID=test', requestDelayMs: 0, concurrency: 2 },
      });

      let inFlight = 0;
      let peak = 0;
      await Promise.all(
        Array.from({ length: 6 }, () =>
          client.runScheduled(async () => {
            inFlight++;
            peak = Math.max(peak, inFlight);
            await new Promise((resolve) => setTimeout(resolve, 20));
            inFlight--;
          }),
        ),
      );

      expect(peak).toBeLessThanOrEqual(2);
    });
  });
});
