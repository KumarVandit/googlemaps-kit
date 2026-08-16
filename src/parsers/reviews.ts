import { type ListUgcReviewsResponseRoot, type PbNode, asListUgcRoot } from '../types/protobuf.js';
import { safeGet } from '../utils/payload.js';
import { htmlToPlainText } from './shared.js';
import { type PlaceUgcAggregates } from '../types/reviews.js';
import { type PlaceReviewRatingDistribution, type ReviewClientFilters } from '../types/reviews.js';
import { parseBatchPayload } from '../rpc/batch-rpc.js';
import { type Review, type ReviewsResult } from '../types/common.js';

function isUnauthenticatedStub(data: PbNode): boolean {
  return (
    Array.isArray(data) &&
    data.length >= 6 &&
    data[0] === null &&
    data[1] === null &&
    data[2] === null &&
    data[3] === null &&
    data[4] === null &&
    data[5] === 1
  );
}

/** Parse `/maps/rpc/listugcposts` review response. */
export function extractListUgcReviews(data: PbNode): ReviewsResult {
  if (isUnauthenticatedStub(data)) {
    return { reviewCount: 0, reviews: [], unauthenticated: true };
  }

  const root = asListUgcRoot(data);
  if (!root) {
    return { reviewCount: 0, reviews: [] };
  }

  const reviews: Review[] = [];
  const nextPageToken = typeof root[1] === 'string' ? root[1] : undefined;
  const reviewsArray = Array.isArray(root[2]) ? root[2] : [];

  for (const reviewEntry of reviewsArray) {
    if (!Array.isArray(reviewEntry) || reviewEntry.length < 1) continue;

    const reviewData = Array.isArray(reviewEntry[0]) ? reviewEntry[0] : reviewEntry;
    if (!Array.isArray(reviewData)) continue;

    const rating = safeGet<number>(reviewData, 2, 0, 0);
    const rawText = safeGet<string>(reviewData, 2, 15, 0, 0);
    const review: Review = {
      reviewId: safeGet<string>(reviewData, 0),
      author: safeGet<string>(reviewData, 1, 4, 5, 0),
      authorPhoto: safeGet<string>(reviewData, 1, 4, 5, 1),
      date: safeGet<string>(reviewData, 1, 6),
      rating: typeof rating === 'number' && rating >= 1 && rating <= 5 ? rating : undefined,
      text: rawText ? htmlToPlainText(rawText) : undefined,
      source: 'rpc',
    };

    if (review.author || review.text) {
      reviews.push(review);
    }
  }

  return {
    reviewCount: reviews.length,
    reviews,
    nextPageToken,
  };
}

export type { ListUgcReviewsResponseRoot };

/**
 * Client-side review filters — anonymous Boq GET ignores server-side search/filter pb slots.
 */

function matchesSearch(review: Review, term: string): boolean {
  const needle = term.toLowerCase();
  const haystacks = [review.text, review.textPreview, review.originalText, review.ownerReply?.text];
  return haystacks.some((value) => value?.toLowerCase().includes(needle));
}

/** Apply client-side filters to parsed review rows. */
export function applyReviewClientFilters(
  result: ReviewsResult,
  filters?: ReviewClientFilters,
): ReviewsResult {
  if (!filters?.search && filters?.rating == null) {
    return result;
  }

  let reviews = result.reviews;
  if (filters.search) {
    reviews = reviews.filter((review) => matchesSearch(review, filters.search!));
  }
  if (filters.rating != null) {
    reviews = reviews.filter((review) => review.rating === filters.rating);
  }

  return {
    ...result,
    reviewCount: reviews.length,
    reviews,
    pageRatingDistribution: undefined,
  };
}

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

/**
 * Parse GetPlaceUgcPostAggregates batchexecute response.
 * Verified: rating [3][0], distribution [3][1], total [3][2] (Kake Di Hatti live + duplicates fixture).
 */
export function extractPlaceUgcAggregates(data: unknown, options?: { raw?: boolean }): PlaceUgcAggregates {
  const root = parseBatchPayload(data);
  const block = safeGet<PbNode[]>(root, 3);
  if (!Array.isArray(block)) {
    return { raw: options?.raw ? root : undefined };
  }

  const rating = safeGet<number>(block, 0);
  const distribution = safeGet<number[]>(block, 1);
  const totalCount = safeGet<number>(block, 2);

  // The wire format sends 5 elements [5★,4★,3★,2★,1★]; nulls appear when a
  // star bucket has no data. Only expose the tuple when all five are numeric.
  const ratingDistribution =
    Array.isArray(distribution) &&
    distribution.length === 5 &&
    distribution.every((n): n is number => typeof n === 'number')
      ? (distribution as [number, number, number, number, number])
      : undefined;

  return {
    rating: typeof rating === 'number' ? rating : undefined,
    ratingDistribution,
    totalCount: typeof totalCount === 'number' ? totalCount : undefined,
    raw: options?.raw ? root : undefined,
  };
}
