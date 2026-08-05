import { HttpClient } from '../client/http-client.js';
import { extractGeocodeResults, toGeocodeResponse } from '../parsers/geocode.js';
import { buildSearchUrl } from '../rpc/pb-builders.js';
import type { GMapsConfig } from '../types/common.js';
import type {
  GeocodeOptions,
  GeocodeResponse,
  ReverseGeocodeOptions,
} from '../types/geocode.js';
import type { PbNode } from '../types/protobuf.js';

const DEFAULT_RESULTS_COUNT = 5;
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
