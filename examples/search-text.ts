/**
 * Text search: searchText() fast (default) vs full mode.
 *
 * Run: npm run example:search
 */
import { assertDefined, createExampleClient, HSR_CENTER } from './shared.js';

async function main() {
  const maps = createExampleClient();
  await maps.ready();

  console.log('searchText() — fast mode (default)\n');
  const t0 = performance.now();
  const fast = await maps.places.search.searchText({
    query: 'restaurants in hsr layout',
    location: HSR_CENTER,
  });
  console.log(`SDK timing: ${fast.timingMs}ms | wall: ${(performance.now() - t0).toFixed(0)}ms`);
  console.log(`Results: ${fast.places.length}\n`);

  for (const [i, p] of fast.places.entries()) {
    console.log(
      `${i + 1}. ${p.name}` +
        (p.rating != null ? ` | rating ${p.rating}` : '') +
        (p.thumbnailUrl ? ' | photo' : ''),
    );
  }

  console.log('\nsearchText() — full mode (hours, phone, attributes)\n');
  const full = await maps.places.search.searchText({
    query: 'cafes in hsr layout',
    location: HSR_CENTER,
    mode: 'full',
    limit: 5,
  });
  assertDefined(full.places[0]?.name, 'first search row name');
  const p = full.places[0]!;
  console.log(
    `Top: ${p.name}` +
      (p.phone ? ` | ${p.phone}` : '') +
      (p.openStatus ? ` | ${p.openStatus}` : '') +
      ` | hexId: ${p.hexId ?? 'n/a'}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
