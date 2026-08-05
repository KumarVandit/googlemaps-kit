/**
 * Combined place preview + paginated reviews via getPlaceFull().
 *
 * Run: npm run example:place-full
 */
import { assertDefined, CEVI, createExampleClient } from './shared.js';

async function main() {
  const maps = createExampleClient();

  const full = await maps.getPlaceFull({
    ...CEVI,
    reviewLimit: 10,
    maxReviewPages: 2,
    richPreview: true,
  });

  const { details, reviews, meta } = full;
  assertDefined(details.name, 'details.name');

  console.log('Place:', details.name);
  console.log('Rating:', details.rating, `(${details.reviewCount ?? '?'} total)`);
  console.log('Reviews fetched:', reviews.reviews.length);
  console.log('Timing (ms):', meta.timingMs);

  const sample = reviews.reviews[0];
  if (sample) {
    console.log('Sample review:', sample.rating, 'stars', sample.author ?? '(no author)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
