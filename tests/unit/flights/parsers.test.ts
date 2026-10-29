import { describe, expect, it } from 'vitest';
import { loadNestedJsonFixture } from '../../helpers/fixtures.js';
import { buildFlightSearchArgs, buildFlightSearchUrl, parseFlightSearchResponse } from '../../../src/flights/parsers.js';

const request = { origin: 'BLR', destination: 'BOM', departureDate: '2026-11-15' };
const fixture = () => loadNestedJsonFixture<unknown[]>('flights', 'blr-bom-oneway.json');
const a = (value: unknown) => value as unknown[];
const firstSegment = (raw: unknown[]) => a(a(a(a(a(raw[2])[0])[0])[0])[2])[0] as unknown[];

describe('Flights shopping capture', () => {
  it('retains offer groups, exact units, carrier numbers and local airport times', () => {
    const result = parseFlightSearchResponse(fixture(), request, 'INR');
    expect(result.offers).toHaveLength(35);
    expect(result.offers.filter(row => row.group === 'best')).toHaveLength(4);
    expect(result.offers[0]).toMatchObject({ group: 'best', stops: 0, durationMinutes: 110, price: { amount: 6559, currency: 'INR' }, segments: [{ airlineCode: '6E', flightNumber: '5205', departure: { airport: 'BLR', date: '2026-11-15', time: '03:15' }, arrival: { airport: 'BOM', date: '2026-11-15', time: '05:05' } }] });
    expect(result.offers[0]?.selectionToken).toBeTruthy();
    expect(result.offers[0]?.raw).toBeDefined();
  });

  it('preserves omitted prices and overnight local dates, including an omitted zero hour', () => {
    const result = parseFlightSearchResponse(fixture(), request, 'INR');
    expect(result.offers.find(row => row.segments[0]?.flightNumber === '1548')?.price).toBeUndefined();
    expect(result.offers.find(row => row.segments[0]?.flightNumber === '5094')?.segments.at(-1)?.arrival).toMatchObject({ date: '2026-11-16', time: '00:10' });
    expect(result.offers.find(row => row.segments.length === 2)?.stops).toBe(1);
  });

  it('keeps the units returned for a separately negotiated USD request without conversion', () => {
    const raw = loadNestedJsonFixture<unknown[]>('flights', 'blr-bom-oneway-usd.json');
    expect(parseFlightSearchResponse(raw, request, 'USD').offers[0]?.price).toEqual({ amount: 74, currency: 'USD' });
    const changed = fixture(), price = a(a(a(a(changed[2])[0])[0])[1]);
    a(price[0])[1] = 0;
    expect(parseFlightSearchResponse(changed, request, 'INR').offers[0]?.price?.amount).toBe(0);
    a(price[0])[1] = -1;
    expect(() => parseFlightSearchResponse(changed, request, 'INR')).toThrow(/flight price/);
  });

  it('rejects a missing time message, invalid times and a mismatched route or date', () => {
    for (const invalid of [null, [25], ['bad', 10]]) {
      const raw = fixture(); firstSegment(raw)[8] = invalid;
      expect(() => parseFlightSearchResponse(raw, request, 'INR')).toThrow(/local date\/time/);
    }
    expect(() => parseFlightSearchResponse(fixture(), { ...request, origin: 'DEL' }, 'INR')).toThrow(/did not match/);
    expect(() => parseFlightSearchResponse(fixture(), { ...request, departureDate: '2026-11-16' }, 'INR')).toThrow(/did not match/);
  });

  it('rejects malformed groups rather than returning an empty list', () => {
    expect(() => parseFlightSearchResponse({}, request, 'INR')).toThrow(/Invalid/);
    expect(() => parseFlightSearchResponse([null, null, {}, null], request, 'INR')).toThrow(/Invalid/);
    expect(parseFlightSearchResponse([null, null, [], []], request, 'INR').offers).toEqual([]);
  });

  it('builds the verified single-adult one-way economy constraint with airport IDs', () => {
    const args = buildFlightSearchArgs({ ...request, origin: ' blr ' });
    const constraints = a(args[1]), leg = a(constraints[13])[0];
    expect(constraints[2]).toBe(2);
    expect(constraints[5]).toBe(1);
    expect(constraints[6]).toEqual([1, 0, 0, 0]);
    expect(a(leg)[0]).toEqual([[['BLR', 0]]]);
    expect(a(leg)[1]).toEqual([[['BOM', 0]]]);
    expect(a(leg)[6]).toBe(request.departureDate);
    const url = new URL(buildFlightSearchUrl(request, 'INR'));
    expect(url.searchParams.get('q')).toContain('2026-11-15 one way');
    expect(url.searchParams.get('curr')).toBe('INR');
  });

  it('rejects impossible dates and unsupported airport inputs before transport', () => {
    for (const departureDate of ['2025-02-29', '2026-13-01', '15/11/2026']) expect(() => buildFlightSearchArgs({ ...request, departureDate })).toThrow();
    for (const origin of ['Bengaluru', 'BOM', '../']) expect(() => buildFlightSearchArgs({ ...request, origin })).toThrow(TypeError);
  });
});
