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
  address?: string;
  streetAddress?: string;
  lat?: number;
  lng?: number;
  /** Canonical hex feature id `0x…:0x…`. */
  hexId?: string;
  /** Google feature id, e.g. `/g/11q21hjdkh`. */
  featureId?: string;
  addedBy?: string;
  addedAt?: string;
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
