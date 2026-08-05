import { HttpClient } from '../client/http-client.js';
import { extractTransitStationBoard } from '../parsers/transit.js';
import { buildListTransitLinesArgs } from '../rpc/batch-request-builders.js';
import { BATCH_SERVICES } from '../rpc/batch-services.js';
import { createRpcClient, isBatchErrorCode, parseBatchPayload } from '../rpc/batch-rpc.js';
import type { GMapsConfig } from '../types/common.js';
import type {
  GetStationDeparturesOptions,
  ListTransitLinesOptions,
  TransitStationBoard,
} from '../types/transit.js';
import type { MapsPreviewPlaceResponse, PlaceDataNode } from '../types/protobuf.js';
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
