import { GoogleWebError } from '../utils/google-web.js';
import type {
  FinanceChart, FinanceChartPoint, FinanceChartRange, FinanceInstrument,
  FinanceInstrumentInput, FinancePrice, FinanceQuote, FinanceSearchMatch, FinanceSearchResult,
} from './types.js';

const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const number = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const string = (value: unknown): string | undefined => typeof value === 'string' && value.length > 0 ? value : undefined;

export const FINANCE_RANGES: Readonly<Record<FinanceChartRange, number>> = {
  '1D': 1, '5D': 2, '1M': 3, '6M': 4, YTD: 5, '1Y': 6, '5Y': 7, MAX: 8,
};

export function parseFinanceInstrument(input: FinanceInstrumentInput): FinanceInstrument {
  const parts = typeof input === 'string' ? input.split(':') : [input?.symbol, input?.exchange];
  const symbol = parts[0]?.trim().toUpperCase();
  const exchange = parts[1]?.trim().toUpperCase();
  if (parts.length !== 2 || !symbol || !exchange || !/^[-A-Z0-9._^=]{1,64}$/.test(symbol) || !/^[-A-Z0-9._]{1,40}$/.test(exchange)) {
    throw new TypeError('Finance instrument must contain a symbol and exchange, for example GOOGL:NASDAQ');
  }
  return { symbol, exchange };
}

export function buildFinanceQuoteUrl(input: FinanceInstrumentInput): string {
  const { symbol, exchange } = parseFinanceInstrument(input);
  return `https://www.google.com/finance/quote/${encodeURIComponent(symbol)}:${encodeURIComponent(exchange)}`;
}

function timestamp(value: unknown): string | undefined {
  const raw = list(value), seconds = number(raw[0]), nanos = number(raw[1]) ?? 0;
  if (seconds == null || nanos < 0 || nanos >= 1_000_000_000) return undefined;
  const date = new Date(seconds * 1000 + nanos / 1_000_000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

/** Finance DateTime uses one-based months and UTC offset seconds in field 8. */
export function parseFinanceDateTime(value: unknown, fallbackOffset?: number): string | undefined {
  const raw = list(value);
  const year = number(raw[0]), month = number(raw[1]), day = number(raw[2]);
  const hour = number(raw[3]) ?? 0, minute = number(raw[4]) ?? 0, second = number(raw[5]) ?? 0;
  const nanos = number(raw[6]) ?? 0, offset = number(list(raw[7])[0]) ?? fallbackOffset;
  if (year == null || month == null || day == null || offset == null || ![year, month, day, hour, minute, second, nanos, offset].every(Number.isInteger)) return undefined;
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59 || nanos < 0 || nanos >= 1_000_000_000 || Math.abs(offset) > 86_400) return undefined;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, Math.floor(nanos / 1_000_000));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return new Date(date.getTime() - offset * 1000).toISOString();
}

function price(value: unknown, time?: unknown): FinancePrice | undefined {
  const raw = list(value), amount = number(raw[0]);
  if (amount == null) return undefined;
  return { price: amount, change: number(raw[1]), changePercent: number(raw[2]), time: timestamp(time) };
}

function instrumentFromNode(value: unknown): FinanceInstrument | undefined {
  const raw = list(value);
  if (typeof raw[0] !== 'string' || typeof raw[1] !== 'string') return undefined;
  try { return parseFinanceInstrument({ symbol: raw[0], exchange: raw[1] }); } catch { return undefined; }
}

/** EntitySummary field 1 wraps a security; fields 6/17 hold regular/extended prices. */
export function parseFinanceQuoteNode(value: unknown): FinanceQuote | undefined {
  const raw = list(value), instrument = instrumentFromNode(raw[1]), regular = price(raw[5], raw[17]);
  const name = string(raw[2]);
  if (!instrument || !name || !regular) return undefined;
  return {
    instrument, name, ...regular, currency: string(raw[4]), entityId: string(raw[0]),
    previousClose: number(raw[7]), extendedMarket: price(raw[16], raw[18]), reportedTime: timestamp(raw[11]),
    timeZone: string(raw[12]), utcOffsetSeconds: number(raw[13]), sourceCode: number(raw[24]),
    delayStatus: 'not-disclosed', url: buildFinanceQuoteUrl(instrument), raw: value,
  };
}

