/**
 * Hypothesized pb suffix encodings for Maps search filters (field-50 xB slot map).
 *
 * NOT EFFECTIVE for anonymous HTTP — the server ignores every variant on GET search.
 * These builders exist so unit tests document the mined JS format; they are not wired
 * into SearchService. See known-surfaces.ts `searchFilters` (status: blocked).
 */

import type {
  SearchFilters,
  SearchOpenHoursFilter,
  SearchPriceLevel,
  SearchRatingFilter,
} from '../types/search-filters.js';
import {
  OPEN_HOURS_CHIP_VALUE,
  RATING_FILTER_CODE,
  SEARCH_FILTER_SLOT,
} from '../types/search-filters.js';

/** One xB map entry: slot number + gE payload fragment. */
export interface FilterPbEntry {
  slot: number;
  /** pb fragment for the gE value (without the slot wrapper). */
  payload: string;
  label: string;
}

function priceBitmask(levels: SearchPriceLevel[]): number {
  return levels.reduce((mask, level) => mask | level, 0);
}

/** Slot 3 — open now / 24h (Q2b → VP(f, 3, …), A2b sets Gn field 1). */
export function encodeOpenHoursFilter(value: SearchOpenHoursFilter): FilterPbEntry {
  const chip = OPEN_HOURS_CHIP_VALUE[value];
  return {
    slot: SEARCH_FILTER_SLOT.openHours,
    payload: `!2m1!1i${chip}`,
    label: `openHours:${value}`,
  };
}

/** Slot 2 — minimum rating (yM → UXb field 2 XAa code). */
export function encodeRatingFilter(minRating: SearchRatingFilter): FilterPbEntry {
  const code = RATING_FILTER_CODE[minRating];
  return {
    slot: SEARCH_FILTER_SLOT.rating,
    payload: `!2m1!1i${code}`,
    label: `minRating:${minRating}`,
  };
}

/** Slot 1 — price range bitmask (A6b → PXb/SXb on gAa field 4). */
export function encodePriceFilter(levels: SearchPriceLevel[]): FilterPbEntry {
  const mask = priceBitmask(levels);
  return {
    slot: SEARCH_FILTER_SLOT.priceRange,
    payload: `!2m1!1i${mask}`,
    label: `priceLevels:0x${mask.toString(16)}`,
  };
}

/** Slot 14 — hotel check-in/out (kAb → rwb/nwb date protos). */
export function encodeHotelDatesFilter(checkIn: string, checkOut: string): FilterPbEntry {
  return {
    slot: SEARCH_FILTER_SLOT.hotelDates,
    payload: `!2m2!1s${checkIn}!2s${checkOut}`,
    label: `hotelDates:${checkIn}/${checkOut}`,
  };
}

/** Wrap slot entries into a hypothesized field-50 xB block. */
export function wrapFilterEntries(entries: FilterPbEntry[]): string {
  if (entries.length === 0) return '';
  const inner = entries
    .map((e) => `!1m1!1i${e.slot}${e.payload}`)
    .join('');
  return `!50m${entries.length}${inner}`;
}

/** Build all pb entries implied by {@link SearchFilters}. */
export function buildFilterPbEntries(filters: SearchFilters): FilterPbEntry[] {
  const entries: FilterPbEntry[] = [];
  if (filters.openHours) entries.push(encodeOpenHoursFilter(filters.openHours));
  if (filters.minRating != null) entries.push(encodeRatingFilter(filters.minRating));
  if (filters.priceLevels?.length) entries.push(encodePriceFilter(filters.priceLevels));
  if (filters.hotelDates) {
    entries.push(
      encodeHotelDatesFilter(filters.hotelDates.checkIn, filters.hotelDates.checkOut),
    );
  }
  return entries;
}

/**
 * Append hypothesized filter block to a search pb. Returns the input unchanged when
 * no filters are set so default search requests stay byte-identical.
 */
export function appendSearchFilterPb(basePb: string, filters?: SearchFilters): string {
  if (!filters) return basePb;
  const entries = buildFilterPbEntries(filters);
  if (entries.length === 0) return basePb;
  return basePb + wrapFilterEntries(entries);
}

/** SerpAPI-style tbs tokens — probed; server ignores on search?tbm=map. */
export const PROBED_TBS_TOKENS = {
  openNow: 'lf_od:1',
  openNowWithLf: 'lf:1,lf_od:1',
  priceLevel1: 'mr:1,price:1',
  priceLevel2: 'mr:1,price:2',
  minRating4: 'mr:1,avg:4',
  minRating45: 'mr:1,avg:4.5',
  hotelDates: 'hc:2026-08-01,2026-08-03',
} as const;
