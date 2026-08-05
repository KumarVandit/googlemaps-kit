/**
 * Live end-to-end verification of the Street View panorama surface.
 *
 * Usage: npx tsx scripts/verify-panorama.ts
 */

import { bootstrapSession, buildBrowserHeaders } from '../src/auth/session.js';
import { HttpClient } from '../src/client/http-client.js';
import { PanoramaService } from '../src/services/panorama.js';
import { buildThumbnailUrl } from '../src/rpc/panorama-pb.js';

const LOCATIONS = [
  { name: 'bangalore', lat: 12.9767, lng: 77.5906 },
  { name: 'new_york', lat: 40.758, lng: -73.9855 },
  { name: 'paris', lat: 48.8584, lng: 2.2945 },
] as const;

const INVALID_PANO_ID = 'G2__WfQLZTzrsr7FP1wUyQ';

interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

const results: CheckResult[] = [];

function record(name: string, pass: boolean, detail: string): void {
  results.push({ name, pass, detail });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name} — ${detail}`);
}

async function fetchThumbnailBytes(url: string): Promise<{ contentType: string; bytes: number }> {
  await bootstrapSession();
  const headers = buildBrowserHeaders({ referer: 'https://www.google.com/maps/' });
  const resp = await fetch(url, { headers, redirect: 'follow' });
  const buf = await resp.arrayBuffer();
  return {
    contentType: resp.headers.get('content-type') ?? '',
    bytes: buf.byteLength,
  };
}

async function main(): Promise<void> {
  await bootstrapSession();

  const http = new HttpClient({ config: { hl: 'en', gl: 'us' } });
  const panorama = new PanoramaService(http, { hl: 'en', gl: 'us' });

  let samplePanoId: string | undefined;

  for (const loc of LOCATIONS) {
    try {
      const nearby = await panorama.findNearby({
        lat: loc.lat,
        lng: loc.lng,
        radiusMeters: 300,
      });

      record(
        `${loc.name}: findNearby returns panoramas`,
        nearby.length > 0,
        `${nearby.length} refs, first=${nearby[0]?.panoId ?? 'none'}`,
      );

      if (nearby.length > 0 && !samplePanoId) {
        samplePanoId = nearby[0]!.panoId;
      }

      const meta = await panorama.getByLocation(loc.lat, loc.lng, { radiusMeters: 300 });

      record(
        `${loc.name}: getByLocation resolves metadata`,
        meta != null,
        meta ? `pano=${meta.panoId}` : 'null',
      );

      record(
        `${loc.name}: metadata has capture date`,
        Boolean(meta?.captureDate),
        meta?.captureDate ?? 'missing',
      );

      record(
        `${loc.name}: metadata has navigation links`,
        (meta?.links.length ?? 0) > 0,
        `${meta?.links.length ?? 0} links`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      record(`${loc.name}: nearby + metadata`, false, msg);
    }
  }

  try {
    const invalid = await panorama.get(INVALID_PANO_ID);
    record(
      'invalid pano id returns null',
      invalid === null,
      invalid === null ? 'stub detected' : `unexpected pano=${invalid?.panoId}`,
    );
  } catch (error) {
    record(
      'invalid pano id returns null',
      false,
      error instanceof Error ? error.message : String(error),
    );
  }

  if (samplePanoId) {
    try {
      const url = buildThumbnailUrl({ panoId: samplePanoId, width: 640, height: 480 });
      const { contentType, bytes } = await fetchThumbnailBytes(url);
      record(
        'thumbnail returns image/jpeg with >5000 bytes',
        contentType.includes('image/') && bytes > 5000,
        `${contentType}, ${bytes} bytes`,
      );
    } catch (error) {
      record(
        'thumbnail returns image/jpeg with >5000 bytes',
        false,
        error instanceof Error ? error.message : String(error),
      );
    }
  } else {
    record('thumbnail returns image/jpeg with >5000 bytes', false, 'no sample pano id');
  }

  console.log('\n========== SUMMARY ==========');
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`${passed} passed, ${failed} failed (${results.length} total)`);

  if (failed > 0) {
    console.log('\nFailed checks:');
    for (const r of results.filter((x) => !x.pass)) {
      console.log(`  - ${r.name}: ${r.detail}`);
    }
    process.exit(1);
  }

  console.log('\nAll panorama checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
