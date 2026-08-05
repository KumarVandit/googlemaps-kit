/**
 * Canonical Google Maps share/embed URL builders.
 *
 * Inverse of {@link parseMapsUrl} — produces human-facing `google.com/maps/*` URLs,
 * distinct from the internal RPC pb URLs in `pb-builders.ts`.
 */

import type { TravelMode } from '../types/common.js';
import type {
  BuildDirectionsUrlOptions,
  BuildEmbedUrlOptions,
  BuildPlaceUrlOptions,
  BuildSearchUrlOptions,
  BuildStreetViewUrlOptions,
  BuildViewportUrlOptions,
  EmbedUrlResult,
} from '../types/maps-urls.js';
import { viewportAltitude } from '../utils/static-map-grid.js';

const BASE = 'https://www.google.com/maps';

const TRAVEL_MODE_CODE: Record<TravelMode, number> = {
  driving: 0,
  bicycling: 1,
  walking: 2,
  transit: 3,
};

function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, '+');
}

function formatCoord(value: number): string {
  const rounded = Math.round(value * 1e7) / 1e7;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function viewportSegment(lat: number, lng: number, zoom?: number): string {
  const z = zoom ?? 15;
  return `@${formatCoord(lat)},${formatCoord(lng)},${z}z`;
}

function placeDataBlob(params: {
  hexId?: string;
  placeId?: string;
  lat: number;
  lng: number;
  featureId?: string;
}): string {
  const idPart = params.hexId
    ? `!1s${params.hexId}`
    : params.placeId
      ? `!1s${params.placeId}`
      : '';
  const ftidPart = params.featureId
    ? `!16s${encodeURIComponent(params.featureId.startsWith('/') ? params.featureId : `/${params.featureId}`)}`
    : '';
  return (
    `!3m1!4b1!4m6!3m5${idPart}!8m2!3d${formatCoord(params.lat)}!4d${formatCoord(params.lng)}${ftidPart}`
  );
}

function directionsDataBlob(mode?: TravelMode): string {
  const modeCode = mode ? TRAVEL_MODE_CODE[mode] : undefined;
  return modeCode != null ? `!4m2!4m1!3e${modeCode}` : '';
}

/** Build a place page URL (`/maps/place/...`). */
export function buildPlaceUrl(options: BuildPlaceUrlOptions): string {
  const namePart = options.name ? encodePathSegment(options.name) : '';
  const viewport = viewportSegment(options.lat, options.lng, options.zoom);
  const data = placeDataBlob({
    hexId: options.hexId,
    placeId: options.placeId,
    lat: options.lat,
    lng: options.lng,
    featureId: options.featureId,
  });
  return `${BASE}/place/${namePart}/${viewport}/data=${data}`;
}

/** Build a search results URL (`/maps/search/...`). */
export function buildSearchUrl(options: BuildSearchUrlOptions): string {
  const query = encodePathSegment(options.query);
  if (options.lat != null && options.lng != null) {
    const viewport = viewportSegment(options.lat, options.lng, options.zoom);
    return `${BASE}/search/${query}/${viewport}`;
  }
  return `${BASE}/search/${query}`;
}

/** Build a directions URL (`/maps/dir/...`). */
export function buildDirectionsUrl(options: BuildDirectionsUrlOptions): string {
  const origin = encodePathSegment(options.origin);
  const destination = encodePathSegment(options.destination);
  const middle =
    options.waypoints && options.waypoints.length > 0
      ? `${options.waypoints.map(encodePathSegment).join('/')}/`
      : '';
  const viewport =
    options.lat != null && options.lng != null
      ? `/${viewportSegment(options.lat, options.lng, options.zoom)}`
      : '';
  const data = directionsDataBlob(options.mode);
  const dataSuffix = data ? `/data=${data}` : '';
  return `${BASE}/dir/${origin}/${middle}${destination}${viewport}${dataSuffix}`;
}

/** Build a bare viewport URL (`/maps/@lat,lng,zoom`). */
export function buildViewportUrl(options: BuildViewportUrlOptions): string {
  const viewport = viewportSegment(options.lat, options.lng, options.zoom);
  const params = new URLSearchParams();
  if (options.mapAction === 'pano') {
    params.set('map_action', 'pano');
  }
  switch (options.layer) {
    case 'transit':
      params.set('layer', 'transit');
      break;
    case 'traffic':
      params.set('layer', 'traffic');
      break;
    case 'bicycling':
      params.set('layer', 'bicycling');
      break;
    case 'none':
    case undefined:
      break;
    default: {
      const exhaustive: never = options.layer;
      throw new Error(`Unhandled map layer: ${String(exhaustive)}`);
    }
  }
  const qs = params.toString();
  return qs ? `${BASE}/${viewport}?${qs}` : `${BASE}/${viewport}`;
}

/**
 * Build a Street View share URL.
 *
 * Uses the `@?api=1&map_action=pano` form documented by Google. Not parsed by
 * {@link parseMapsUrl} today — verify via live HTTP instead of round-trip.
 */
export function buildStreetViewUrl(options: BuildStreetViewUrlOptions): string {
  const params = new URLSearchParams();
  params.set('api', '1');
  params.set('map_action', 'pano');
  params.set('viewpoint', `${formatCoord(options.lat)},${formatCoord(options.lng)}`);
  if (options.panoId) {
    params.set('pano', options.panoId);
  }
  if (options.heading != null) {
    params.set('heading', String(options.heading));
  }
  if (options.pitch != null) {
    params.set('pitch', String(options.pitch));
  }
  if (options.fov != null) {
    params.set('fov', String(options.fov));
  }
  return `${BASE}/@?${params.toString()}`;
}

function buildKeylessEmbedPb(options: BuildEmbedUrlOptions): string | null {
  const hl = options.hl ?? 'en';
  const gl = options.gl ?? 'us';
  const ts = Date.now();

  switch (options.kind) {
    case 'place': {
      if (!options.hexId) return null;
      const lat = options.lat ?? 0;
      const lng = options.lng ?? 0;
      const alt = viewportAltitude(lat, options.zoom ?? 15);
      const namePart = options.name
        ? `!2s${options.name.replace(/ /g, '+')}`
        : '';
      return (
        `!1m18!1m12!1m3!1d${alt}!2d${formatCoord(lng)}!3d${formatCoord(lat)}` +
        `!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1` +
        `!3m3!1m2!1s${options.hexId}${namePart}!5e0` +
        `!3m2!1s${hl}!2s${gl}!4v${ts}!5m2!1s${hl}!2s${gl}`
      );
    }
    case 'search': {
      if (!options.query) return null;
      const lat = options.lat ?? 0;
      const lng = options.lng ?? 0;
      const alt = viewportAltitude(lat, options.zoom ?? 15);
      const q = encodeURIComponent(options.query);
      return (
        `!1m18!1m12!1m3!1d${alt}!2d${formatCoord(lng)}!3d${formatCoord(lat)}` +
        `!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1` +
        `!3m3!1m2!1s0x0:0x0!2z${q}!5e0` +
        `!3m2!1s${hl}!2s${gl}!4v${ts}!5m2!1s${hl}!2s${gl}`
      );
    }
    case 'directions': {
      if (!options.origin || !options.destination) return null;
      const modeCode = options.mode ? TRAVEL_MODE_CODE[options.mode] : 0;
      const origin = encodeURIComponent(options.origin);
      const dest = encodeURIComponent(options.destination);
      const wpCoords = (options.waypoints ?? [])
        .map((wp) => `!4m3!3m2!1d0!2d0!3d0!4m1!3s${encodeURIComponent(wp)}`)
        .join('');
      const wpCount = options.waypoints?.length ?? 0;
      const outerM = 12 + wpCount * 4 + 11;
      const innerM = wpCount * 4 + 1;
      return (
        `!1m${outerM}!1m12!1m3!1d1!2d0!3d0` +
        `!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1` +
        `!4m${innerM}!3e${modeCode}` +
        `!4m5!1s0x0:0x0!2s${origin}!3m2!1d0!2d0` +
        `!4m5!1s0x0:0x0!2s${dest}!3m2!1d0!2d0` +
        wpCoords +
        `!5e0!3m2!1s${hl}!2s${gl}!4v${ts}!5m2!1s${hl}!2s${gl}`
      );
    }
    case 'view': {
      const lat = options.lat ?? 0;
      const lng = options.lng ?? 0;
      const alt = viewportAltitude(lat, options.zoom ?? 15);
      return (
        `!1m14!1m12!1m3!1d${alt}!2d${formatCoord(lng)}!3d${formatCoord(lat)}` +
        `!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0` +
        `!3m2!1s${hl}!2s${gl}!4v${ts}!5m2!1s${hl}!2s${gl}`
      );
    }
    default: {
      const exhaustive: never = options.kind;
      throw new Error(`Unhandled embed kind: ${String(exhaustive)}`);
    }
  }
}

function buildEmbedV1Url(options: BuildEmbedUrlOptions): string {
  const key = options.apiKey!;
  const params = new URLSearchParams({ key });

  switch (options.kind) {
    case 'place': {
      const q =
        options.hexId ??
        options.name ??
        (options.lat != null && options.lng != null
          ? `${options.lat},${options.lng}`
          : '');
      params.set('q', q);
      if (options.zoom != null) params.set('zoom', String(options.zoom));
      return `${BASE}/embed/v1/place?${params.toString()}`;
    }
    case 'search': {
      params.set('q', options.query ?? '');
      return `${BASE}/embed/v1/search?${params.toString()}`;
    }
    case 'directions': {
      params.set('origin', options.origin ?? '');
      params.set('destination', options.destination ?? '');
      if (options.mode) params.set('mode', options.mode);
      if (options.waypoints?.length) {
        params.set('waypoints', options.waypoints.join('|'));
      }
      return `${BASE}/embed/v1/directions?${params.toString()}`;
    }
    case 'view': {
      params.set('center', `${options.lat ?? 0},${options.lng ?? 0}`);
      params.set('zoom', String(options.zoom ?? 15));
      return `${BASE}/embed/v1/view?${params.toString()}`;
    }
    default: {
      const exhaustive: never = options.kind;
      throw new Error(`Unhandled embed kind: ${String(exhaustive)}`);
    }
  }
}

/**
 * Build an embed iframe URL.
 *
 * Prefers the keyless `/maps/embed?pb=` form when a pb can be derived; falls back
 * to `/maps/embed/v1/*` when `apiKey` is supplied or pb construction is impossible.
 */
export function buildEmbedUrl(options: BuildEmbedUrlOptions): EmbedUrlResult {
  if (options.apiKey) {
    return { url: buildEmbedV1Url(options), keyRequired: true };
  }

  const pb = buildKeylessEmbedPb(options);
  if (pb) {
    return {
      url: `${BASE}/embed?pb=${encodeURIComponent(pb)}`,
      keyRequired: false,
    };
  }

  return {
    url: buildEmbedV1Url({ ...options, apiKey: 'YOUR_API_KEY' }),
    keyRequired: true,
  };
}

/** Travel mode code used in directions data blobs (!3eN). */
export function travelModeToCode(mode: TravelMode): number {
  return TRAVEL_MODE_CODE[mode];
}

/** Travel mode from directions data blob code. */
export function travelModeFromCode(code: number): TravelMode | undefined {
  const modes: TravelMode[] = ['driving', 'bicycling', 'walking', 'transit'];
  return modes[code];
}
