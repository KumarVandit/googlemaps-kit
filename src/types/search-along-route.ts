import type { Coordinates, SearchResult, TravelMode } from './common.js';

export interface SearchAlongRouteOptions {
  origin: Coordinates | string;
  destination: Coordinates | string;
  /** What to search for near the route, e.g. `"coffee"`. */
  query: string;
  /** Travel mode used to fetch the route geometry (default `driving`). */
  mode?: TravelMode;
  /**
   * How many points to sample along the route for biased searches.
   * Default 5, clamped to 1–10. Each sample is one search request.
   */
  samples?: number;
  /** Per-sample search radius in metres (default 5_000). */
  radiusMeters?: number;
  /** Results per sample search (default 10). */
  limitPerSample?: number;
  /**
   * Drop hits farther than this straight-line distance from the route
   * polyline, in metres. Default: no filtering.
   */
  maxDetourMeters?: number;
  /** Parallel sample searches (default 4). */
  concurrency?: number;
  hl?: string;
  gl?: string;
}

export interface RouteSearchHit extends SearchResult {
  /** Straight-line distance in metres from this place to the nearest point on the route polyline. */
  detourMeters: number;
  /** Index of the route sample whose search found this hit. */
  sampleIndex: number;
}

export interface SearchAlongRouteResult {
  places: RouteSearchHit[];
  route: {
    distanceMeters?: number;
    durationSeconds?: number;
    summary?: string;
    /** Decoded route polyline used for sampling and detour maths. */
    path: Coordinates[];
    /** The sampled bias centers that were searched. */
    samples: Coordinates[];
  };
  /** HTTP requests issued: 1 directions + N searches (deduped hits across samples). */
  requestCount: number;
  timingMs: number;
}
