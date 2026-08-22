/**
 * Result wrapper for `categories.getHierarchy()`.
 * The `nodes` array contains the top-level category roots; each node may have nested `children`.
 */
export interface CategoryHierarchyResult {
  /** Top-level category nodes (each may have `.children` for sub-categories). */
  nodes: CategoryNode[];
  raw?: unknown;
}

/** Google Maps category taxonomy node from LocalRapService.GetCategoryHierarchy. */
export interface CategoryNode {
  name: string;
  gcid?: string;
  id?: number;
  children?: CategoryNode[];
  raw?: unknown;
}

export interface CategorySuggestion {
  gcid: string;
  label: string;
  raw?: unknown;
}

export interface PlaceInfoEntry {
  hexId?: string;
  label?: string;
  raw?: unknown;
}

export interface PlaceInfoResult {
  hexId?: string;
  entries: PlaceInfoEntry[];
  raw?: unknown;
}

export interface PotentialDuplicate {
  hexId: string;
  name: string;
  category?: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  raw?: unknown;
}

export interface SignedPlaceUrl {
  hexId: string;
  signedPath: string;
  raw?: unknown;
}

export interface GetCategorySuggestionsOptions {
  query: string;
}

export interface GetPlaceInfoOptions {
  hexId: string;
}

export interface GetPotentialDuplicatesOptions {
  hexId: string;
}

export interface GetSignedUrlOptions {
  hexId: string;
}
