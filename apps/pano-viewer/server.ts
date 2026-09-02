/**
 * Thin CORS shim in front of googlemaps-kit so the client-side webapp in
 * public/ can use the SDK from the browser (Google's consumer endpoints send
 * no CORS headers, so the SDK must run in Node). All app logic lives in the
 * webapp; this file only exposes three raw SDK calls as JSON.
 *
 * Run: npm run app:pano  →  http://localhost:8787
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sdk } from '../../src/index.js';
import type { PanoramaMetadata } from '../../src/types/panorama.js';

const PORT = Number(process.env.PORT ?? 8787);
const PUBLIC_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'public');

function bearing(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  const rad = Math.PI / 180;
  const φ1 = fromLat * rad;
  const φ2 = toLat * rad;
  const Δλ = (toLng - fromLng) * rad;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) / rad) + 360) % 360;
}

/**
 * Keyless Maps embed URL. Pitch is pinned to 0 so the camera looks straight
 * ahead at street level; heading aims at the target when known.
 */
function embedUrlFor(meta: PanoramaMetadata, heading?: number): string {
  const h = heading ?? meta.heading ?? 0;
  return (
    'https://www.google.com/maps/embed?pb=!4v1!6m8!1m7' +
    `!1s${meta.panoId}!2m2!1d0!2d0!3f${h.toFixed(4)}!4f0!5f0.7820865974627469`
  );
}

async function nearestPano(
  lat: number,
  lng: number,
  aimLat?: number,
  aimLng?: number,
): Promise<{ panoId: string; captureDate?: string; embedUrl: string } | null> {
  const meta = await sdk().map.panorama.getByLocation(lat, lng);
  if (!meta) return null;
  const heading =
    aimLat != null && aimLng != null && meta.lat != null && meta.lng != null
      ? bearing(meta.lat, meta.lng, aimLat, aimLng)
      : undefined;
  return {
    panoId: meta.panoId,
    captureDate: meta.captureDate,
    embedUrl: embedUrlFor(meta, heading),
  };
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function json(res: import('node:http').ServerResponse, data: unknown): void {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const num = (k: string) => Number(url.searchParams.get(k));
  const has = (...keys: string[]) => keys.every((k) => Number.isFinite(num(k)));

  try {
    if (url.pathname === '/api/geocode') {
      const q = url.searchParams.get('q')?.trim();
      if (!q) throw new Error('Missing ?q=');
      const hit = (await sdk().location.geocode.geocode(q)).result;
      if (!hit?.lat || !hit?.lng) throw new Error(`No location found for "${q}"`);
      return json(res, { name: hit.formattedAddress ?? hit.name, lat: hit.lat, lng: hit.lng });
    }

    if (url.pathname === '/api/panorama') {
      if (!has('lat', 'lng')) throw new Error('Missing lat/lng');
      const pano = await nearestPano(num('lat'), num('lng'), num('aimLat'), num('aimLng'));
      if (!pano) throw new Error('No Street View coverage near this point');
      return json(res, pano);
    }

    if (url.pathname === '/api/discover') {
      const q = url.searchParams.get('q')?.trim();
      if (!q || !has('lat', 'lng')) throw new Error('Missing q or lat/lng');
      const limit = num('limit') || 5;
      const found = await sdk().discover({
        query: q,
        near: { lat: num('lat'), lng: num('lng') },
        limit,
      });
      return json(
        res,
        found.places
          .filter((p) => p.lat != null && p.lng != null)
          .slice(0, limit)
          .map((p) => ({ name: p.name, lat: p.lat, lng: p.lng })),
      );
    }

    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    try {
      const body = await readFile(join(PUBLIC_DIR, file));
      res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end('Not found');
    }
  } catch (err) {
    res.statusCode = 404;
    json(res, { error: err instanceof Error ? err.message : String(err) });
  }
}).listen(PORT, () => {
  console.log(`Pano viewer running at http://localhost:${PORT}`);
});
