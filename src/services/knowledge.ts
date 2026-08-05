import { HttpClient } from '../client/http-client.js';
import {
  extractKnowledgeEntity,
  extractKnowledgeFromPlaceDetails,
} from '../parsers/knowledge.js';
import { buildKnowledgeUrl } from '../rpc/pb-builders.js';
import type { GMapsConfig, KnowledgeEntity, PlaceDetails } from '../types/common.js';
import type { PbNode } from '../types/protobuf.js';

export interface GetKnowledgeOptions {
  hexId: string;
  ftid?: string;
  placeId?: string;
  /** Use place preview fields when the RPC surface is unavailable. */
  fallbackDetails?: PlaceDetails;
  /** Try getknowledgeentity RPC even when fallbackDetails is set (default false). */
  tryRpc?: boolean;
}

export class KnowledgeService {
  private http: HttpClient;
  private hl: string;
  private gl: string;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.http = http;
    this.hl = config.hl ?? 'en';
    this.gl = config.gl ?? 'us';
  }

  /**
   * Fetch knowledge entity data for a place.
   * By default uses place-preview fallback — getknowledgeentity returns HTTP 400 for every
   * pb variant and the path is absent from captured JS (no client-side pb builder to imitate).
   */
  async get(options: GetKnowledgeOptions): Promise<KnowledgeEntity | null> {
    if (options.fallbackDetails && options.tryRpc !== true) {
      return this.fromPlaceDetails(options.fallbackDetails);
    }

    const variants = buildKnowledgeUrl({
      hexId: options.hexId,
      ftid: options.ftid,
      placeId: options.placeId,
      hl: this.hl,
      gl: this.gl,
    }).slice(0, 1);

    for (const url of variants) {
      try {
        const data = await this.http.get(url, {
          referer: 'https://www.google.com/maps/',
          includeOrigin: true,
          allowShortBody: true,
          noRetry: true,
        }) as PbNode;
        const entity = extractKnowledgeEntity(data);
        if (entity.name || entity.description || entity.facts?.length) {
          return entity;
        }
      } catch {
        // RPC unavailable — use fallback below
      }
    }

    if (options.fallbackDetails) {
      return this.fromPlaceDetails(options.fallbackDetails);
    }
    return null;
  }

  private fromPlaceDetails(details: PlaceDetails): KnowledgeEntity | null {
    const entity = extractKnowledgeFromPlaceDetails(details);
    if (entity.name || entity.description || entity.facts?.length) {
      return entity;
    }
    return null;
  }
}
