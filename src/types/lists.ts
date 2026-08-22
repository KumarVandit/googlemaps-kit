/** Options for fetching a shared or public Google Maps place list. */
export type GetListOptions = {
  /** Raw list id (mutually exclusive with `url`). */
  listId?: string;
  /** List URL — placelists page or maps.app.goo.gl short link (mutually exclusive with `listId`). */
  url?: string;
  /** Page size passed as `!4i{n}` in the pb (default 500). */
  pageSize?: number;
  hl?: string;
  gl?: string;
  /** Include the raw protobuf-over-JSON payload on the result. */
  raw?: boolean;
};

/** A single place stub inside a curated list. */
export interface PlaceListEntry {
  name: string;
  /** Curator comment — unique to list entries. */
  note?: string;
  /**
   * Full formatted address string from addressBlock[2].
   * May include the place name as a prefix (e.g. "Marcy Land Omotesando Ramen Bar, 屋台 ...").
   */
  address?: string;
  /**
   * @deprecated No longer populated — addressBlock[4] is a country-first reverse geocode
   * string ("Japan, 〒..."), not a street-level line. Use `address` instead.
   */
  streetAddress?: string;
  lat?: number;
  lng?: number;
  /**
   * Canonical hex feature id `0x…:0x…` — derived from the decimal hi/lo pair
   * in the address block, not directly transmitted in hex form.
   */
  hexId?: string;
  /**
   * Google internal feature id, e.g. `/g/11q21hjdkh`.
   * Present when addressBlock[7] or addressBlock[5][5] is a `/g/…` or `/m/…` path.
   * Distinct from `hexId` — this is the `/g/` path form, hexId is the `0x…:0x…` form.
   */
  featureId?: string;
  /** ChIJ base64 place id when present in the address block. */
  placeId?: string;
  addedBy?: string;
  /** ISO 8601 timestamp when the entry was added to the list. */
  addedAt?: string;
  /**
   * Place rating (1–5).
   * Not currently extracted by the parser — present in some list entry payloads.
   * Reserved for future extraction.
   */
  rating?: number;
  /**
   * Total review count for the place.
   * Not currently extracted by the parser — reserved for future extraction.
   */
  reviewCount?: number;
  /**
   * Primary category string (e.g. "Restaurant", "Café").
   * Not currently extracted by the parser — reserved for future extraction.
   */
  category?: string;
  /**
   * Place thumbnail URL.
   * Not currently extracted by the parser — reserved for future extraction.
   */
  thumbnailUrl?: string;
  raw?: unknown;
}

/** Parsed place list with metadata and lightweight place stubs. */
export interface PlaceList {
  listId: string;
  title?: string;
  ownerName?: string;
  ownerAvatarUrl?: string;
  shareUrl?: string;
  placeCount?: number;
  entries: PlaceListEntry[];
  raw?: unknown;
}

/** Options for browsing public lists. */
export interface ListBrowseOptions {
  category?: 'featured' | 'trending' | 'new';
  language?: string;
  limit?: number;
  offset?: number;
}

/** Summary of a list for browsing. */
export interface PlaceListSummary {
  id: string;
  title: string;
  description?: string;
  ownerName?: string;
  itemCount: number;
  itemPreview?: Array<{ name: string; lat?: number; lng?: number }>;
  createdAt?: Date;
  lastModified?: Date;
  isPublic: boolean;
}
