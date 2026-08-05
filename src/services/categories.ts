import { HttpClient } from '../client/http-client.js';
import {
  extractCategoryHierarchy,
  extractCategorySuggestions,
  extractPlaceInfo,
  extractPotentialDuplicates,
  extractSignedPlaceUrl,
} from '../parsers/categories.js';
import {
  buildCategorySuggestionsArgs,
  buildPlaceInfoArgs,
  buildPotentialDuplicatesArgs,
  buildSignedUrlArgs,
} from '../rpc/batch-request-builders.js';
import { BATCH_SERVICES } from '../rpc/batch-services.js';
import { createRpcClient } from '../rpc/batch-rpc.js';
import type { GMapsConfig } from '../types/common.js';
import type {
  CategoryNode,
  CategorySuggestion,
  GetCategorySuggestionsOptions,
  GetPlaceInfoOptions,
  GetPotentialDuplicatesOptions,
  GetSignedUrlOptions,
  PlaceInfoResult,
  PotentialDuplicate,
  SignedPlaceUrl,
} from '../types/categories.js';

export class CategoriesService {
  private http: HttpClient;
  private config: GMapsConfig;

  constructor(http: HttpClient, config: GMapsConfig = {}) {
    this.http = http;
    this.config = config;
  }

  /** Full Maps place category taxonomy (LocalRapService.GetCategoryHierarchy). */
  async getHierarchy(): Promise<CategoryNode[]> {
    const rpc = await createRpcClient(this.http, this.config);
    const data = await rpc.call(BATCH_SERVICES.CATEGORY_HIERARCHY, []);
    return extractCategoryHierarchy(data);
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
