/** Options for GET /maps/preview/reveal (hidden POI at map click). */
export interface RevealPlaceOptions {
  /** Map viewport center latitude. */
  camLat: number;
  /** Map viewport center longitude. */
  camLng: number;
  /** Map zoom level used to derive camera altitude (default 14). */
  camZoom?: number;
  /** Click / hit-test latitude. */
  hitLat: number;
  /** Click / hit-test longitude. */
  hitLng: number;
  /**
   * Feature id at the hit location (`!4m2!1s{ftid}!7e81`).
   * From search/suggest `featureId` or place preview; omit to try hex-only flows.
   */
  ftid?: string;
  /** Viewport width in pixels (default 1440). */
  width?: number;
  /** Viewport height in pixels (default 900). */
  height?: number;
  /** Tile pixel X for the hit (default 96). */
  tileX?: number;
  /** Tile pixel Y for the hit (default 64). */
  tileY?: number;
}

/** POI revealed at a map click — often hidden from default map tiles. */
export interface RevealedPlace {
  name?: string;
  formattedAddress?: string;
  hexId?: string;
  placeId?: string;
  featureId?: string;
  lat?: number;
  lng?: number;
  timezone?: string;
  categoryHint?: string;
  streetViewThumbnailUrl?: string;
  plusCode?: string;
}

export interface RevealPlaceResult {
  place?: RevealedPlace;
  /** Raw address line pair when present at response root. */
  addressLines?: string[];
}
