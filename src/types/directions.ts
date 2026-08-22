import type { Coordinates, TravelMode } from './common.js';

export type DirectionsUnits = 'metric' | 'imperial';

/** Driving preference — not exposed until a working pb slot is confirmed live. */
export type DirectionsAvoid = 'tolls' | 'highways' | 'ferries';

/**
 * Transit mode filter for `mode: 'transit'` routes.
 * Pass one or more to restrict results to those vehicle types.
 * Multiple values are ORed together (same as the Maps web client behaviour).
 */
export type TransitRoutingPreference = 'less_walking' | 'fewer_transfers';
export type TransitMode =
  | 'bus'
  | 'subway'
  | 'train'
  | 'tram'
  | 'rail';

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

  // ─── transit-specific options ──────────────────────────────────────────────

  /**
   * Desired departure time as a Unix timestamp (seconds). For transit routes.
   * When not set, Google uses the current time.
   */
  departureTime?: number;
  /**
   * Desired arrival time as a Unix timestamp (seconds). For transit routes.
   * Mutually exclusive with `departureTime`.
   */
  arrivalTime?: number;
  /**
   * Restrict transit routes to these vehicle types. Only effective when `mode: 'transit'`.
   * Multiple values are ORed together.
   */
  transitModes?: TransitMode[];
  /**
   * Preference for transit routing: minimize walking or minimize transfers.
   */
  transitRoutingPreference?: TransitRoutingPreference;
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

/** Full transit details extracted from a transit step. */
export interface DirectionsTransitDetails {
  /** Line identifier, e.g. "Bus 10" or "Jubilee line". */
  line?: string;
  /** Short route identifier, e.g. "N1" or "Jubilee". */
  routeShortName?: string;
  /** Destination shown on the vehicle, e.g. "towards Stratford". */
  headsign?: string;
  /** Operating agency name, e.g. "Transport for London". */
  agency?: string;
  /** Vehicle type: "BUS", "SUBWAY", "TRAIN", "TRAM", "RAIL", "FERRY", "CABLE_CAR". */
  vehicleType?: string;
  /** URL of the transit vehicle icon. */
  vehicleIconUrl?: string;
  /** Line background colour as a hex string, e.g. "#0098A4". */
  lineColor?: string;
  /** Line text colour as a hex string, e.g. "#FFFFFF". */
  lineTextColor?: string;
  /** Name of the stop where you board. */
  departureStop?: string;
  /** Name of the stop where you alight. */
  arrivalStop?: string;
  /** Human-readable departure time, e.g. "10:32". */
  departureTime?: string;
  /** Human-readable arrival time. */
  arrivalTime?: string;
  /** ISO 8601 departure timestamp derived from Unix time when available. */
  departureAt?: string;
  /** ISO 8601 arrival timestamp. */
  arrivalAt?: string;
  /** Number of stops on this segment. */
  numStops?: number;
  /** Fare string when present, e.g. "₹10" or "$2.50". */
  fare?: string;
}

export interface DirectionsStep {
  /** Plain-text instruction, e.g. "Turn left onto 11th Cross Rd". */
  instruction?: string;
  /** Human-readable distance, e.g. "148 ft" or "1.2 km". */
  distance?: string;
  /** Parsed distance in metres (always an integer when distance is present). */
  distanceMeters?: number;
  /** Human-readable duration, e.g. "2 min". */
  duration?: string;
  /** Parsed duration in seconds (integer). */
  durationSeconds?: number;
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
  /**
   * Standard encoded polyline derived from `path` when ≥2 points exist.
   * Pass to `decodePolyline()` or `polylineToPath()` for human-readable coordinates.
   */
  polyline?: string;
  /** Transit details — present only on transit steps. */
  transit?: DirectionsTransitDetails;
}

export interface DirectionsLeg {
  /** Human-readable distance, e.g. "2.7 miles". */
  distance?: string;
  /** Parsed distance in metres. */
  distanceMeters?: number;
  /** Human-readable duration, e.g. "9 min". */
  duration?: string;
  /** Parsed duration in seconds. */
  durationSeconds?: number;
  /** Primary road / route name for this leg. */
  summary?: string;
  steps?: DirectionsStep[];
}

export interface LatLngBounds {
  southwest: Coordinates;
  northeast: Coordinates;
  /** Human-readable bounding box, e.g. "SW(42.29°, -83.73°) → NE(42.30°, -83.71°)". */
  label?: string;
}

/** One route alternative. Google usually returns two or three per request. */
export interface DirectionsRoute {
  /** Human-readable distance, e.g. "2.7 miles". */
  distance?: string;
  /** Parsed distance in metres. */
  distanceMeters?: number;
  /** Human-readable free-flow duration, e.g. "9 min". */
  duration?: string;
  /** Parsed free-flow duration in seconds. */
  durationSeconds?: number;
  /** Human label at route header `[0][1]`, e.g. "8th Main Rd". */
  summary?: string;
  /** Traffic-adjusted duration at route header `[0][10][0][1]` when distinct from free-flow. */
  durationInTraffic?: string;
  /** Parsed traffic-adjusted duration in seconds. */
  durationInTrafficSeconds?: number;
  bounds?: LatLngBounds;
  legs: DirectionsLeg[];
  /**
   * Encoded overview polyline stitched from per-step path points.
   * Pass to `decodePolyline()` for a lat/lng array, or `polylineToGeoJSON()` for a GeoJSON LineString.
   */
  polyline?: string;
  /**
   * Decoded lat/lng path — ready to use without calling decodePolyline.
   * Same data as polyline, just already expanded.
   */
  path?: Coordinates[];
  /**
   * Simplified human-readable path: array of "lat, lng" strings for logging / display.
   * Rounded to 5 decimal places.
   */
  humanPath?: string[];
  warnings?: string[];
}

export interface DirectionsResult {
  /** Human-readable distance of the primary route, e.g. "2.7 miles". */
  distance?: string;
  /** Parsed distance in metres for the primary route. */
  distanceMeters?: number;
  /** Human-readable free-flow duration of the primary route, e.g. "9 min". */
  duration?: string;
  /** Parsed free-flow duration in seconds for the primary route. */
  durationSeconds?: number;
  /** Primary route label, e.g. "via Pontiac Trail". */
  summary?: string;
  /** Traffic-adjusted duration for the primary route when present. */
  durationInTraffic?: string;
  /** Parsed traffic duration in seconds. */
  durationInTrafficSeconds?: number;
  bounds?: LatLngBounds;
  /** Legs of the primary (first) route. */
  legs: DirectionsLeg[];
  /** All route alternatives Google returned, primary first. */
  routes?: DirectionsRoute[];
  warnings?: string[];
  /**
   * Overview polyline for the primary route.
   * Pass to `decodePolyline()` / `polylineToGeoJSON()`.
   */
  polyline?: string;
  /**
   * Decoded lat/lng path for the primary route — ready to use.
   */
  path?: Coordinates[];
  raw?: unknown;
}
