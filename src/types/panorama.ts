/** Street View panorama search near a lat/lng point. */
export interface PanoramaSearchOptions {
  lat: number;
  lng: number;
  /** Search radius in metres (default 300). */
  radiusMeters?: number;
  /** BCP-47 language (overrides client config). */
  hl?: string;
  /** Country code (overrides client config). */
  gl?: string;
}

/** Lightweight panorama reference from a nearby search. */
export interface PanoramaRef {
  panoId: string;
  lat?: number;
  lng?: number;
  /** Default compass heading in degrees (0–360). */
  heading?: number;
  /** Default pitch in degrees (−90 to +90). */
  pitch?: number;
  thumbnailUrl?: string;
  raw?: unknown;
}

/** Navigation edge to an adjacent panorama in the Street View graph. */
export interface PanoramaLink {
  panoId: string;
  lat?: number;
  lng?: number;
  /** Compass heading towards this neighbour (degrees, 0–360). */
  heading?: number;
  /** Human-readable bearing label, e.g. "N", "NE", "SE". */
  bearingLabel?: string;
  raw?: unknown;
}

/** A historical capture date available for this panorama. */
export interface PanoramaHistoricalCapture {
  year: number;
  month: number;
  /** Formatted as "YYYY-MM". */
  label: string;
  raw?: unknown;
}

/** Full photometa payload for a single panorama. */
export interface PanoramaMetadata {
  panoId: string;
  lat?: number;
  lng?: number;
  /** Primary capture date as YYYY-MM. */
  captureDate?: string;
  copyright?: string;
  attribution?: string;
  address?: string;
  /**
   * Default compass heading (0–360°) for this panorama.
   * Present on most outdoor panoramas; absent on indoor tours.
   */
  heading?: number;
  /**
   * Default pitch (−90 to +90°) for this panorama.
   * Typically 0 for street-level captures.
   */
  pitch?: number;
  /**
   * Roll angle in degrees (usually 0 for upright captures).
   */
  roll?: number;
  /** Per-zoom level tile dimensions (index = zoom). */
  tileSizes?: Array<[number, number]>;
  /** Maximum tile dimensions at highest zoom. */
  maxTileDimensions?: [number, number];
  /** Base tile face size in pixels. */
  tileFaceSize?: [number, number];
  /**
   * Total number of tile zoom levels available.
   * Derived from `tileSizes.length`.
   */
  tileZoomLevels?: number;
  links: PanoramaLink[];
  historicalCaptures?: PanoramaHistoricalCapture[];
  /**
   * Ready-made embed URL for this panorama (no API key required).
   * Renders in an `<iframe>` at the exact heading/pitch captured.
   */
  embedUrl?: string;
  /**
   * Direct Google Maps Street View URL — opens in a browser tab.
   */
  streetViewUrl?: string;
  /** Raw parsed response tree when requested. */
  raw?: unknown;
}

/** Options for building Street View imagery URLs (no HTTP fetch). */
export interface PanoramaImageOptions {
  panoId: string;
  width?: number;
  height?: number;
  pitch?: number;
  yaw?: number;
  x?: number;
  y?: number;
  zoom?: number;
}

/** Options for fetching full panorama metadata. */
export interface PanoramaGetOptions {
  hl?: string;
  gl?: string;
  /** Include the raw parsed protobuf tree in the result. */
  raw?: boolean;
}

/** Options for `getByLocation` — lat/lng are passed as method arguments. */
export type PanoramaLocationOptions = Omit<PanoramaSearchOptions, 'lat' | 'lng'> &
  PanoramaGetOptions;
