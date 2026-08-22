import type { Coordinates, TravelMode } from './common.js';

export type ElevationStatus = 'OK' | 'UNAVAILABLE' | 'ERROR';

export interface ElevationPointOptions {
  lat: number;
  lng: number;
  hl?: string;
  gl?: string;
}

export interface ElevationPointResult {
  lat: number;
  lng: number;
  status: ElevationStatus;
  /** Meters above WGS84 ellipsoid when available. */
  elevationMeters?: number;
  /** How elevation was obtained. */
  source?: 'directions-bicycling-start' | 'directions-profile';
  error?: string;
  timingMs?: number;
}

export interface ElevationPathOptions {
  /** At least two points defining the path. */
  points: Coordinates[];
  /** Travel mode for directions lookup (default `bicycling` — most reliable elevation block). */
  mode?: Extract<TravelMode, 'bicycling' | 'walking'>;
  hl?: string;
  gl?: string;
  /** Include raw directions payload in the result. */
  raw?: boolean;
}

export interface ElevationSummary {
  minElevationMeters: number;
  maxElevationMeters: number;
  startElevationMeters: number;
  endElevationMeters: number;
  gainMeters: number;
  lossMeters: number;
  /** Formatted strings from Google payload when present. */
  minElevationText?: string;
  maxElevationText?: string;
}

export interface ElevationProfileSample {
  /** Cumulative distance along the route in meters (delta-decoded from directions payload). */
  distanceMeters: number;
  /**
   * Elevation in meters above sea level at this sample.
   * Currently `undefined` — the directions elevation block encodes only the
   * summary (min/max/start/end) and grade per sample, not per-sample absolute elevation.
   * Reserved for a future payload that provides it.
   */
  elevationMeters?: number;
  /** Grade at this sample in percent when present. */
  gradePercent?: number;
}

export interface ElevationPathResult {
  status: ElevationStatus;
  summary?: ElevationSummary;
  /** Cumulative-distance samples with grade; elevation stats are in `summary`. */
  profile?: ElevationProfileSample[];
  /** Total route distance in meters from decoded profile distances. */
  pathDistanceMeters?: number;
  /**
   * Elevation at the start of the route in meters — same as `summary.startElevationMeters`.
   * Provided as a convenience field directly on the result for quick access.
   */
  startElevationMeters?: number;
  mode: Extract<TravelMode, 'bicycling' | 'walking'>;
  error?: string;
  raw?: unknown;
  timingMs?: number;
}
