import { find as findTimezones } from 'geo-tz';
import { GeocodeService } from './geocode.js';
import type { GMapsConfig } from '../types/common.js';
import type { TimezoneOptions, TimezoneResult } from '../types/timezone.js';
import {
  buildTimezoneResult,
  extractTimezoneFromGeocodeResults,
  localityQueriesFromReverseHit,
} from '../parsers/timezone-geocode.js';

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
