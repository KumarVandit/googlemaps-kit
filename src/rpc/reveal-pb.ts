import { PREVIEW } from './rpc-methods.js';
import { altitudeFromZoom } from '../utils/geo.js';

export interface BuildRevealPbParams {
  camLat: number;
  camLng: number;
  camZoom?: number;
  hitLat: number;
  hitLng: number;
  ftid: string;
  width?: number;
  height?: number;
  tileX?: number;
  tileY?: number;
  tileScale?: number;
  tileLayer?: number;
}

/** Strip leading `/g/` or `/m/` — reveal pb uses bare ftid tokens. */
export function normalizeRevealFtid(ftid: string): string {
  return ftid.replace(/^\/g\//, '').replace(/^\/m\//, '').replace(/^\//, '');
}

/**
 * Build pb for GET /maps/preview/reveal.
 * Wire format from live browser capture (live-flows.json, poi-pin-click flow).
 */
export function buildRevealPb(params: BuildRevealPbParams): string {
  const zoom = params.camZoom ?? 14;
  const alt = altitudeFromZoom(zoom, params.camLat);
  const w = params.width ?? 1440;
  const h = params.height ?? 900;
  const tx = params.tileX ?? 96;
  const ty = params.tileY ?? 64;
  const ts = params.tileScale ?? 1;
  const tl = params.tileLayer ?? 8;
  const ftid = normalizeRevealFtid(params.ftid);

  return (
    `!2m9!1m3!1d${alt}!2d${params.camLng}!3d${params.camLat}` +
    `!2m0!3m2!1i${w}!2i${h}!4f13.1` +
    `!3m2!2d${params.hitLng}!3d${params.hitLat}` +
    `!4m2!1s${ftid}!7e81` +
    `!5m5!2m4!1i${tx}!2i${ty}!3i${ts}!4i${tl}`
  );
}

export function buildRevealUrl(params: BuildRevealPbParams & { hl: string; gl: string }): string {
  const pb = buildRevealPb(params);
  return (
    `https://www.google.com${PREVIEW.REVEAL}?authuser=0&hl=${params.hl}&gl=${params.gl}` +
    `&pb=${encodeURIComponent(pb)}`
  );
}
