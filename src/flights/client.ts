import { TravelRpc } from '../travel-google/common.js';
import { buildFlightSearchArgs, parseFlightSearchResponse } from './parsers.js';
import type { FlightSearchOptions, FlightSearchResult, FlightsConfig } from './types.js';

export class FlightsClient {
  private readonly rpc: TravelRpc;
  constructor(config: FlightsConfig = {}) { this.rpc = new TravelRpc('flights', config); }
  /** Searches one-way economy fares for one adult using exact airport codes and a departure date. */
  async search(options: FlightSearchOptions): Promise<FlightSearchResult> {
    const args = buildFlightSearchArgs(options);
    const raw = await this.rpc.call('LqxFAb', args, options);
    return parseFlightSearchResponse(raw, options, this.rpc.currency, this.rpc.language);
  }
}
export function flights(config: FlightsConfig = {}): FlightsClient { return new FlightsClient(config); }
