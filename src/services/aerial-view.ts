import { HttpClient } from '../client/http-client.js';
import { GMapsError } from '../types/common.js';
import type { GMapsConfig } from '../types/common.js';
import type {
  AerialViewLookupOptions,
  AerialViewLookupResult,
  AerialViewRenderOptions,
} from '../types/aerial-view.js';

const AERIAL_VIEW_BASE = 'https://aerialview.googleapis.com/v1';

export class AerialViewService {
  private http: HttpClient;
  private defaultApiKey?: string;

  constructor(http: HttpClient, config: GMapsConfig = {}) {
    this.http = http;
    this.defaultApiKey =
      config.aerialViewApiKey ?? process.env.GMAPS_AERIAL_VIEW_API_KEY;
  }

  /** Check whether a cinematic aerial video exists for an address (requires apiKey). */
  async lookupMetadata(options: AerialViewLookupOptions): Promise<AerialViewLookupResult> {
    return this.call('videos:lookupVideoMetadata', options);
  }

  /**
   * Fetch short-lived video URIs for an address or stored video id.
   * Call on every display — URIs expire quickly.
   */
  async lookupVideo(options: AerialViewLookupOptions): Promise<AerialViewLookupResult> {
    return this.call('videos:lookupVideo', options);
  }

  /** Request rendering when lookup returns 404 / not found. */
  async renderVideo(options: AerialViewRenderOptions): Promise<AerialViewLookupResult> {
    const apiKey = this.resolveApiKey(options.apiKey);
    const params = new URLSearchParams();
    params.set('address', options.address);
    const url = `${AERIAL_VIEW_BASE}/videos:renderVideo?${params.toString()}`;

    try {
      const body = await this.http.get<string>(url, {
        extraHeaders: { 'X-Goog-Api-Key': apiKey },
        raw: true,
        noRetry: true,
        referer: 'https://mapsplatform.google.com/',
      });
      return this.parsePayload(JSON.parse(body));
    } catch (error) {
      return this.errorResult(error);
    }
  }

  private async call(
    method: 'videos:lookupVideo' | 'videos:lookupVideoMetadata',
    options: AerialViewLookupOptions,
  ): Promise<AerialViewLookupResult> {
    const apiKey = this.resolveApiKey(options.apiKey);
    if (!options.address && !options.videoId) {
      throw new GMapsError('Aerial View lookup requires address or videoId');
    }

    const params = new URLSearchParams();
    if (options.address) params.set('address', options.address);
    if (options.videoId) params.set('videoId', options.videoId);
    const url = `${AERIAL_VIEW_BASE}/${method}?${params.toString()}`;

    try {
      const body = await this.http.get<string>(url, {
        extraHeaders: { 'X-Goog-Api-Key': apiKey },
        raw: true,
        noRetry: true,
        referer: 'https://mapsplatform.google.com/',
      });
      return this.parsePayload(JSON.parse(body));
    } catch (error) {
      return this.errorResult(error);
    }
  }

  private resolveApiKey(override?: string): string {
    const key = override ?? this.defaultApiKey;
    if (!key) {
      throw new GMapsError(
        'Aerial View requires apiKey (options.apiKey, config.aerialViewApiKey, or GMAPS_AERIAL_VIEW_API_KEY).',
      );
    }
    return key;
  }

  private parsePayload(data: unknown): AerialViewLookupResult {
    if (!data || typeof data !== 'object') {
      return { state: 'PROCESSING', error: 'Empty aerial view response' };
    }

    const record = data as Record<string, unknown>;
    if (record.error && typeof record.error === 'object') {
      const err = record.error as Record<string, unknown>;
      return {
        state: 'PROCESSING',
        error: String(err.message ?? 'Aerial view request failed'),
        statusCode: typeof err.code === 'number' ? err.code : undefined,
      };
    }

    const state = record.state === 'ACTIVE' || record.state === 'PROCESSING'
      ? record.state
      : 'PROCESSING';

    const metadata =
      record.metadata && typeof record.metadata === 'object'
        ? (record.metadata as AerialViewLookupResult['metadata'])
        : undefined;

    const uris =
      record.uris && typeof record.uris === 'object'
        ? (record.uris as AerialViewLookupResult['uris'])
        : undefined;

    return { state, metadata, uris };
  }

  private errorResult(error: unknown): AerialViewLookupResult {
    const message = error instanceof Error ? error.message : String(error);
    const statusMatch = /HTTP (\d+)/.exec(message);
    const statusCode = statusMatch ? Number(statusMatch[1]) : undefined;
    return {
      state: 'PROCESSING',
      error: message,
      statusCode,
    };
  }
}
