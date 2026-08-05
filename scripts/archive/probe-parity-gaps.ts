/**
 * Measure gap-closing work: timezone offline, distance matrix 2×2, elevation, place full.
 */
import { loadProjectEnv } from '../src/utils/load-env.js';
import { GMapsClient } from '../src/client/gmaps-client.js';

loadProjectEnv();

const HSR = { lat: 12.9121263, lng: 77.6499775 };
const HEX = '0x3bae1500315fdff7:0x9fe54cd44a84f1c7';
const DEST = { lat: 12.9716, lng: 77.5946 }; // MG Road-ish

async function main(): Promise<void> {
  const maps = new GMapsClient({ hl: 'en', gl: 'in', requestDelayMs: 0, concurrency: 8 });

  console.log('=== timezone ===');
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    const tz = await maps.timezone.get(HSR);
    console.log(
      `  offline ${i + 1}: ${(performance.now() - t0).toFixed(1)}ms  ${tz.timeZoneId} (${tz.timezoneSource})`,
    );
  }
  {
    const t0 = performance.now();
    const tz = await maps.timezone.get({ ...HSR, source: 'geocode' });
    console.log(
      `  geocode: ${(performance.now() - t0).toFixed(0)}ms  ${tz.timeZoneId} (${tz.timezoneSource}) status=${tz.status}`,
    );
  }

  console.log('\n=== distance matrix 2×2 ===');
  for (let i = 0; i < 3; i++) {
    const result = await maps.distanceMatrix.getMatrix({
      origins: [HSR, DEST],
      destinations: [HSR, DEST],
      concurrency: 8,
      requestDelayMs: 0,
    });
    const ok = result.rows.flat().filter((c) => c.status === 'OK').length;
    console.log(
      `  run ${i + 1}: ${result.timingMs?.toFixed(0)}ms  reqs=${result.requestCount} ok=${ok}/4`,
    );
  }

  console.log('\n=== elevation point ===');
  for (let i = 0; i < 3; i++) {
    const el = await maps.elevation.getAtPoint(HSR);
    console.log(
      `  run ${i + 1}: ${el.timingMs?.toFixed(0)}ms  status=${el.status} elev=${el.elevationMeters ?? 'n/a'}`,
    );
  }

  console.log('\n=== place full (parallel preview+reviews) ===');
  for (let i = 0; i < 3; i++) {
    const full = await maps.getPlaceFull({
      hexId: HEX,
      name: 'Kake Di Hatti',
      lat: HSR.lat,
      lng: HSR.lng,
    });
    console.log(
      `  run ${i + 1}: total=${full.meta.timingMs?.total?.toFixed(0)}ms ` +
        `preview=${full.meta.timingMs?.preview?.toFixed(0)}ms ` +
        `reviews=${full.meta.timingMs?.reviews?.toFixed(0)}ms ` +
        `posts=${full.meta.timingMs?.localPosts?.toFixed(0)}ms ` +
        `reviewsN=${full.reviews.reviews.length} photos=${full.details.photos?.length ?? 0}`,
    );
  }

  console.log('\n=== static map 640x360 ===');
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    const map = await maps.staticMap.getStaticMap({
      lat: HSR.lat,
      lng: HSR.lng,
      zoom: 15,
      width: 640,
      height: 360,
    });
    console.log(
      `  run ${i + 1}: ${(performance.now() - t0).toFixed(0)}ms  tiles=${map.tilesFetched} bytes=${map.bytes.length}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
