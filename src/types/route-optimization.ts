import type { Coordinates, TravelMode } from './common.js';

export interface OptimizeWaypointsOptions {
  /**
   * Fixed start point. Omit for an open tour that may begin at any stop.
   */
  origin?: Coordinates | string;
  /**
   * Fixed end point. Omit to end at the last visited stop.
   * With `roundTrip`, defaults to `origin`.
   */
  destination?: Coordinates | string;
  /** Stops to visit, in the caller's current (unoptimized) order. */
  stops: Array<Coordinates | string>;
  /** Travel mode for all legs (default `driving`). */
  mode?: TravelMode;
  /** Return to `origin` after the final stop (default false). */
  roundTrip?: boolean;
  /** Minimize total duration (default) or total distance. */
  metric?: 'duration' | 'distance';
  /**
   * Also fetch turn-by-turn legs for the optimized order via
   * `/maps/preview/directions` — one extra request per leg (default false).
   */
  includeLegs?: boolean;
  /** Max parallel matrix requests (default 8). */
  concurrency?: number;
  hl?: string;
  gl?: string;
}

export interface OptimizedLeg {
  from: Coordinates | string;
  to: Coordinates | string;
  durationSeconds?: number;
  distanceMeters?: number;
}

export interface OptimizeWaypointsResult {
  /** Stop indices in visiting order — a permutation of `[0, stops.length)`. */
  order: number[];
  /** The reordered stop list, ready to pass back as waypoints. */
  stops: Array<Coordinates | string>;
  totalDurationSeconds?: number;
  totalDistanceMeters?: number;
  /** Cost of the caller's original order, same metric, when computable. */
  baselineDurationSeconds?: number;
  baselineDistanceMeters?: number;
  /** Percentage improvement over the input order (positive = better). */
  improvementPercent?: number;
  /** Present when `includeLegs` is true. */
  legs?: OptimizedLeg[];
  /** Unique origin×destination pairs resolved in the matrix fan-out. */
  matrixRequests: number;
  /** Directions requests issued for legs (0 unless `includeLegs`). */
  legRequests: number;
  timingMs: number;
}
