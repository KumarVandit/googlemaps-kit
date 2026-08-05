import type { PlaceUgcAggregates } from '../types/ugc-aggregates.js';
import type { PlaceReviewRatingDistribution } from '../types/reviews.js';

/** Convert batchexecute histogram (index 0 = 5-star) to named buckets. */
export function placeAggregatesToRatingDistribution(
  aggregates: PlaceUgcAggregates,
): PlaceReviewRatingDistribution | undefined {
  const buckets = aggregates.ratingDistribution;
  if (!Array.isArray(buckets) || buckets.length < 5) return undefined;

  return {
    fiveStar: buckets[0] ?? 0,
    fourStar: buckets[1] ?? 0,
    threeStar: buckets[2] ?? 0,
    twoStar: buckets[3] ?? 0,
    oneStar: buckets[4] ?? 0,
  };
}

/** Sum histogram buckets — should match totalCount when Google sends a complete aggregate. */
export function sumRatingDistribution(dist: PlaceReviewRatingDistribution): number {
  return dist.oneStar + dist.twoStar + dist.threeStar + dist.fourStar + dist.fiveStar;
}
