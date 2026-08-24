/**
 * Search along a route.
 *
 * Consumer Maps has no corridor-search RPC. This composes two anonymous
 * surfaces: `/maps/preview/directions` for the route polyline, then N
 * `tbm=map` searches biased to evenly-spaced sample points on that polyline.
 * Hits are deduplicated across samples and ranked by straight-line distance
 * from the route geometry.
 */

import { GeocodeService } from './geocode.js';
import { DirectionsService } from './directions.js';
import type { SearchService } from './search.js';
import { decodePolyline } from '../utils/encoded-polyline.js';
import { haversineMeters } from '../utils/geo.js';
import { pooledMap } from '../utils/async.js';
import { GMapsError } from '../types/common.js';
import type { Coordinates } from '../types/common.js';
import type {
  RouteSearchHit,
  SearchAlongRouteOptions,
  SearchAlongRouteResult,
} from '../types/search-along-route.js';

const DEFAULT_SAMPLES = 5;
const MAX_SAMPLES = 10;
const DEFAULT_RADIUS = 5_000;
const DEFAULT_LIMIT = 10;
const DEFAULT_CONCURRENCY = 4;

/** Shortest distance from a point to a segment in local equirectangular metres. */
function pointToSegmentMeters(
  p: Coordinates,
  a: Coordinates,
  b: Coordinates,
): number {
  const latRef = (p.lat + a.lat + b.lat) / 3;
  const scale = Math.cos((latRef * Math.PI) / 180);
  const ax = a.lng * scale;
  const ay = a.lat;
  const bx = b.lng * scale;
  const by = b.lat;
  const px = p.lng * scale;
  const py = p.lat;

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return haversineMeters(p.lat, p.lng, a.lat, a.lng);
  }

  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  // Convert the planar delta back to approximate metres via haversine.
  return haversineMeters(py, px / scale, cy, cx / scale);
}

function detourToPath(point: Coordinates, path: Coordinates[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < path.length - 1; i++) {
    const d = pointToSegmentMeters(point, path[i]!, path[i + 1]!);
    if (d < best) best = d;
    if (best === 0) break;
  }
  if (path.length === 1) {
    best = haversineMeters(point.lat, point.lng, path[0]!.lat, path[0]!.lng);
  }
  return best;
}

/** Evenly spaced fractional points along the cumulative-distance axis of the path. */
export function sampleRoutePath(path: Coordinates[], count: number): Coordinates[] {
  if (path.length === 0) return [];
  if (count <= 1 || path.length === 1) return [path[Math.floor(path.length / 2)]!];

  const segmentLengths: number[] = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const d = haversineMeters(path[i]!.lat, path[i]!.lng, path[i + 1]!.lat, path[i + 1]!.lng);
    segmentLengths.push(d);
    total += d;
  }

  const samples: Coordinates[] = [];
  for (let s = 0; s < count; s++) {
    const target = (total * s) / (count - 1 || 1);
    let walked = 0;
    for (let i = 0; i < segmentLengths.length; i++) {
      const seg = segmentLengths[i]!;
      if (walked + seg >= target || i === segmentLengths.length - 1) {
        const frac = seg > 0 ? (target - walked) / seg : 0;
        const clamped = Math.max(0, Math.min(1, frac));
        samples.push({
          lat: path[i]!.lat + (path[i + 1]!.lat - path[i]!.lat) * clamped,
          lng: path[i]!.lng + (path[i + 1]!.lng - path[i]!.lng) * clamped,
        });
        break;
      }
      walked += seg;
    }
  }
  return samples;
}

export class SearchAlongRouteService {
  private search: SearchService;
  private directions: DirectionsService;
  private geocode: GeocodeService;

  constructor(search: SearchService, directions: DirectionsService, geocode: GeocodeService) {
    this.search = search;
    this.directions = directions;
    this.geocode = geocode;
  }

  /**
   * Find places matching `query` near the route between origin and destination.
   *
   * One directions request yields the route path; each sample point then runs
   * one biased text search. Results are deduplicated by place id across
   * samples and sorted by route-detour distance (nearest first).
   */
  async find(options: SearchAlongRouteOptions): Promise<SearchAlongRouteResult> {
    const start = performance.now();
    const sampleCount = clamp(options.samples ?? DEFAULT_SAMPLES, 1, MAX_SAMPLES);
    const radiusMeters = options.radiusMeters ?? DEFAULT_RADIUS;
    const limitPerSample = options.limitPerSample ?? DEFAULT_LIMIT;
    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

    const [origin, destination] = await Promise.all([
      this.resolve(options.origin),
      this.resolve(options.destination),
    ]);

    const directionsResult = await this.directions.get({
      origin,
      destination,
      mode: options.mode ?? 'driving',
    });

    let path = directionsResult.path ?? [];
    if (path.length < 2 && directionsResult.polyline) {
      try {
        path = decodePolyline(directionsResult.polyline);
      } catch {
        path = [];
      }
    }
    if (path.length < 2) {
      throw new GMapsError(
        'Directions returned no usable route path — cannot run a corridor search.',
      );
    }

    const samples = sampleRoutePath(path, sampleCount);

    let requestCount = 1;
    const perSample = await pooledMap(samples, concurrency, async (sample, sampleIndex) => {
      const result = await this.search.searchText({
        query: options.query,
        location: sample,
        near: sample,
        radiusMeters,
        limit: limitPerSample,
        zoom: 15,
      });
      requestCount += 1;
      return { sampleIndex, places: result.places };
    });

    const byKey = new Map<string, RouteSearchHit>();
    for (const batch of perSample) {
      for (const place of batch.places) {
        const key =
          place.hexId ??
          place.placeId ??
          place.cid ??
          `${place.name}@${place.lat ?? 'x'},${place.lng ?? 'y'}`;
        const detour = detourToPath({ lat: place.lat!, lng: place.lng! }, path);

        const existing = byKey.get(key);
        if (existing) {
          existing.detourMeters = Math.min(existing.detourMeters, detour);
          existing.sampleIndex = Math.min(existing.sampleIndex, batch.sampleIndex);
          continue;
        }

        byKey.set(key, {
          ...place,
          detourMeters: detour,
          sampleIndex: batch.sampleIndex,
        });
      }
    }

    let places = [...byKey.values()];
    if (options.maxDetourMeters !== undefined) {
      places = places.filter((hit) => hit.detourMeters <= options.maxDetourMeters!);
    }
    places.sort((a, b) => a.detourMeters - b.detourMeters);

    return {
      places,
      route: {
        distanceMeters: directionsResult.distanceMeters,
        durationSeconds: directionsResult.durationSeconds,
        summary: directionsResult.summary,
        path,
        samples,
      },
      requestCount,
      timingMs: performance.now() - start,
    };
  }

  /** Coordinates for an endpoint, geocoding address strings once. */
  private async resolve(value: Coordinates | string): Promise<Coordinates | string> {
    if (typeof value !== 'string') return value;
    const response = await this.geocode.geocode(value);
    const hit = response.result ?? response.alternatives[0];
    if (!hit) {
      throw new GMapsError(`Could not resolve route endpoint: ${value}`);
    }
    return { lat: hit.lat, lng: hit.lng };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
