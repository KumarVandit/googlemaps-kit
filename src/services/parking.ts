import { HttpClient } from '../client/http-client.js';
import { extractParkingResults, extractParkingAvailability, extractParkingPrice } from '../parsers/parking.js';
import { buildParkingSearchArgs, buildParkingAvailabilityArgs, buildParkingPricingArgs } from '../rpc/parking-pb.js';
import { createRpcClient } from '../rpc/batch-rpc.js';
import { BATCH_SERVICES } from '../rpc/batch-services.js';
import type { GMapsConfig } from '../types/common.js';
import type { PbNode } from '../types/protobuf.js';
import type {
  Parking,
  ParkingAvailability,
  ParkingPrice,
  ParkingSearchOptions,
} from '../types/parking.js';

export class ParkingService {
  private http: HttpClient;
  private hl: string;
  private gl: string;
  private config: GMapsConfig;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.http = http;
    this.hl = config.hl ?? 'en';
    this.gl = config.gl ?? 'us';
    this.config = config;
  }

  async search(options: ParkingSearchOptions): Promise<Parking[]> {
    const psi = 'anonymous';
    const rpc = await createRpcClient(this.http, this.config);

    try {
      const data = await rpc.call(BATCH_SERVICES.PARKING_SEARCH, buildParkingSearchArgs({
        psi,
        lat: options.location.lat,
        lng: options.location.lng,
        radiusMeters: options.radiusMeters,
      }));
      return extractParkingResults(data as PbNode);
    } catch {
      return [];
    }
  }

  async getAvailability(parkingId: string): Promise<ParkingAvailability> {
    const rpc = await createRpcClient(this.http, this.config);

    const data = await rpc.call(BATCH_SERVICES.PARKING_AVAILABILITY, buildParkingAvailabilityArgs(parkingId));
    return extractParkingAvailability(data as PbNode);
  }

  async getPricing(parkingId: string): Promise<ParkingPrice> {
    const rpc = await createRpcClient(this.http, this.config);

    const data = await rpc.call(BATCH_SERVICES.PARKING_PRICING, buildParkingPricingArgs(parkingId));
    return extractParkingPrice(data as PbNode);
  }
}
