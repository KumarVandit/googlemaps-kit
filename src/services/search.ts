import { HttpClient } from '../client/http-client.js';
import { applyClientSearchFilters, extractBusinesses, extractSearchPagination } from '../parsers/search.js';
import { buildSearchUrl } from '../rpc/pb-builders.js';
import { GMapsError, type GMapsConfig, type PlaceDetails, type SearchFieldMask, type SearchMode, type SearchOptions, type SearchPageResult, type SearchResult, type SearchTextOptions, type SearchTextResult } from '../types/common.js';
import type { GridSearchOptions, GridSearchResult } from '../types/grid-search.js';
import type { PbNode } from '../types/protobuf.js';
import { resolveSearchCenter } from '../utils/place-ref.js';
import { webMercatorTile, webMercatorTileCenter } from '../utils/geo.js';
import { extractSuggestions } from '../parsers/suggest.js';
import { DEFAULT_SUGGEST_LAT, DEFAULT_SUGGEST_LNG, buildSuggestUrl } from '../rpc/feature-pb.js';
import type { SuggestOptions, SuggestResult } from '../types/suggest.js';

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

  /**
   * Cover a bounding box with a grid of zoom-cell searches and merge the results.
   *
   * Maps caps anonymous pagination far below the true result count for dense
   * queries, so a single query over a big city returns only a slice. Splitting
   * the area into Web Mercator cells at `cellZoom` (one search per cell) gets
   * dramatically more unique results — same strategy commercial scrapers use.
   *
   * Results are deduped by hexId / placeId / name across cells in encounter
   * order. Stops early once `maxResults` is reached; `onProgress` fires per cell.
   */
  async gridSearch(options: GridSearchOptions): Promise<GridSearchResult> {
    const { bounds } = options;
    const cellZoom = options.cellZoom ?? 15;
    if (!Number.isInteger(cellZoom) || cellZoom < 10 || cellZoom > 18) {
      throw new GMapsError(`gridSearch: cellZoom must be an integer between 10 and 18, got ${cellZoom}`);
    }
    if (
      !(
        Number.isFinite(bounds.north) &&
        Number.isFinite(bounds.south) &&
        Number.isFinite(bounds.east) &&
        Number.isFinite(bounds.west)
      ) ||
      bounds.north <= bounds.south ||
      bounds.east <= bounds.west
    ) {
      throw new GMapsError(
        'gridSearch: bounds must satisfy north > south and east > west (decimal degrees)',
      );
    }

    // Web Mercator x grows eastward, y grows southward: the north edge has the smaller y.
    const westX = webMercatorTile(0, bounds.west, cellZoom).x;
    const eastX = webMercatorTile(0, bounds.east, cellZoom).x;
    const northY = webMercatorTile(bounds.north, 0, cellZoom).y;
    const southY = webMercatorTile(bounds.south, 0, cellZoom).y;
    const cols = eastX - westX + 1;
    const rows = southY - northY + 1;
    const cellsTotal = cols * rows;

    const maxCells = options.maxCells ?? cellsTotal;
    const pagesPerCell = Math.max(1, options.pagesPerCell ?? 1);
    const maxResults = options.maxResults ?? Number.POSITIVE_INFINITY;

    const collected: SearchResult[] = [];
    const seen = new Set<string>();
    let requestsMade = 0;
    let cell = 0;
    let lastOffset = 0;
    let lastPsi: string | undefined;

    outer: for (let ty = northY; ty <= southY; ty++) {
      for (let tx = westX; tx <= eastX; tx++) {
        if (cell >= maxCells || collected.length >= maxResults) break outer;
        cell++;

        let foundInCell = 0;
        for (let page = 0; page < pagesPerCell; page++) {
          requestsMade++;

          // Search from the cell centre; the pb builder derives viewportDist from zoom,
          // so the effective search window tracks the cell footprint.
          const center = webMercatorTileCenter(tx, ty, cellZoom);
          const batch =
            page === 0
              ? await this.searchPage({
                  query: options.query,
                  location: center,
                  limit: options.limit,
                  mode: options.mode,
                  fieldMask: options.fieldMask,
                  filters: options.filters,
                  zoom: cellZoom,
                })
              : await this.searchPage({
                  query: options.query,
                  location: center,
                  limit: options.limit,
                  mode: options.mode,
                  fieldMask: options.fieldMask,
                  filters: options.filters,
                  zoom: cellZoom,
                  offset: lastOffset,
                  psi: lastPsi,
                  ech: page + 1,
                });

          for (const result of batch.results) {
            const key = result.hexId ?? result.placeId ?? result.name;
            if (!key || seen.has(key)) continue;
            seen.add(key);
            collected.push(result);
            foundInCell++;
          }

          if (collected.length >= maxResults) break;
          if (!batch.pagination.hasMore || batch.pagination.nextOffset == null) break;
          lastOffset = batch.pagination.nextOffset;
          lastPsi = batch.pagination.psi;
        }

        options.onProgress?.({
          cell,
          totalCells: cellsTotal,
          x: tx,
          y: ty,
          foundInCell,
          uniqueResults: collected.length,
        });
      }
    }

    return {
      results: collected.slice(0, maxResults),
      places: collected.slice(0, maxResults),
      cellsSearched: cell,
      cellsTotal,
      requestsMade,
      cellZoom,
    };
  }
}

export class SuggestService {
  private http: HttpClient;
  private hl: string;
  private gl: string;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.http = http;
    this.hl = config.hl ?? 'en';
    this.gl = config.gl ?? 'us';
  }

  /** Maps omnibox autocomplete — query completions and place suggestions. */
  async suggest(options: SuggestOptions): Promise<SuggestResult> {
    const lat = options.location?.lat ?? options.lat ?? DEFAULT_SUGGEST_LAT;
    const lng = options.location?.lng ?? options.lng ?? DEFAULT_SUGGEST_LNG;
    const hl = options.hl ?? this.hl;
    const gl = options.gl ?? this.gl;

    const url = buildSuggestUrl({
      query: options.query,
      lat,
      lng,
      altitude: options.altitude,
      zoom: options.zoom,
      screenWidth: options.screenWidth,
      screenHeight: options.screenHeight,
      hl,
      gl,
      sessionToken: options.sessionToken,
    });

    const data = await this.http.get<unknown>(url, {
      referer: 'https://www.google.com/maps/',
    });

    return extractSuggestions(data, { raw: options.raw });
  }
}
