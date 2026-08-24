/** Decoded Maps URL from DecodeUrl batchexecute RPC. */
export interface DecodedMapsUrl {
  /**
   * Place name extracted from the decoded URL (e.g. "Kake Di Hatti").
   * Present only when the URL pointed to a place page.
   */
  name?: string;
  /** Viewport / place latitude from the decoded URL coordinates block. */
  lat?: number;
  /** Viewport / place longitude. */
  lng?: number;
  /** Map zoom level from the decoded URL. */
  zoom?: number;
  /**
   * Hex feature id (`0x…:0x…`) when present in the decoded URL payload.
   * Currently not extracted by the parser — reserved for future extraction.
   */
  hexId?: string;
  /**
   * ChIJ place id when present in the decoded URL payload.
   * Currently not extracted by the parser — reserved for future extraction.
   */
  placeId?: string;
  /**
   * Formatted address string when the decoded URL carries one.
   * Currently not extracted by the parser — reserved for future extraction.
   */
  address?: string;
  /**
   * URL type derived from the type code in the DecodeUrl response (`coordsBlock[1][0]`).
   * - `'place'` — place page URL (type code 2, confirmed from fixture)
   * - `'search'` — search results URL (type code 1, inferred)
   * - `'directions'` — directions URL (type code 3, inferred)
   * - `'viewport'` — bare viewport URL (type code 4, inferred)
   * `undefined` when the type code is absent or unrecognized.
   */
  type?: 'place' | 'search' | 'directions' | 'viewport';
  raw?: unknown;
}

export interface DecodeUrlOptions {
  url: string;
}

export interface CreateShortUrlOptions {
  url: string;
  /** Maps session psi — required for anonymous CreateShortUrl (from place page HTML). */
  psi?: string;
}

export interface CreateShortUrlResult {
  shortUrl?: string;
  raw?: unknown;
}
