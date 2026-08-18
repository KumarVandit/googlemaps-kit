/** Transit station departure board embedded in place preview placeData[62]. */
import type { Coordinates } from './common.js';
import type { TransitMode } from './directions.js';

/**
 * Raw vehicle label from the transit feed.
 * Known canonical values are suggested, but Google also emits locale display
 * labels ("Tube", "Metro"), so any string is assignable.
 */
export type TransitVehicleType =
  | 'SUBWAY'
  | 'BUS'
  | 'TRAM'
  | 'RAIL'
  | 'FERRY'
  | 'CABLE_CAR'
  | 'GONDOLA'
  | (string & {});

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
  vehicleType?: TransitVehicleType;
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
  origin: Coordinates | string;
  destination: Coordinates | string;
  /** Desired departure (local timezone of the origin). */
  departureTime?: Date;
  /** Desired arrival. Mutually exclusive with `departureTime`. */
  arrivalTime?: Date;
  preferences?: TransitPreference[];
  /** Restrict to these vehicle types. */
  modes?: TransitVehicleFilter[];
  language?: string;
}

/**
 * Vehicle types accepted by the transit filter.
 * Same value set as {@link TransitMode} — kept as an alias so both option
 * spellings (`RouteOptions.transitModes`, `TransitRouteOptions.modes`) stay valid.
 */
export type TransitVehicleFilter = TransitMode;

export type TransitPreference = 'avoidSurface' | 'preferRail' | 'fewerTransfers';

/** A point in space and time on a transit trip. */
export interface TransitStation {
  name: string;
  /** Feed stop id (GTFS stop code) when Google publishes one. */
  code?: string;
  lat: number;
  lng: number;
  /** Maps feature id (`0x…:0x…`) for the stop, when present. */
  hexId?: string;
  /** Scheduled departure from this stop. */
  departureTime?: Date;
  /** Scheduled arrival at this stop. */
  arrivalTime?: Date;
}

/** Operator running a transit leg. */
export interface TransitAgency {
  name: string;
  id?: string;
  url?: string;
  phone?: string;
}

export interface TransitLine {
  /** Short name riders use — `"176"`, `"A Line"`, `"Northern"`. */
  number?: string;
  /** Long display name when it differs from {@link number}. */
  name?: string;
  /** Line colour as `#rrggbb`. */
  color?: string;
  /** Contrasting text colour for {@link color}. */
  textColor?: string;
  agency?: string;
  /** Full operator record. */
  agencyDetails?: TransitAgency;
  /** Terminus shown on the vehicle, e.g. `"Far Rockaway-Mott Av"`. */
  headsign?: string;
  /** Vehicle label from the feed — `"Bus"`, `"Subway"`, `"Tram"`. */
  vehicleType?: TransitVehicleType;
  /** Line/vehicle icon served by maps.gstatic.com. */
  iconUrl?: string;
}

/** Service advisory attached to a route or leg. */
export interface TransitAlert {
  /** Short label, e.g. `"Modified schedule"`. */
  headline?: string;
  /** Severity label Google renders, e.g. `"Information"`. */
  severity?: string;
  /** Full advisory text. */
  description?: string;
}

/** Fare for a route or leg, as published by the operator. */
export interface TransitFare {
  /** Numeric amount in {@link currency}. */
  amount: number;
  /** Localised amount, e.g. `"£1.75"`. */
  text: string;
  /** ISO 4217 code. */
  currency: string;
}

export interface TransitLeg {
  /** `walking` for the connecting legs, `transit` when riding a vehicle. */
  mode: 'walking' | 'transit';
  /**
   * Boarding stop. Omitted when Google does not publish a station block
   * (common on walking legs) — never a placeholder.
   */
  startStation?: TransitStation;
  /** Alighting stop. Omitted when Google does not publish a station block. */
  endStation?: TransitStation;
  departureTime?: Date;
  arrivalTime?: Date;
  /** Leg duration in seconds. Omitted when the feed carries no duration node. */
  durationSeconds?: number;
  /** Human-readable duration, e.g. `"14 min"`. */
  durationText?: string;
  /** Distance in metres — present on walking legs. */
  distanceMeters?: number;
  distanceText?: string;
  line?: TransitLine;
  /** Turn-by-turn text for walking legs. */
  instructions?: string[];
  /** Stops between {@link startStation} and {@link endStation}. */
  stops?: TransitStation[];
  /** Number of stops ridden, as Google counts them. */
  stopCount?: number;
  /** Advisories scoped to this leg. */
  alerts?: TransitAlert[];
  fare?: TransitFare;
}

export interface TransitRoute {
  legs: TransitLeg[];
  /** Total trip duration in seconds. Omitted when the feed carries no duration node. */
  durationSeconds?: number;
  durationText?: string;
  distanceMeters?: number;
  distanceText?: string;
  arrivalTime?: Date;
  departureTime?: Date;
  /** IANA timezone the times are expressed in. */
  timezone?: string;
  /** Vehicle boardings on this route (walking legs excluded). */
  transfers: number;
  /** Service frequency blurb, e.g. `"every 10 min"`. */
  frequency?: string;
  /** Total walking time across the route. */
  walkingSeconds?: number;
  fare?: TransitFare;
  agencies?: TransitAgency[];
  alerts?: TransitAlert[];
  summary?: string;
}

export interface TransitRouteResult {
  routes: TransitRoute[];
  timingMs: number;
}
