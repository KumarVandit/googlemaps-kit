import type { PlaceUgcAggregates } from '../types/ugc-aggregates.js';
import type { PbNode } from '../types/protobuf.js';
import { safeGet } from '../utils/safe-get.js';
import { parseBatchPayload } from '../rpc/batch-rpc.js';

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

  return {
    rating: typeof rating === 'number' ? rating : undefined,
    ratingDistribution: Array.isArray(distribution) ? distribution : undefined,
    totalCount: typeof totalCount === 'number' ? totalCount : undefined,
    raw: options?.raw ? root : undefined,
  };
}
