import { TravelRpc } from '../travel-google/common.js';
import { buildHotelSearchArgs, parseHotelSearchResponse } from './parsers.js';
import type { HotelSearchOptions, HotelSearchResult, HotelsConfig } from './types.js';
export class HotelsClient {
  private readonly rpc: TravelRpc;
  constructor(config: HotelsConfig = {}) { this.rpc = new TravelRpc('hotels', config); }
  /** Searches Google Hotels for explicit stay dates and preserves Google's displayed price basis. */
  async search(options: HotelSearchOptions): Promise<HotelSearchResult> {
    const args = buildHotelSearchArgs(options, this.rpc.currency);
    const raw = await this.rpc.call('MQghPc', args, options);
    return parseHotelSearchResponse(raw, options, this.rpc.currency);
  }
}
export function hotels(config: HotelsConfig = {}): HotelsClient { return new HotelsClient(config); }
