/** Place UGC/review aggregates from GetPlaceUgcPostAggregates batchexecute RPC. */
export interface PlaceUgcAggregates {
  rating?: number;
  /** Star counts index 0 = 5-star … index 4 = 1-star (verified Kake Di Hatti + duplicates fixture). */
  ratingDistribution?: number[];
  totalCount?: number;
  raw?: unknown;
}

export interface GetPlaceUgcAggregatesOptions {
  hexId: string;
  /** Override session psi (scraped from Maps bootstrap when omitted). */
  psi?: string;
}
