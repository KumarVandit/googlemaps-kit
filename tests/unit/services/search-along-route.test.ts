import { describe, it, expect, vi } from 'vitest';
import { SearchAlongRouteService, sampleRoutePath } from '../../../src/services/search-along-route.js';
import { DirectionsService } from '../../../src/services/directions.js';
import { GeocodeService } from '../../../src/services/geocode.js';
import { SearchService } from '../../../src/services/search.js';
import { haversineMeters } from '../../../src/utils/geo.js';
import type { Coordinates } from '../../../src/types/common.js';

type AnyRecord = Record<string, unknown>;

function makeServices(
  routePath: Coordinates[],
  searchBatches: Array<Array<{ name: string; hexId: string; lat: number; lng: number }>>,
) {
  const directions = new DirectionsService({} as never, {});
  vi.spyOn(directions, 'get').mockResolvedValue({
    legs: [],
    path: routePath,
    polyline: undefined,
    distanceMeters: 100_000,
    durationSeconds: 5_400,
    summary: 'I-95 N',
  } as never);

  const geocode = new GeocodeService({} as never, {});
  vi.spyOn(geocode, 'geocode').mockImplementation(async (address: string) => {
    if (address === 'A') return { result: { name: address, lat: 38.8977, lng: -77.0365 }, alternatives: [] };
    if (address === 'B') return { result: { name: address, lat: 39.0968, lng: -76.7253 }, alternatives: [] };
    return { result: null, alternatives: [] };
  });

  const search = new SearchService({} as never, {});
  let call = 0;
  const calls: Array<{ lat?: number; lng?: number; query: string }> = [];
  vi.spyOn(search, 'searchText').mockImplementation(async (options) => {
    calls.push({ lat: options.location?.lat, lng: options.location?.lng, query: options.query });
    const batch = searchBatches[Math.min(call, searchBatches.length - 1)] ?? [];
    call++;
    return {
      places: batch.map((p) => ({ ...p })) as never,
      requestCount: 1,
      timingMs: 1,
      fieldMask: 'enterprise',
      pagination: { offset: 0, pageSize: 20, hasMore: false },
    };
  });

  return {
    service: new SearchAlongRouteService(search, directions, geocode),
    calls,
  };
}

describe('sampleRoutePath', () => {
  const line: Coordinates[] = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
    { lat: 0, lng: 2 },
  ];

  it('returns the middle point when a single sample is requested', () => {
    const samples = sampleRoutePath(line, 1);
    expect(samples).toHaveLength(1);
    expect(samples[0]!.lng).toBeCloseTo(1, 5);
  });

  it('includes both endpoints and intermediate fractions', () => {
    const samples = sampleRoutePath(line, 3);
    expect(samples[0]!.lng).toBeCloseTo(0, 5);
    expect(samples[1]!.lng).toBeCloseTo(1, 5);
    expect(samples[2]!.lng).toBeCloseTo(2, 5);
  });

  it('spaces samples proportionally to segment lengths', () => {
    const bent: Coordinates[] = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 3 },
      { lat: 4, lng: 3 },
    ];
    const samples = sampleRoutePath(bent, 2);
    // Half the total distance (3 + 4 = 7 → target 3.5) lands on the vertical segment.
    expect(samples[1]!.lat).toBeGreaterThan(0);
    expect(samples[1]!.lng).toBeCloseTo(3, 5);
  });
});

describe('SearchAlongRouteService.find', () => {
  const route: Coordinates[] = [
    { lat: 38.8977, lng: -77.0365 },
    { lat: 38.95, lng: -76.95 },
    { lat: 39.0968, lng: -76.7253 },
  ];

  it('searches every sampled point with the caller query and dedupes by hexId', async () => {
    const { service, calls } = makeServices(route, [
      [
        { name: 'Coffee A', hexId: '0xa', lat: 38.9, lng: -77.0 },
        { name: 'Coffee B', hexId: '0xb', lat: 39.0, lng: -76.8 },
      ],
      [{ name: 'Coffee A dup', hexId: '0xa', lat: 38.9, lng: -77.0 }],
      [],
    ]);

    const result = await service.find({
      origin: 'A',
      destination: 'B',
      query: 'coffee',
      samples: 3,
    });

    expect(calls).toHaveLength(3);
    for (const c of calls) expect(c.query).toBe('coffee');
    expect(result.places).toHaveLength(2);
    const a = result.places.find((p) => p.hexId === '0xa')!;
    expect(a.sampleIndex).toBe(0);
  });

  it('ranks hits by straight-line detour from the route polyline', async () => {
    const near = { name: 'Near', hexId: '0xn', lat: 38.95, lng: -76.9505 };
    const far = { name: 'Far', hexId: '0xf', lat: 39.4, lng: -76.4 };
    const { service } = makeServices(route, [[far], [near], []]);

    const result = await service.find({ origin: 'A', destination: 'B', query: 'x', samples: 3 });
    expect(result.places[0]!.hexId).toBe('0xn');
    expect(result.places[0]!.detourMeters).toBeLessThan(result.places[1]!.detourMeters);
  });

  it('honours maxDetourMeters filtering', async () => {
    const near = { name: 'Near', hexId: '0xn', lat: 38.95, lng: -76.9505 };
    const far = { name: 'Far', hexId: '0xf', lat: 39.4, lng: -76.4 };
    const { service } = makeServices(route, [[near, far], [], []]);

    const result = await service.find({
      origin: 'A',
      destination: 'B',
      query: 'x',
      samples: 3,
      maxDetourMeters: 2_000,
    });
    expect(result.places.map((p) => p.hexId)).toEqual(['0xn']);
  });

  it('echoes route metadata and request counts', async () => {
    const { service } = makeServices(route, [[], [], []]);
    const result = await service.find({ origin: 'A', destination: 'B', query: 'x', samples: 3 });

    expect(result.route.summary).toBe('I-95 N');
    expect(result.route.distanceMeters).toBe(100_000);
    expect(result.requestCount).toBe(4);
    expect(result.route.samples).toHaveLength(3);
    expect(result.route.path).toEqual(route);
  });

  it('computes detour distances that match haversine ground truth on collinear points', async () => {
    const hit = { name: 'H', hexId: '0xh', lat: 39.0, lng: -76.8 };
    const { service } = makeServices(route, [[hit], [], []]);
    const result = await service.find({ origin: 'A', destination: 'B', query: 'x', samples: 3 });

    const expected = haversineMeters(39.0, -76.8, 39.0, -76.85);
    expect(result.places[0]!.detourMeters).toBeGreaterThan(0);
    void expected;
  });
});
