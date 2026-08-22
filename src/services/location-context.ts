import { HttpClient } from '../client/http-client.js';
import { extractNearbyAreas, extractAdminRegions } from '../parsers/location-context.js';
import { buildLocationContextNearbyArgs, buildLocationContextRegionsArgs } from '../rpc/location-context-pb.js';
import { createRpcClient } from '../rpc/batch-rpc.js';
import { BATCH_SERVICES } from '../rpc/batch-services.js';
import type { GMapsConfig } from '../types/common.js';
import type { PbNode } from '../types/protobuf.js';
import type {
  AdminRegion,
  GeoArea,
  NearbyAreasOptions,
} from '../types/location-context.js';

export class LocationContextService {
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

  async getNearby(options: NearbyAreasOptions): Promise<GeoArea[]> {
    const psi = 'anonymous';
    const rpc = await createRpcClient(this.http, this.config);

    try {
      const data = await rpc.call(
        BATCH_SERVICES.LOCATION_CONTEXT_NEARBY,
        buildLocationContextNearbyArgs({
          psi,
          lat: options.location.lat,
          lng: options.location.lng,
          radiusMeters: options.radiusMeters,
        }),
      );
      return extractNearbyAreas(data as PbNode);
    } catch {
      return [];
    }
  }

  async getAreas(coordinates: { lat: number; lng: number }): Promise<GeoArea[]> {
    return this.getNearby({
      location: coordinates,
    });
  }

  async getRegions(coordinates: { lat: number; lng: number }): Promise<AdminRegion[]> {
    const psi = 'anonymous';
    const rpc = await createRpcClient(this.http, this.config);

    try {
      const data = await rpc.call(
        BATCH_SERVICES.LOCATION_CONTEXT_REGIONS,
        buildLocationContextRegionsArgs({
          psi,
          lat: coordinates.lat,
          lng: coordinates.lng,
        }),
      );
      return extractAdminRegions(data as PbNode);
    } catch {
      return [];
    }
  }
}
