import type { Coordinates, TravelMode } from './common.js';

export type DistanceMatrixElementStatus = 'OK' | 'ZERO_RESULTS' | 'NOT_FOUND' | 'ERROR';

export interface DistanceMatrixLocation extends Coordinates {
  /** Optional label echoed back in results. */
  label?: string;
}

export interface DistanceMatrixOptions {
  origins: Array<Coordinates | string>;
  destinations: Array<Coordinates | string>;
  mode?: TravelMode;
  /** Max parallel directions requests (default 8). */
  concurrency?: number;
  /** Extra delay between pair starts (default 0 — HttpClient scheduler paces). */
  requestDelayMs?: number;
  hl?: string;
  gl?: string;
}

export interface DistanceMatrixCell {
  originIndex: number;
  destinationIndex: number;
  status: DistanceMatrixElementStatus;
  distanceMeters?: number;
  durationSeconds?: number;
  /** Human-readable distance from directions, when parsed. */
  distanceText?: string;
  /** Human-readable duration from directions, when parsed. */
  durationText?: string;
  error?: string;
}

export interface DistanceMatrixResult {
  /** origins × destinations matrix in row-major order. */
  rows: DistanceMatrixCell[][];
  /** Total unique directions HTTP requests made (after deduplication). */
  requestCount: number;
  /** Implementation note: fan-out over `/maps/preview/directions`, not a batch matrix RPC. */
  implementation: 'directions-fan-out';
  /** Wall time for the whole matrix. */
  timingMs?: number;
}
