import { describe, expect, it } from 'vitest';
import {
  buildTimezoneResult,
  deriveTimezoneOffset,
  extractTimezoneFromGeocodeResults,
  localityQueriesFromReverseHit,
} from '../src/parsers/timezone-geocode.js';
import type { GeocodeResult } from '../src/types/geocode.js';

describe('timezone geocode parser', () => {
  it('extracts timezone from geocode rows', () => {
    const rows: GeocodeResult[] = [
      { name: 'coord', lat: 1, lng: 2 },
      { name: 'poi', lat: 1, lng: 2, timezone: 'Europe/Paris' },
    ];
    expect(extractTimezoneFromGeocodeResults(rows)).toBe('Europe/Paris');
  });

  it('builds locality forward queries from plus code address', () => {
    const hit: GeocodeResult = {
      name: 'coord',
      lat: -33.8688,
      lng: 151.2093,
      plusCodeAddress: '46J5+FPF Sydney, New South Wales, Australia',
    };
    expect(localityQueriesFromReverseHit(hit)).toContain('Sydney, Australia');
  });

  it('derives half-hour offset for Asia/Calcutta via Intl', () => {
    const derived = deriveTimezoneOffset('Asia/Calcutta', new Date('2026-01-15T12:00:00Z'));
    expect(derived?.totalOffsetMinutes).toBe(330);
    expect(derived?.offsetSource).toBe('derived-intl');
  });

  it('builds timezone result with derived offsets', () => {
    const result = buildTimezoneResult(40.758, -73.9855, 'America/New_York');
    expect(result.status).toBe('OK');
    expect(result.timeZoneId).toBe('America/New_York');
    expect(result.offsetSource).toBe('derived-intl');
    expect(result.totalOffsetMinutes).toBeDefined();
  });
});

describe('timezone offline geo-tz', () => {
  it('resolves Bengaluru via geo-tz without HTTP', async () => {
    const { TimezoneService } = await import('../src/services/timezone.js');
    const svc = new TimezoneService(
      { reverseGeocode: async () => { throw new Error('should not call'); } } as never,
      { hl: 'en', gl: 'in' },
    );
    const result = await svc.get({ lat: 12.91, lng: 77.63 });
    expect(result.status).toBe('OK');
    expect(result.timezoneSource).toBe('geo-tz');
    expect(result.timeZoneId).toMatch(/^Asia\//);
  });
});

describe('distance matrix service (offline)', () => {
  it('deduplicates identical origin/destination pairs and handles same-point cells', async () => {
    const { DistanceMatrixService } = await import('../src/services/distance-matrix.js');

    let callCount = 0;
    const mockDirections = {
      get: async () => {
        callCount += 1;
        return {
          legs: [{ distance: '2 km', duration: '5 min' }],
          distance: '2 km',
          duration: '5 min',
        };
      },
    };

    const matrix = new DistanceMatrixService(
      mockDirections as unknown as import('../src/services/directions.js').DirectionsService,
      { hl: 'en', gl: 'us' },
    );
    const origin = { lat: 40.758, lng: -73.9855 };
    const result = await matrix.getMatrix({
      origins: [origin, origin],
      destinations: [origin, { lat: 40.761, lng: -73.98 }],
      concurrency: 2,
      requestDelayMs: 0,
    });

    expect(result.implementation).toBe('directions-fan-out');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]![0]!.distanceMeters).toBe(0);
    expect(result.rows[0]![0]!.durationSeconds).toBe(0);
    expect(result.rows[0]![1]!.distanceMeters).toBe(2000);
    expect(callCount).toBe(1);
  });
});
