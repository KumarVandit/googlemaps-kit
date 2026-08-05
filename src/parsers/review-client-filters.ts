/**
 * Client-side review filters — anonymous Boq GET ignores server-side search/filter pb slots.
 */

import type { Review, ReviewsResult } from '../types/common.js';
import type { ReviewClientFilters } from '../types/reviews.js';

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
