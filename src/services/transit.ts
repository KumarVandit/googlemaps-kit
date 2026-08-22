import { HttpClient } from '../client/http-client.js';
import { extractTransitStationBoard } from '../parsers/transit.js';
import { buildListTransitLinesArgs } from '../rpc/batch-request-builders.js';
import { BATCH_SERVICES } from '../rpc/batch-services.js';
import { createRpcClient, isBatchErrorCode, parseBatchPayload } from '../rpc/batch-rpc.js';
import type { GMapsConfig } from '../types/common.js';
import type {
  GetStationDeparturesOptions,
  ListTransitLinesOptions,
  TransitRouteOptions,
  TransitRouteResult,
  TransitStationBoard,
  TransitRoute,
  TransitLeg,
  TransitStation,
  TransitPreference,
} from '../types/transit.js';
import type { MapsPreviewPlaceResponse, PlaceDataNode, PbNode } from '../types/protobuf.js';
import { PlacesService } from './places.js';

export class TransitService {
  private http: HttpClient;
  private config: GMapsConfig;
  private places: PlacesService;

  constructor(http: HttpClient, config: GMapsConfig = {}) {
    this.http = http;
    this.config = config;
    this.places = new PlacesService(http, config);
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
  async getRoute(options: TransitRouteOptions): Promise<TransitRouteResult> {
    const start = performance.now();

    try {
      const rpc = await createRpcClient(this.http, this.config);

      // Resolve addresses to coordinates if needed
      let originCoords = typeof options.origin === 'string'
        ? await this.resolveAddress(options.origin)
        : options.origin;
      let destCoords = typeof options.destination === 'string'
        ? await this.resolveAddress(options.destination)
        : options.destination;

      // Build transit routing request
      const departureTimeMs = options.departureTime ? options.departureTime.getTime() : Date.now();
      const arrivalTimeMs = options.arrivalTime ? options.arrivalTime.getTime() : undefined;

      const requestData = [
        { psi: 'anonymous' },
        null,
        [
          [originCoords.lat, originCoords.lng],
          [destCoords.lat, destCoords.lng],
        ],
        departureTimeMs,
        arrivalTimeMs || null,
        this.encodeTransitPreferences(options.preferences),
      ];

      const data = await rpc.call('/MapsApi.GetTransitDirections', requestData);

      // Parse routes from response
      const routes = this.extractTransitRoutes(data as PbNode);
      const timingMs = performance.now() - start;

      return { routes, timingMs };
    } catch (error) {
      const timingMs = performance.now() - start;
      return { routes: [], timingMs };
    }
  }

  private async resolveAddress(address: string) {
    // Address resolution via geocoding would require GeocodeService
    // For now, return default - caller should use coordinates directly
    return { lat: 0, lng: 0 };
  }

  private encodeTransitPreferences(prefs?: TransitPreference[]): number {
    if (!prefs) return 0;
    let encoded = 0;
    if (prefs.includes('avoidSurface')) encoded |= 1;
    if (prefs.includes('preferRail')) encoded |= 2;
    if (prefs.includes('fewerTransfers')) encoded |= 4;
    return encoded;
  }

  private extractTransitRoutes(data: PbNode): TransitRoute[] {
    const routes: TransitRoute[] = [];

    // Extract routes array from response structure [1][0]
    const routesArray = Array.isArray(data) && Array.isArray(data[1])
      ? Array.isArray(data[1][0]) ? data[1][0] : null
      : null;

    if (!Array.isArray(routesArray)) {
      return routes;
    }

    for (const route of routesArray) {
      if (!Array.isArray(route)) continue;

      const legs = this.extractTransitLegs(route[1]);
      const transfers = this.countTransfers(legs);
      const durationSeconds = this.calculateRouteDuration(legs);

      const firstLeg = legs.length > 0 ? legs[0] : undefined;
      const lastLeg = legs.length > 0 ? legs[legs.length - 1] : undefined;
      routes.push({
        legs,
        durationSeconds,
        departureTime: firstLeg?.departureTime,
        arrivalTime: lastLeg?.arrivalTime,
        transfers,
        summary: this.generateRouteSummary(legs),
      });
    }

    return routes;
  }

  private extractTransitLegs(legsData: unknown): TransitLeg[] {
    const legs: TransitLeg[] = [];

    if (!Array.isArray(legsData)) return legs;

    for (const leg of legsData) {
      if (!Array.isArray(leg)) continue;

      const mode = String(leg[0] ?? 'bus').toLowerCase();
      const startLat = Number(leg[2]?.[0] ?? 0);
      const startLng = Number(leg[2]?.[1] ?? 0);
      const endLat = Number(leg[3]?.[0] ?? 0);
      const endLng = Number(leg[3]?.[1] ?? 0);
      const departMs = Number(leg[4] ?? Date.now());
      const arriveMs = Number(leg[5] ?? Date.now());

      legs.push({
        mode,
        startStation: {
          name: String(leg[6] ?? 'Start'),
          lat: startLat,
          lng: startLng,
        },
        endStation: {
          name: String(leg[7] ?? 'End'),
          lat: endLat,
          lng: endLng,
        },
        departureTime: new Date(departMs),
        arrivalTime: new Date(arriveMs),
        durationSeconds: (arriveMs - departMs) / 1000,
        line: {
          number: String(leg[8] ?? ''),
          color: String(leg[9] ?? ''),
          agency: String(leg[10] ?? ''),
        },
        stops: this.extractStops(leg[11]),
      });
    }

    return legs;
  }

  private extractStops(stopsData: unknown): TransitStation[] {
    const stops: TransitStation[] = [];

    if (!Array.isArray(stopsData)) return stops;

    for (const stop of stopsData) {
      if (!Array.isArray(stop)) continue;

      stops.push({
        name: String(stop[0] ?? 'Stop'),
        code: stop[1] ? String(stop[1]) : undefined,
        lat: Number(stop[2] ?? 0),
        lng: Number(stop[3] ?? 0),
      });
    }

    return stops;
  }

  private countTransfers(legs: TransitLeg[]): number {
    return Math.max(0, legs.length - 1);
  }

  private calculateRouteDuration(legs: TransitLeg[]): number {
    if (legs.length === 0) return 0;
    const firstLeg = legs[0];
    const lastLeg = legs[legs.length - 1];
    if (!firstLeg || !lastLeg) return 0;
    const start = firstLeg.departureTime.getTime();
    const end = lastLeg.arrivalTime.getTime();
    return Math.round((end - start) / 1000);
  }

  private generateRouteSummary(legs: TransitLeg[]): string {
    if (legs.length === 0) return 'No routes available';
    const firstLeg = legs[0];
    const lastLeg = legs[legs.length - 1];
    if (!firstLeg || !lastLeg) return 'Route available';
    if (legs.length === 1) return `${firstLeg.mode} to ${firstLeg.endStation.name}`;
    return `${firstLeg.mode} to ${lastLeg.endStation.name} (${legs.length} legs)`;
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
