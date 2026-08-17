

/**
 * Feature-layer batchexecute RPC calls (directions, air-quality, map-actions, etc.).
 *
 * Note: place/search/reviews use GET pb surfaces — not these batchexecute rpcids.
 */

import type { GMapsRpcClient } from './rpc-client.js';
import { FEATURE_RPC } from './rpc-methods.js';

export type FeatureRpcName = keyof typeof FEATURE_RPC;

export interface FeatureRpcCallOptions {
  args?: unknown[];
  urlParams?: Record<string, string>;
}

export class FeatureRpcService {
  constructor(private readonly rpc: GMapsRpcClient) {}

  async callFeature(name: FeatureRpcName, options: FeatureRpcCallOptions = {}): Promise<unknown> {
    const rpcid = FEATURE_RPC[name];
    return this.rpc.call(rpcid, options.args ?? [], options.urlParams);
  }

  async directions(args: unknown[] = [], urlParams?: Record<string, string>): Promise<unknown> {
    return this.callFeature('DIRECTIONS', { args, urlParams });
  }

  async airQuality(args: unknown[] = [], urlParams?: Record<string, string>): Promise<unknown> {
    return this.callFeature('AIR_QUALITY', { args, urlParams });
  }

  async mapActions(args: unknown[] = [], urlParams?: Record<string, string>): Promise<unknown> {
    return this.callFeature('MAP_ACTIONS', { args, urlParams });
  }

  async categoricalSearch(args: unknown[] = [], urlParams?: Record<string, string>): Promise<unknown> {
    return this.callFeature('CATEGORICAL_SEARCH', { args, urlParams });
  }

  async placeData(args: unknown[] = [], urlParams?: Record<string, string>): Promise<unknown> {
    return this.callFeature('PLACE_DATA', { args, urlParams });
  }

  async destinations(args: unknown[] = [], urlParams?: Record<string, string>): Promise<unknown> {
    return this.callFeature('DESTINATIONS', { args, urlParams });
  }

  async airQualityHeatmap(args: unknown[] = [], urlParams?: Record<string, string>): Promise<unknown> {
    return this.callFeature('AIR_QUALITY_HEATMAP', { args, urlParams });
  }

  async crisisWildfires(args: unknown[] = [], urlParams?: Record<string, string>): Promise<unknown> {
    return this.callFeature('CRISIS_WILDFIRES', { args, urlParams });
  }
}

export function createFeatureRpcService(rpc: GMapsRpcClient): FeatureRpcService {
  return new FeatureRpcService(rpc);
}

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
