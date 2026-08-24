import type { SearchClientFilters } from './search-filters.js';
import type { SearchFieldMask, SearchMode, SearchResult } from './common.js';

/**
 * Bounding box for area searches, in decimal degrees.
 * Spelling matches the rest of the SDK (`north/south/east/west`).
 */
export interface GridSearchBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface GridSearchOptions {
  /** Query run in every cell, e.g. "cafes". */
  query: string;
  /** Area to cover. Larger areas at a given `cellZoom` mean more cells. */
  bounds: GridSearchBounds;
  /**
   * Web Mercator zoom used to subdivide the area into cells — each cell is
   * one anonymous search request. `14` ≈ city districts, `15` ≈ ~2 km cells,
   * `16` ≈ neighbourhoods, `17` ≈ blocks. Defaults to `15`.
   */
  cellZoom?: number;
  /** Stop once this many unique results are collected. */
  maxResults?: number;
  /** Safety cap on cells searched. Defaults to all cells covered by the bounds. */
  maxCells?: number;
  /** Results requested per cell per page (search `limit`). */
  limit?: number;
  /** Pagination pages fetched per cell (default 1). */
  pagesPerCell?: number;
  mode?: SearchMode;
  fieldMask?: SearchFieldMask;
  filters?: SearchClientFilters;
  /**
   * Progress callback fired after each cell with the cell's tile coordinates
   * and how many new unique results it contributed.
   */
  onProgress?: (progress: GridSearchProgress) => void;
}

/** Progress snapshot fired once per searched cell. */
export interface GridSearchProgress {
  /** 1-based index of the cell just completed. */
  cell: number;
  totalCells: number;
  /** Web Mercator tile coordinates of the cell. */
  x: number;
  y: number;
  /** New unique results contributed by this cell. */
  foundInCell: number;
  /** Running total of unique results so far. */
  uniqueResults: number;
}

export interface GridSearchResult {
  results: SearchResult[];
  /** Alias of {@link GridSearchResult.results}. */
  places: SearchResult[];
  /** Cells actually searched (may be capped by `maxCells` / `maxResults`). */
  cellsSearched: number;
  /** Total cells implied by the bounds at `cellZoom`. */
  cellsTotal: number;
  /** HTTP requests issued including pagination. */
  requestsMade: number;
  cellZoom: number;
}
