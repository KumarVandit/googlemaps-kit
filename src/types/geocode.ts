/** Forward geocode request options (address → coordinates). */
export interface GeocodeOptions {
  /** Viewport center latitude — biases the search camera (default 0). */
  lat?: number;
  /** Viewport center longitude — biases the search camera (default 0). */
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
