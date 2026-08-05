/**
 * Text search: searchText() (enterprise field mask) and search().
 *
 * Run: npm run example:search
 */
import { assertDefined, createExampleClient, HSR_CENTER } from './shared.js';

async function main() {
  const maps = createExampleClient();

  console.log('searchText() with fieldMask enterprise\n');
  const t0 = performance.now();
  const { places, timingMs } = await maps.search.searchText({
    query: 'restaurants in hsr layout',
    location: HSR_CENTER,
    limit: 5,
    fieldMask: 'enterprise',
  });
  console.log(`SDK timing: ${timingMs}ms | wall: ${(performance.now() - t0).toFixed(0)}ms`);
  console.log(`Results: ${places.length}\n`);

  for (const [i, p] of places.slice(0, 5).entries()) {
    console.log(
      `${i + 1}. ${p.name}` +
        (p.rating != null ? ` | rating ${p.rating}` : '') +
        (p.phone ? ` | ${p.phone}` : '') +
        (p.openStatus ? ` | ${p.openStatus}` : ''),
    );
  }

  console.log('\nsearch() full rows\n');
  const rows = await maps.search.search({
    query: 'cafes in hsr layout',
    location: HSR_CENTER,
    limit: 3,
  });
  assertDefined(rows[0]?.name, 'first search row name');
  console.log(`Top: ${rows[0]!.name} | hexId: ${rows[0]!.hexId ?? 'n/a'}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
