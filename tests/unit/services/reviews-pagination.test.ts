import { describe, expect, it, vi } from 'vitest';
import { ReviewsService } from '../../../src/services/reviews.js';
import type { HttpClient } from '../../../src/client/http-client.js';

describe('authenticated review fallback pagination', () => {
  it('advances RPC cursors and returns continuation when a page limit is reached', async () => {
    const service = new ReviewsService({ hasAuthCookies: () => true } as unknown as HttpClient, {});
    vi.spyOn(service, 'listBoq').mockResolvedValue({ reviewCount: 0, reviews: [] });
    vi.spyOn(service, 'listEmbedded').mockResolvedValue({ reviewCount: 0, reviews: [], totalReviews: 100 });
    const rpc = vi.spyOn(service, 'listRpc')
      .mockResolvedValueOnce({ reviewCount: 1, reviews: [{ reviewId: 'one', rating: 5 }], nextPageToken: 'cursor2' })
      .mockResolvedValueOnce({ reviewCount: 2, reviews: [{ reviewId: 'one', rating: 5 }, { reviewId: 'two', rating: 4 }], nextPageToken: 'cursor3' });

    const result = await service.listAll({ hexId: '0x1:0x2', paginationToken: 'cursor1', maxPages: 2 });

    expect(rpc.mock.calls.map(([options]) => options.paginationToken)).toEqual(['cursor1', 'cursor2']);
    expect(result.reviews.map(review => review.reviewId)).toEqual(['one', 'two']);
    expect(result.nextPageToken).toBe('cursor3');
    expect(result.totalReviews).toBe(100);
  });

  it('clears continuation when the final RPC page has no cursor', async () => {
    const service = new ReviewsService({ hasAuthCookies: () => true } as unknown as HttpClient, {});
    vi.spyOn(service, 'listBoq').mockResolvedValue({ reviewCount: 0, reviews: [] });
    vi.spyOn(service, 'listEmbedded').mockResolvedValue({ reviewCount: 0, reviews: [] });
    vi.spyOn(service, 'listRpc').mockResolvedValue({ reviewCount: 1, reviews: [{ reviewId: 'one', rating: 5 }] });
    expect((await service.listAll({ hexId: '0x1:0x2', maxPages: 2 })).nextPageToken).toBeUndefined();
  });

  it('does not retain an exhausted cursor after an empty page', async () => {
    const service = new ReviewsService({ hasAuthCookies: () => true } as unknown as HttpClient, {});
    vi.spyOn(service, 'listBoq').mockResolvedValue({ reviewCount: 0, reviews: [] });
    vi.spyOn(service, 'listEmbedded').mockResolvedValue({ reviewCount: 0, reviews: [] });
    vi.spyOn(service, 'listRpc')
      .mockResolvedValueOnce({ reviewCount: 1, reviews: [{ reviewId: 'one', rating: 5 }], nextPageToken: 'cursor2' })
      .mockResolvedValueOnce({ reviewCount: 0, reviews: [] });
    const result = await service.listAll({ hexId: '0x1:0x2', maxPages: 3 });
    expect(result.reviews).toHaveLength(1);
    expect(result.nextPageToken).toBeUndefined();
  });
});
