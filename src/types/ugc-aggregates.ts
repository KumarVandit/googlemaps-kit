/** Place UGC/review aggregates from GetPlaceUgcPostAggregates batchexecute RPC. */
export interface PlaceUgcAggregates {
  rating?: number;
  /**
   * Star count histogram as a fixed 5-element tuple:
   * `[fiveStar, fourStar, threeStar, twoStar, oneStar]` — index 0 = 5-star, index 4 = 1-star.
   * Verified against Kake Di Hatti + duplicates fixtures.
   */
  ratingDistribution?: [number, number, number, number, number];
  totalCount?: number;
  raw?: unknown;
}

export interface GetPlaceUgcAggregatesOptions {
  hexId: string;
  /** Override session psi (scraped from Maps bootstrap when omitted). */
  psi?: string;
}
