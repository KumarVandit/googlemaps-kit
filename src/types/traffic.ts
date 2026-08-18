/** Area traffic report from GetAreaTraffic batchexecute RPC. */
import type { Coordinates } from './common.js';

export interface AreaTrafficReport {
  hasTraffic: boolean;
  /**
   * Traffic congestion severity level:
   * `0` = no traffic, `1` = light, `2` = moderate, `3` = heavy, `4` = severe.
   * Matches Google Maps internal traffic overlay codes.
   */
  severity?: 0 | 1 | 2 | 3 | 4;
  summary?: string;
  detail?: string;
  /**
   * Traffic incident icon URLs.
   * Reserved — returns an empty array in all currently observed responses.
   * Kept for forward compatibility if Google starts populating this slot.
   */
  iconUrls?: string[];
  raw?: unknown;
}

export interface GetAreaTrafficOptions {
  /** Southwest corner latitude. */
  swLat: number;
  /** Southwest corner longitude. */
  swLng: number;
  /** Northeast corner latitude. */
  neLat: number;
  /** Northeast corner longitude. */
  neLng: number;
  /** Override session psi token (scraped automatically when omitted). */
  psi?: string;
}

export type IncidentType = 'accident' | 'roadClosure' | 'roadWork' | 'congestion' | 'other';
export type IncidentSeverity = 'critical' | 'major' | 'moderate' | 'minor';

export interface TrafficIncident {
  /** Google's incident id. */
  id: string;
  type: IncidentType;
  /**
   * Derived from {@link TrafficIncident.delay}, not reported by Google:
   * `critical` ≥ 20 min, `major` ≥ 10, `moderate` ≥ 5, otherwise `minor`.
   */
  severity: IncidentSeverity;
  /**
   * Latitude of the first point of {@link TrafficIncident.path}.
   * Omitted when Google publishes no decodable path for the incident.
   */
  lat?: number;
  /** Longitude of the first path point. Omitted when there is no path. */
  lng?: number;
  /** Headline, e.g. `"Slowdown on E 42nd St"`. */
  title: string;
  /** Delay blurb, e.g. `"14-min delay"`. */
  description?: string;
  startTime?: Date;
  endTime?: Date;
  /** Road names the incident sits on. */
  affectedRoads?: string[];
  delay?: { estimatedMinutes: number; seconds: number; text?: string };
  /** Affected stretch of road, decoded from the response's delta-encoded points. */
  path?: Coordinates[];
  /** {@link TrafficIncident.path} as an encoded polyline. */
  polyline?: string;
  /** Incident icon served by maps.gstatic.com. */
  iconUrl?: string;
  source?: string;
}

export interface TrafficIncidentsOptions {
  neLat: number;
  neLng: number;
  swLat: number;
  swLng: number;
  psi?: string;
}
