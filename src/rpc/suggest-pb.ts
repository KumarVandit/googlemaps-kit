/**
 * Protobuf URL builders for Maps omnibox autocomplete (`/s?suggest=p`).
 *
 * The endpoint rejects requests without a camera viewport pb (HTTP 500).
 */

import { altitudeFromZoom } from '../utils/geo.js';

const SUGGEST_BASE =
  'https://www.google.com/s?tbm=map&gs_ri=maps&suggest=p&authuser=0';

/** Default Bangalore viewport used during reverse-engineering. */
export const DEFAULT_SUGGEST_LAT = 12.9168;
export const DEFAULT_SUGGEST_LNG = 77.645;

/**
 * Build the camera viewport pb that scopes autocomplete to a map area.
 *
 * Format verified by ablation: only `q` and this `pb` are required on the endpoint.
 */
export function buildSuggestCameraPb(params: {
  lat: number;
  lng: number;
  altitude: number;
  screenWidth: number;
  screenHeight: number;
}): string {
  return (
    `!4m12!1m3!1d${params.altitude}!2d${params.lng}!3d${params.lat}` +
    `!2m3!1f0!2f0!3f0!3m2!1i${params.screenWidth}!2i${params.screenHeight}!4f13.1`
  );
}

/** Assemble the full suggest URL with query, locale, and camera pb. */
export function buildSuggestUrl(params: {
  query: string;
  lat: number;
  lng: number;
  altitude?: number;
  zoom?: number;
  screenWidth?: number;
  screenHeight?: number;
  hl: string;
  gl: string;
  sessionToken?: string;
}): string {
  const lat = params.lat;
  const lng = params.lng;
  const altitude =
    params.altitude ??
    (params.zoom != null ? altitudeFromZoom(params.zoom, lat) : 10_000);
  const screenWidth = params.screenWidth ?? 1440;
  const screenHeight = params.screenHeight ?? 757;

  const pb = buildSuggestCameraPb({
    lat,
    lng,
    altitude,
    screenWidth,
    screenHeight,
  });

  const q = encodeURIComponent(params.query);
  let url = `${SUGGEST_BASE}&hl=${params.hl}&gl=${params.gl}&q=${q}&pb=${encodeURIComponent(pb)}`;

  if (params.sessionToken) {
    url += `&psi=${encodeURIComponent(params.sessionToken)}`;
  }

  return url;
}
