import { describe, it, expect, vi } from 'vitest';
import { WaypointOptimizerService } from '../../../src/services/waypoint-optimizer.js';
import { DistanceMatrixService } from '../../../src/services/distance-matrix.js';
import { DirectionsService } from '../../../src/services/directions.js';
import { GeocodeService } from '../../../src/services/geocode.js';
import type { Coordinates } from '../../../src/types/common.js';

/** Five towns on a line at unit marks 1–5; costs derive from coordinates, not array position. */
const SECONDS_PER_UNIT = 30;
const METERS_PER_UNIT = 100;

function markOf(point: Coordinates | string): number {
  return (point as Coordinates).lat;
}
function unitsBetween(a: Coordinates | string, b: Coordinates | string): number {
  return Math.abs(markOf(a) - markOf(b));
}

const POINTS: Array<Coordinates | string> = [
  { lat: 1, lng: 1 },
  { lat: 2, lng: 2 },
  { lat: 3, lng: 3 },
  { lat: 4, lng: 4 },
  { lat: 5, lng: 5 },
];

function makeOptimizer() {
  const matrix = new DistanceMatrixService({} as never, {});
  vi.spyOn(matrix, 'getMatrix').mockImplementation(async (options) => {
    const rows = options.origins.map((o) =>
      options.destinations.map((d) => {
        const units = unitsBetween(o, d);
        return {
          originIndex: -1,
          destinationIndex: -1,
          status: 'OK' as const,
          distanceMeters: units * METERS_PER_UNIT,
          durationSeconds: units * SECONDS_PER_UNIT,
        };
      }),
    );
    // Patch indices after building (rows must mirror request order).
    rows.forEach((row, i) => row.forEach((cell, j) => {
      cell.originIndex = i;
      cell.destinationIndex = j;
    }));
    return {
      rows,
      requestCount: options.origins.length ** 2 - options.origins.length,
      implementation: 'directions-fan-out' as const,
      timingMs: 1,
    };
  });

  const directions = new DirectionsService({} as never, {});
  vi.spyOn(directions, 'get').mockResolvedValue({
    legs: [],
    distanceMeters: 1000,
    durationSeconds: 60,
  } as never);

  const geocode = new GeocodeService({} as never, {});
  vi.spyOn(geocode, 'geocode').mockImplementation(async () => ({
    result: null,
    alternatives: [],
  }));

  return new WaypointOptimizerService(matrix, directions, geocode);
}

function tourCost(points: Array<Coordinates | string>, roundTripTo?: Coordinates | string): number {
  let seconds = 0;
  const seq = [...points, ...(roundTripTo ? [roundTripTo] : [])];
  for (let i = 0; i < seq.length - 1; i++) {
    seconds += unitsBetween(seq[i]!, seq[i + 1]!) * SECONDS_PER_UNIT;
  }
  return seconds;
}

describe('WaypointOptimizerService.optimize', () => {
  it('keeps an already-optimal order unchanged', async () => {
    const optimizer = makeOptimizer();
    // Stops already in line order (indices 1, 2, 3 of the matrix).
    const result = await optimizer.optimize({
      stops: [POINTS[1]!, POINTS[2]!, POINTS[3]!],
      origin: POINTS[0]!,
      destination: POINTS[4]!,
    });

    expect(result.order).toEqual([0, 1, 2]);
    expect(result.totalDurationSeconds).toBe(30 + 30 + 30 + 30);
    expect(result.improvementPercent).toBe(0);
  });

  it('repairs a deliberately backwards tour to the optimal direction', async () => {
    const optimizer = makeOptimizer();
    const result = await optimizer.optimize({
      stops: [POINTS[3]!, POINTS[2]!, POINTS[1]!],
      origin: POINTS[0]!,
      destination: POINTS[4]!,
    });

    // Stops arrive as [far, mid, near]; the optimal tour visits the near one first.
    expect(result.order).toEqual([2, 1, 0]);
    expect(result.totalDurationSeconds).toBe(120);
    expect(result.baselineDurationSeconds).toBe(
      tourCost([POINTS[3]!, POINTS[2]!, POINTS[1]!], undefined) + unitsBetween(POINTS[0]!, POINTS[3]!) * SECONDS_PER_UNIT + unitsBetween(POINTS[1]!, POINTS[4]!) * SECONDS_PER_UNIT,
    );
    expect(result.improvementPercent).toBe(50);
  });

  it('supports roundTrip returning to the fixed origin', async () => {
    const optimizer = makeOptimizer();
    const result = await optimizer.optimize({
      stops: [POINTS[2]!, POINTS[1]!, POINTS[3]!],
      origin: POINTS[0]!,
      roundTrip: true,
      metric: 'distance',
    });

    // Mirror tours cost the same on a symmetric line — assert optimality, not direction.
    const visited = result.order.map((i) => POINTS[i]);
    expect(new Set(visited).size).toBe(3);
    // Optimal loop 1→2→3→4→1 spans 6 units.
    expect(result.totalDistanceMeters).toBe(600);
    expect(result.baselineDistanceMeters).toBeGreaterThanOrEqual(600);
    expect(result.improvementPercent).toBeGreaterThanOrEqual(0);
  });

  it('reports the caller order as baseline and counts unique matrix pairs', async () => {
    const optimizer = makeOptimizer();
    const result = await optimizer.optimize({
      stops: [POINTS[1]!, POINTS[2]!],
      origin: POINTS[0]!,
      destination: POINTS[3]!,
    });

    expect(result.baselineDurationSeconds).toBeDefined();
    expect(result.matrixRequests).toBe(12);
    expect(result.legRequests).toBe(0);
  });

  it('fetches legs for the final order when includeLegs is set', async () => {
    const optimizer = makeOptimizer();
    const result = await optimizer.optimize({
      stops: [POINTS[1]!, POINTS[2]!],
      origin: POINTS[0]!,
      destination: POINTS[3]!,
      includeLegs: true,
    });

    expect(result.legs).toHaveLength(3);
    expect(result.legRequests).toBe(3);
    expect(result.legs?.[0]?.durationSeconds).toBe(60);
  });

  it('rejects empty stop lists and roundTrip without origin', async () => {
    const optimizer = makeOptimizer();
    await expect(optimizer.optimize({ stops: [] })).rejects.toThrow(/at least one stop/);
    await expect(
      optimizer.optimize({ stops: [POINTS[1]!], roundTrip: true }),
    ).rejects.toThrow(/roundTrip requires a fixed origin/);
  });
});
