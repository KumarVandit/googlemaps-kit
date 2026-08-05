/**
 * GetLocalBoqProxy request builder for paginated place reviews.
 */

import { BOQ_PROXY_MSC, SERVICE_GET_LOCAL_BOQ_PROXY } from './rpc-methods.js';
import { ENDPOINTS } from '../types/common.js';
import type { ReviewSortOrder } from '../types/common.js';

export interface BoqReviewsRequest {
  hexId: string;
  ftid?: string;
  limit?: number;
  sort?: ReviewSortOrder;
  paginationToken?: string;
}

export function buildBoqReviewsPayload(options: BoqReviewsRequest): unknown[] {
  const limit = options.paginationToken ? null : (options.limit ?? 10);
  const sort = options.sort ?? 1;

  const inner: unknown[] = [
    null,
    sort,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    limit,
    null,
    [options.hexId, null, null, options.ftid ?? null],
    null,
    null,
    '',
    null,
    [1, 1, null, [[3], [4], [5], [6], [7]]],
    null,
    null,
    null,
    null,
    null,
    options.paginationToken ?? null,
    0,
  ];

  return [null, [null, null, null, null, null, null, null, null, null, inner]];
}

export function buildBoqReviewsUrl(options: BoqReviewsRequest): string {
  const reqpld = JSON.stringify(buildBoqReviewsPayload(options));
  const url = new URL(ENDPOINTS.BOQ_REVIEWS);
  url.searchParams.set('msc', BOQ_PROXY_MSC);
  url.searchParams.set('reqpld', reqpld);
  return url.toString();
}

export { SERVICE_GET_LOCAL_BOQ_PROXY };
