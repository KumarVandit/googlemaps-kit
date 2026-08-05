/** Google Maps category taxonomy node from LocalRapService.GetCategoryHierarchy. */
export interface CategoryNode {
  name: string;
  gcid?: string;
  id?: number;
  children?: CategoryNode[];
}

export interface CategorySuggestion {
  gcid: string;
  label: string;
}

export interface PlaceInfoResult {
  hexId?: string;
  entries: Array<{ hexId?: string; label?: string }>;
}

export interface PotentialDuplicate {
  hexId: string;
  name: string;
  category?: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
}

export interface SignedPlaceUrl {
  hexId: string;
  signedPath: string;
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
