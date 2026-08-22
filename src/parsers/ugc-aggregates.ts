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

  // The wire format always sends exactly 5 elements [5★,4★,3★,2★,1★].
  // We cast safely after verifying length to satisfy the [n,n,n,n,n] tuple type.
  const ratingDistribution =
    Array.isArray(distribution) && distribution.length === 5
      ? (distribution as [number, number, number, number, number])
      : undefined;

  return {
    rating: typeof rating === 'number' ? rating : undefined,
    ratingDistribution,
    totalCount: typeof totalCount === 'number' ? totalCount : undefined,
    raw: options?.raw ? root : undefined,
  };
}
