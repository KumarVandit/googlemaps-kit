import { altitudeFromZoom } from '../utils/geo.js';
import { PREVIEW } from './rpc-methods.js';

export interface PassiveAssistPbParams {
  lat: number;
  lng: number;
  zoom?: number;
  psi: string;
  width?: number;
  height?: number;
  chipLimit?: number;
}

/**
 * Browser-captured pb shape (2026-07-31 headless live-flows + probe-target-surfaces).
 *
 * Uses the shorter `!1m10!2m9` camera block — the legacy `!1m16!2m15` builder
 * with `!6m2!1f0!2f0` returns the cache-metadata stub for the same psi.
 */
export function buildPassiveAssistPb(params: PassiveAssistPbParams): string {
  const zoom = params.zoom ?? 14;
  const alt = altitudeFromZoom(zoom, params.lat);
  const w = params.width ?? 1440;
  const h = params.height ?? 900;
  const limit = params.chipLimit ?? 50;
  return (
    `!1m10!2m9!1m3!1d${alt}!2d${params.lng}!3d${params.lat}` +
    `!2m0!3m2!1i${w}!2i${h}!4f13.1` +
    `!3m3!1s${params.psi}!7e81!15i312935!7m1!58b1` +
    `!35m6!1i${limit}!3m3!3b1!26b1!29b1!44e11`
  );
}

export function buildPassiveAssistUrl(params: PassiveAssistPbParams & { hl: string; gl: string }): string {
  const pb = buildPassiveAssistPb(params);
  return `https://www.google.com${PREVIEW.PASSIVE_ASSIST}?authuser=0&hl=${params.hl}&gl=${params.gl}&pb=${encodeURIComponent(pb)}`;
}
