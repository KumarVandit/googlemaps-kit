import { describe, expect, it, vi } from 'vitest';
import { FlightsClient } from '../../../src/flights.js';
import { HotelsClient } from '../../../src/hotels.js';
import { loadNestedJsonFixture } from '../../helpers/fixtures.js';

const flightRequest = { origin: 'BLR', destination: 'BOM', departureDate: '2026-11-15' };
const hotelRequest = { query: 'Mumbai', checkIn: '2026-11-15', checkOut: '2026-11-16' };
const bootstrap = (app: string) => `<script>var WIZ_global_data = {"eptZe":"/_/${app}/","FdrFJe":"session","cfb2h":"build"};</script>`;
const envelope = (id: string, data: unknown) => new Response(`)]}'\n\n${JSON.stringify([['wrb.fr', id, JSON.stringify(data), null, null, null, 'generic']])}`);
function args(fetcher: ReturnType<typeof vi.fn<typeof fetch>>, index: number): unknown[] {
  const body = fetcher.mock.calls[index]?.[1]?.body as string;
  return JSON.parse(JSON.parse(new URLSearchParams(body).get('f.req')!)[0][0][1]) as unknown[];
}

describe('Google Travel consumer transport', () => {
  it('uses the Flights prefetch RPC and negotiated currency with fresh bootstrap metadata', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(bootstrap('FlightsFrontendUi')))
      .mockResolvedValueOnce(envelope('LqxFAb', loadNestedJsonFixture('flights', 'blr-bom-oneway.json')))
      .mockResolvedValueOnce(envelope('LqxFAb', loadNestedJsonFixture('flights', 'blr-bom-oneway.json')));
    const client = new FlightsClient({ fetch: fetcher, currency: 'INR' });
    expect((await client.search(flightRequest)).offers).toHaveLength(35);
    await client.search(flightRequest);
    expect(fetcher).toHaveBeenCalledTimes(3);
    const url = new URL(String(fetcher.mock.calls[1]?.[0]));
    expect(url.pathname).toBe('/_/FlightsFrontendUi/data/batchexecute');
    expect(url.searchParams.get('rpcids')).toBe('LqxFAb');
    expect(url.searchParams.get('curr')).toBe('INR');
    expect(url.searchParams.get('f.sid')).toBe('session');
    expect(url.searchParams.get('bl')).toBe('build');
    expect(args(fetcher, 1)[0]).toEqual([]);
    expect(new URLSearchParams(fetcher.mock.calls[1]?.[1]?.body as string).has('at')).toBe(false);
  });

  it('passes explicit hotel stay dates and the captured pagination token to HotelService.Search', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(bootstrap('TravelFrontendUi')))
      .mockResolvedValueOnce(envelope('MQghPc', loadNestedJsonFixture('hotels', 'mumbai-search.json')))
      .mockResolvedValueOnce(envelope('MQghPc', loadNestedJsonFixture('hotels', 'mumbai-page2.json')));
    const client = new HotelsClient({ fetch: fetcher, currency: 'INR' });
    const first = await client.search(hotelRequest);
    await client.search({ ...hotelRequest, pageToken: first.nextPageToken });
    expect(args(fetcher, 1)).toEqual(['Mumbai', null, null, [null, null, null, 'INR', [[2026, 11, 15], [2026, 11, 16], 1, 1]]]);
    expect(args(fetcher, 2)[4]).toBe('CAw');
    expect(new URL(String(fetcher.mock.calls[1]?.[0])).pathname).toBe('/_/TravelFrontendUi/data/batchexecute');
  });

  it('reports access guards without retrying or pretending there are no results', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(bootstrap('FlightsFrontendUi'))).mockResolvedValueOnce(new Response('blocked', { status: 429 }));
    await expect(new FlightsClient({ fetch: fetcher }).search(flightRequest)).rejects.toMatchObject({ kind: 'blocked', status: 429 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const unsupported = vi.fn<typeof fetch>().mockResolvedValue(new Response(bootstrap('WrongApp')));
    await expect(new HotelsClient({ fetch: unsupported }).search(hotelRequest)).rejects.toMatchObject({ kind: 'parse' });
  });

  it('validates options and honors pre-aborted requests before network access', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(new FlightsClient({ fetch: fetcher }).search({ ...flightRequest, origin: 'Mumbai' })).rejects.toThrow(TypeError);
    await expect(new HotelsClient({ fetch: fetcher }).search({ ...hotelRequest, checkOut: hotelRequest.checkIn })).rejects.toThrow(RangeError);
    const controller = new AbortController(), reason = new Error('cancelled'); controller.abort(reason);
    await expect(new FlightsClient({ fetch: fetcher }).search({ ...flightRequest, signal: controller.signal })).rejects.toBe(reason);
    expect(fetcher).not.toHaveBeenCalled();
    expect(() => new FlightsClient({ currency: 'rupees' })).toThrow(TypeError);
    expect(() => new HotelsClient({ timeoutMs: 0 })).toThrow(RangeError);
    expect(() => new HotelsClient({ language: '../en' })).toThrow(TypeError);
  });
});
