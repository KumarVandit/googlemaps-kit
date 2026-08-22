/** Transit station departure board embedded in place preview placeData[62]. */

export interface TransitDeparture {
  headsign: string;
  /** Human-readable departure time, e.g. "2 min" or "10:32". */
  scheduledTime?: string;
  /** Unix timestamp in seconds (UTC). */
  scheduledUnix?: number;
  /** ISO 8601 formatted departure time derived from scheduledUnix when timezone is present. */
  scheduledAt?: string;
  /** Minutes until departure (derived from scheduledUnix and current time). */
  minutesUntil?: number;
  timezone?: string;
  platform?: string;
  tripId?: string;
  lineHexId?: string;
  lineName?: string;
  lineColor?: string;
  lineTextColor?: string;
  /**
   * Vehicle type string from the transit feed.
   * Known values: `"SUBWAY"`, `"BUS"`, `"TRAM"`, `"RAIL"`, `"FERRY"`, `"CABLE_CAR"`, `"GONDOLA"`.
   * May also be a display label like `"Tube"` or `"Metro"` depending on locale.
   */
  vehicleType?: string;
  vehicleIconUrl?: string;
  /** Short route identifier (e.g. "N1", "Jubilee") extracted from headsign or line name. */
  routeShortName?: string;
  raw?: unknown;
}

export interface TransitModeBoard {
  mode: string;
  /** Human-readable mode label (e.g. "Tube", "Bus") when present. */
  modeLabel?: string;
  departures: TransitDeparture[];
  raw?: unknown;
}

export interface TransitStationBoard {
  stationName?: string;
  hexId?: string;
  lat?: number;
  lng?: number;
  timezone?: string;
  modes: TransitModeBoard[];
  raw?: unknown;
}

export interface GetStationDeparturesOptions {
  hexId: string;
  name?: string;
  lat?: number;
  lng?: number;
  hl?: string;
  gl?: string;
  /** Place preview pb mode (default `rich` when coords present). */
  mode?: 'live' | 'detail' | 'rich';
}

export interface ListTransitLinesOptions {
  /** Transit line feature hex id (0x…:0x…). */
  lineHexId: string;
  /** Optional viewport centre for line geometry context. */
  lat?: number;
  lng?: number;
  psi?: string;
}

export interface TransitRouteOptions {
  origin: { lat: number; lng: number } | string;
  destination: { lat: number; lng: number } | string;
  departureTime?: Date;
  arrivalTime?: Date;
  preferences?: TransitPreference[];
  language?: string;
}

export type TransitPreference = 'avoidSurface' | 'preferRail' | 'fewerTransfers';

export interface TransitStation {
  name: string;
  code?: string;
  lat: number;
  lng: number;
}

export interface TransitLine {
  number?: string;
  color?: string;
  agency?: string;
}

export interface TransitLeg {
  mode: string;
  startStation: TransitStation;
  endStation: TransitStation;
  departureTime: Date;
  arrivalTime: Date;
  durationSeconds: number;
  line?: TransitLine;
  instructions?: string;
  stops?: TransitStation[];
}

export interface TransitRoute {
  legs: TransitLeg[];
  durationSeconds: number;
  arrivalTime?: Date;
  departureTime?: Date;
  transfers: number;
  summary?: string;
}

export interface TransitRouteResult {
  routes: TransitRoute[];
  timingMs: number;
}
