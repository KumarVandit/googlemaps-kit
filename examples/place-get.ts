/**
 * Place preview via places.get() (live pb — fastest path).
 *
 * Run: npm run example:place
 */
import { assertDefined, CEVI, createExampleClient } from './shared.js';

async function main() {
  const maps = createExampleClient();

  const place = await maps.places.get({
    hexId: CEVI.hexId,
    name: CEVI.name,
    lat: CEVI.lat,
    lng: CEVI.lng,
    ftid: CEVI.ftid,
    mode: 'live',
    skipIncompleteRetry: true,
  });

  assertDefined(place.name, 'place.name');
  console.log('Name:', place.name);
  console.log('Address:', place.address ?? 'n/a');
  console.log('Rating:', place.rating, `(${place.reviewCount ?? '?'} reviews)`);
  console.log('Phone:', place.phone ?? 'n/a');
  console.log('Website:', place.website ?? 'n/a');
  console.log('Open:', place.openStatus ?? 'n/a');
  console.log('Timezone:', place.timezone ?? 'n/a');
  console.log('Photos:', place.photos?.length ?? 0);
  console.log('Attribute groups:', place.attributeGroups?.length ?? 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
