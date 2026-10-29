import { describe, expect, it, vi } from 'vitest';
import { FinanceClient, FinanceError } from '../../../src/finance.js';
import { loadNestedJsonFixture } from '../../helpers/fixtures.js';

const bootstrap = '<script>var WIZ_global_data = {"eptZe":"/finance/_/FinHubUi/","FdrFJe":"session","cfb2h":"finance-build"};</script>';
function envelope(id: string, data: unknown): Response {
  return new Response(`)]}'\n\n${JSON.stringify([['wrb.fr', id, JSON.stringify(data), null, null, null, 'generic']])}`);
}

function requestArgs(fetcher: ReturnType<typeof vi.fn<typeof fetch>>, index: number): unknown {
  const body = fetcher.mock.calls[index]?.[1]?.body as string;
  return JSON.parse(JSON.parse(new URLSearchParams(body).get('f.req')!)[0][0][1]);
}

describe('Finance consumer transport', () => {
  it('bootstraps once, then sends the observed summary and historical requests', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(bootstrap))
      .mockResolvedValueOnce(envelope('gCvqoe', loadNestedJsonFixture('finance', 'quote-googl.json')))
      .mockResolvedValueOnce(envelope('c2u4wc', loadNestedJsonFixture('finance', 'chart-googl-month.json')));
    const client = new FinanceClient({ fetch: fetcher });
    const quote = await client.quote('GOOGL:NASDAQ');
    const chart = await client.chart('GOOGL:NASDAQ', { range: '1M' });
    expect(quote.price).toBe(324.89);
    expect(chart.range).toBe('1M');
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(requestArgs(fetcher, 1)).toEqual([[[null, ['GOOGL', 'NASDAQ']]]]);
    expect(requestArgs(fetcher, 2)).toEqual([[[null, ['GOOGL', 'NASDAQ']]], 3]);
    const url = new URL(String(fetcher.mock.calls[1]?.[0]));
    expect(url.pathname).toBe('/finance/_/FinHubUi/data/batchexecute');
    expect(url.searchParams.get('f.sid')).toBe('session');
    expect(url.searchParams.get('bl')).toBe('finance-build');
    expect(new URLSearchParams(fetcher.mock.calls[1]?.[1]?.body as string).has('at')).toBe(false);
  });

  it('sends search suggestions rather than an earnings RPC', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(bootstrap)).mockResolvedValueOnce(envelope('XB3kn', loadNestedJsonFixture('finance', 'search-microsoft.json')));
    const result = await new FinanceClient({ fetch: fetcher }).search('Microsoft');
    expect(requestArgs(fetcher, 1)).toEqual(['Microsoft', null, 1]);
    expect(result.matches.some(row => row.instrument.symbol === 'MSFT')).toBe(true);
  });

  it('surfaces the captured per-instrument not-found status', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(bootstrap)).mockResolvedValueOnce(envelope('gCvqoe', [[[null, [5]]]]));
    await expect(new FinanceClient({ fetch: fetcher }).quote('MISSING:NASDAQ')).rejects.toMatchObject({ kind: 'rpc', rpcCode: 5, message: 'Finance quote was not found' });
  });

  it('surfaces automated-query failures without retrying or returning invented data', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(bootstrap)).mockResolvedValueOnce(new Response('blocked', { status: 429, headers: { 'Retry-After': '3' } }));
    await expect(new FinanceClient({ fetch: fetcher }).quote('GOOGL:NASDAQ')).rejects.toMatchObject({ kind: 'blocked', status: 429, retryAfterMs: 3000 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rejects unsupported bootstrap pages and remote application errors', async () => {
    const unsupported = vi.fn<typeof fetch>().mockResolvedValue(new Response('<script>WIZ_global_data={"eptZe":"/other/"};</script>'));
    await expect(new FinanceClient({ fetch: unsupported }).search('test')).rejects.toThrow(/unsupported/);
    const failed = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(bootstrap)).mockResolvedValueOnce(new Response(`)]}'\n\n${JSON.stringify([['wrb.fr', 'XB3kn', null, null, null, [5], 'generic']])}`));
    await expect(new FinanceClient({ fetch: failed }).search('test')).rejects.toMatchObject({ kind: 'rpc', rpcCode: 5 });
  });

  it('validates locally and honors cancellation before network access', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new FinanceClient({ fetch: fetcher });
    await expect(client.quote('GOOGL')).rejects.toThrow(TypeError);
    await expect(client.search(' ')).rejects.toThrow(TypeError);
    await expect(client.chart('GOOGL:NASDAQ', { range: 'CUSTOM' as never })).rejects.toThrow(TypeError);
    const controller = new AbortController(), reason = new Error('cancelled');
    controller.abort(reason);
    await expect(client.quote('GOOGL:NASDAQ', { signal: controller.signal })).rejects.toBe(reason);
    expect(fetcher).not.toHaveBeenCalled();
    expect(() => new FinanceClient({ timeoutMs: 0 })).toThrow(RangeError);
    expect(new FinanceError('blocked', 'blocked')).toBeInstanceOf(Error);
  });
});
