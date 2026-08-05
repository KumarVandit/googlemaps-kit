import { HttpClient } from '../client/http-client.js';
import { extractCreateShortUrlResult, extractDecodedMapsUrl } from '../parsers/batch-url.js';
import { buildCreateShortUrlArgs, buildDecodeUrlArgs } from '../rpc/batch-request-builders.js';
import { BATCH_SERVICES } from '../rpc/batch-services.js';
import { createRpcClient, fetchPlacePsi } from '../rpc/batch-rpc.js';
import type { GMapsConfig } from '../types/common.js';
import type {
  CreateShortUrlOptions,
  CreateShortUrlResult,
  DecodeUrlOptions,
  DecodedMapsUrl,
} from '../types/batch-url.js';

export class BatchUrlService {
  private http: HttpClient;
  private config: GMapsConfig;

  constructor(http: HttpClient, config: GMapsConfig = {}) {
    this.http = http;
    this.config = config;
  }

  /** Server-side Maps URL decode (MapsUrlService.DecodeUrl batchexecute). */
  async decode(options: DecodeUrlOptions & { raw?: boolean }): Promise<DecodedMapsUrl> {
    const rpc = await createRpcClient(this.http, this.config);
    const data = await rpc.call(BATCH_SERVICES.DECODE_URL, buildDecodeUrlArgs(options.url));
    return extractDecodedMapsUrl(data, options);
  }

  /** Create a maps.app.goo.gl short link (may require signed-in session). */
  async createShortUrl(options: CreateShortUrlOptions & { raw?: boolean }): Promise<CreateShortUrlResult> {
    const rpc = await createRpcClient(this.http, this.config);
    const psi = options.psi ?? (await this.resolvePsi());
    const data = await rpc.call(BATCH_SERVICES.CREATE_SHORT_URL, buildCreateShortUrlArgs(options.url, psi));
    return extractCreateShortUrlResult(data, options);
  }

  private async resolvePsi(): Promise<string> {
    const psi = await fetchPlacePsi(this.http, '/maps/place/@12.9168,77.6450,14z');
    return psi ?? 'anonymous';
  }
}
