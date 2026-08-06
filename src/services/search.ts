import { HttpClient } from '../client/http-client.js';
import { applyClientSearchFilters } from '../parsers/search-client-filters.js';
import { extractBusinesses } from '../parsers/search.js';
import { extractSearchPagination } from '../parsers/search-pagination.js';
import { buildSearchUrl } from '../rpc/pb-builders.js';
import type {
  GMapsConfig,
  PlaceDetails,
  SearchFieldMask,
  SearchMode,
  SearchOptions,
  SearchPageResult,
  SearchResult,
  SearchTextOptions,
  SearchTextResult,
} from '../types/common.js';
import type { PbNode } from '../types/protobuf.js';
import { resolveSearchCenter } from '../utils/place-ref.js';

/** Lift a search row into the PlaceDetails shape used by places.get callers. */
export function searchResultToPlaceDetails(row: SearchResult): PlaceDetails {
  return {
    name: row.name,
    address: row.address,
    placeId: row.placeId,
    hexId: row.hexId,
    ftid: row.ftid,
    rating: row.rating,
    reviewCount: row.reviewCount,
    priceLevel: row.priceLevel,
    lat: row.lat ?? row.latitude,
    lng: row.lng ?? row.longitude,
    latitude: row.latitude ?? row.lat,
    longitude: row.longitude ?? row.lng,
    phone: row.internationalPhone ?? row.phone,
    website: row.website,
    categories: row.categories,
    openStatus: row.openStatus,
    openingSchedule: row.openingSchedule,
    attributeGroups: row.attributeGroups,
    timezone: row.timezone,
    photos: row.photos ?? (row.thumbnailUrl ? [row.thumbnailUrl] : undefined),
  };
}

interface ResolvedSearchRequest {
  fieldMask: SearchFieldMask;
  pageSize: number;
  lite: boolean;
  radiusMeters: number;
}

function resolveSearchRequest(
  options: SearchOptions & { fieldMask?: SearchFieldMask },
  defaultMode: SearchMode,
): ResolvedSearchRequest {
  const mode = options.mode ?? defaultMode;

  if (mode === 'fast') {
    return {
      fieldMask: 'pro',
      pageSize: options.limit ?? 5,
      lite: true,
      radiusMeters: options.radiusMeters ?? 50_000,
    };
  }

  const fieldMask = options.fieldMask ?? 'enterprise';
  return {
    fieldMask,
    pageSize: options.limit ?? (fieldMask === 'pro' ? 10 : 20),
    lite: fieldMask === 'pro',
    radiusMeters: options.radiusMeters ?? 150_000,
  };
}

export class SearchService {
  private http: HttpClient;
  private hl: string;
  private gl: string;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.http = http;
    this.hl = config.hl ?? 'en';
    this.gl = config.gl ?? 'us';
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const page = await this.searchPage(options);
    return page.results;
  }

  /**
   * Places API (New) Text Search equivalent — one HTTP call.
   *
   * Defaults to `mode: 'fast'` (5 results, ~400 ms warm). Pass `mode: 'full'`
   * for hours, phone, attributes, and up to 20 rows per page.
   */
  async searchText(options: SearchTextOptions): Promise<SearchTextResult> {
    const resolved = resolveSearchRequest(options, 'fast');
    const start = performance.now();
    const page = await this.searchPage({ ...options, mode: options.mode ?? 'fast' });
    return {
      places: page.results,
      requestCount: 1,
      timingMs: performance.now() - start,
      fieldMask: resolved.fieldMask,
      pagination: page.pagination,
    };
  }

  /** Search with pagination metadata (psi, next offset). */
  async searchPage(
    options: SearchOptions & { fieldMask?: SearchFieldMask },
  ): Promise<SearchPageResult> {
    const location = resolveSearchCenter(options);
    const resolved = resolveSearchRequest(options, 'full');
    const pageSize = resolved.pageSize;
    const offset = options.offset ?? 0;

    let psi = options.psi;
    if (!psi && offset === 0) {
      const tokens = this.http.peekMapsPageTokens();
      psi = tokens?.psi ?? tokens?.kEI;
    }

    const url = buildSearchUrl({
      query: options.query,
      lat: location.lat,
      lng: location.lng,
      resultsCount: pageSize,
      maxRadius: resolved.radiusMeters,
      viewportDist: options.viewportDist,
      offset,
      hl: this.hl,
      gl: this.gl,
      psi,
      ech: options.ech ?? Math.floor(offset / pageSize) + 1,
      zoom: options.zoom,
    });

    const data = await this.http.get(url) as PbNode;
    let results = extractBusinesses(data, { lite: resolved.lite, fastPath: true });
    if (options.filters) {
      results = applyClientSearchFilters(results, options.filters);
    }
    const paginationMeta = extractSearchPagination(data, offset, pageSize);
    const nextPsi = paginationMeta.psi ?? psi;

    return {
      results,
      places: results,
      pagination: {
        offset,
        pageSize,
        psi: nextPsi,
        nextOffset: paginationMeta.hasMore ? paginationMeta.nextOffset : undefined,
        hasMore: paginationMeta.hasMore ?? false,
      },
    };
  }

  async searchAll(
    options: SearchOptions & { maxPages?: number; fieldMask?: SearchFieldMask },
  ): Promise<SearchResult[]> {
    const resolved = resolveSearchRequest(options, 'full');
    const pageSize = resolved.pageSize;
    const maxPages = options.maxPages ?? 5;
    const all: SearchResult[] = [];
    const seen = new Set<string>();

    let offset = options.offset ?? 0;
    let psi = options.psi;
    let ech = options.ech ?? 1;

    for (let page = 0; page < maxPages; page++) {
      const batch = await this.searchPage({
        ...options,
        limit: pageSize,
        offset,
        psi,
        ech,
      });

      if (batch.results.length === 0) break;

      for (const biz of batch.results) {
        const key = biz.placeId ?? biz.hexId ?? biz.name;
        if (key && !seen.has(key)) {
          seen.add(key);
          all.push(biz);
        }
      }

      if (!batch.pagination.hasMore || batch.pagination.nextOffset == null) break;
      offset = batch.pagination.nextOffset;
      psi = batch.pagination.psi ?? psi;
      ech++;
    }

    return all;
  }
}
