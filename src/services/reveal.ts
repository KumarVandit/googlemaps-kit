import { HttpClient } from '../client/http-client.js';
import { extractRevealPlace } from '../parsers/reveal.js';
import { buildRevealUrl, normalizeRevealFtid } from '../rpc/reveal-pb.js';
import type { GMapsConfig } from '../types/common.js';
import type { RevealPlaceOptions, RevealPlaceResult } from '../types/reveal.js';

export class RevealService {
  private http: HttpClient;
  private hl: string;
  private gl: string;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.http = http;
    this.hl = config.hl ?? 'en';
    this.gl = config.gl ?? 'us';
  }

  /**
   * Reveal a hidden POI at a map click location.
   * Requires a feature id (`ftid`) from search/suggest or place preview.
   */
  async revealAtClick(options: RevealPlaceOptions): Promise<RevealPlaceResult> {
    if (!options.ftid) {
      return {};
    }

    const url = buildRevealUrl({
      camLat: options.camLat,
      camLng: options.camLng,
      camZoom: options.camZoom,
      hitLat: options.hitLat,
      hitLng: options.hitLng,
      ftid: normalizeRevealFtid(options.ftid),
      width: options.width,
      height: options.height,
      tileX: options.tileX,
      tileY: options.tileY,
      hl: this.hl,
      gl: this.gl,
    });

    const data = await this.http.get(url, {
      referer: 'https://www.google.com/maps/',
      includeOrigin: true,
    });

    return extractRevealPlace(data as import('../types/protobuf.js').PbNode);
  }
}
