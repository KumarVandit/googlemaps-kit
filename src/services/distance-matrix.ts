import type {
  Coordinates,
  DirectionsResult,
  GMapsConfig,
} from '../types/common.js';
import type {
  DistanceMatrixCell,
  DistanceMatrixElementStatus,
  DistanceMatrixOptions,
  DistanceMatrixResult,
} from '../types/directions.js';
import { DirectionsService } from './directions.js';
import { parseDistanceToMeters, parseDurationToSeconds } from '../utils/directions-metrics.js';
import { haversineMeters } from '../utils/geo.js';
import { pooled } from '../utils/async.js';

/** Match HttpClient default concurrency; no per-pair sleep — scheduler paces. */
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_REQUEST_DELAY_MS = 0;
const SAME_POINT_THRESHOLD_METERS = 1;

interface NormalizedLocation {
  key: string;
  origin: Coordinates | string;
}

function isCoordinates(value: Coordinates | string): value is Coordinates {
  return typeof value === 'object' && value != null && 'lat' in value && 'lng' in value;
}

function locationKey(value: Coordinates | string): string {
  if (isCoordinates(value)) {
    return `${value.lat.toFixed(6)},${value.lng.toFixed(6)}`;
  }
  return `s:${value.trim().toLowerCase()}`;
}

function normalizeLocations(values: Array<Coordinates | string>): NormalizedLocation[] {
  return values.map((origin) => ({ key: locationKey(origin), origin }));
}

function parseDirectionsCell(result: DirectionsResult): Pick<
  DistanceMatrixCell,
  'status' | 'distanceMeters' | 'durationSeconds' | 'distanceText' | 'durationText'
> {
  const distanceText = result.distance ?? result.legs[0]?.distance;
  const durationText = result.duration ?? result.legs[0]?.duration;
  const distanceMeters = parseDistanceToMeters(distanceText);
  const durationSeconds = parseDurationToSeconds(durationText);

  if (!distanceText && !durationText && result.legs.length === 0) {
    return { status: 'ZERO_RESULTS' };
  }

  return {
    status: 'OK',
    distanceMeters,
    durationSeconds,
    distanceText,
    durationText,
  };
}

export class DistanceMatrixService {
  private directions: DirectionsService;

  constructor(directions: DirectionsService, _config: GMapsConfig) {
    this.directions = directions;
  }

  /**
   * Compute an origins × destinations travel-time matrix.
   *
   * Consumer Maps has no native Distance Matrix RPC — this fans out over
   * `/maps/preview/directions` with `metricsOnly` (no HTML scrape). Defaults:
   * concurrency 8, no artificial per-pair delay. A 2×2 lands near one directions
   * RTT (~700 ms); larger matrices scale as ceil(N×M / concurrency) × ~RTT.
   */
  async getMatrix(options: DistanceMatrixOptions): Promise<DistanceMatrixResult> {
    const origins = normalizeLocations(options.origins);
    const destinations = normalizeLocations(options.destinations);
    const mode = options.mode ?? 'driving';
    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    const requestDelayMs = options.requestDelayMs ?? DEFAULT_REQUEST_DELAY_MS;
    const start = performance.now();

    if (origins.length === 0 || destinations.length === 0) {
      return {
        rows: [],
        requestCount: 0,
        implementation: 'directions-fan-out',
        timingMs: 0,
      };
    }

    type PairKey = `${string}:${string}:${string}`;
    const uniquePairs = new Map<
      PairKey,
      {
        originIndex: number;
        destinationIndex: number;
        origin: Coordinates | string;
        destination: Coordinates | string;
      }
    >();

    for (let oi = 0; oi < origins.length; oi++) {
      for (let di = 0; di < destinations.length; di++) {
        const origin = origins[oi]!;
        const destination = destinations[di]!;
        const pairKey = `${origin.key}:${destination.key}:${mode}` as PairKey;
        if (!uniquePairs.has(pairKey)) {
          uniquePairs.set(pairKey, {
            originIndex: oi,
            destinationIndex: di,
            origin: origin.origin,
            destination: destination.origin,
          });
        }
      }
    }

    const pairResults = new Map<PairKey, DistanceMatrixCell>();
    const pairList = [...uniquePairs.entries()];

    await pooled(pairList, concurrency, async ([pairKey, pair], index) => {
      if (requestDelayMs > 0 && index > 0) {
        await new Promise((r) => setTimeout(r, requestDelayMs));
      }

      if (
        isCoordinates(pair.origin) &&
        isCoordinates(pair.destination) &&
        haversineMeters(pair.origin.lat, pair.origin.lng, pair.destination.lat, pair.destination.lng) <
          SAME_POINT_THRESHOLD_METERS
      ) {
        pairResults.set(pairKey, {
          originIndex: pair.originIndex,
          destinationIndex: pair.destinationIndex,
          status: 'OK',
          distanceMeters: 0,
          durationSeconds: 0,
          distanceText: '0 m',
          durationText: '0 min',
        });
        return;
      }

      try {
        const directions = await this.directions.get({
          origin: pair.origin,
          destination: pair.destination,
          mode,
          metricsOnly: true,
        });
        pairResults.set(pairKey, {
          originIndex: pair.originIndex,
          destinationIndex: pair.destinationIndex,
          ...parseDirectionsCell(directions),
        });
      } catch (error) {
        pairResults.set(pairKey, {
          originIndex: pair.originIndex,
          destinationIndex: pair.destinationIndex,
          status: 'ERROR',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    const rows: DistanceMatrixCell[][] = origins.map((origin, originIndex) =>
      destinations.map((destination, destinationIndex) => {
        const pairKey = `${origin.key}:${destination.key}:${mode}` as PairKey;
        const cached = pairResults.get(pairKey);
        if (cached) {
          return { ...cached, originIndex, destinationIndex };
        }
        return {
          originIndex,
          destinationIndex,
          status: 'ERROR' as DistanceMatrixElementStatus,
          error: 'Missing cell result',
        };
      }),
    );

    return {
      rows,
      requestCount: pairList.length,
      implementation: 'directions-fan-out',
      timingMs: performance.now() - start,
    };
  }
}
