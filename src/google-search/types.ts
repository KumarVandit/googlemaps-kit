export interface GoogleSearchConfig {
  fetch?: typeof globalThis.fetch;
  language?: string;
  country?: string;
  /** Request deadline, including response-body consumption. Defaults to 20000 ms. */
  timeoutMs?: number;
}

export interface GoogleSearchOptions {
  signal?: AbortSignal;
  language?: string;
  country?: string;
  start?: number;
  safe?: 'active' | 'off';
  /** Retains the response for diagnosis when Google changes its markup. */
  includeRawHtml?: boolean;
}

export interface GoogleSuggestOptions {
  signal?: AbortSignal;
  language?: string;
  country?: string;
}

export interface GoogleSearchLink {
  title: string;
  url: string;
}

export interface GoogleOrganicResult extends GoogleSearchLink {
  position: number;
  snippet?: string;
  displayUrl?: string;
}

export interface GoogleAiOverview {
  status: 'present' | 'blocked' | 'unverified';
  /** Extracted visible text from an explicitly labeled overview region, when available. */
  text?: string;
  sources: GoogleSearchLink[];
  reason: string;
}

export type GoogleSearchStatus = 'results' | 'empty' | 'blocked' | 'javascript-required' | 'consent-required' | 'unrecognized';

export interface GoogleSearchResponse {
  query: string;
  sourceUrl: string;
  httpStatus: number;
  status: GoogleSearchStatus;
  organic: GoogleOrganicResult[];
  relatedQuestions: string[];
  relatedSearches: Array<{ query: string; url: string }>;
  aiOverview: GoogleAiOverview;
  warnings: string[];
  retryAfterMs?: number;
  rawHtml?: string;
}

export interface GoogleAutocompleteResponse {
  query: string;
  suggestions: string[];
  raw: unknown[];
}

export interface ParseGoogleSearchOptions {
  sourceUrl: string;
  query?: string;
  httpStatus?: number;
  includeRawHtml?: boolean;
}
