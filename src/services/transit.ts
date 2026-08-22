import { HttpClient } from '../client/http-client.js';
import { extractTransitStationBoard } from '../parsers/transit.js';
import { buildListTransitLinesArgs } from '../rpc/batch-request-builders.js';
import { BATCH_SERVICES } from '../rpc/batch-services.js';
import { createRpcClient, isBatchErrorCode, parseBatchPayload } from '../rpc/batch-rpc.js';
import { buildDirectionsUrls } from '../rpc/pb-builders.js';
import { extractTransitRoutes } from '../parsers/transit-directions.js';
import { DirectionsService } from './directions.js';
import { GeocodeService } from './geocode.js';
import { GMapsError } from '../types/common.js';
import type { GMapsConfig } from '../types/common.js';
import type { PbNode } from '../types/protobuf.js';
import type {
  GetStationDeparturesOptions,
  ListTransitLinesOptions,
  TransitPreference,
  TransitRouteOptions,
  TransitRouteResult,
  TransitStationBoard,
} from '../types/transit.js';
import type { TransitRoutingPreference } from '../types/directions.js';

import type { MapsPreviewPlaceResponse, PlaceDataNode } from '../types/protobuf.js';
import { PlacesService } from './places.js';

/** Map the transit preference list onto the single pb routing-preference slot. */
function toRoutingPreference(
  preferences?: TransitPreference[],
): TransitRoutingPreference | undefined {
  if (!preferences?.length) return undefined;
  if (preferences.includes('fewerTransfers')) return 'fewer_transfers';
  if (preferences.includes('avoidSurface') || preferences.includes('preferRail')) {
    return 'less_walking';
  }
  return undefined;
}

export class TransitService {
  private http: HttpClient;
  private config: GMapsConfig;
  private places: PlacesService;
  private directions: DirectionsService;
  private geocode: GeocodeService;

  constructor(http: HttpClient, config: GMapsConfig = {}) {
    this.http = http;
    this.config = config;
    this.places = new PlacesService(http, config);
    this.directions = new DirectionsService(http, config);
    this.geocode = new GeocodeService(http, config);
  }

  /**
   * Live departure board for a transit station (place preview placeData[62]).
   * Requires a rich/detail preview with coordinates for full schedule rows.
   */
  async getStationDepartures(options: GetStationDeparturesOptions): Promise<TransitStationBoard> {
    const preview = await this.places.fetchPreview({
      hexId: options.hexId,
      name: options.name,
      lat: options.lat,
      lng: options.lng,
      mode: options.mode ?? 'rich',
    });

    const placeData = preview.data[6] as PlaceDataNode | undefined;
    if (!placeData) {
      throw new Error('Place preview returned no placeData node');
    }

    const board = extractTransitStationBoard(placeData);
    if (!board) {
      throw new Error('No transit departure board in place preview (placeData[62] absent or empty)');
    }

    return board;
  }

  /**
   * Full transit routing from origin to destination.
   * Returns all transit routes with transfers, stops, and line information.
   */
  /**
   * Transit itineraries between two points.
   *
   * Backed by `/maps/preview/directions` in transit mode. The request carries
   * the page session token, without which Google returns travel-time chips and
   * no routes at all. Returns every itinerary Google offers, each with its legs,
   * lines, stops, fare and service alerts.
   *
   * String endpoints are geocoded first.
   */
  async getRoute(options: TransitRouteOptions): Promise<TransitRouteResult> {
    const start = performance.now();

    const origin = await this.resolveEndpoint(options.origin);
    const destination = await this.resolveEndpoint(options.destination);

    const sessionToken = await this.directions.sessionToken(origin);
    const [url] = buildDirectionsUrls({
      origin,
      destination,
      mode: 'transit',
      hl: this.config.hl ?? 'en',
      gl: this.config.gl ?? 'us',
      departureTime: options.departureTime ? Math.floor(options.departureTime.getTime() / 1000) : undefined,
      arrivalTime: options.arrivalTime ? Math.floor(options.arrivalTime.getTime() / 1000) : undefined,
      transitModes: options.modes,
      transitRoutingPreference: toRoutingPreference(options.preferences),
      sessionToken,
    });

    const data = (await this.http.get(url!, {
      referer: 'https://www.google.com/maps/',
      includeOrigin: true,
    })) as PbNode;

    return { routes: extractTransitRoutes(data), timingMs: performance.now() - start };
  }

  /** Coordinates for an endpoint, geocoding a string when needed. */
  private async resolveEndpoint(
    value: TransitRouteOptions['origin'],
  ): Promise<{ lat: number; lng: number }> {
    if (typeof value !== 'string') return value;

    const response = await this.geocode.geocode(value);
    const hit = response.result ?? response.alternatives[0];
    if (!hit) {
      throw new GMapsError(`Could not resolve transit endpoint: ${value}`);
    }
    return { lat: hit.lat, lng: hit.lng };
  }

  /**
   * Probe ListTransitLines batchexecute (currently returns error [3] for anonymous callers).
   * Exposed for research scripts; prefer getStationDepartures for live schedules.
   */
  async probeListTransitLines(options: ListTransitLinesOptions): Promise<unknown> {
    const rpc = await createRpcClient(this.http, this.config);
    const data = await rpc.call(
      BATCH_SERVICES.LIST_TRANSIT_LINES,
      buildListTransitLinesArgs({
        lineHexId: options.lineHexId,
        lat: options.lat,
        lng: options.lng,
      }),
    );
    const parsed = parseBatchPayload(data);
    if (isBatchErrorCode(parsed)) {
      const code = Array.isArray(parsed) ? parsed[0] : undefined;
      throw new Error(`ListTransitLines returned batchexecute error [${String(code)}]`);
    }
    return parsed;
  }
}

export function extractTransitBoardFromPreview(data: MapsPreviewPlaceResponse): TransitStationBoard | undefined {
  const placeData = data[6] as PlaceDataNode | undefined;
  if (!placeData) return undefined;
  return extractTransitStationBoard(placeData);
}
