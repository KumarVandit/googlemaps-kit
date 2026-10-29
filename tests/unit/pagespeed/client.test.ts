import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageSpeedClient, PageSpeedError, pageSpeed } from '../../../src/pagespeed.js';

const TARGET = 'https://example.com/';
const BOOTSTRAP_DATA = { cfb2h: 'pagespeed-test-build', FdrFJe: 'test-session', pDzS6: 3 };
const LIGHTHOUSE = {
  lighthouseVersion: '13.0.0', requestedUrl: TARGET, finalUrl: TARGET,
  fetchTime: '2026-10-29T06:00:00.000Z', audits: {}, categories: {},
};

function bootstrap(token?: string): Response {
  return new Response(`<script>window.WIZ_global_data = ${JSON.stringify({ ...BOOTSTRAP_DATA, ...(token ? { SNlM0e: token } : {}) })};</script>`);
}

function result(id: string, status = 1, strategy = 1, type = 1): unknown[] {
  return [TARGET, TARGET, strategy, type, null, null, status, null, id, status === 2 && type === 1 ? JSON.stringify(LIGHTHOUSE) : null];
}

function analysis(results: unknown[][] = [result('mobile')], status = 1): unknown[] {
  return ['report123', TARGET, status, 3, results, [[1, TARGET], [2, TARGET]], [1793255215, 930220000]];
}

function rpcResponse(id: string, payload: unknown): Response {
  return new Response(")]}'\n\n" + JSON.stringify([['wrb.fr', id, JSON.stringify(payload), null, null, null, 'generic']]));
}

function requestUrl(input: Parameters<typeof globalThis.fetch>[0]): URL {
  return new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
}

function rpcArgs(init: RequestInit | undefined): unknown[] {
  const form = new URLSearchParams(String(init?.body));
  const envelope = JSON.parse(form.get('f.req') ?? 'null') as Array<Array<[string, string, null, string]>>;
  return JSON.parse(envelope[0]![0]![1]) as unknown[];
}

afterEach(() => {
  vi.useRealTimers();
});

