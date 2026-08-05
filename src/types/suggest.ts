/** Omnibox autocomplete request options. */
export interface SuggestOptions {
  /** Partial query text typed by the user. */
  query: string;
  /** Camera latitude — biases suggestions toward this viewport (default Bangalore). */
  lat?: number;
  /** Camera longitude — biases suggestions toward this viewport (default Bangalore). */
  lng?: number;
  /** Map zoom level; converted to viewport altitude when `altitude` is omitted. */
  zoom?: number;
  /** Viewport altitude (`!1d` in camera pb); overrides zoom-derived value. */
  altitude?: number;
  /** Screen width embedded in camera pb (default 1440). */
  screenWidth?: number;
  /** Screen height embedded in camera pb (default 757). */
  screenHeight?: number;
  /** BCP-47 language (overrides client config). */
  hl?: string;
  /** Country code (overrides client config). */
  gl?: string;
  /** Continuation token from a prior suggest response (`psi` query param). */
  sessionToken?: string;
  /** Include the raw parsed protobuf tree in the result. */
  raw?: boolean;
}

export type SuggestionKind = 'query' | 'place';

/** A single omnibox suggestion — either a query completion or a place hit. */
export interface Suggestion {
  kind: SuggestionKind;
  /** Best display text (full description or primary line). */
  text: string;
  /** Bold / main line shown in the omnibox dropdown. */
  primaryText?: string;
  /** Subtitle line (address, "See locations", etc.). */
  secondaryText?: string;
  /** Google Place ID when present (ChIJ… form). */
  placeId?: string;
  /** Hex feature id (0x…:0x… form). */
  hexId?: string;
  /** Knowledge Graph feature id (/m/… or /g/…). */
  featureId?: string;
  /** Thumbnail image URL when Google attaches one. */
  thumbnailUrl?: string;
  /** ISO 3166-1 alpha-2 country code when present. */
  countryCode?: string;
}

/** Parsed omnibox autocomplete response. */
export interface SuggestResult {
  /** Echoed query string from the response. */
  query: string;
  suggestions: Suggestion[];
  /** Opaque session token for follow-up requests (root index [7]). */
  sessionToken?: string;
  /** Raw parsed response tree when requested. */
  raw?: unknown;
}
