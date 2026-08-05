/**
 * Parser for GetLocalBoqProxy review responses.
 */

import type { Review, ReviewRatingDistribution, ReviewsResult } from '../types/common.js';
import type {
  ReviewAttribute,
  ReviewOwnerReply,
  ReviewPhoto,
  ReviewerCredibility,
  ReviewTranslation,
} from '../types/reviews.js';
import type { PbNode } from '../types/protobuf.js';
import { asBoqRoot } from '../types/protobuf.js';
import { normalizePhotoUrl } from '../utils/photo-url.js';
import { safeGet } from '../utils/safe-get.js';
import { htmlToPlainText } from './shared.js';

function isGoogleUserContentUrl(value: PbNode): value is string {
  return typeof value === 'string' && value.includes('googleusercontent.com');
}

function parseLocalGuideLevel(authorPhoto?: string, levelBlock?: PbNode): number | undefined {
  if (typeof authorPhoto === 'string') {
    const match = authorPhoto.match(/-ba(\d+)-/i);
    if (match) return Number.parseInt(match[1]!, 10);
  }
  if (Array.isArray(levelBlock) && typeof levelBlock[1] === 'number' && levelBlock[1] > 0) {
    return levelBlock[1];
  }
  return undefined;
}

function parseReviewerCredibility(authorInfo: PbNode[] | undefined): ReviewerCredibility | undefined {
  if (!Array.isArray(authorInfo)) return undefined;

  const reviewCount = typeof authorInfo[3] === 'number' ? authorInfo[3] : undefined;
  const photoCount = typeof authorInfo[4] === 'number' ? authorInfo[4] : undefined;
  const authorPhoto = typeof authorInfo[1] === 'string' ? authorInfo[1] : undefined;
  const localGuideLevel = parseLocalGuideLevel(authorPhoto, authorInfo[5]);
  const isLocalGuide =
    localGuideLevel != null ||
    (typeof authorPhoto === 'string' && /-ba\d+-/i.test(authorPhoto));

  if (
    reviewCount == null &&
    photoCount == null &&
    localGuideLevel == null &&
    !isLocalGuide
  ) {
    return undefined;
  }

  return { reviewCount, photoCount, localGuideLevel, isLocalGuide: isLocalGuide || undefined };
}

function parseOwnerReply(block: PbNode): ReviewOwnerReply | undefined {
  if (!Array.isArray(block)) return undefined;
  const date = typeof block[1] === 'string' ? block[1] : undefined;
  const rawText = typeof block[2] === 'string' ? block[2] : undefined;
  const text = rawText ? htmlToPlainText(rawText) : undefined;
  if (!date && !text) return undefined;
  return { date, text };
}

function parseReviewPhotos(review: PbNode[]): ReviewPhoto[] {
  const photosNode = review[14];
  if (!Array.isArray(photosNode)) return [];

  const photos: ReviewPhoto[] = [];
  for (const entry of photosNode) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string') continue;
    const url = entry[0].startsWith('//') ? `https:${entry[0]}` : entry[0];
    if (!url.includes('googleusercontent.com')) continue;

    photos.push({
      photoId: typeof entry[3] === 'string' ? entry[3] : undefined,
      url,
      normalizedUrl: normalizePhotoUrl(url),
      caption: typeof entry[1] === 'string' && entry[1].length > 0 ? entry[1] : undefined,
      aspectRatio: typeof entry[4] === 'number' ? entry[4] : undefined,
      videoUrl: typeof entry[5] === 'string' ? entry[5] : undefined,
      uploadDate: typeof entry[6] === 'string' ? entry[6] : undefined,
    });
  }

  return photos;
}

function parseAttributeValue(entry: PbNode[]): string | undefined {
  const choiceBlock = entry[2];
  if (Array.isArray(choiceBlock)) {
    const row = choiceBlock[0];
    if (Array.isArray(row)) {
      const selected = row[0];
      if (Array.isArray(selected) && typeof selected[1] === 'string') {
        return selected[1];
      }
    }
  }

  const altBlock = entry[3];
  if (Array.isArray(altBlock)) {
    const row = altBlock[0];
    if (Array.isArray(row)) {
      const selected = row[0];
      if (Array.isArray(selected) && typeof selected[1] === 'string') {
        return selected[1];
      }
    }
  }

  return undefined;
}

function parseReviewAttributes(review: PbNode[]): ReviewAttribute[] {
  const attrsNode = review[30];
  if (!Array.isArray(attrsNode)) return [];

  const attributes: ReviewAttribute[] = [];
  for (const entry of attrsNode) {
    if (!Array.isArray(entry) || !Array.isArray(entry[0])) continue;
    const keyNode = entry[0];
    let key: string | undefined;
    if (Array.isArray(keyNode)) {
      const first = keyNode[0];
      if (typeof first === 'string') {
        key = first;
      } else if (Array.isArray(first) && typeof first[0] === 'string') {
        key = first[0];
      }
    }
    if (!key) continue;

    const label =
      typeof entry[5] === 'string'
        ? entry[5]
        : typeof entry[1] === 'string'
          ? entry[1]
          : key;

    const aspectRatings = entry[11];
    const rating =
      Array.isArray(aspectRatings) && typeof aspectRatings[0] === 'number'
        ? aspectRatings[0]
        : undefined;

    const value = parseAttributeValue(entry);

    attributes.push({
      key,
      label,
      value,
      rating: rating != null && rating >= 1 && rating <= 5 ? rating : undefined,
    });
  }

  return attributes;
}

