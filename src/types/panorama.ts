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
  heading?: number;
  pitch?: number;
  thumbnailUrl?: string;
}

/** Navigation edge to an adjacent panorama in the Street View graph. */
export interface PanoramaLink {
  panoId: string;
  lat?: number;
  lng?: number;
  heading?: number;
}

/** A historical capture date available for this panorama. */
export interface PanoramaHistoricalCapture {
  year: number;
  month: number;
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
  /** Per-zoom level tile dimensions (index = zoom). */
  tileSizes?: Array<[number, number]>;
  /** Maximum tile dimensions at highest zoom. */
  maxTileDimensions?: [number, number];
  /** Base tile face size in pixels. */
  tileFaceSize?: [number, number];
  links: PanoramaLink[];
  historicalCaptures?: PanoramaHistoricalCapture[];
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
