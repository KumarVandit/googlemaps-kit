import { HttpClient } from '../client/http-client.js';
import { extractEvChargingStations, extractChargerStatus, extractChargingPrice } from '../parsers/ev-charging.js';
import { buildEvChargingSearchArgs, buildEvChargerStatusArgs, buildEvChargingPricingArgs } from '../rpc/ev-charging-pb.js';
import { createRpcClient } from '../rpc/batch-rpc.js';
import { BATCH_SERVICES } from '../rpc/batch-services.js';
import type { GMapsConfig } from '../types/common.js';
import type { PbNode } from '../types/protobuf.js';
import type {
  EvChargerStatus,
  EvChargingPrice,
  EvChargingSearchOptions,
  EvChargingStation,
} from '../types/ev-charging.js';

export class EvChargingService {
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

  async findCharging(options: EvChargingSearchOptions): Promise<EvChargingStation[]> {
    const psi = 'anonymous';
    const rpc = await createRpcClient(this.http, this.config);

    try {
      const data = await rpc.call(BATCH_SERVICES.EV_CHARGING_SEARCH, buildEvChargingSearchArgs({
        psi,
        lat: options.location.lat,
        lng: options.location.lng,
        radiusMeters: options.radiusMeters,
      }));
      return extractEvChargingStations(data as PbNode);
    } catch {
      return [];
    }
  }

  async getStatus(chargerId: string): Promise<EvChargerStatus> {
    const rpc = await createRpcClient(this.http, this.config);

    try {
      const data = await rpc.call(BATCH_SERVICES.EV_CHARGER_STATUS, buildEvChargerStatusArgs(chargerId));
      return extractChargerStatus(data as PbNode);
    } catch (error) {
      return {
        chargerId,
        status: 'unknown',
        available: false,
        lastUpdated: new Date(),
      };
    }
  }

  async getPricing(stationId: string): Promise<EvChargingPrice> {
    const rpc = await createRpcClient(this.http, this.config);

    try {
      const data = await rpc.call(BATCH_SERVICES.EV_CHARGING_PRICING, buildEvChargingPricingArgs(stationId));
      return extractChargingPrice(data as PbNode);
    } catch (error) {
      return {
        stationId,
        currency: 'USD',
        pricing: {},
      };
    }
  }
}
