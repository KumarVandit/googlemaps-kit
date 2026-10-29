import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { buildLensSearchUrl, lens } from '../../../src/lens.js';

const image = new Uint8Array([137, 80, 78, 71]);
const resultUrl = 'https://www.google.com/search?vsrid=public-session&udm=26';

describe('Lens source-derived transport', () => {
  it('builds image-URL navigation with the shipped entry-point and locale', () => {
    const url = new URL(buildLensSearchUrl('https://example.com/public-image.png?a=1&b=2', { locale: 'en-US' }));
    expect(url.origin + url.pathname).toBe('https://lens.google.com/v3/upload');
    expect(url.searchParams.get('url')).toBe('https://example.com/public-image.png?a=1&b=2');
    expect(url.searchParams.get('ep')).toBe('gsbubu');
    expect(url.searchParams.get('hl')).toBe('en-US');
    expect(Number(url.searchParams.get('st'))).toBeGreaterThan(0);
  });

  it('submits the observed multipart field and dimensions and returns the issued redirect', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 303, headers: { location: resultUrl } }));
    const result = await lens({ fetch: fetcher, locale: 'en-US' }).createSearch(image, { width: 600, height: 200, filename: 'synthetic.png' });
    const call = fetcher.mock.calls[0]!;
    const url = new URL(String(call[0]));
    expect(url.pathname).toBe('/v3/upload');
    expect(url.searchParams.get('ep')).toBe('gsbubb');
    expect(call[1]?.method).toBe('POST');
    expect(call[1]?.redirect).toBe('manual');
    const body = call[1]?.body as FormData;
    const file = body.get('encoded_image') as File;
    expect(file.name).toBe('synthetic.png');
    expect(file.type).toBe('image/png');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(image);
    expect(body.get('processed_image_dimensions')).toBe('600,200');
    expect(result).toEqual({ url: resultUrl, raw: { status: 303, location: resultUrl, body: '' } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('supports a Blob input while preserving its media type', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 303, headers: { location: resultUrl } }));
    await lens({ fetch: fetcher }).createSearch(new Blob([image], { type: 'image/webp' }));
    expect((fetcher.mock.calls[0]?.[1]?.body as FormData).get('processed_image_dimensions')).toBeNull();
    expect(((fetcher.mock.calls[0]?.[1]?.body as FormData).get('encoded_image') as File).type).toBe('image/webp');
  });

  it('reports the observed traffic challenge rather than claiming recognition results', async () => {
    const challenge = readFileSync(new URL('../../fixtures/lens/challenge.html', import.meta.url), 'utf8');
    await expect(lens({ fetch: async () => new Response(challenge, { status: 429 }) }).createSearch(image)).rejects.toMatchObject({ kind: 'rate-limit' });
    await expect(lens({ fetch: async () => new Response(challenge, { status: 200 }) }).createSearch(image)).rejects.toMatchObject({ kind: 'blocked' });
    await expect(lens({ fetch: async () => new Response('', { status: 303, headers: { location: 'https://www.google.com/sorry/index' } }) }).createSearch(image)).rejects.toMatchObject({ kind: 'blocked' });
  });

  it('distinguishes authentication, unsupported redirects, HTTP and parse failures', async () => {
    const redirect = (location: string) => lens({ fetch: async () => new Response('', { status: 303, headers: { location } }) });
    await expect(redirect('https://accounts.google.com/ServiceLogin').createSearch(image)).rejects.toMatchObject({ kind: 'auth-required' });
    await expect(redirect('https://unexpected.example/results').createSearch(image)).rejects.toMatchObject({ kind: 'parse' });
    await expect(lens({ fetch: async () => new Response('bad', { status: 400 }) }).createSearch(image)).rejects.toMatchObject({ kind: 'http', status: 400 });
    await expect(lens({ fetch: async () => new Response('no redirect') }).createSearch(image)).rejects.toMatchObject({ kind: 'parse' });
    await expect(lens({ fetch: async () => { throw new Error('offline'); } }).createSearch(image)).rejects.toMatchObject({ kind: 'network' });
  });

  it('uses a single request after rate limiting', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('limited', { status: 429, headers: { 'retry-after': '90' } }));
    await expect(lens({ fetch: fetcher }).createSearch(image)).rejects.toMatchObject({ kind: 'rate-limit', status: 429, retryAfterMs: 90000 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('validates caller input before any upload', async () => {
    const fetcher = vi.fn<typeof fetch>(); const client = lens({ fetch: fetcher });
    await expect(client.createSearch(new Uint8Array())).rejects.toThrow(TypeError);
    await expect(client.createSearch(image, { width: 600 })).rejects.toThrow(TypeError);
    await expect(client.createSearch(image, { width: 600, height: -1 })).rejects.toThrow(RangeError);
    await expect(client.createSearch(new Blob([image], { type: 'text/plain' }))).rejects.toThrow(TypeError);
    expect(() => client.searchUrl('file:///private/image.png')).toThrow(TypeError);
    expect(() => client.searchUrl('https://user:secret@example.com/image.png')).toThrow(TypeError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('supports cancellation and deadlines including response-body reads', async () => {
    const controller = new AbortController(); const reason = new Error('Stop'); controller.abort(reason);
    const fetcher = vi.fn<typeof fetch>();
    await expect(lens({ fetch: fetcher }).createSearch(image, { signal: controller.signal })).rejects.toBe(reason);
    expect(fetcher).not.toHaveBeenCalled();
    const pending: typeof fetch = async (_, init) => new Response(new ReadableStream({ start(stream) { init?.signal?.addEventListener('abort', () => stream.error(init.signal?.reason)); } }));
    await expect(lens({ fetch: pending, timeoutMs: 5 }).createSearch(image)).rejects.toMatchObject({ kind: 'timeout' });
  });
});
