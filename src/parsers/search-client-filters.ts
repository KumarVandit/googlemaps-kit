import type { SearchResult } from '../types/common.js';
import type { SearchClientFilters, SearchPriceLevel } from '../types/search-filters.js';

/** Maps parsed dollar-count (1–4) to the client bitmask used in filter encodings. */
function priceLevelToBitmask(level: number): SearchPriceLevel | undefined {
  switch (level) {
    case 1:
      return 1;
    case 2:
      return 2;
    case 3:
      return 4;
    case 4:
      return 8;
    default:
      return undefined;
  }
}

/** True when Google's open-status label indicates the place is open right now. */
export function isOpenNowStatus(openStatus: string | undefined): boolean {
  if (!openStatus) return false;
  return /^open\b/i.test(openStatus.trim());
}

/** Apply client-side filters to already-parsed search results. */
export function applyClientSearchFilters(
  results: SearchResult[],
  filters: SearchClientFilters | undefined,
): SearchResult[] {
  if (!filters) return results;

  let out = results;

  if (filters.openNow) {
    out = out.filter((r) => r.isOpenNow === true);
  }

  if (filters.minRating != null) {
    out = out.filter((r) => r.rating != null && r.rating >= filters.minRating!);
  }

  if (filters.priceLevels?.length) {
    const allowed = new Set(filters.priceLevels);
    out = out.filter((r) => {
      if (r.priceLevel == null) return false;
      const bitmask = priceLevelToBitmask(r.priceLevel);
      return bitmask != null && allowed.has(bitmask);
    });
  }

  return out;
}
