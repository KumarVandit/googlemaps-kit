import { describe, expect, it, vi, beforeEach } from 'vitest';
import { IntentApi } from '../../../src/client/intent.js';
import type { ServiceBundle } from '../../../src/client/namespaces.js';
import type { ReviewsResult } from '../../../src/types/common.js';

function makeReviewsResult(overrides: Partial<ReviewsResult> = {}): ReviewsResult {
  return {
    reviewCount: 2,
    reviews: [
      { author: 'A', rating: 5, source: 'boq' },
      { author: 'B', rating: 4, source: 'boq' },
    ],
    totalReviews: 100,
    aggregateRating: 4.2,
    ratingDistribution: {
      oneStar: 5,
      twoStar: 5,
      threeStar: 10,
      fourStar: 20,
      fiveStar: 60,
    },
    ...overrides,
  };
}

describe('IntentApi profile includeAggregates', () => {
  let getFull: ReturnType<typeof vi.fn>;
  let knowledgeGet: ReturnType<typeof vi.fn>;
  let intent: IntentApi;

  beforeEach(() => {
    getFull = vi.fn().mockResolvedValue({
      details: { name: 'Test Place', rating: 4.2, placeId: 'pid' },
      reviews: makeReviewsResult(),
      meta: {
        fetchedAt: '',
        previewMode: 'live',
        sources: {
          preview: true,
          reviewsBoq: true,
          reviewsEmbedded: false,
          reviewsRpc: false,
          localPosts: false,
        },
      },
    });
    knowledgeGet = vi.fn().mockResolvedValue({
      name: 'Test Place',
      facts: ['Restaurant'],
      source: 'place-fallback',
    });

    const services = {
      places: { get: vi.fn(), getFull },
      reviews: { list: vi.fn() },
      knowledge: { get: knowledgeGet },
    } as unknown as ServiceBundle;

    intent = new IntentApi(services, {}, () => false);
  });

  it('passes includeAggregates through to getFull', async () => {
    const profile = await intent.profile(
      { hexId: '0xabc:0xdef', name: 'Test', lat: 1, lng: 2 },
      { depth: 'full', includeAggregates: true },
    );

    expect(getFull).toHaveBeenCalledWith(
      expect.objectContaining({ includeAggregates: true }),
      expect.anything(),
    );
    expect(profile.reviews?.ratingDistribution?.fiveStar).toBe(60);
  });

  it('passes includeAggregates through to getFull on complete depth', async () => {
    await intent.profile({ hexId: '0xabc:0xdef' }, { depth: 'complete', includeAggregates: true });

    expect(getFull).toHaveBeenCalledWith(
      expect.objectContaining({ includeAggregates: true }),
      expect.anything(),
    );
    expect(knowledgeGet).toHaveBeenCalled();
  });
});