export function parseFinanceQuoteResponse(value: unknown, requested: FinanceInstrument): FinanceQuote {
  if (!Array.isArray(value) || (value[0] != null && !Array.isArray(value[0]))) throw new GoogleWebError('Invalid Finance quote response', 'parse');
  const rows = list(value[0]);
  for (const row of rows) {
    const entry = list(row), status = list(entry[1]), code = number(status[0]);
    if (entry[0] == null && code != null && code > 0) {
      throw new GoogleWebError(code === 5 ? 'Finance quote was not found' : string(status[1]) ?? 'Finance quote request failed', 'rpc', undefined, code);
    }
    const quote = parseFinanceQuoteNode(entry[0]);
    if (quote?.instrument.symbol === requested.symbol && quote.instrument.exchange === requested.exchange) return quote;
  }
  if (rows.length > 0) throw new GoogleWebError('Finance response did not contain the requested quote', 'parse');
  throw new GoogleWebError('Finance quote was not found', 'rpc', undefined, 5);
}

export function parseFinanceSearchResponse(value: unknown, query: string): FinanceSearchResult {
  if (!Array.isArray(value)) throw new GoogleWebError('Invalid Finance search response', 'parse');
  const matches: FinanceSearchMatch[] = [], seen = new Set<string>();
  for (const index of [0, 6, 7, 2, 3, 4, 5, 10, 11]) {
    if (value[index] != null && !Array.isArray(value[index])) throw new GoogleWebError('Invalid Finance suggestion group', 'parse');
    for (const item of list(value[index])) {
      const raw = list(item), node = list(raw[3]);
      const instrument = instrumentFromNode(node[1]) ?? instrumentFromNode(list(raw[4])[1]);
      const name = string(node[2]) ?? string(raw[6]);
      if (!instrument || !name) continue;
      const key = `${instrument.symbol}:${instrument.exchange}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push({ instrument, name, entityId: string(raw[0]), quote: parseFinanceQuoteNode(node), url: buildFinanceQuoteUrl(instrument), raw: item });
    }
  }
  return { query, matches, raw: value };
}

/** HistoricalPricingData field 4 groups session headers with DateTime/price/volume points. */
export function parseFinanceChartResponse(value: unknown, requested: FinanceInstrument, range: FinanceChartRange): FinanceChart {
  if (!Array.isArray(value) || (value[0] != null && !Array.isArray(value[0]))) throw new GoogleWebError('Invalid Finance chart response', 'parse');
  const records = list(value[0]);
  const record = records.find(item => {
    const instrument = instrumentFromNode(list(item)[0]);
    return instrument?.symbol === requested.symbol && instrument.exchange === requested.exchange;
  });
  if (!record) {
    if (records.length > 0) throw new GoogleWebError('Finance chart did not match the requested instrument', 'parse');
    throw new GoogleWebError('Finance chart was not found', 'rpc', undefined, 5);
  }
  const raw = list(record), offset = number(raw[5]);
  if (!Array.isArray(raw[3])) throw new GoogleWebError('Finance chart sessions are missing', 'parse');
  const sessions = raw[3].map(item => {
    const session = list(item), header = list(session[0]);
    if (!Array.isArray(session[1])) throw new GoogleWebError('Invalid Finance chart points', 'parse');
    const points: FinanceChartPoint[] = [];
    for (const entry of session[1]) {
      const point = list(entry), time = parseFinanceDateTime(point[0], offset), amount = number(list(point[1])[0]);
      if (!time || amount == null) throw new GoogleWebError('Invalid Finance chart point', 'parse');
      points.push({ time, price: amount, volume: number(point[2]), raw: entry });
    }
    return { sessionCode: number(header[0]), startTime: parseFinanceDateTime(header[1], offset), endTime: parseFinanceDateTime(header[2], offset), points, raw: item };
  });
  return { instrument: requested, range, name: string(raw[7]), currency: string(raw[2]), entityId: string(raw[1]), intervalSeconds: number(raw[8]), previousClose: number(raw[6]), utcOffsetSeconds: offset, sessions, raw: value };
}
