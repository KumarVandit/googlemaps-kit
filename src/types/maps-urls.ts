import type { Coordinates, TravelMode } from './common.js';

/** Maps URL map-action query parameter (`map_action=`). */
export type MapsUrlMapAction = 'map' | 'pano';

/** Optional map layer overlay for canonical URLs. */
export type MapsUrlLayer = 'none' | 'transit' | 'traffic' | 'bicycling';

/** Place page URL builder input. */
export interface BuildPlaceUrlOptions {
  name?: string;
  lat: number;
  lng: number;
  zoom?: number;
  hexId?: string;
  placeId?: string;
  featureId?: string;
}

/** Search results URL builder input. */
export interface BuildSearchUrlOptions {
  query: string;
  lat?: number;
  lng?: number;
  zoom?: number;
}

/** Directions URL builder input. */
export interface BuildDirectionsUrlOptions {
  origin: string;
  destination: string;
  mode?: TravelMode;
  waypoints?: string[];
  lat?: number;
  lng?: number;
  zoom?: number;
}

/** Street View share URL builder input. */
export interface BuildStreetViewUrlOptions {
  lat: number;
  lng: number;
  panoId?: string;
  heading?: number;
  pitch?: number;
  fov?: number;
}

/** Embed iframe URL builder input. */
export interface BuildEmbedUrlOptions {
  kind: 'place' | 'search' | 'directions' | 'view';
  /** Required for keyless pb embed of a place. */
  hexId?: string;
  name?: string;
  query?: string;
  origin?: string;
  destination?: string;
  waypoints?: string[];
  mode?: TravelMode;
  lat?: number;
  lng?: number;
  zoom?: number;
  hl?: string;
  gl?: string;
  width?: number;
  height?: number;
  /** Maps Embed API key — when set, uses `/maps/embed/v1/*` (key required). */
  apiKey?: string;
}

/** Viewport-only canonical URL. */
export interface BuildViewportUrlOptions {
  lat: number;
  lng: number;
  zoom?: number;
  mapAction?: MapsUrlMapAction;
  layer?: MapsUrlLayer;
}

/** Result of building an embed URL — distinguishes keyless vs key-required forms. */
export interface EmbedUrlResult {
  url: string;
  /** True when the URL uses `/maps/embed/v1/` and requires an API key. */
  keyRequired: boolean;
}

export type { Coordinates, TravelMode };
