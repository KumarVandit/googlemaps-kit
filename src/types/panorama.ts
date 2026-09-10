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
  /** Height above mean sea level in metres, as Google reports it for this pano. */
  elevationMeters?: number;
  /** Height above the WGS84 ellipsoid in metres (sea level plus the geoid offset). */
  ellipsoidalHeightMeters?: number;
  /** Every address line Google attaches, most specific first (street, then city). */
  addressLines?: string[];
  /** Imagery provenance, e.g. `GEO_PHOTO_REFERENCE`. */
  imagerySource?: string;
  /** Internal imagery key, e.g. `IMAGE_ALLEYCAT|{panoId}`. */
  imageKey?: string;
  /** Present only when requested with `includeDepth`. */
  depthMap?: PanoramaDepthMap;
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

/** Static Street View thumbnail fetch — maps to streetviewpixels /thumbnail. */
export interface PanoramaStaticImageOptions {
  panoId: string;
  width?: number;
  height?: number;
  pitch?: number;
  yaw?: number;
  hl?: string;
  gl?: string;
}

export interface PanoramaStaticImageResult {
  bytes: Uint8Array;
  contentType: string;
  width: number;
  height: number;
  panoId: string;
  url: string;
}

export type PanoramaStaticImageLocationOptions = Omit<
  PanoramaStaticImageOptions,
  'panoId'
> &
  Omit<PanoramaSearchOptions, 'lat' | 'lng'>;

/** Options for fetching full panorama metadata. */
export interface PanoramaGetOptions {
  hl?: string;
  gl?: string;
  /** Include the raw parsed protobuf tree in the result. */
  raw?: boolean;
  /**
   * Also request the panorama's depth raster (photometa section 18).
   *
   * Costs a second parse of the response as bytes, so it is opt-in.
   */
  includeDepth?: boolean;
}

/** Options for `getByLocation` — lat/lng are passed as method arguments. */
export type PanoramaLocationOptions = Omit<PanoramaSearchOptions, 'lat' | 'lng'> &
  PanoramaGetOptions;

/**
 * Per-pixel surface raster that ships alongside a panorama.
 *
 * A lossless WebP, 512x256, laid out equirectangularly over the same sphere as
 * the imagery: column 0 is the panorama's own heading origin, row 0 is
 * straight up. Pixels are greyscale and hold a small integer, not a distance —
 * Google quantises the scene into coplanar surfaces and stores each pixel's
 * surface index (sky, road, and each façade get their own). The plane
 * equations that would turn those indices into metres are not published on any
 * photometa section probed on 2026-08-23, so treat this as a depth
 * *segmentation*: it tells you which pixels share a surface and roughly how
 * far they are ordered, not how many metres away they sit.
 *
 * Node has no WebP decoder — pass `bytes` to sharp, canvas, or `dwebp`.
 */
export interface PanoramaDepthMap {
  format: 'webp';
  width: number;
  height: number;
  bytes: Uint8Array;
}

/** One zoom level of a panorama's equirectangular tile pyramid. */
export interface PanoramaTileLevel {
  /** Tile zoom level (0-based). */
  zoom: number;
  /** Tiles across (columns). */
  cols: number;
  /** Tiles down (rows). */
  rows: number;
  /** Full pano width in pixels at this level. */
  width: number;
  /** Full pano height in pixels at this level. */
  height: number;
}

/**
 * The complete equirectangular tile manifest for a panorama.
 *
 * Street View ships no video stream — the web client renders live by fetching
 * these tiles. Level dimensions come from photometa `tileSizes`; each URL
 * serves a JPEG without auth.
 */
export interface PanoramaTileGrid {
  panoId: string;
  /** Levels from lowest to highest resolution. */
  levels: PanoramaTileLevel[];
  /** Direct tile URL matrix per level: [row][col]. */
  urls: string[][][];
}
