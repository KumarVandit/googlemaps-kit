/**
 * Search filter types matched against the Maps web client (FRNZOb.js / eH4Qrd.js).
 *
 * NOT EFFECTIVE for anonymous HTTP: live probing showed none of these encodings change
 * `search?tbm=map` results — parameters are silently ignored. Registered as `searchFilters`
 * in known-surfaces.ts with status `blocked`. See scripts/probe-search-filters.ts.
 *
 * The web client stores active filters in request field 50 (_.BF) → xB map slot → gE.
 */

/** Minimum rating threshold — Maps uses internal codes 4–9 (E2b in FRNZOb.js). */
export type SearchRatingFilter = 2 | 2.5 | 3 | 3.5 | 4 | 4.5;

/** Price level bitmask ($=1, $$=2, $$$=4, $$$$=8) — slot 1 or 19 in the client. */
export type SearchPriceLevel = 1 | 2 | 4 | 8;

/** Open-hours chip values from _.d3b (A2b): 1 = open now, 2 = open 24 hours. */
export type SearchOpenHoursFilter = 'open_now' | 'open_24h';

/** Hotel check-in/out for slot 14 (kAb) — yyyy-mm-dd strings. */
export interface SearchHotelDatesFilter {
  checkIn: string;
  checkOut: string;
}

/**
 * Filters the Maps UI exposes on local search. All fields optional; omit or leave
 * undefined to match an unfiltered search request byte-for-byte.
 */
export interface SearchFilters {
  openHours?: SearchOpenHoursFilter;
  minRating?: SearchRatingFilter;
  /** Bitmask OR of selected price levels (e.g. `[2, 4]` for $$ and $$$). */
  priceLevels?: SearchPriceLevel[];
  hotelDates?: SearchHotelDatesFilter;
}

/**
 * Client-side filters applied after parsing search results. The anonymous search
 * endpoint ignores server-side pb/tbs filter encodings; these options filter the
 * parsed payload locally (open status and rating are present in search rows).
 */
export interface SearchClientFilters {
  /** Keep only places whose open-status label starts with "Open". */
  openNow?: boolean;
  minRating?: SearchRatingFilter;
  /** Requires `priceLevel` on each result — often absent in search payloads. */
  priceLevels?: SearchPriceLevel[];
}

/** Client-side xB filter slot numbers (_.m4b in FRNZOb.js). */
export const SEARCH_FILTER_SLOT = {
  priceRange: 1,
  rating: 2,
  openHours: 3,
  hotelDates: 14,
  priceDerived: 18,
  priceChip: 19,
  openToggle: 41,
  amenities: 62,
} as const;

/** Maps internal rating code for each public threshold (yM / E2b). */
export const RATING_FILTER_CODE: Record<SearchRatingFilter, number> = {
  2: 4,
  2.5: 5,
  3: 6,
  3.5: 7,
  4: 8,
  4.5: 9,
};

/** Open-hours chip value for A2b(label, value). */
export const OPEN_HOURS_CHIP_VALUE: Record<SearchOpenHoursFilter, number> = {
  open_now: 1,
  open_24h: 2,
};
