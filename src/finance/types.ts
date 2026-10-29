import type { GoogleWebConfig, GoogleWebRequestOptions } from '../utils/google-web.js';

export interface FinanceConfig extends GoogleWebConfig {
  language?: string;
  userAgent?: string;
}

export interface FinanceInstrument {
  symbol: string;
  exchange: string;
}

/** Strings use Google Finance's symbol:exchange order, for example GOOGL:NASDAQ. */
export type FinanceInstrumentInput = FinanceInstrument | string;
export type FinanceRequestOptions = GoogleWebRequestOptions;
export type FinanceChartRange = '1D' | '5D' | '1M' | '6M' | 'YTD' | '1Y' | '5Y' | 'MAX';

export interface FinanceChartOptions extends FinanceRequestOptions {
  range?: FinanceChartRange;
}

export interface FinancePrice {
  price: number;
  change?: number;
  changePercent?: number;
  time?: string;
}

export interface FinanceQuote extends FinancePrice {
  instrument: FinanceInstrument;
  name: string;
  currency?: string;
  entityId?: string;
  previousClose?: number;
  extendedMarket?: FinancePrice;
  reportedTime?: string;
  timeZone?: string;
  utcOffsetSeconds?: number;
  sourceCode?: number;
  delayStatus: 'not-disclosed';
  url: string;
  raw: unknown;
}

export interface FinanceSearchMatch {
  instrument: FinanceInstrument;
  name: string;
  entityId?: string;
  quote?: FinanceQuote;
  url: string;
  raw: unknown;
}

export interface FinanceSearchResult {
  query: string;
  matches: FinanceSearchMatch[];
  raw: unknown;
}

export interface FinanceChartPoint {
  time: string;
  price: number;
  volume?: number;
  raw: unknown;
}

export interface FinanceChartSession {
  sessionCode?: number;
  startTime?: string;
  endTime?: string;
  points: FinanceChartPoint[];
  raw: unknown;
}

export interface FinanceChart {
  instrument: FinanceInstrument;
  range: FinanceChartRange;
  name?: string;
  currency?: string;
  entityId?: string;
  intervalSeconds?: number;
  previousClose?: number;
  utcOffsetSeconds?: number;
  sessions: FinanceChartSession[];
  raw: unknown;
}
