/**
 * Minimal HTTP façade implementing openapi/openapi.yaml using GMapsClient.
 * For Stainless-generated multi-language SDKs. No express dependency.
 *
 * Usage: npm run api:serve
 * Env: PORT (default 8787), GMAPS_HL, GMAPS_GL
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { loadProjectEnv } from '../utils/env.js';
import { sdk } from '../client/gmaps-client.js';
import type { Coordinates, TravelMode } from '../types/common.js';
import { GMapsError, GMapsAuthError, GMapsThrottleError } from '../types/common.js';
import { getPackageVersion } from '../utils/env.js';

loadProjectEnv();

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '127.0.0.1';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'access-control-allow-origin': '*',
  });
  res.end(payload);
}

function clientFromRequest(_req: IncomingMessage) {
  return sdk({
    hl: process.env.GMAPS_HL ?? 'en',
    gl: process.env.GMAPS_GL ?? 'us',
    concurrency: 8,
    requestDelayMs: 0,
  });
}

function toLatLng(value: unknown): Coordinates | string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'lat' in value && 'lng' in value) {
    const o = value as { lat: unknown; lng: unknown };
    if (typeof o.lat === 'number' && typeof o.lng === 'number') {
      return { lat: o.lat, lng: o.lng };
    }
  }
  return undefined;
}

function mapError(res: ServerResponse, error: unknown): void {
  if (error instanceof GMapsThrottleError) {
    sendJson(res, 429, { error: error.message, code: 'throttle' });
    return;
  }
  if (error instanceof GMapsAuthError) {
    sendJson(res, 401, { error: error.message, code: 'auth' });
    return;
  }
  if (error instanceof GMapsError) {
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 502;
    sendJson(res, status, { error: error.message, code: 'upstream' });
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  sendJson(res, 502, { error: message, code: 'upstream' });
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
  const path = url.pathname.replace(/\/$/, '') || '/';

  if (req.method === 'GET' && (path === '/v1/health' || path === '/health')) {
    sendJson(res, 200, { ok: true, version: getPackageVersion() });
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type,x-gmaps-cookies',
    });
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed', code: 'method' });
    return;
  }

  let body: Record<string, unknown> = {};
  try {
    const raw = await readBody(req);
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body', code: 'bad_request' });
    return;
  }

  const maps = clientFromRequest(req);

  try {
    switch (path) {
      case '/v1/places/search_text': {
        const query = String(body.query ?? '');
        if (!query.trim()) {
          sendJson(res, 400, { error: 'query is required', code: 'bad_request' });
          return;
        }
        const location = toLatLng(body.location);
        const coords =
          typeof location === 'object'
            ? location
            : { lat: 20, lng: 0 };
        const result = await maps.places.search.searchText({
          query,
          location: coords,
          limit: typeof body.limit === 'number' ? body.limit : 20,
          fieldMask: 'enterprise',
        });
        sendJson(res, 200, {
          places: result.places.map((p) => ({
            name: p.name,
            address: p.address,
            place_id: p.placeId,
            hex_id: p.hexId,
            rating: p.rating,
            review_count: p.reviewCount,
            phone: p.internationalPhone ?? p.phone,
            latitude: p.latitude,
            longitude: p.longitude,
            open_status: p.openStatus,
            timezone: p.timezone,
            thumbnail_url: p.thumbnailUrl,
          })),
          request_count: result.requestCount,
          timing_ms: result.timingMs,
        });
        return;
      }
      case '/v1/places/get': {
        const hexId = String(body.hex_id ?? '');
        if (!hexId) {
          sendJson(res, 400, { error: 'hex_id is required', code: 'bad_request' });
          return;
        }
        const location = toLatLng(body.location);
        const place = await maps.places.get({
          hexId,
          name: typeof body.name === 'string' ? body.name : undefined,
          lat: typeof location === 'object' ? location.lat : undefined,
          lng: typeof location === 'object' ? location.lng : undefined,
          mode:
            body.mode === 'rich' || body.mode === 'detail' || body.mode === 'live'
              ? body.mode
              : 'live',
        });
        sendJson(res, 200, {
          name: place.name,
          address: place.address,
          place_id: place.placeId,
          hex_id: place.hexId,
          rating: place.rating,
          review_count: place.reviewCount,
          phone: place.phone,
          website: place.website,
          latitude: place.latitude,
          longitude: place.longitude,
          timezone: place.timezone,
          photos: place.photos,
        });
        return;
      }
      case '/v1/directions': {
        const origin = toLatLng(body.origin);
        const destination = toLatLng(body.destination);
        if (origin == null || destination == null) {
          sendJson(res, 400, { error: 'origin and destination are required', code: 'bad_request' });
          return;
        }
        const mode = (typeof body.mode === 'string' ? body.mode : 'driving') as TravelMode;
        const result = await maps.travel.directions.get({
          origin,
          destination,
          mode,
          metricsOnly: body.metrics_only === true,
        });
        sendJson(res, 200, {
          distance: result.distance,
          duration: result.duration,
          legs: result.legs,
        });
        return;
      }
      case '/v1/geocode': {
        const query = String(body.query ?? '');
        if (!query.trim()) {
          sendJson(res, 400, { error: 'query is required', code: 'bad_request' });
          return;
        }
        const location = toLatLng(body.location);
        const result = await maps.location.geocode.geocode(query, {
          lat: typeof location === 'object' ? location.lat : undefined,
          lng: typeof location === 'object' ? location.lng : undefined,
        });
        sendJson(res, 200, {
          result: result.result,
          alternatives: result.alternatives,
        });
        return;
      }
      case '/v1/timezone': {
        if (typeof body.lat !== 'number' || typeof body.lng !== 'number') {
          sendJson(res, 400, { error: 'lat and lng are required', code: 'bad_request' });
          return;
        }
        const result = await maps.location.timezone.get({
          lat: body.lat,
          lng: body.lng,
          source: body.source === 'geocode' ? 'geocode' : 'offline',
        });
        sendJson(res, 200, {
          lat: result.lat,
          lng: result.lng,
          status: result.status,
          time_zone_id: result.timeZoneId,
          total_offset_minutes: result.totalOffsetMinutes,
          timezone_source: result.timezoneSource,
        });
        return;
      }
      case '/v1/distance_matrix': {
        const origins = Array.isArray(body.origins)
          ? body.origins.map(toLatLng).filter((v): v is Coordinates | string => v != null)
          : [];
        const destinations = Array.isArray(body.destinations)
          ? body.destinations.map(toLatLng).filter((v): v is Coordinates | string => v != null)
          : [];
        if (origins.length === 0 || destinations.length === 0) {
          sendJson(res, 400, {
            error: 'origins and destinations are required',
            code: 'bad_request',
          });
          return;
        }
        const result = await maps.travel.distanceMatrix.getMatrix({
          origins,
          destinations,
          mode: (typeof body.mode === 'string' ? body.mode : 'driving') as TravelMode,
          concurrency: typeof body.concurrency === 'number' ? body.concurrency : 8,
          requestDelayMs: 0,
        });
        sendJson(res, 200, {
          rows: result.rows,
          request_count: result.requestCount,
          implementation: result.implementation,
          timing_ms: result.timingMs,
        });
        return;
      }
      case '/v1/elevation': {
        if (typeof body.lat !== 'number' || typeof body.lng !== 'number') {
          sendJson(res, 400, { error: 'lat and lng are required', code: 'bad_request' });
          return;
        }
        const result = await maps.travel.elevation.getAtPoint({ lat: body.lat, lng: body.lng });
        sendJson(res, 200, {
          lat: result.lat,
          lng: result.lng,
          status: result.status,
          elevation_meters: result.elevationMeters,
          timing_ms: result.timingMs,
        });
        return;
      }
      default: {
        sendJson(res, 404, { error: `Unknown path ${path}`, code: 'not_found' });
      }
    }
  } catch (error) {
    mapError(res, error);
  }
}

const server = createServer((req, res) => {
  void handle(req, res).catch((error) => {
    mapError(res, error);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`googlemaps-kit API façade listening on http://${HOST}:${PORT}`);
  console.log('OpenAPI: openapi/openapi.yaml · Stainless: openapi/stainless.yml');
});