describe('PageSpeed web client', () => {
  it('bootstraps the public web session and creates both strategies without leaking the API key', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(bootstrap())
      .mockResolvedValueOnce(rpcResponse('nqfuif', [analysis()]));
    const client = pageSpeed({ fetch: fetchMock, apiKey: 'official-api-key' });

    const report = await client.createAnalysis('https://example.com');

    expect(client).toBeInstanceOf(PageSpeedClient);
    expect(report).toMatchObject({ id: 'report123', url: TARGET, status: 'pending' });
    expect(requestUrl(fetchMock.mock.calls[0]![0]).toString()).toBe('https://pagespeed.web.dev/?hl=en-US');
    const [input, init] = fetchMock.mock.calls[1]!;
    const url = requestUrl(input);
    expect(url.origin + url.pathname).toBe('https://pagespeed.web.dev/_/PagespeedUi/data/batchexecute');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      rpcids: 'nqfuif', 'source-path': '/analysis', bl: BOOTSTRAP_DATA.cfb2h,
      'f.sid': BOOTSTRAP_DATA.FdrFJe, hl: 'en-US', rt: 'c',
    });
    expect(url.searchParams.get('_reqid')).toMatch(/^\d+$/);
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('X-Rawurl')).toBe(TARGET);
    expect(new URLSearchParams(String(init?.body)).get('f.req')).toBe(JSON.stringify([[['nqfuif', JSON.stringify([TARGET, 3]), null, 'generic']]]));
    expect(new URLSearchParams(String(init?.body)).has('at')).toBe(false);
    for (const [request, options] of fetchMock.mock.calls) {
      expect(requestUrl(request).searchParams.has('key')).toBe(false);
      expect(String(options?.body)).not.toContain('official-api-key');
      expect(JSON.stringify(options?.headers ?? {})).not.toContain('official-api-key');
    }
  });

  it.each([true, false])('encodes the explicit useOriginalUrl=%s flag and optional session token', async (useOriginalUrl) => {
    const fetchMock = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(bootstrap('session-auth-token'))
      .mockResolvedValueOnce(rpcResponse('nqfuif', [analysis()]));

    await pageSpeed({ fetch: fetchMock, locale: 'fr' }).createAnalysis(TARGET, { useOriginalUrl });

    expect(requestUrl(fetchMock.mock.calls[0]![0]).searchParams.get('hl')).toBe('fr');
    const [, init] = fetchMock.mock.calls[1]!;
    expect(rpcArgs(init)).toEqual([TARGET, 3, null, useOriginalUrl]);
    expect(new URLSearchParams(String(init?.body)).get('at')).toBe('session-auth-token');
  });

  it('retrieves report URLs by ID and reuses the bootstrap session', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(bootstrap())
      .mockResolvedValueOnce(rpcResponse('CBayme', analysis()))
      .mockResolvedValueOnce(rpcResponse('CBayme', analysis()));
    const client = pageSpeed({ fetch: fetchMock });

    await client.getAnalysis('https://pagespeed.web.dev/analysis/https-example-com/report123?form_factor=mobile');
    await client.getAnalysis('report123');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(rpcArgs(fetchMock.mock.calls[1]![1])).toEqual(['report123']);
    expect(rpcArgs(fetchMock.mock.calls[2]![1])).toEqual(['report123']);
    expect(requestUrl(fetchMock.mock.calls[1]![0]).searchParams.get('rpcids')).toBe('CBayme');
    expect(requestUrl(fetchMock.mock.calls[1]![0]).searchParams.get('_reqid'))
      .not.toBe(requestUrl(fetchMock.mock.calls[2]![0]).searchParams.get('_reqid'));
  });

  it('polls only pending result IDs and preserves completed field data while merging by ID', async () => {
    const field = result('field', 2, 1, 3);
    field[5] = [[], [], null, [[2026, 10, 1], [2026, 10, 28]]];
    const fetchMock = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(bootstrap())
      .mockResolvedValueOnce(rpcResponse('CBayme', analysis([result('mobile'), field, result('desktop', 1, 2)])))
      .mockResolvedValueOnce(rpcResponse('LsX2he', [[result('desktop', 2, 2), result('mobile', 2)]]));
    const client = pageSpeed({ fetch: fetchMock });
    const initial = await client.getAnalysis('report123');

    const updated = await client.pollAnalysis(initial);

    expect(rpcArgs(fetchMock.mock.calls[2]![1])).toEqual(['report123', ['mobile', 'desktop']]);
    expect(updated.status).toBe('complete');
    expect(updated.results.map(item => item.id)).toEqual(['mobile', 'field', 'desktop']);
    expect(updated.results[0]?.lighthouse).toEqual(LIGHTHOUSE);
    expect(updated.results[1]?.fieldData).toEqual(initial.results[1]?.fieldData);
    expect(initial.results[0]?.status).toBe('pending');
    expect(updated.raw[4]).toEqual(updated.results.map(item => item.raw));
  });

  it('accepts an analysis ID for polling and avoids further requests after completion', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(bootstrap())
      .mockResolvedValueOnce(rpcResponse('CBayme', analysis([result('mobile', 2)], 2)));
    const client = pageSpeed({ fetch: fetchMock });

    const report = await client.pollAnalysis('report123');

    expect(await client.pollAnalysis(report)).toBe(report);
    expect(await client.waitForAnalysis(report)).toBe(report);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces HTTP throttling with Retry-After and never retries analysis creation', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(bootstrap())
      .mockResolvedValueOnce(new Response('quota exceeded', { status: 429, headers: { 'Retry-After': '1.5' } }));

    await expect(pageSpeed({ fetch: fetchMock }).createAnalysis(TARGET)).rejects.toMatchObject({
      name: 'PageSpeedError', kind: 'http', status: 429, retryAfterMs: 1500,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects missing RPC results instead of returning an empty analysis', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(bootstrap())
      .mockResolvedValueOnce(rpcResponse('unrelated', analysis()));

    await expect(pageSpeed({ fetch: fetchMock }).getAnalysis('report123')).rejects.toMatchObject({ kind: 'parse' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('preserves explicit RPC failure codes', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(bootstrap())
      .mockResolvedValueOnce(new Response(")]}'\n\n" + JSON.stringify([['er', 'CBayme', 7]])));

    await expect(pageSpeed({ fetch: fetchMock }).getAnalysis('report123')).rejects.toMatchObject({ kind: 'rpc', rpcCode: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects incomplete session metadata before issuing an RPC', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('<script>WIZ_global_data = {"pDzS6":3};</script>'));

    await expect(pageSpeed({ fetch: fetchMock }).createAnalysis(TARGET)).rejects.toMatchObject({ kind: 'parse' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('PageSpeed official API', () => {
  it('emits repeated categories and optional API parameters while preserving the complete response', async () => {
    const payload = { kind: 'pagespeedonline#result', lighthouseResult: LIGHTHOUSE, extension: { future: true } };
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify(payload)));

    const report = await pageSpeed({ fetch: fetchMock, apiKey: 'api-key', locale: 'en-US' }).runPagespeed(TARGET, {
      strategy: 'mobile', categories: ['performance', 'accessibility', 'best-practices', 'seo'], locale: 'de',
      captchaToken: 'captcha-value', utmCampaign: 'test-campaign', utmSource: 'test-source',
    });

    expect(report).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0]!;
    const url = requestUrl(input);
    expect(url.origin + url.pathname).toBe('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
    expect(url.searchParams.getAll('category')).toEqual(['performance', 'accessibility', 'best-practices', 'seo']);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      url: TARGET, strategy: 'mobile', locale: 'de', key: 'api-key',
      captchaToken: 'captcha-value', utm_campaign: 'test-campaign', utm_source: 'test-source',
    });
    expect(init?.method).toBe('GET');
    expect(init?.body).toBeUndefined();
  });

  it('defaults to desktop without requiring an API key or web bootstrap', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('{}'));

    await pageSpeed({ fetch: fetchMock }).runPagespeed(TARGET);

    const params = requestUrl(fetchMock.mock.calls[0]![0]).searchParams;
    expect(params.get('strategy')).toBe('desktop');
    expect(params.get('locale')).toBe('en-US');
    expect(params.has('key')).toBe(false);
    expect(params.getAll('category')).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retains API error messages and HTTP-date retry deadlines', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-29T06:00:00.000Z'));
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Daily quota exhausted' } }), {
      status: 429, headers: { 'Retry-After': 'Thu, 29 Oct 2026 06:00:05 GMT' },
    }));

    await expect(pageSpeed({ fetch: fetchMock }).runPagespeed(TARGET)).rejects.toMatchObject({
      kind: 'http', status: 429, retryAfterMs: 5000, message: 'PageSpeed HTTP 429: Daily quota exhausted',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports malformed API JSON and network failures distinctly', async () => {
    const invalid = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('not JSON'));
    await expect(pageSpeed({ fetch: invalid }).runPagespeed(TARGET)).rejects.toMatchObject({ kind: 'parse' });
    const cause = new TypeError('connection closed');
    const failed = vi.fn<typeof globalThis.fetch>().mockRejectedValue(cause);
    await expect(pageSpeed({ fetch: failed }).runPagespeed(TARGET)).rejects.toMatchObject({ kind: 'network', cause });
  });

  it('validates target URLs before sending any request', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    const client = pageSpeed({ fetch: fetchMock });

    for (const url of ['example.com', 'file:///tmp/test', 'https://user:password@example.com/']) {
      await expect(client.createAnalysis(url)).rejects.toBeInstanceOf(TypeError);
      await expect(client.runPagespeed(url)).rejects.toBeInstanceOf(TypeError);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('PageSpeed deadlines and cancellation', () => {
  it('honors an already aborted caller before fetching', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    const client = pageSpeed({ fetch: fetchMock });
    const controller = new AbortController();
    const reason = new Error('caller canceled');
    controller.abort(reason);

    await expect(client.createAnalysis(TARGET, { signal: controller.signal })).rejects.toBe(reason);
    await expect(client.getAnalysis('report123', { signal: controller.signal })).rejects.toBe(reason);
    await expect(client.waitForAnalysis('report123', { signal: controller.signal })).rejects.toBe(reason);
    await expect(client.runPagespeed(TARGET, { signal: controller.signal })).rejects.toBe(reason);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the request deadline active until its response body finishes', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | null | undefined;
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockImplementation(async (_input, init) => {
      requestSignal = init?.signal;
      return {
        text: () => new Promise<string>((_resolve, reject) => {
          requestSignal?.addEventListener('abort', () => reject(requestSignal?.reason), { once: true });
        }),
      } as Response;
    });
    const rejection = expect(pageSpeed({ fetch: fetchMock, timeoutMs: 50 }).runPagespeed(TARGET)).rejects.toMatchObject({ kind: 'timeout' });

    await vi.advanceTimersByTimeAsync(50);

    await rejection;
    expect(requestSignal?.aborted).toBe(true);
    expect(requestSignal?.reason).toBeInstanceOf(PageSpeedError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts an in-flight initial report request at the overall wait deadline', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | null | undefined;
    const fetchMock = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(bootstrap())
      .mockImplementationOnce(async (_input, init) => {
        requestSignal = init?.signal;
        return new Promise<Response>((_resolve, reject) => {
          requestSignal?.addEventListener('abort', () => reject(requestSignal?.reason), { once: true });
        });
      });
    const rejection = expect(pageSpeed({ fetch: fetchMock }).waitForAnalysis('report123', { timeoutMs: 50 })).rejects.toMatchObject({ kind: 'timeout' });

    await vi.advanceTimersByTimeAsync(50);

    await rejection;
    expect(requestSignal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('cancels a polling delay promptly without issuing another request', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(bootstrap())
      .mockResolvedValueOnce(rpcResponse('CBayme', analysis()));
    const client = pageSpeed({ fetch: fetchMock });
    const initial = await client.getAnalysis('report123');
    const controller = new AbortController();
    const reason = new Error('stop polling');
    const rejection = expect(client.waitForAnalysis(initial, { signal: controller.signal, pollIntervalMs: 3000 })).rejects.toBe(reason);

    controller.abort(reason);

    await rejection;
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('creates and waits for completion, reporting progress across partial result updates', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(bootstrap())
      .mockResolvedValueOnce(rpcResponse('nqfuif', [analysis([result('mobile'), result('desktop', 1, 2)])]))
      .mockResolvedValueOnce(rpcResponse('LsX2he', [[result('desktop', 2, 2)]]))
      .mockResolvedValueOnce(rpcResponse('LsX2he', [[result('mobile', 2)]]));
    const onProgress = vi.fn();
    const pending = pageSpeed({ fetch: fetchMock }).analyze(TARGET, { pollIntervalMs: 10, timeoutMs: 100, onProgress });

    await vi.advanceTimersByTimeAsync(20);
    const report = await pending;

    expect(report.status).toBe('complete');
    expect(rpcArgs(fetchMock.mock.calls[2]![1])).toEqual(['report123', ['mobile', 'desktop']]);
    expect(rpcArgs(fetchMock.mock.calls[3]![1])).toEqual(['report123', ['mobile']]);
    expect(onProgress.mock.calls.map(([value]) => value.results.filter((item: { status: string }) => item.status === 'pending').length)).toEqual([2, 1, 0]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
