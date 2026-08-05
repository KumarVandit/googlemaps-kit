/**
 * Paginated search via searchPage().
 *
 * Run: npm run example:pagination
 */
import { createExampleClient, HSR_CENTER } from './shared.js';

async function main() {
  const maps = createExampleClient();

  const p1 = await maps.search.searchPage({
    query: 'restaurants in HSR Layout',
    location: HSR_CENTER,
    limit: 10,
    offset: 0,
  });

  console.log('Page 1:', p1.results.length, 'results');
  console.log('  hasMore:', p1.pagination.hasMore);
  console.log('  nextOffset:', p1.pagination.nextOffset);
  console.log('  first:', p1.results[0]?.name);

  if (!p1.pagination.hasMore) {
    console.log('No second page available for this query.');
    return;
  }

  const p2 = await maps.search.searchPage({
    query: 'restaurants in HSR Layout',
    location: HSR_CENTER,
    limit: 10,
    offset: p1.pagination.nextOffset ?? 10,
  });

  console.log('Page 2:', p2.results.length, 'results');
  console.log('  first:', p2.results[0]?.name);
  const overlap = p1.results[0]?.hexId && p1.results[0]?.hexId === p2.results[0]?.hexId;
  console.log('  same first row as page 1:', overlap ? 'yes' : 'no');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
