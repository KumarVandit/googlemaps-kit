export type PageSpeedStrategy = 'mobile' | 'desktop';
export type PageSpeedCategory = 'performance' | 'accessibility' | 'best-practices' | 'seo';
export type PageSpeedStatus = 'pending' | 'complete' | 'unknown';
export type PageSpeedResultType = 'lighthouse' | 'origin' | 'page' | 'unknown';
export type PageSpeedRating = 'good' | 'needs-improvement' | 'poor';

export interface PageSpeedConfig {
  fetch?: typeof globalThis.fetch;
  locale?: string;
  apiKey?: string;
  /** Deadline for each HTTP request, including its response body. Defaults to 120 seconds. */
  timeoutMs?: number;
}

export interface PageSpeedRequestOptions {
  signal?: AbortSignal;
}

export interface CreateAnalysisOptions extends PageSpeedRequestOptions {
  useOriginalUrl?: boolean;
}

export interface WaitForAnalysisOptions extends PageSpeedRequestOptions {
  /** Overall polling deadline. Defaults to 180 seconds. */
  timeoutMs?: number;
  /** Defaults to the web client's observed interval of 3000 ms. */
  pollIntervalMs?: number;
  onProgress?: (analysis: PageSpeedAnalysis) => void;
}

export interface AnalyzeOptions extends CreateAnalysisOptions, WaitForAnalysisOptions {}

export interface RunPagespeedOptions extends PageSpeedRequestOptions {
  strategy?: PageSpeedStrategy;
  categories?: PageSpeedCategory[];
  locale?: string;
  captchaToken?: string;
  utmCampaign?: string;
  utmSource?: string;
}

export interface LighthouseAudit {
  id: string;
  title: string;
  description?: string;
  score: number | null;
  scoreDisplayMode: string;
  numericValue?: number;
  numericUnit?: string;
  displayValue?: string;
  details?: Record<string, unknown>;
  metricSavings?: Record<string, number>;
  [key: string]: unknown;
}

export interface LighthouseCategory {
  id: string;
  title: string;
  score: number | null;
  auditRefs?: Array<{ id: string; weight: number; group?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

/** The complete Lighthouse report, including categories and audits unknown to this client. */
export interface LighthouseResult {
  lighthouseVersion: string;
  requestedUrl: string;
  finalUrl: string;
  fetchTime: string;
  audits: Record<string, LighthouseAudit>;
  categories: Record<string, LighthouseCategory>;
  runtimeError?: { code: string; message: string };
  runWarnings?: unknown[];
  configSettings?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PageSpeedFieldMetric {
  name: string;
  percentile?: number;
  histogram: Array<{ start: number; end?: number; density: number }>;
  fractions?: Record<string, number>;
  rating?: PageSpeedRating;
  /** Unmodified positional data for metrics whose schema changes independently of the UI. */
  raw: unknown[];
}

export interface PageSpeedFieldData {
  metrics: Record<string, PageSpeedFieldMetric>;
  collectionPeriod?: { firstDate: string; lastDate: string };
  coreWebVitals: 'passed' | 'failed' | 'unavailable';
  raw: unknown[];
}

export interface PageSpeedRpcStatus {
  code: number;
  message: string;
  details?: unknown[];
}

export interface PageSpeedResult {
  id: string;
  url: string;
  finalUrl?: string;
  strategy?: PageSpeedStrategy;
  type: PageSpeedResultType;
  status: PageSpeedStatus;
  statusCode: number;
  typeCode: number;
  strategyCode: number;
  error?: PageSpeedRpcStatus;
  lighthouse?: LighthouseResult;
  fieldData?: PageSpeedFieldData;
  raw: unknown[];
}

export interface PageSpeedAnalysis {
  id: string;
  url: string;
  status: PageSpeedStatus;
  statusCode: number;
  results: PageSpeedResult[];
  urls: Partial<Record<PageSpeedStrategy, string>>;
  createdAt?: string;
  reportUrl: string;
  raw: unknown[];
}

export interface PagespeedApiLoadingExperience {
  id?: string;
  overall_category?: string;
  initial_url?: string;
  origin_fallback?: boolean;
  metrics?: Record<string, {
    percentile?: number;
    category?: string;
    distributions?: Array<{ min: number; max?: number; proportion: number }>;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface RunPagespeedResponse {
  id?: string;
  kind?: string;
  analysisUTCTimestamp?: string;
  lighthouseResult?: LighthouseResult;
  loadingExperience?: PagespeedApiLoadingExperience;
  originLoadingExperience?: PagespeedApiLoadingExperience;
  [key: string]: unknown;
}
