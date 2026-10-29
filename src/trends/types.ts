export interface TrendsConfig {
  fetch?: typeof globalThis.fetch;
  locale?: string;
  /** Minutes west of UTC, matching Date.getTimezoneOffset(). Defaults to 0. */
  timezone?: number;
  /** Deadline for each request, including its response body. Defaults to 30 seconds. */
  timeoutMs?: number;
}

export interface TrendsRequestOptions {
  signal?: AbortSignal;
}

export interface TrendsTopic {
  mid: string;
  title: string;
  type: string;
  raw: Record<string, unknown>;
}

export interface TrendsSuggestions {
  topics: TrendsTopic[];
  raw: Record<string, unknown>;
}

export interface TrendsArticle {
  title: string;
  url: string;
  source?: string;
  snippet?: string;
  picture?: string;
  raw: string;
}

export interface TrendingSearch {
  title: string;
  link?: string;
  approximateTraffic?: string;
  publishedAt?: string;
  picture?: string;
  pictureSource?: string;
  articles: TrendsArticle[];
  raw: string;
}

export interface TrendsFeed {
  title: string;
  description?: string;
  link?: string;
  items: TrendingSearch[];
  raw: string;
}

export interface TrendingOptions extends TrendsRequestOptions {
  /** Country or supported subdivision code, for example US or IN. Defaults to US. */
  geo?: string;
}

export interface TrendsComparisonItem {
  keyword: string;
  /** Empty string selects worldwide. Defaults to worldwide. */
  geo?: string;
  /** Website range expression, such as today 12-m, all, or 2026-01-01 2026-09-30. */
  time?: string;
}

export interface TrendsExploreOptions {
  comparisonItem: TrendsComparisonItem[];
  category?: number;
  property?: '' | 'images' | 'news' | 'froogle' | 'youtube';
}

export type TrendsEmbedType = 'TIMESERIES' | 'GEO_MAP' | 'RELATED_TOPICS' | 'RELATED_QUERIES';

export interface TrendsLinkOptions {
  locale?: string;
  /** Selects the classic Explore link offered by the current website. */
  legacy?: boolean;
  /** Minutes west of UTC. */
  timezone?: number;
}
