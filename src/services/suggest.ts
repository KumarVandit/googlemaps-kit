import { HttpClient } from '../client/http-client.js';
import { extractSuggestions } from '../parsers/suggest.js';
import {
  buildSuggestUrl,
  DEFAULT_SUGGEST_LAT,
  DEFAULT_SUGGEST_LNG,
} from '../rpc/suggest-pb.js';
import type { GMapsConfig } from '../types/common.js';
import type { SuggestOptions, SuggestResult } from '../types/suggest.js';

export class SuggestService {
  private http: HttpClient;
  private hl: string;
  private gl: string;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.http = http;
    this.hl = config.hl ?? 'en';
    this.gl = config.gl ?? 'us';
  }

  /** Maps omnibox autocomplete — query completions and place suggestions. */
  async suggest(options: SuggestOptions): Promise<SuggestResult> {
    const lat = options.lat ?? DEFAULT_SUGGEST_LAT;
    const lng = options.lng ?? DEFAULT_SUGGEST_LNG;
    const hl = options.hl ?? this.hl;
    const gl = options.gl ?? this.gl;

    const url = buildSuggestUrl({
      query: options.query,
      lat,
      lng,
      altitude: options.altitude,
      zoom: options.zoom,
      screenWidth: options.screenWidth,
      screenHeight: options.screenHeight,
      hl,
      gl,
      sessionToken: options.sessionToken,
    });

    const data = await this.http.get<unknown>(url, {
      referer: 'https://www.google.com/maps/',
    });

    return extractSuggestions(data, { raw: options.raw });
  }
}
