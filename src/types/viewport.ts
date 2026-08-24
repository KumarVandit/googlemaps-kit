/** Viewport-surface types: passive-assist chips, neighbourhood context, click reveal. */

export interface PassiveAssistChip {
  name: string;
  cacheKey?: string;
  token?: string;
  weatherIconUrl?: string;
  weatherLabel?: string;
  weatherTemp?: string;
  /** Latitude of the associated place when present in the chip payload. */
  lat?: number;
  /** Longitude of the associated place when present in the chip payload. */
  lng?: number;
  /** Hex feature id of the associated place when present. */
  hexId?: string;
  /** ChIJ place id when present. */
  placeId?: string;
  raw?: unknown;
}

/** What a psi provider returns; `url` lets a provider hand back the verbatim captured request. */
export interface MintedViewportPsi {
  psi: string;
  passiveAssistUrl?: string;
}

export interface PassiveAssistPsiContext {
  lat: number;
  lng: number;
  zoom?: number;
  hl: string;
  gl: string;
}

export interface PassiveAssistOptions {
  lat: number;
  lng: number;
  /** Viewport zoom used to derive camera altitude (default 14). */
  zoom?: number;
  /**
   * In-page viewport psi. REQUIRED unless `psiProvider` is supplied: bootstrap
   * kEI / fetchSessionPsi tokens only ever return the cache-metadata stub.
   */
  psi?: string;
  /**
   * Supplies an in-page psi on demand. Only a live Maps viewport session produces
   * a usable token, so obtaining one needs a browser — this SDK deliberately will
   * not launch one for you. Use `mintViewportPsi` from `scripts/lib/mint-viewport-psi.ts`
   * to build a provider when a browser is acceptable in your environment.
   */
  psiProvider?: (context: PassiveAssistPsiContext) => Promise<string | MintedViewportPsi>;
  width?: number;
  height?: number;
  /** Chip density hint (default 50). Browser also requests a 20-chip variant. */
  chipLimit?: number;
  hl?: string;
  gl?: string;
}

export interface PassiveAssistResult {
  chips: PassiveAssistChip[];
  /** True when the response is the ~212 B cache-metadata stub with no POI rows. */
  isStub: boolean;
  raw?: unknown;
}

export type AreaType = 'city' | 'district' | 'neighborhood' | 'park' | 'water' | 'region';
export type AdminLevel = 'country' | 'state' | 'county' | 'city' | 'neighborhood';

export interface NearbyAreasOptions {
  location: { lat: number; lng: number };
  radiusMeters?: number;
  types?: AreaType[];
}

export interface GeoArea {
  id: string;
  name: string;
  type: AreaType;
  lat: number;
  lng: number;
  distanceMeters: number;
  bounds?: { ne: { lat: number; lng: number }; sw: { lat: number; lng: number } };
  population?: number;
}

export interface AdminRegion {
  name: string;
  type: AdminLevel;
  code?: string;
  /**
   * Region extent, when the source surface reports one.
   *
   * Reverse geocode names the administrative hierarchy but does not carry
   * polygons, so this is usually absent.
   */
  bounds?: { ne: { lat: number; lng: number }; sw: { lat: number; lng: number } };
  parent?: AdminRegion;
}

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
  raw?: unknown;
}

export interface RevealPlaceResult {
  place?: RevealedPlace;
  /** Raw address line pair when present at response root. */
  addressLines?: string[];
  raw?: unknown;
}
