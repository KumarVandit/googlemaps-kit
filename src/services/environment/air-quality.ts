import { HttpClient } from '../../client/http-client.js';
import { TilesService } from '../tiles.js';
import type { GMapsConfig } from '../../types/common.js';
import { GMapsError } from '../../types/common.js';
import { safeGet } from '../../utils/payload.js';

export interface AirQualityIndex {
  aqi?: number;
  category?: string;
  dominantPollutant?: string;
  displayName?: string;
}

export interface AirQualityLookupResult {
  indexes?: AirQualityIndex[];
  regionCode?: string;
  dateTime?: string;
  raw?: unknown;
}

export interface AirQualityLookupOptions {
  lat: number;
  lng: number;
  apiKey?: string;
}

export class AirQualityService {
  private http: HttpClient;
  private tiles: TilesService;
  private defaultApiKey?: string;

  constructor(http: HttpClient, config: GMapsConfig = {}) {
    this.http = http;
    this.tiles = new TilesService(http, config);
    this.defaultApiKey = config.airQualityApiKey ?? process.env.GMAPS_AIR_QUALITY_API_KEY;
  }

  /** Point air quality lookup when apiKey is set. Heatmap tiles are keyless via getHeatmapTile(). */
  async lookup(options: AirQualityLookupOptions): Promise<AirQualityLookupResult> {
    const apiKey = options.apiKey ?? this.defaultApiKey;
    if (!apiKey) {
      throw new GMapsError(
        'Air Quality point lookup requires apiKey, config.airQualityApiKey, or GMAPS_AIR_QUALITY_API_KEY. ' +
          'For heatmap tiles use getHeatmapTile(); for batchexecute use sdk().features().airQuality() with cookies.',
      );
    }

    const params = new URLSearchParams();
    params.set('location.latitude', String(options.lat));
    params.set('location.longitude', String(options.lng));
    const url = `https://airquality.googleapis.com/v1/currentConditions:lookup?${params.toString()}`;
    const body = await this.http.get<string>(url, {
      extraHeaders: { 'X-Goog-Api-Key': apiKey },
      raw: true,
      noRetry: true,
    });
    const data = JSON.parse(body) as Record<string, unknown>;
    return parseAirQualityApiResponse(data);
  }

  /** AQI heatmap raster tile (keyless vt overlay). */
  async getHeatmapTile(options: { z: number; x: number; y: number }) {
    return this.tiles.getOverlay({
      z: options.z,
      x: options.x,
      y: options.y,
      layer: 'airQualityHeatmap',
    });
  }

  /**
   * Parse batchexecute GivvBd response when available via features().airQuality().
   * Layout is reverse-engineered from nested numeric fields — may omit fields on sparse payloads.
   */
  parseBatchexecuteResponse(data: unknown): AirQualityLookupResult {
    return parseAirQualityBatchexecute(data);
  }
}

function parseAirQualityApiResponse(data: Record<string, unknown>): AirQualityLookupResult {
  const indexesRaw = data.indexes;
  const indexes: AirQualityIndex[] = [];
  if (Array.isArray(indexesRaw)) {
    for (const entry of indexesRaw) {
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as Record<string, unknown>;
      indexes.push({
        aqi: typeof row.aqi === 'number' ? row.aqi : undefined,
        category: typeof row.category === 'string' ? row.category : undefined,
        dominantPollutant:
          typeof row.dominantPollutant === 'string' ? row.dominantPollutant : undefined,
        displayName: typeof row.displayName === 'string' ? row.displayName : undefined,
      });
    }
  }
  return {
    indexes,
    regionCode: typeof data.regionCode === 'string' ? data.regionCode : undefined,
    dateTime: typeof data.dateTime === 'string' ? data.dateTime : undefined,
    raw: data,
  };
}

function parseAirQualityBatchexecute(data: unknown): AirQualityLookupResult {
  const aqi = safeGet<number>(data, 1, 0, 0);
  const category = safeGet<string>(data, 1, 0, 1);
  const pollutant = safeGet<string>(data, 1, 0, 2);
  const indexes: AirQualityIndex[] = [];
  if (aqi != null) {
    indexes.push({
      aqi,
      category,
      dominantPollutant: pollutant,
    });
  }
  return { indexes, raw: data };
}
