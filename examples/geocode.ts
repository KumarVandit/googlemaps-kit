/**
 * Forward and reverse geocoding.
 *
 * Run: npm run example:geocode
 */
import { run, assertDefined, createExampleClient, HSR_CENTER } from './shared.js';

async function main() {
  const maps = createExampleClient();

  const forward = await maps.location.geocode.geocode('HSR Layout, Bengaluru');
  const fwd = assertDefined(forward.result, 'forward geocode result');
  console.log('Forward:', fwd.name);
  console.log('  address:', fwd.formattedAddress ?? 'n/a');
  console.log('  coords:', fwd.lat, fwd.lng);

  const reverse = await maps.location.geocode.reverseGeocode(HSR_CENTER.lat, HSR_CENTER.lng);
  const rev = assertDefined(reverse.result, 'reverse geocode result');
  console.log('Reverse:', rev.formattedAddress ?? rev.name);
}

await run(main);
