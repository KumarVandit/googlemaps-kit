/**
 * Extended review types — fields populated from GetLocalBoqProxy (boq) unless noted.
 */

/** Owner / business response attached to a review (boq entry [4]). */
export interface ReviewOwnerReply {
  /** Relative date string, e.g. "2 months ago" — boq entry [4][1]. */
  date?: string;
  /** Plain-text owner reply — boq entry [4][2] (HTML stripped). */
  text?: string;
  raw?: unknown;
}

/** Local Guide / contributor stats from boq entry [3]. */
export interface ReviewerCredibility {
  /** Total reviews written — boq entry [3][3]. */
  reviewCount?: number;
  /** Total photos contributed — boq entry [3][4]. */
  photoCount?: number;
  /** Local Guide level parsed from avatar URL (`baN`) or entry [3][5]. */
  localGuideLevel?: number;
  /** True when avatar URL contains Local Guide badge markers. */
  isLocalGuide?: boolean;
  /** Google user id of the reviewer (numeric string) when parseable. */
  authorId?: string;
  raw?: unknown;
}

/** Structured review-attached photo (boq entry [14][*]). */
export interface ReviewPhoto {
  /** Stable photo id (CIABIh… / CIHM…). */
  photoId?: string;
  /** Thumbnail or full URL from payload. */
  url: string;
  /** Size-normalized URL via normalizePhotoUrl. */
  normalizedUrl: string;
  caption?: string;
  /** width/height aspect ratio when present. */
  aspectRatio?: number;
  videoUrl?: string;
  uploadDate?: string;
  /** Width in pixels when available. */
  width?: number;
  /** Height in pixels when available. */
  height?: number;
  raw?: unknown;
}

/** Per-aspect or chip attribute on a review (boq entry [30][*]). */
export interface ReviewAttribute {
  /** Ontology key, e.g. GUIDED_DINING_FOOD_ASPECT. */
  key: string;
  /** Human label, e.g. "Food", "Meal type". */
  label: string;
  /** Selected value text, e.g. "Dinner", "₹1,200–1,400". */
  value?: string;
  /** Numeric aspect rating 1–5 when the attribute is a star aspect. */
  rating?: number;
  raw?: unknown;
}

/** Translation metadata (boq entry [44]). */
export interface ReviewTranslation {
  /** BCP-47 language of review text — boq entry [26]. */
  language?: string;
  /** True when Google machine-translation badge is present — boq entry [44][4] === 1. */
  isTranslated?: boolean;
  /** Full review text (may be translated) — boq entry [27]. */
  text?: string;
  /** Truncated preview — boq entry [28]. */
  textPreview?: string;
  /** Original text when both original and translation are present — boq entry [32] when non-empty. */
  originalText?: string;
  raw?: unknown;
}

/**
 * Client-side filters applied after fetching boq reviews.
 * Use when server-side pb slots do not change results (see reviewFilters in findings).
 */
export interface ReviewClientFilters {
  /** Keep only reviews whose text contains this substring (case-insensitive). */
  search?: string;
  /** Keep only reviews with this star rating (1–5). */
  rating?: 1 | 2 | 3 | 4 | 5;
}

/** Place-wide star histogram from GetPlaceUgcPostAggregates (batchexecute). */
export interface PlaceReviewRatingDistribution {
  /** Count of 5-star reviews (index 0 in RPC array). */
  fiveStar: number;
  fourStar: number;
  threeStar: number;
  twoStar: number;
  oneStar: number;
}
