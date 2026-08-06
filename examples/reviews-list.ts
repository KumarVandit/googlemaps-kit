/**
 * Paginated Boq reviews via reviews.listAll() and reviews.listBoq().
 *
 * Run: npm run example:reviews
 */
import { assertDefined, CEVI, createExampleClient } from './shared.js';

async function main() {
  const maps = createExampleClient();

  const page = await maps.places.reviews.listBoq({
    hexId: CEVI.hexId,
    ftid: CEVI.ftid,
    limit: 5,
    includeAggregates: true,
  });

  console.log('listBoq page:', page.reviews.length, 'reviews');
  if (page.totalReviews != null) {
    console.log('Place total:', page.totalReviews, '| aggregate:', page.aggregateRating);
  }

  const all = await maps.places.reviews.listAll({
    hexId: CEVI.hexId,
    ftid: CEVI.ftid,
    limit: 10,
    maxPages: 2,
    includeAggregates: false,
  });

  console.log('listAll deduped:', all.reviews.length, 'reviews');
  const first = assertDefined(all.reviews[0], 'first review');
  console.log('First:', first.rating, 'stars', first.author ?? '(embedded snippet)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
