import { HttpClient } from '../client/http-client.js';
import { cookiesToHeader } from '../auth/session.js';
import { extractPlaceUgcAggregates } from '../parsers/ugc-aggregates.js';
import { parseMapsPageTokens } from '../rpc/app-options.js';
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
    const placePath = `/maps/place/@12.9121263,77.6499775,14z`;
    const html = await fetch(`https://www.google.com${placePath}`, {
      headers: {
        'User-Agent': this.http.getUserAgent(),
        Cookie: cookiesToHeader(this.http.getCookieJar()),
        Accept: 'text/html',
      },
      redirect: 'follow',
    }).then((r) => r.text());
    const tokens = parseMapsPageTokens(html);
    const psi = tokens.psi ?? tokens.kEI;
    if (!psi) {
      throw new GMapsAuthError('Could not obtain Maps session psi token for UGC aggregates');
    }
    return psi;
  }
}
