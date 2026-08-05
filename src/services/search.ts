import { HttpClient } from '../client/http-client.js';
import { applyClientSearchFilters } from '../parsers/search-client-filters.js';
import { extractBusinesses } from '../parsers/search.js';
import { extractSearchPagination } from '../parsers/search-pagination.js';
import { buildSearchUrl } from '../rpc/pb-builders.js';
import type {
  GMapsConfig,
  PlaceDetails,
  SearchFieldMask,
  SearchOptions,
  SearchPageResult,
  SearchResult,
  SearchTextOptions,
  SearchTextResult,
} from '../types/common.js';
import type { PbNode } from '../types/protobuf.js';

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
    latitude: row.latitude,
    longitude: row.longitude,
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
   * Search rows already carry Enterprise fields (hours, phone, attributes, photo,
   * rating, place id). Prefer this over search + N× places.get when you need the
   * same shape official `places:searchText` returns with a field mask.
   */
  async searchText(options: SearchTextOptions): Promise<SearchTextResult> {
    const fieldMask: SearchFieldMask = options.fieldMask ?? 'enterprise';
    const start = performance.now();
    const page = await this.searchPage(options);
    return {
      places: page.results,
      requestCount: 1,
      timingMs: performance.now() - start,
      fieldMask,
      pagination: page.pagination,
    };
  }

  /** Search with pagination metadata (psi, next offset). */
  async searchPage(options: SearchOptions): Promise<SearchPageResult> {
    const pageSize = options.limit ?? 20;
    const offset = options.offset ?? 0;

    const url = buildSearchUrl({
      query: options.query,
      lat: options.location.lat,
      lng: options.location.lng,
      resultsCount: pageSize,
      maxRadius: options.radiusMeters ?? 150_000,
      viewportDist: options.viewportDist,
      offset,
      hl: this.hl,
      gl: this.gl,
      psi: options.psi,
      ech: options.ech ?? Math.floor(offset / pageSize) + 1,
      zoom: options.zoom,
    });

    const data = await this.http.get(url) as PbNode;
    let results = extractBusinesses(data);
    if (options.filters) {
      results = applyClientSearchFilters(results, options.filters);
    }
    const paginationMeta = extractSearchPagination(data, offset, pageSize);
    const psi = paginationMeta.psi ?? options.psi;

    return {
      results,
      pagination: {
        offset,
        pageSize,
        psi,
        nextOffset: paginationMeta.hasMore ? paginationMeta.nextOffset : undefined,
        hasMore: paginationMeta.hasMore ?? false,
      },
    };
  }

  async searchAll(
    options: SearchOptions & { maxPages?: number },
  ): Promise<SearchResult[]> {
    const pageSize = options.limit ?? 20;
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
