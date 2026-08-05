/**
 * End-to-end walkthrough: search, place, reviews.
 * Matches the README quick start.
 *
 * Run: npm run example:quick-start
 */
import { assertDefined, createExampleClient, HSR_CENTER } from './shared.js';

async function main() {
  const maps = createExampleClient();

  const { places } = await maps.search.searchText({
    query: 'cafes in indiranagar',
    location: { lat: 12.98, lng: 77.64 },
    limit: 5,
  });

  const top = assertDefined(places[0], 'search result');
  const hexId = assertDefined(top.hexId, 'hexId');
  const name = assertDefined(top.name, 'name');

  const place = await maps.places.get({
    hexId,
    name,
    lat: top.latitude ?? 12.98,
    lng: top.longitude ?? 77.64,
    mode: 'rich',
  });

  const reviews = await maps.reviews.listAll({
    hexId: assertDefined(place.hexId, 'place.hexId'),
    limit: 10,
    maxPages: 1,
  });

  console.log(place.name, place.rating, reviews.reviews.length, 'reviews');
  console.log('HSR sanity check location:', HSR_CENTER.lat, HSR_CENTER.lng);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
