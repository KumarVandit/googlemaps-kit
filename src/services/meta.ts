import { HttpClient } from '../client/http-client.js';
import { extractCategoryHierarchy, extractCategorySuggestions, extractPlaceInfo, extractPotentialDuplicates, extractSignedPlaceUrl } from '../parsers/categories.js';
import { buildCategorySuggestionsArgs, buildCreateShortUrlArgs, buildDecodeUrlArgs, buildPlaceInfoArgs, buildPlaceUgcAggregatesArgs, buildPotentialDuplicatesArgs, buildSignedUrlArgs } from '../rpc/batch-request-builders.js';
import { BATCH_SERVICES } from '../rpc/batch-services.js';
import { createRpcClient, fetchPlacePsi, isBatchErrorCode, parseBatchPayload } from '../rpc/batch-rpc.js';
import { AuthRequiredError, GMapsConfig, GMapsAuthError } from '../types/common.js';
import type { CategoryHierarchyResult, CategoryNode, CategorySuggestion, GetCategorySuggestionsOptions, GetPlaceInfoOptions, GetPotentialDuplicatesOptions, GetSignedUrlOptions, PlaceInfoResult, PotentialDuplicate, SignedPlaceUrl } from '../types/categories.js';
import { extractPlaceUgcAggregates } from '../parsers/reviews.js';
import type { GetPlaceUgcAggregatesOptions, PlaceUgcAggregates } from '../types/reviews.js';
import { extractCreateShortUrlResult, extractDecodedMapsUrl } from '../parsers/batch-url.js';
import type { CreateShortUrlOptions, CreateShortUrlResult, DecodeUrlOptions, DecodedMapsUrl } from '../types/batch-url.js';
import { safeGet } from '../utils/payload.js';

/**
 * Meta surfaces: category taxonomy, rating aggregates, URL decode/create, user prefs.
 */

export class CategoriesService {
  private http: HttpClient;
  private config: GMapsConfig;

  constructor(http: HttpClient, config: GMapsConfig = {}) {
    this.http = http;
    this.config = config;
  }

  /** Full Maps place category taxonomy (LocalRapService.GetCategoryHierarchy). */
  async getHierarchy(): Promise<CategoryHierarchyResult> {
    const rpc = await createRpcClient(this.http, this.config);
    const data = await rpc.call(BATCH_SERVICES.CATEGORY_HIERARCHY, []);
    const nodes = extractCategoryHierarchy(data);
    return { nodes };
  }

  /** Autocomplete category suggestions for a query string. */
  async suggest(options: GetCategorySuggestionsOptions): Promise<CategorySuggestion[]> {
    const rpc = await createRpcClient(this.http, this.config);
    const data = await rpc.call(
      BATCH_SERVICES.CATEGORY_SUGGESTIONS,
      buildCategorySuggestionsArgs(options.query),
    );
    return extractCategorySuggestions(data);
  }

  /** Resolve hex id metadata for a place feature id. */
  async getPlaceInfo(options: GetPlaceInfoOptions): Promise<PlaceInfoResult> {
    const rpc = await createRpcClient(this.http, this.config);
    const data = await rpc.call(BATCH_SERVICES.PLACE_INFO, buildPlaceInfoArgs(options.hexId));
    return extractPlaceInfo(data);
  }

  /** Find potential duplicate listings near/alongside a place. */
  async getPotentialDuplicates(
    options: GetPotentialDuplicatesOptions & { raw?: boolean },
  ): Promise<PotentialDuplicate[]> {
    const rpc = await createRpcClient(this.http, this.config);
    const data = await rpc.call(
      BATCH_SERVICES.POTENTIAL_DUPLICATES,
      buildPotentialDuplicatesArgs(options.hexId),
    );
    return extractPotentialDuplicates(data, options);
  }

  /** Get a signed hex id path fragment for authenticated place URLs. */
  async getSignedUrl(options: GetSignedUrlOptions): Promise<SignedPlaceUrl | null> {
    const rpc = await createRpcClient(this.http, this.config);
    const data = await rpc.call(BATCH_SERVICES.SIGNED_URL, buildSignedUrlArgs(options.hexId));
    return extractSignedPlaceUrl(data);
  }
}

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

/**
 * MapsUserPrefsService — per-account settings store (units, region, home/work).
 *
 * Anonymous batchexecute answers a bare `[1]` stub for every arg shape probed;
 * the store is signed-in only. The response layout beyond int32 field 1 is
 * inferred from the JS message classes and unverified without cookies.
 */

export interface UserPrefs {
  raw?: unknown;
}

export class UserPrefsService {
  constructor(
    private readonly http: HttpClient,
    private readonly config: GMapsConfig,
  ) {}

  /** @throws {AuthRequiredError} when Google answers the anonymous stub. */
  async get(): Promise<UserPrefs> {
    const rpc = await createRpcClient(this.http, this.config);
    let data: unknown;
    try {
      data = await rpc.call(BATCH_SERVICES.GET_USER_PREFS, []);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/500|401|403|auth/i.test(message)) {
        throw new AuthRequiredError(
          'UserPrefs requires a signed-in Maps session (set GMAPS_COOKIES). ' +
            `Anonymous batchexecute failed: ${message}`,
          'userPrefs',
        );
      }
      throw error;
    }

    const root = parseBatchPayload(data);
    if (isBatchErrorCode(root)) {
      throw new AuthRequiredError(
        `UserPrefs is signed-in only — Google answered error [${String(Array.isArray(root) ? root[0] : root)}]. Set GMAPS_COOKIES.`,
        'userPrefs',
      );
    }
    return { raw: root };
  }

  static isAnonymousStub(root: unknown): boolean {
    return safeGet<number>(root, 0) === 1 && !Array.isArray(safeGet<unknown[]>(root, 1));
  }
}
