import { HttpClient } from '../client/http-client.js';
import { extractGeocodeResults, toGeocodeResponse } from '../parsers/geocode.js';
import { buildSearchUrl } from '../rpc/pb-builders.js';
import type { GMapsConfig } from '../types/common.js';
import type { GeocodeOptions, GeocodeResponse, ReverseGeocodeOptions } from '../types/geocode.js';
import type { PbNode } from '../types/protobuf.js';
import { find as findTimezones } from 'geo-tz';
import type { TimezoneOptions, TimezoneResult } from '../types/geocode.js';
import {
  buildTimezoneResult,
  extractTimezoneFromGeocodeResults,
  localityQueriesFromReverseHit,
} from '../parsers/geocode.js';

const DEFAULT_RESULTS_COUNT = 1;
const DEFAULT_MAX_RADIUS = 50_000;
const DEFAULT_FORWARD_ZOOM = 15;
const DEFAULT_REVERSE_ZOOM = 17;

type FetchOptions = GeocodeOptions | ReverseGeocodeOptions;

export class GeocodeService {
  private http: HttpClient;
  private hl: string;
  private gl: string;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.http = http;
    this.hl = config.hl ?? 'en';
    this.gl = config.gl ?? 'us';
  }

  /** Forward geocode: address string → coordinates and place metadata. */
  async geocode(address: string, options?: GeocodeOptions): Promise<GeocodeResponse> {
    const trimmed = address.trim();
    if (!trimmed) {
      return { result: null, alternatives: [] };
    }

    const lat = options?.lat ?? 0;
    const lng = options?.lng ?? 0;

    return this.fetch(trimmed, lat, lng, {
      ...options,
      zoom: options?.zoom ?? DEFAULT_FORWARD_ZOOM,
    });
  }

  /**
   * Reverse geocode: coordinates → nearest place / Plus Code address.
   *
   * Query formulation: `q={lat},{lng}` with the search pb camera centred on the same
   * coordinates (verified live against Paris, NYC and Bangalore probes).
   */
  async reverseGeocode(
    lat: number,
    lng: number,
    options?: ReverseGeocodeOptions,
  ): Promise<GeocodeResponse> {
    const query = `${lat},${lng}`;
    return this.fetch(query, lat, lng, {
      ...options,
      zoom: options?.zoom ?? DEFAULT_REVERSE_ZOOM,
    });
  }

  private async fetch(
    query: string,
    lat: number,
    lng: number,
    options?: FetchOptions,
  ): Promise<GeocodeResponse> {
    const hl = options?.hl ?? this.hl;
    const gl = options?.gl ?? this.gl;

    const url = buildSearchUrl({
      query,
      lat,
      lng,
      resultsCount: options?.resultsCount ?? DEFAULT_RESULTS_COUNT,
      maxRadius: options?.maxRadius ?? DEFAULT_MAX_RADIUS,
      viewportDist: options?.viewportDist,
      offset: 0,
      hl,
      gl,
      zoom: options?.zoom,
    });

    const data = await this.http.get<PbNode>(url);
    const results = extractGeocodeResults(data);
    const response = toGeocodeResponse(results, options?.raw ? data : undefined);

    return response;
  }
}

export class TimezoneService {
  private geocode: GeocodeService;
  private hl: string;
  private gl: string;

  constructor(geocode: GeocodeService, config: GMapsConfig) {
    this.geocode = geocode;
    this.hl = config.hl ?? 'en';
    this.gl = config.gl ?? 'us';
  }

  /**
   * Resolve IANA timezone for coordinates.
   *
   * Default path is offline `geo-tz` polygon lookup (~1 ms) — matches Time Zone API
   * latency without a network hop. Pass `source: 'geocode'` to force Google's
   * `[14][30]` field via reverse (+ optional forward) geocode (~240–860 ms).
   */
  async get(options: TimezoneOptions, at: Date = new Date()): Promise<TimezoneResult> {
    const source = options.source ?? 'offline';
    if (source === 'offline') {
      try {
        const ids = findTimezones(options.lat, options.lng);
        const timeZoneId = ids[0];
        if (timeZoneId) {
          const result = buildTimezoneResult(options.lat, options.lng, timeZoneId, at);
          return { ...result, timezoneSource: 'geo-tz' };
        }
      } catch (error) {
        return {
          lat: options.lat,
          lng: options.lng,
          status: 'ERROR',
          error: error instanceof Error ? error.message : String(error),
        };
      }
      // Fall through to geocode if polygon miss (ocean / disputed edge).
    }

    return this.getFromGeocode(options, at);
  }

  private async getFromGeocode(options: TimezoneOptions, at: Date): Promise<TimezoneResult> {
    const hl = options.hl ?? this.hl;
    const gl = options.gl ?? this.gl;

    try {
      const reverse = await this.geocode.reverseGeocode(options.lat, options.lng, { hl, gl });
      const direct = extractTimezoneFromGeocodeResults([
        reverse.result,
        ...reverse.alternatives,
      ]);

      if (direct) {
        const result = buildTimezoneResult(options.lat, options.lng, direct, at);
        return { ...result, timezoneSource: 'google-geocode' };
      }

      if (reverse.result) {
        const queries = localityQueriesFromReverseHit(reverse.result);
        const forwards = await Promise.all(
          queries.slice(0, 3).map((query) =>
            this.geocode.geocode(query, {
              lat: options.lat,
              lng: options.lng,
              hl,
              gl,
            }),
          ),
        );
        for (const forward of forwards) {
          const tz = extractTimezoneFromGeocodeResults([
            forward.result,
            ...forward.alternatives,
          ]);
          if (tz) {
            const result = buildTimezoneResult(options.lat, options.lng, tz, at);
            return { ...result, timezoneSource: 'google-geocode' };
          }
        }
      }

      return {
        lat: options.lat,
        lng: options.lng,
        status: 'NOT_FOUND',
        error: 'Timezone not present in geocode search payloads for this coordinate',
      };
    } catch (error) {
      return {
        lat: options.lat,
        lng: options.lng,
        status: 'ERROR',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
