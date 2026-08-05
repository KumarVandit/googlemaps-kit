import { HttpClient } from '../client/http-client.js';
import { extractAreaTraffic } from '../parsers/traffic.js';
import { buildAreaTrafficArgs } from '../rpc/batch-request-builders.js';
import { BATCH_SERVICES } from '../rpc/batch-services.js';
import { createRpcClient } from '../rpc/batch-rpc.js';
import type { GMapsConfig } from '../types/common.js';
import type { AreaTrafficReport, GetAreaTrafficOptions } from '../types/traffic.js';
import { parseMapsPageTokens } from '../rpc/app-options.js';
import { cookiesToHeader } from '../auth/session.js';

export class TrafficService {
  private http: HttpClient;
  private config: GMapsConfig;

  constructor(http: HttpClient, config: GMapsConfig = {}) {
    this.http = http;
    this.config = config;
  }

  /** Fetch area traffic conditions for a viewport bounding box (batchexecute GetAreaTraffic). */
  async getAreaTraffic(options: GetAreaTrafficOptions): Promise<AreaTrafficReport> {
    const rpc = await createRpcClient(this.http, this.config);
    const psi = options.psi ?? (await this.resolvePsi());

    const data = await rpc.call(
      BATCH_SERVICES.AREA_TRAFFIC,
      buildAreaTrafficArgs({
        psi,
        swLat: options.swLat,
        swLng: options.swLng,
        neLat: options.neLat,
        neLng: options.neLng,
      }),
    );

    return extractAreaTraffic(data);
  }

  private async resolvePsi(): Promise<string> {
    const html = await fetch('https://www.google.com/maps/place/@12.9168,77.6450,14z', {
      headers: {
        'User-Agent': this.http.getUserAgent(),
        Cookie: cookiesToHeader(this.http.getCookieJar()),
        Accept: 'text/html',
      },
      redirect: 'follow',
    }).then((r) => r.text());
    const tokens = parseMapsPageTokens(html);
    return tokens.psi ?? tokens.kEI ?? 'anonymous';
  }
}
