import type { Coordinates } from './common.js';

/** Marker overlay style for static map composition. */
export type StaticMapMarkerStyle = 'pin' | 'circle';

/** A marker drawn on top of the stitched basemap. */
export interface StaticMapMarker {
  lat: number;
  lng: number;
  style?: StaticMapMarkerStyle;
  /** RGBA colour components 0–255 (default pin red). */
  color?: [number, number, number, number];
  /** Radius in output pixels for circle style (default 6). */
  radius?: number;
}

/** Polyline path overlay. */
export interface StaticMapPath {
  points: Coordinates[];
  /** Stroke colour RGBA (default Google-blue). */
  color?: [number, number, number, number];
  /** Stroke width in output pixels (default 3). */
  width?: number;
}

/** Retina scale factor — doubles output pixel dimensions (zoom + 1 internally). */
export type StaticMapScale = 1 | 2;

/** Centre-based static map request. */
export interface StaticMapOptions {
  lat: number;
  lng: number;
  zoom: number;
  width: number;
  height: number;
  markers?: StaticMapMarker[];
  path?: StaticMapPath;
  scale?: StaticMapScale;
  /** Max concurrent tile fetches (default 3). */
  concurrency?: number;
  /** Delay between tile requests in ms (default 500). */
  fetchDelayMs?: number;
}

/** Bounding-box static map request — zoom is computed to fit. */
export interface StaticMapBoundsOptions {
  sw: Coordinates;
  ne: Coordinates;
  width: number;
  height: number;
  markers?: StaticMapMarker[];
  path?: StaticMapPath;
  scale?: StaticMapScale;
  concurrency?: number;
  fetchDelayMs?: number;
}

/** Composed static map PNG result. */
export interface StaticMapResult {
  bytes: Uint8Array;
  width: number;
  height: number;
  zoom: number;
  /** Centre lat/lng of the rendered viewport. */
  center: Coordinates;
  tilesFetched: number;
}
