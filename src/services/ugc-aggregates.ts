import { HttpClient } from '../client/http-client.js';
import { extractPlaceUgcAggregates } from '../parsers/ugc-aggregates.js';
import { buildPlaceUgcAggregatesArgs } from '../rpc/batch-request-builders.js';
import { BATCH_SERVICES } from '../rpc/batch-services.js';
import { createRpcClient, isBatchErrorCode } from '../rpc/batch-rpc.js';
import { GMapsAuthError } from '../types/common.js';
import type { GMapsConfig } from '../types/common.js';
import type { GetPlaceUgcAggregatesOptions, PlaceUgcAggregates } from '../types/ugc-aggregates.js';

export class UgcAggregatesService {
  private http: HttpClient;
  private config: GMapsConfig;

  constructor(http: HttpClient, config: GMapsConfig = {}) {
    this.http = http;
    this.config = config;
  }

  /**
   * Place review/Q&A aggregate stats (rating, star distribution, total count).
   * Requires a valid Maps session psi token in the request context array.
   */
  async getPlaceAggregates(
    options: GetPlaceUgcAggregatesOptions & { raw?: boolean },
  ): Promise<PlaceUgcAggregates> {
    const rpc = await createRpcClient(this.http, this.config);
    const psi = options.psi ?? (await this.resolvePsi());

    const data = await rpc.call(
      BATCH_SERVICES.PLACE_UGC_AGGREGATES,
      buildPlaceUgcAggregatesArgs(options.hexId, psi),
    );

    if (isBatchErrorCode(data)) {
      throw new GMapsAuthError('GetPlaceUgcPostAggregates requires a valid Maps session token');
    }

    return extractPlaceUgcAggregates(data, options);
  }

  private async resolvePsi(): Promise<string> {
    return this.http.resolvePsi();
  }
}
