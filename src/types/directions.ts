import type { Coordinates, TravelMode } from './common.js';

export type DirectionsUnits = 'metric' | 'imperial';

/** Driving preference — not exposed until a working pb slot is confirmed live. */
export type DirectionsAvoid = 'tolls' | 'highways' | 'ferries';

export interface DirectionsWaypoint {
  location: Coordinates | string;
  /** When true, route passes through but does not stop (not yet verified on preview/directions). */
  via?: boolean;
}

export interface DirectionsOptions {
  /** Directions service spelling. Intent `route` uses `from` — both accepted. */
  origin?: Coordinates | string;
  destination?: Coordinates | string;
  /** Alias for `origin` (Intent spelling). */
  from?: Coordinates | string;
  /** Alias for `destination`. */
  to?: Coordinates | string;
  mode?: TravelMode;
  /** Intermediate stops — encoded as extra `!1m4!3m2!3d…!4d…!6e2` blocks (verified live). */
  waypoints?: DirectionsWaypoint[];
  /**
   * When true, scrape `/maps/dir/` HTML for turn-by-turn steps if the preview pb lacks them.
   * Default false — returns duration/distance from preview only (faster).
   */
  includeSteps?: boolean;
  /**
   * Return duration/distance only — skip step scrape (used by distance matrix / elevation).
   */
  metricsOnly?: boolean;
}

export type StepManeuver =
  | 'TURN'
  | 'STRAIGHT'
  | 'MERGE'
  | 'RAMP'
  | 'FORK'
  | 'ROUNDABOUT'
  | 'UTURN'
  | 'FERRY'
  | 'TRANSIT'
  | 'WALK'
  | 'UNKNOWN';

export interface DirectionsTransitDetails {
  line?: string;
  headsign?: string;
  agency?: string;
  vehicleType?: string;
  departureStop?: string;
  arrivalStop?: string;
  departureTime?: string;
  arrivalTime?: string;
  numStops?: number;
  fare?: string;
}

export interface DirectionsStep {
  /** Plain-text instruction, e.g. "Turn left onto 11th Cross Rd". */
  instruction?: string;
  distance?: string;
  duration?: string;
  /** Maneuver code from step markup or dir-tt CSS class. */
  maneuver?: string;
  /** Normalized turn hint parsed from dir-tt CSS when present. */
  turn?: string;
  /** Step length in metres, parsed from the markup's `meters` attribute. */
  meters?: number;
  /** Road names referenced by this step. */
  roads?: string[];
  /** Explicit lat/lng pairs from step holder `[7][1]` / `[7][2]`. */
  path?: Coordinates[];
  /** Standard encoded polyline derived from `path` when enough points exist. */
  polyline?: string;
  transit?: DirectionsTransitDetails;
}

export interface DirectionsLeg {
  distance?: string;
  duration?: string;
  summary?: string;
  steps?: DirectionsStep[];
}

export interface LatLngBounds {
  southwest: Coordinates;
  northeast: Coordinates;
}

/** One route alternative. Google usually returns two or three per request. */
export interface DirectionsRoute {
  distance?: string;
  duration?: string;
  /** Human label at route header `[0][1]`, e.g. "8th Main Rd". */
  summary?: string;
  /** Traffic-adjusted duration at route header `[0][10][0][1]` when distinct from free-flow. */
  durationInTraffic?: string;
  bounds?: LatLngBounds;
  legs: DirectionsLeg[];
  /** Encoded overview polyline stitched from per-step `[7][5][0]` segments when present. */
  polyline?: string;
  path?: Coordinates[];
  warnings?: string[];
}

export interface DirectionsResult {
  distance?: string;
  duration?: string;
  summary?: string;
  /** Traffic-adjusted duration for the primary route when present. */
  durationInTraffic?: string;
  bounds?: LatLngBounds;
  /** Legs of the primary (first) route. */
  legs: DirectionsLeg[];
  /** All route alternatives Google returned, primary first. */
  routes?: DirectionsRoute[];
  warnings?: string[];
  raw?: unknown;
}
