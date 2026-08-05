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
