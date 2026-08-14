/**
 * Waypoint order optimization.
 *
 * Consumer Maps has no `optimize:true` equivalent, so this composes the
 * anonymous directions-fan-out distance matrix with a travelling-salesman
 * heuristic: nearest-neighbour construction followed by 2-opt improvement.
 * Fixed origin/destination are respected; open tours (no fixed ends) try
 * every stop as a starting point and keep the best tour after 2-opt.
 */

import { GeocodeService } from './geocode.js';
import { DirectionsService } from './directions.js';
import { DistanceMatrixService } from './distance-matrix.js';
import type { DistanceMatrixCell } from '../types/directions.js';
import { GMapsError } from '../types/common.js';
import type { Coordinates } from '../types/common.js';
import type {
  OptimizedLeg,
  OptimizeWaypointsOptions,
  OptimizeWaypointsResult,
} from '../types/route-optimization.js';

/** Upper bound on 2-opt improving passes to keep worst cases bounded. */
const MAX_TWO_OPT_PASSES = 64;

export class WaypointOptimizerService {
  private matrix: DistanceMatrixService;
  private directions: DirectionsService;
  private geocode: GeocodeService;

  constructor(
    matrix: DistanceMatrixService,
    directions: DirectionsService,
    geocode: GeocodeService,
  ) {
    this.matrix = matrix;
    this.directions = directions;
    this.geocode = geocode;
  }

  /**
   * Reorder `stops` into an efficient visiting order.
   *
   * Costs come from real driving durations/distances via the directions
   * fan-out matrix. With ~N stops the matrix costs N² unique pairs, so this
   * suits up to roughly a dozen stops; larger lists still work but take
   * proportionally longer.
   */
  async optimize(options: OptimizeWaypointsOptions): Promise<OptimizeWaypointsResult> {
    const start = performance.now();
    if (!Array.isArray(options.stops) || options.stops.length === 0) {
      throw new GMapsError('optimizeWaypoints requires at least one stop');
    }
    if (options.roundTrip && !options.origin) {
      throw new GMapsError('roundTrip requires a fixed origin to return to');
    }

    const mode = options.mode ?? 'driving';
    const useDistance = options.metric === 'distance';

    const [origin, destination, stops] = await Promise.all([
      options.origin ? this.resolve(options.origin) : Promise.resolve(undefined),
      options.destination
        ? this.resolve(options.destination)
        : options.roundTrip && options.origin
          ? this.resolve(options.origin)
          : Promise.resolve(undefined),
      Promise.all(options.stops.map((s) => this.resolve(s))),
    ]);

    const nodes: Array<Coordinates | string> = [];
    const originIndex = origin ? nodes.push(origin) - 1 : -1;
    const firstStopIndex = nodes.length;
    for (const s of stops) nodes.push(s);
    const destinationIndex = destination ? nodes.push(destination) - 1 : -1;

    const matrixResult = await this.matrix.getMatrix({
      origins: nodes,
      destinations: nodes,
      mode,
      concurrency: options.concurrency,
      hl: options.hl,
      gl: options.gl,
    });
    const cellAt = (from: number, to: number): DistanceMatrixCell | undefined =>
      matrixResult.rows[from]?.[to];

    const costOf = (from: number, to: number): number => {
      const cell = cellAt(from, to);
      if (!cell) return Number.POSITIVE_INFINITY;
      const value = useDistance ? cell.distanceMeters : cell.durationSeconds;
      return value ?? Number.POSITIVE_INFINITY;
    };

    const tourCost = (order: number[]): number => {
      const full = buildFullSequence(order, originIndex, destinationIndex);
      let cost = 0;
      for (let i = 0; i < full.length - 1; i++) {
        cost += costOf(full[i]!, full[i + 1]!);
      }
      return cost;
    };

    const inputOrder = stops.map((_, i) => firstStopIndex + i);

    const startCandidates: number[] =
      originIndex >= 0 ? [originIndex] : [...inputOrder];
    let bestOrder: number[] | null = null;
    let bestCost = Number.POSITIVE_INFINITY;

    for (const startNode of startCandidates) {
      const remaining = new Set<number>(inputOrder);
      const order: number[] = [];
      let current = startNode;
      if (remaining.has(current)) {
        order.push(current);
        remaining.delete(current);
      }
      while (remaining.size > 0) {
        let next: number | undefined;
        let nextCost = Number.POSITIVE_INFINITY;
        for (const candidate of remaining) {
          const c = costOf(current, candidate);
          if (c < nextCost) {
            nextCost = c;
            next = candidate;
          }
        }
        if (next === undefined) break;
        order.push(next);
        remaining.delete(next);
        current = next;
      }

      twoOptImprove(order, costOf, originIndex, destinationIndex);
      const improvedCost = tourCost(order);
      if (improvedCost < bestCost) {
        bestCost = improvedCost;
        bestOrder = [...order];
      }
    }

    const order = (bestOrder ?? inputOrder).map((n) => n - firstStopIndex);

    const result: OptimizeWaypointsResult = {
      order,
      stops: order.map((i) => stops[i]!),
      matrixRequests: matrixResult.requestCount,
      legRequests: 0,
      timingMs: performance.now() - start,
    };

    const totalFull = buildFullSequence(
      order.map((i) => firstStopIndex + i),
      originIndex,
      destinationIndex,
    );
    const totals = sumPath(totalFull, cellAt);
    if (totals.durationKnown) result.totalDurationSeconds = totals.duration;
    if (totals.distanceKnown) result.totalDistanceMeters = totals.distance;

    const baselineFull = buildFullSequence(inputOrder, originIndex, destinationIndex);
    const baselineTotals = sumPath(baselineFull, cellAt);
    if (baselineTotals.durationKnown) result.baselineDurationSeconds = baselineTotals.duration;
    if (baselineTotals.distanceKnown) result.baselineDistanceMeters = baselineTotals.distance;

    const base = useDistance ? result.totalDistanceMeters : result.totalDurationSeconds;
    const baseline = useDistance ? result.baselineDistanceMeters : result.baselineDurationSeconds;
    if (base !== undefined && baseline !== undefined && baseline > 0) {
      result.improvementPercent = Math.round(((baseline - base) / baseline) * 1000) / 10;
    }

    if (options.includeLegs) {
      const legs: OptimizedLeg[] = [];
      for (let i = 0; i < totalFull.length - 1; i++) {
        const from = nodes[totalFull[i]!]!;
        const to = nodes[totalFull[i + 1]!]!;
        const leg = await this.directions.get({ origin: from, destination: to, mode });
        result.legRequests += 1;
        legs.push({
          from,
          to,
          durationSeconds: leg.durationSeconds,
          distanceMeters: leg.distanceMeters,
        });
      }
      result.legs = legs;
    }

    return result;
  }

