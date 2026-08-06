import type { Review, ReviewsResult } from '../types/common.js';
import type { ListUgcReviewsResponseRoot, PbNode } from '../types/protobuf.js';
import { asListUgcRoot } from '../types/protobuf.js';
import { safeGet } from '../utils/safe-get.js';
import { htmlToPlainText } from './shared.js';

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
