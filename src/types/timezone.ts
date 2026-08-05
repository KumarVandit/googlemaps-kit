export interface TimezoneOptions {
  lat: number;
  lng: number;
  hl?: string;
  gl?: string;
  /**
   * `offline` (default) — `geo-tz` polygon lookup, ~1 ms, no HTTP.
   * `geocode` — Google place-row `[14][30]` via reverse/forward geocode.
   */
  source?: 'offline' | 'geocode';
}

export type TimezoneOffsetSource = 'google-geocode' | 'derived-intl';

export type TimezoneIdSource = 'geo-tz' | 'google-geocode';

export interface TimezoneResult {
  lat: number;
  lng: number;
  /** IANA timezone id, e.g. `Asia/Kolkata` / `America/New_York`. */
  timeZoneId?: string;
  status: 'OK' | 'NOT_FOUND' | 'ERROR';
  /**
   * UTC offset in minutes for the queried instant (default: now).
   * Derived via `Intl` when not present in Google's payload — see `offsetSource`.
   */
  rawOffsetMinutes?: number;
  /** DST offset in minutes (derived via `Intl`; Google payload does not expose this). */
  dstOffsetMinutes?: number;
  /** Total offset = raw + dst, in minutes east of UTC. */
  totalOffsetMinutes?: number;
  offsetSource?: TimezoneOffsetSource;
  /** Where the IANA id came from. */
  timezoneSource?: TimezoneIdSource;
  /** Whether DST is active at the queried instant (derived via `Intl`). */
  isDst?: boolean;
  error?: string;
}
