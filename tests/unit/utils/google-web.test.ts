import { afterEach, describe, expect, it, vi } from 'vitest';
import { googleBatchBody, googleBatchResponse, googleBootstrap, googleWebText, xmlText } from '../../../src/utils/google-web.js';

afterEach(() => vi.useRealTimers());

describe('Google web transport', () => {
  it('parses bootstrap JSON containing semicolons and braces without evaluation', () => {
    expect(googleBootstrap('window.WIZ_global_data={"value":"x}; y","FdrFJe":"9007199254740993"}; throw Error("unsafe")')).toEqual({ value: 'x}; y', FdrFJe: '9007199254740993' });
    expect(() => googleBootstrap('window.WIZ_global_data = {')).toThrow(/Truncated/);
    expect(() => googleBootstrap('<html>consent</html>')).toThrow(/missing/);
  });

  it('decodes Unicode and bracket characters across batch frames', () => {
    const data = ['é😀 "]', ['nested']];
    const frame = JSON.stringify([['wrb.fr', 'test', JSON.stringify(data)]]);
    expect(googleBatchResponse(`)]}'\n\n${Buffer.byteLength(frame)}\n${frame}\n25\n[["e",4,null,null,802]]`, 'test')).toEqual(data);
    expect(JSON.parse(new URLSearchParams(googleBatchBody('test', ['a&b'], 'token')).get('f.req')!)).toEqual([[['test', '["a&b"]', null, 'generic']]]);
  });

  it.each(['', '12\n[[', '[["wrb.fr","other","[]"]]', '[["wrb.fr","test","{invalid}"]]', '[["wrb.fr","test","[]"],["wrb.fr","test","[]"]]'])('rejects malformed batches: %s', value => {
    expect(() => googleBatchResponse(value, 'test')).toThrow();
  });

  it('retains RPC failures inside successful HTTP responses', () => {
    expect(() => googleBatchResponse('[["er","test",7]]', 'test')).toThrow(expect.objectContaining({ kind: 'rpc', rpcCode: 7 }));
    expect(() => googleBatchResponse('[["wrb.fr","test",null,null,null,[5]]]', 'test')).toThrow(expect.objectContaining({ kind: 'rpc', rpcCode: 5 }));
  });

  it('reports Google blocks without retrying', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('blocked', { status: 429, headers: { 'Retry-After': '2' } }));
    await expect(googleWebText(fetcher, new URL('https://translate.google.com'), {}, 1000)).rejects.toMatchObject({ kind: 'blocked', status: 429, retryAfterMs: 2000 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('propagates caller cancellation before requesting', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const controller = new AbortController();
    const reason = new Error('stop'); controller.abort(reason);
    await expect(googleWebText(fetcher, new URL('https://translate.google.com'), {}, 1000, controller.signal)).rejects.toBe(reason);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('recognizes same-URL HTML challenges without misclassifying JSON content', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('<html><body>Our systems have detected unusual traffic</body></html>')).mockResolvedValueOnce(new Response('["Our systems have detected unusual traffic"]'));
    await expect(googleWebText(fetcher, new URL('https://translate.google.com'), {}, 1000)).rejects.toMatchObject({ kind: 'blocked', status: 200 });
    expect(await googleWebText(fetcher, new URL('https://translate.google.com'), {}, 1000)).toBe('["Our systems have detected unusual traffic"]');
  });

  it('keeps deadlines active while the response body streams', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => ({
      text: () => new Promise<string>((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true })),
    }) as Response);
    const result = expect(googleWebText(fetcher, new URL('https://translate.google.com'), {}, 50)).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(50); await result;
  });

  it('decodes XML entities once and preserves CDATA contents', () => {
    expect(xmlText('A &amp; B &#233; &#x1F600; &amp;lt;')).toBe('A & B é 😀 &lt;');
    expect(xmlText('<![CDATA[A &amp; B]]> &lt;')).toBe('A &amp; B <');
    expect(xmlText('&#xD800; &#99999999;')).toBe('&#xD800; &#99999999;');
  });
});
