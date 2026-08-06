/**
 * End-to-end walkthrough via Intent API (discover → profile → opinions).
 *
 * Run: npm run example:quick-start
 */
import { assertDefined, createExampleClient, HSR_CENTER } from './shared.js';

async function main() {
  const maps = createExampleClient();

  const { places, timingMs } = await maps.discover({
    query: 'cafes in indiranagar',
    near: { lat: 12.98, lng: 77.64 },
    limit: 5,
  });

  const top = assertDefined(places[0], 'search result');
  assertDefined(top.hexId, 'hexId');

  const { place, depth } = await maps.profile(top, { depth: 'card' });
  const reviews = await maps.opinions(top, { pages: 1, limit: 10 });

  console.log(place.name, place.rating, depth, reviews.reviews.length, 'reviews');
  console.log('discover timingMs:', timingMs);
  console.log('HSR sanity check location:', HSR_CENTER.lat, HSR_CENTER.lng);
  console.log('capabilities:', await maps.capabilities());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
