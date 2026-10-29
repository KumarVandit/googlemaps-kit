import { describe, expect, it } from 'vitest';
import { flights } from '../../src/flights.js';
import { hotels } from '../../src/hotels.js';

function dateAfter(days: number, start = new Date()): string {
  const value = new Date(start); value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

describe.skipIf(process.env.GMAPS_LIVE !== '1' || process.env.GOOGLE_TRAVEL_LIVE !== '1')('Google Travel public searches', () => {
  const departureDate = process.env.GOOGLE_TRAVEL_DATE ?? dateAfter(17);

  it('returns priced one-way flights for an explicit future departure date', async () => {
    const result = await flights({ currency: 'INR' }).search({ origin: 'BLR', destination: 'BOM', departureDate });
    expect(result.offers.length).toBeGreaterThan(0);
    expect(result.offers.some(row => row.price && row.price.amount > 0)).toBe(true);
    expect(result.offers[0]?.segments[0]?.departure).toMatchObject({ airport: 'BLR', date: departureDate });
    expect(result.offers[0]?.segments.at(-1)?.arrival.airport).toBe('BOM');
  }, 60_000);

  it('returns hotel identities, matching stay dates, and displayed prices', async () => {
    const checkOut = dateAfter(1, new Date(`${departureDate}T00:00:00Z`));
    const result = await hotels({ currency: 'INR' }).search({ query: 'Mumbai', checkIn: departureDate, checkOut });
    expect(result.currency).toBe('INR');
    expect(result.hotels.length).toBeGreaterThan(0);
    expect(result.hotels.some(row => row.price && row.price.amount > 0)).toBe(true);
    expect(result.hotels.find(row => row.price)?.price).toMatchObject({ checkIn: departureDate, checkOut, currency: 'INR', basis: 'displayed' });
  }, 60_000);
});
