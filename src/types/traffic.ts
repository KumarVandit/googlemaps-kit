/** Area traffic report from GetAreaTraffic batchexecute RPC. */
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
  id: string;
  type: IncidentType;
  severity: IncidentSeverity;
  lat: number;
  lng: number;
  title: string;
  description?: string;
  startTime?: Date;
  endTime?: Date;
  affectedRoads?: string[];
  delay?: { estimatedMinutes: number };
  polyline?: string;
  source?: string;
}

export interface TrafficIncidentsOptions {
  neLat: number;
  neLng: number;
  swLat: number;
  swLng: number;
  psi?: string;
}
