import { describe, expect, it } from 'vitest';
import { loadNestedJsonFixture } from '../../helpers/fixtures.js';
import { buildHotelSearchArgs, parseHotelSearchResponse } from '../../../src/hotels/parsers.js';

const request = { query: 'Mumbai', checkIn: '2026-11-15', checkOut: '2026-11-16' };
const fixture = (name = 'mumbai-search.json') => loadNestedJsonFixture<unknown[]>('hotels', name);
const a = (value: unknown) => value as unknown[];
function hotel(raw: unknown[]): unknown[] {
  for (const entry of a(raw[8])) {
    const extensions = a(entry)[1] as Record<string, unknown>;
    if (extensions && extensions['179305178']) return a(extensions['179305178']);
  }
  throw new Error('Fixture hotel is missing');
}

describe('HotelService.Search capture', () => {
  it('preserves opaque IDs, exact displayed units, date and currency echoes and observed links', () => {
    const result = parseHotelSearchResponse(fixture(), request, 'INR');
    expect(result.hotels).toHaveLength(12);
    expect(result).toMatchObject({ currency: 'INR', totalResults: 2995, nextPageToken: 'CAw', occupancyRaw: [1, 1] });
    expect(result.hotels[0]).toMatchObject({ id: 'ChoIu4DL3ILx1L2mARoNL2cvMTFnZGt3cnc1cBAB', name: 'Hotel Lotus Grand', mapsFeatureId: '0x3be7c86e57414327:0xa67b53882b92c03b', location: { lat: 19.0990274, lng: 72.8920697 }, rating: 3.8, reviewCount: 746, hotelClass: 3, price: { amount: 1506, currency: 'INR', basis: 'displayed', checkIn: request.checkIn, checkOut: request.checkOut, occupancyRaw: [1, 1] }, website: 'http://www.hotellotusgrand.in/' });
    expect(result.hotels[0]?.mapsUrl).toContain('https://maps.google.com/maps?');
    expect(result.hotels[1]?.price).toMatchObject({ amount: 672.46875, formatted: '₹672' });
    expect(result.hotels[0]?.raw).toBeDefined();
  });

  it('returns the second page token without promising disjoint rankings across pages', () => {
    const first = parseHotelSearchResponse(fixture(), request);
    const second = parseHotelSearchResponse(fixture('mumbai-page2.json'), { ...request, pageToken: first.nextPageToken });
    expect(second.nextPageToken).toBe('CBg');
    expect(second.hotels).toHaveLength(14);
    expect(second.hotels.some(row => first.hotels.some(other => row.id === other.id))).toBe(true);
    expect(buildHotelSearchArgs({ ...request, pageToken: first.nextPageToken }, 'INR')[4]).toBe('CAw');
  });

  it('rejects mismatched search dates, stay dates and currencies', () => {
    expect(() => parseHotelSearchResponse(fixture(), { ...request, checkOut: '2026-11-17' })).toThrow(/dates did not match/);
    expect(() => parseHotelSearchResponse(fixture(), request, 'USD')).toThrow(/currency did not match/);
    const changedDate = fixture(); a(a(hotel(changedDate)[6])[2])[8] = [[2026, 11, 15], [2026, 11, 17], 1, 1];
    expect(() => parseHotelSearchResponse(changedDate, request)).toThrow(/stay dates/);
    const changedCurrency = fixture(); a(a(hotel(changedCurrency)[6])[2])[15] = 'USD';
    expect(() => parseHotelSearchResponse(changedCurrency, request)).toThrow(/currency differs/);
  });

  it('leaves missing prices absent and keeps unknown card extensions out of hotel results', () => {
    const raw = fixture(); a(hotel(raw)[6])[2] = null;
    a(raw[8]).push([1, { '999999': ['Unknown card'] }]);
    const result = parseHotelSearchResponse(raw, request);
    expect(result.hotels).toHaveLength(12);
    expect(result.hotels[0]?.price).toBeUndefined();
  });

  it('rejects corrupt entities and coordinates while accepting valid empty pages', () => {
    const raw = fixture(); a(hotel(raw)[2])[0] = [91, 0];
    expect(() => parseHotelSearchResponse(raw, request)).toThrow(/coordinates/);
    const missingId = fixture(); hotel(missingId)[20] = null;
    expect(() => parseHotelSearchResponse(missingId, request)).toThrow(/identity/);
    const empty = fixture(); empty[8] = [];
    expect(parseHotelSearchResponse(empty, request).hotels).toEqual([]);
    expect(() => parseHotelSearchResponse([], request)).toThrow(/Invalid/);
  });

  it('validates explicit stay dates and the opaque page token locally', () => {
    expect(buildHotelSearchArgs(request, 'INR')).toEqual(['Mumbai', null, null, [null, null, null, 'INR', [[2026, 11, 15], [2026, 11, 16], 1, 1]]]);
    expect(() => buildHotelSearchArgs({ ...request, checkIn: request.checkOut }, 'INR')).toThrow(RangeError);
    expect(() => buildHotelSearchArgs({ ...request, query: ' ' }, 'INR')).toThrow(TypeError);
    expect(() => buildHotelSearchArgs({ ...request, pageToken: '<invalid>' }, 'INR')).toThrow(TypeError);
  });
});
