/** Decoded Maps URL from DecodeUrl batchexecute RPC. */
export interface DecodedMapsUrl {
  name?: string;
  lat?: number;
  lng?: number;
  zoom?: number;
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
