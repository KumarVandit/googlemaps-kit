/**
 * Live verification for extended directions features.
 * Usage: npx tsx scripts/verify-directions-extended.ts
 */

import { DirectionsService } from '../src/services/directions.js';
import { HttpClient } from '../src/client/http-client.js';
import { parseDistanceToMeters } from '../src/utils/directions-metrics.js';
import { haversineMeters } from '../src/utils/geo.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const HSR = { lat: 12.9168407, lng: 77.6450439 };
const KOR = { lat: 12.9352, lng: 77.6245 };
const INDI = { lat: 12.9784, lng: 77.6408 };

function assert(condition: boolean, message: string): void {
  console.log(condition ? `PASS ${message}` : `FAIL ${message}`);
  if (!condition) process.exitCode = 1;
}

async function main(): Promise<void> {
  const http = new HttpClient({ config: { hl: 'en', gl: 'in' } });
  const directions = new DirectionsService(http, { hl: 'en', gl: 'in' });

  const direct = await directions.get({ origin: HSR, destination: KOR, mode: 'driving' });
  await sleep(700);

  const via = await directions.get({
    origin: HSR,
    destination: KOR,
    mode: 'driving',
    waypoints: [{ location: INDI }],
  });
  await sleep(700);

  const directMetres = parseDistanceToMeters(direct.distance) ?? 0;
  const viaMetres = parseDistanceToMeters(via.distance) ?? 0;
  assert(viaMetres > directMetres * 1.5, `waypoint distance ${viaMetres}m > direct ${directMetres}m`);
  assert((via.routes?.length ?? 0) >= 1, 'waypoint route returned');

  assert((direct.routes?.length ?? 0) >= 2, `route alternatives count=${direct.routes?.length ?? 0}`);
  assert(Boolean(direct.routes?.[0]?.summary), 'primary route summary present');

  if (direct.durationInTraffic) {
    assert(
      direct.durationInTraffic !== direct.duration,
      `traffic duration ${direct.durationInTraffic} differs from ${direct.duration}`,
    );
  } else {
    console.log('SKIP traffic duration (not present on this response)');
  }

  const path = direct.routes?.[0]?.path ?? direct.legs[0]?.steps?.find((step) => step.path)?.path;
  if (path && path.length > 1) {
    assert(path.length > 1, 'route path has multiple points');
    assert(
      haversineMeters(path[0]!.lat, path[0]!.lng, HSR.lat, HSR.lng) < 2500,
      'path starts near origin',
    );
    assert(
      haversineMeters(path[path.length - 1]!.lat, path[path.length - 1]!.lng, KOR.lat, KOR.lng) < 2500,
      'path ends near destination',
    );
  } else {
    console.log('FAIL no route path found');
    process.exitCode = 1;
  }

  assert(Boolean(direct.bounds), 'route bounds present');

  for (const mode of ['driving', 'walking', 'bicycling', 'transit'] as const) {
    await sleep(700);
    const [origin, destination] =
      mode === 'bicycling'
        ? [{ lat: 52.3676, lng: 4.9041 }, { lat: 52.3731, lng: 4.8922 }]
        : [HSR, KOR];
    const route = await directions.get({ origin, destination, mode });
    assert(Boolean(route.duration), `${mode} duration present (${route.duration ?? 'missing'})`);
  }

  console.log(process.exitCode === 1 ? '\nSome checks FAILED' : '\nAll checks PASSED');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
