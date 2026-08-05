/** Transit station departure board embedded in place preview placeData[62]. */

export interface TransitDeparture {
  headsign: string;
  scheduledTime?: string;
  scheduledUnix?: number;
  timezone?: string;
  platform?: string;
  tripId?: string;
  lineHexId?: string;
  lineName?: string;
  lineColor?: string;
  lineTextColor?: string;
  vehicleType?: string;
  vehicleIconUrl?: string;
}

export interface TransitModeBoard {
  mode: string;
  departures: TransitDeparture[];
}

export interface TransitStationBoard {
  stationName?: string;
  hexId?: string;
  lat?: number;
  lng?: number;
  timezone?: string;
  modes: TransitModeBoard[];
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