  /** Coordinates for any node, geocoding address strings once. */
  private async resolve(value: Coordinates | string): Promise<Coordinates | string> {
    if (typeof value !== 'string') return value;
    const response = await this.geocode.geocode(value);
    const hit = response.result ?? response.alternatives[0];
    if (!hit) {
      throw new GMapsError(`Could not resolve waypoint: ${value}`);
    }
    return { lat: hit.lat, lng: hit.lng };
  }
}

function buildFullSequence(
  stopNodes: number[],
  originIndex: number,
  destinationIndex: number,
): number[] {
  const full: number[] = [];
  if (originIndex >= 0) full.push(originIndex);
  full.push(...stopNodes);
  if (destinationIndex >= 0) full.push(destinationIndex);
  return full;
}

interface PathTotals {
  duration?: number;
  distance?: number;
  durationKnown: boolean;
  distanceKnown: boolean;
}

function sumPath(
  sequence: number[],
  cellAt: (from: number, to: number) => DistanceMatrixCell | undefined,
): PathTotals {
  let duration = 0;
  let distance = 0;
  let durationKnown = true;
  let distanceKnown = true;
  for (let i = 0; i < sequence.length - 1; i++) {
    const cell = cellAt(sequence[i]!, sequence[i + 1]!);
    if (!cell || cell.durationSeconds === undefined) durationKnown = false;
    else duration += cell.durationSeconds;
    if (!cell || cell.distanceMeters === undefined) distanceKnown = false;
    else distance += cell.distanceMeters;
  }
  return { duration, distance, durationKnown, distanceKnown };
}

/** In-place 2-opt on the stop-node subsequence; segment reversal keeps fixed endpoints. */
function twoOptImprove(
  order: number[],
  costOf: (from: number, to: number) => number,
  originIndex: number,
  destinationIndex: number,
): void {
  const full = buildFullSequence(order, originIndex, destinationIndex);
  // Only the origin is prepended; the destination trails behind the stops.
  const offset = originIndex >= 0 ? 1 : 0;

  for (let pass = 0; pass < MAX_TWO_OPT_PASSES; pass++) {
    let improved = false;

    for (let i = 0; i < order.length - 1; i++) {
      for (let k = i + 1; k < order.length; k++) {
        const beforeA = offset + i - 1 >= 0 ? full[offset + i - 1] ?? null : null;
        const afterB = offset + k + 1 < full.length ? full[offset + k + 1] ?? null : null;
        const edgeAFrom = beforeA !== null ? full[offset + i] : undefined;
        const edgeBTo = afterB !== null ? full[offset + k] : undefined;

        const removedEdgeA = beforeA !== null && edgeAFrom !== undefined ? costOf(beforeA, edgeAFrom) : 0;
        const removedEdgeB = afterB !== null && edgeBTo !== undefined ? costOf(edgeBTo, afterB) : 0;
        const addedEdgeA = beforeA !== null && edgeBTo !== undefined ? costOf(beforeA, edgeBTo) : 0;
        const addedEdgeB = afterB !== null && edgeAFrom !== undefined ? costOf(edgeAFrom, afterB) : 0;

        if (addedEdgeA + addedEdgeB < removedEdgeA + removedEdgeB) {
          reverseSegment(full, offset + i, offset + k);
          improved = true;
        }
      }
    }

    if (!improved) break;
  }

  for (let i = 0; i < order.length; i++) {
    order[i] = full[offset + i]!;
  }
}

function reverseSegment(arr: number[], from: number, to: number): void {
  while (from < to) {
    const tmp = arr[from]!;
    arr[from] = arr[to]!;
    arr[to] = tmp;
    from++;
    to--;
  }
}
