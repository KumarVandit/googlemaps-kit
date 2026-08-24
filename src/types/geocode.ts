

/** Forward geocode request options (address → coordinates). */
export interface GeocodeOptions {
/**
 * Viewport center latitude for the search camera bias.
 * Defaults to 0 (Null Island) — pass a lat near the target area for better
 * ranking of ambiguous addresses.
 */
  lat?: number;
/**
 * Viewport center longitude for the search camera bias. See {@link GeocodeOptions.lat}.
 */
  lng?: number;
  /** Map zoom used to derive viewport altitude when `viewportDist` is omitted. */
  zoom?: number;
  /** Viewport altitude (`!1d` in search pb). */
  viewportDist?: number;
  /** Search radius in metres passed as `!74i` (default 50_000). */
  maxRadius?: number;
  /** Max place rows to request via `!7i` (default 5). */
  resultsCount?: number;
  hl?: string;
  gl?: string;
  /** Include the raw protobuf-over-JSON payload. */
  raw?: boolean;
}

/** Reverse geocode request options (coordinates → address). */
export interface ReverseGeocodeOptions {
  /** Map zoom for the camera viewport (default 17). */
  zoom?: number;
  viewportDist?: number;
  maxRadius?: number;
  resultsCount?: number;
  hl?: string;
  gl?: string;
  raw?: boolean;
}

/** A single parsed address component from place row index `[2]`. */
export interface AddressComponent {
  /** Long-form component name, e.g. "New York", "United States". */
  longName: string;
  /**
   * Short-form component name, e.g. "NY", "US".
   * Not currently extracted by the geocode parser — reserved for future extraction.
   */
  shortName?: string;
  /**
   * Address component type tags, e.g. `["locality", "political"]`.
   * Not currently extracted — reserved for future extraction.
   */
  types?: string[];
  raw?: unknown;
}

/** Parsed geocode / reverse-geocode place row. */
export interface GeocodeResult {
  name: string;
  formattedAddress?: string;
  lat: number;
  lng: number;
  hexId?: string;
  placeId?: string;
  /** IANA timezone when present (reliable on forward geocode POI hits). */
  timezone?: string;
  /** Street / city / country lines from `[2]` — absent on pure coordinate reverse hits. */
  addressComponents?: AddressComponent[];
  /** Google Plus Code (compact) — payload at `[183][2][1][0]` on reverse hits; derived from coords on forward hits. */
  plusCode?: string;
  /** Human-readable Plus Code address — usually at `[183][2][2][0]` on reverse geocode. */
  plusCodeAddress?: string;
  /** Whether plusCode came from the response or was computed locally via Open Location Code. */
  plusCodeSource?: 'payload' | 'derived-olc';
  /** Primary category when the geocode hit is a POI (e.g. "Restaurant"). */
  category?: string;
  /** True when the result is a precise POI match vs. a street/area result. */
  isPoi?: boolean;
  raw?: unknown;
}

/** Forward or reverse geocode response with best match and alternates. */
export interface GeocodeResponse {
  result: GeocodeResult | null;
  alternatives: GeocodeResult[];
  raw?: unknown;
}

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