function parseTranslation(review: PbNode[]): ReviewTranslation | undefined {
  const language = typeof review[26] === 'string' ? review[26] : undefined;
  const fullTextRaw = typeof review[27] === 'string' ? review[27] : undefined;
  const previewRaw = typeof review[28] === 'string' ? review[28] : undefined;
  const originalRaw = typeof review[32] === 'string' && review[32].length > 0 ? review[32] : undefined;
  const translationBlock = review[44];
  const isTranslated =
    Array.isArray(translationBlock) && translationBlock[4] === 1 ? true : undefined;

  const text = fullTextRaw ? htmlToPlainText(fullTextRaw) : undefined;
  const textPreview = previewRaw ? htmlToPlainText(previewRaw) : undefined;
  const originalText = originalRaw ? htmlToPlainText(originalRaw) : undefined;

  if (!language && !text && !textPreview && !originalText && isTranslated == null) {
    return undefined;
  }

  return { language, isTranslated, text, textPreview, originalText };
}

function parseSingleReview(review: PbNode): Review | null {
  if (!Array.isArray(review) || review.length < 6) {
    return null;
  }

  const rating = review[1];
  const timeInfo = review[2];
  const authorInfo = review[3];
  const reviewId = review[5];
  const translation = parseTranslation(review);
  const structuredPhotos = parseReviewPhotos(review);
  const attributes = parseReviewAttributes(review);
  const ownerReply = parseOwnerReply(review[4] ?? null);
  const credibility = parseReviewerCredibility(Array.isArray(authorInfo) ? authorInfo : undefined);
  const helpfulCount = typeof review[29] === 'number' ? review[29] : undefined;
  const permalink = typeof review[12] === 'string' ? review[12] : undefined;
  const timestampMs = Array.isArray(timeInfo) && typeof timeInfo[2] === 'string' ? timeInfo[2] : undefined;

  const parsed: Review = {
    reviewId: typeof reviewId === 'string' ? reviewId : undefined,
    rating: typeof rating === 'number' && rating >= 1 && rating <= 5 ? rating : undefined,
    date: Array.isArray(timeInfo) && typeof timeInfo[0] === 'string' ? timeInfo[0] : undefined,
    timestampMs,
    author: Array.isArray(authorInfo) && typeof authorInfo[0] === 'string' ? authorInfo[0] : undefined,
    authorPhoto:
      Array.isArray(authorInfo) && authorInfo[1] != null && isGoogleUserContentUrl(authorInfo[1])
        ? authorInfo[1]
        : undefined,
    profileUrl: Array.isArray(authorInfo) && typeof authorInfo[2] === 'string' ? authorInfo[2] : undefined,
    credibility,
    text: translation?.text,
    textPreview: translation?.textPreview,
    language: translation?.language,
    translation,
    originalText: translation?.originalText,
    isTranslated: translation?.isTranslated,
    ownerReply,
    helpfulCount,
    permalink,
    attributes: attributes.length > 0 ? attributes : undefined,
    photoItems: structuredPhotos.length > 0 ? structuredPhotos : undefined,
    photos: structuredPhotos.length > 0 ? structuredPhotos.map((p) => p.normalizedUrl) : undefined,
    source: 'boq',
  };

  if (!parsed.author && !parsed.text) {
    return null;
  }

  return parsed;
}

/** Star counts for the supplied reviews only — not the place aggregate histogram. */
function buildRatingDistribution(reviews: Review[]): ReviewRatingDistribution | undefined {
  const dist: ReviewRatingDistribution = {
    oneStar: 0,
    twoStar: 0,
    threeStar: 0,
    fourStar: 0,
    fiveStar: 0,
  };

  let counted = 0;
  for (const review of reviews) {
    switch (review.rating) {
      case 1:
        dist.oneStar++;
        counted++;
        break;
      case 2:
        dist.twoStar++;
        counted++;
        break;
      case 3:
        dist.threeStar++;
        counted++;
        break;
      case 4:
        dist.fourStar++;
        counted++;
        break;
      case 5:
        dist.fiveStar++;
        counted++;
        break;
      default:
        break;
    }
  }

  return counted > 0 ? dist : undefined;
}

/** Parse GetLocalBoqProxy JSON response into reviews. */
export function extractBoqReviews(data: PbNode): ReviewsResult {
  const root = asBoqRoot(data);
  const reviewsNode = root ? safeGet<PbNode[]>(root, 1, 10) : undefined;
  const reviewsArray = Array.isArray(reviewsNode?.[2]) ? (reviewsNode[2] as PbNode[]) : [];
  const nextPageToken = typeof reviewsNode?.[6] === 'string' ? reviewsNode[6] : undefined;

  const reviews: Review[] = [];
  for (const entry of reviewsArray) {
    const review = parseSingleReview(entry);
    if (review) {
      reviews.push(review);
    }
  }

  return {
    reviewCount: reviews.length,
    reviews,
    nextPageToken,
    pageRatingDistribution: buildRatingDistribution(reviews),
  };
}
