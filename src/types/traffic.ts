/** Area traffic report from GetAreaTraffic batchexecute RPC. */
export interface AreaTrafficReport {
  hasTraffic: boolean;
  severity?: number;
  summary?: string;
  detail?: string;
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
