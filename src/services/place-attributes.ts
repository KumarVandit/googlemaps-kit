import { HttpClient } from '../client/http-client.js';
import { extractAttributeCatalog, getCategoryAttributes, getAttributesByType } from '../parsers/place-attributes.js';
import { createRpcClient } from '../rpc/batch-rpc.js';
import { BATCH_SERVICES } from '../rpc/batch-services.js';
import type { GMapsConfig } from '../types/common.js';
import type { PbNode } from '../types/protobuf.js';
import type { Attribute, AttributeCategory } from '../types/place-attributes.js';

export class PlaceAttributesService {
  private http: HttpClient;
  private hl: string;
  private gl: string;
  private config: GMapsConfig;
  private catalogCache?: AttributeCategory[];

  constructor(http: HttpClient, config: GMapsConfig) {
    this.http = http;
    this.hl = config.hl ?? 'en';
    this.gl = config.gl ?? 'us';
    this.config = config;
  }

  async getAll(): Promise<AttributeCategory[]> {
    if (this.catalogCache) {
      return this.catalogCache;
    }

    const psi = 'anonymous';
    const rpc = await createRpcClient(this.http, this.config);

    try {
      const data = await rpc.call(
        '/MapsPlaceAttributesService.GetAttributeCatalog',
        [{ psi }],
      );

      const catalog = extractAttributeCatalog(data as PbNode);
      this.catalogCache = catalog;
      return catalog;
    } catch {
      return [];
    }
  }

  async byCategory(category: string): Promise<Attribute[]> {
    const catalog = await this.getAll();
    return getCategoryAttributes(catalog, category);
  }

  async byType(
    type: 'accessibility' | 'parking' | 'payment' | 'amenities',
  ): Promise<Attribute[]> {
    const catalog = await this.getAll();
    return getAttributesByType(catalog, type);
  }
}
