import { HttpClient } from '../client/http-client.js';
import { extractPlaceDetails } from '../parsers/place.js';
import {
  extractKnowledgeEntity,
  extractKnowledgeFromPlaceDetails,
} from '../parsers/knowledge.js';
import { buildKnowledgeUrl, buildPlaceUrl } from '../rpc/pb-builders.js';
import type { GMapsConfig, KnowledgeEntity, PlaceDetails } from '../types/common.js';
import type { PbNode } from '../types/protobuf.js';
import { buildPlaceReferer } from '../utils/place-ref.js';

export interface GetKnowledgeOptions {
  hexId: string;
  name?: string;
  lat?: number;
  lng?: number;
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
   * When `fallbackDetails` is omitted, fetches a live place preview and derives facts from
   * categories and amenities — getknowledgeentity returns HTTP 400 for every pb variant.
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

    const fallback =
      options.fallbackDetails ?? (await this.fetchPreviewDetails(options));
    if (fallback) {
      return this.fromPlaceDetails(fallback);
    }
    return null;
  }

  private async fetchPreviewDetails(
    options: Pick<GetKnowledgeOptions, 'hexId' | 'ftid' | 'name' | 'lat' | 'lng'>,
  ): Promise<PlaceDetails | null> {
    try {
      const url = buildPlaceUrl({
        hexId: options.hexId,
        ftid: options.ftid,
        name: options.name,
        lat: options.lat,
        lng: options.lng,
        hl: this.hl,
        gl: this.gl,
        mode: 'live',
      });
      const data = await this.http.get(url, {
        referer: buildPlaceReferer(options.name),
        includeOrigin: true,
      });
      return extractPlaceDetails(data as PbNode);
    } catch {
      return null;
    }
  }

  private fromPlaceDetails(details: PlaceDetails): KnowledgeEntity | null {
    const entity = extractKnowledgeFromPlaceDetails(details);
    if (entity.name || entity.description || entity.facts?.length) {
      return entity;
    }
    return null;
  }
}
