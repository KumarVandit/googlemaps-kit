import { describe, expect, it } from 'vitest';
import { loadNestedJsonFixture } from '../../helpers/fixtures.js';
import {
  buildFinanceQuoteUrl, parseFinanceChartResponse, parseFinanceDateTime, parseFinanceInstrument,
  parseFinanceQuoteNode, parseFinanceQuoteResponse, parseFinanceSearchResponse,
} from '../../../src/finance/parsers.js';

const instrument = { symbol: 'GOOGL', exchange: 'NASDAQ' };
const fixture = (name: string) => loadNestedJsonFixture<unknown[]>('finance', name);

describe('Finance quote captures', () => {
  it('keeps regular and extended prices separate, with exchange timestamps', () => {
    const quote = parseFinanceQuoteResponse(fixture('quote-googl.json'), instrument);
    expect(quote).toMatchObject({ instrument, name: 'Alphabet Inc Class A', price: 324.89, currency: 'USD', previousClose: 320.58, timeZone: 'America/New_York', utcOffsetSeconds: -14_400, delayStatus: 'not-disclosed' });
    expect(quote.time).toBe(new Date(1_793_217_601_000).toISOString());
    expect(quote.extendedMarket).toMatchObject({ price: 292.5, change: -32.390015, changePercent: -9.969532 });
    expect(quote.extendedMarket?.time).toBe(new Date(1_793_231_999_000).toISOString());
    expect(quote.reportedTime).toBe(new Date(1_793_257_498_000).toISOString());
  });

  it('preserves genuine zero prices, changes and timestamps', () => {
    const quote = parseFinanceQuoteNode(['/m/example', ['ZERO', 'TEST'], 'Zero', 0, 'USD', [0, 0, 0], null, 0, null, null, null, [0], 'UTC', 0, null, null, [0, 0, 0], [0], [0]]);
    expect(quote).toMatchObject({ price: 0, change: 0, changePercent: 0, previousClose: 0, utcOffsetSeconds: 0, time: '1970-01-01T00:00:00.000Z', extendedMarket: { price: 0 } });
  });

  it('distinguishes a missing quote from malformed or mismatched data', () => {
    expect(() => parseFinanceQuoteResponse([], instrument)).toThrow(/not found/);
    expect(() => parseFinanceQuoteResponse([{}], instrument)).toThrow(/Invalid/);
    expect(() => parseFinanceQuoteResponse(fixture('quote-googl.json'), { symbol: 'MSFT', exchange: 'NASDAQ' })).toThrow(/requested quote/);
  });
});

describe('Finance suggestions', () => {
  it('deduplicates repeated groups while retaining quoted currencies and zero changes', () => {
    const result = parseFinanceSearchResponse(fixture('search-microsoft.json'), 'Microsoft');
    const microsoft = result.matches.find(row => row.instrument.symbol === 'MSFT');
    expect(microsoft).toMatchObject({ instrument: { symbol: 'MSFT', exchange: 'NASDAQ' }, name: 'Microsoft Corp', quote: { price: 531.01, currency: 'USD' } });
    const keys = result.matches.map(row => `${row.instrument.symbol}:${row.instrument.exchange}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(result.matches.find(row => row.instrument.symbol === 'NOAA')?.quote).toMatchObject({ price: 8, change: 0, changePercent: 0, currency: 'EUR' });
  });

  it('handles a valid empty result without concealing malformed groups', () => {
    expect(parseFinanceSearchResponse([], 'no matches').matches).toEqual([]);
    expect(() => parseFinanceSearchResponse({}, 'query')).toThrow(/Invalid/);
    expect(() => parseFinanceSearchResponse([true], 'query')).toThrow(/Invalid/);
  });
});

describe('Finance historical prices', () => {
  it('decodes intraday sessions without treating extended prices as regular quotes', () => {
    const chart = parseFinanceChartResponse(fixture('chart-googl-day.json'), instrument, '1D');
    expect(chart).toMatchObject({ instrument, currency: 'USD', name: 'Alphabet Inc Class A', intervalSeconds: 60, previousClose: 320.58 });
    expect(chart.sessions.map(row => row.sessionCode)).toEqual([1, 3]);
    expect(chart.sessions[0]?.points[0]).toMatchObject({ time: '2026-10-28T13:30:00.000Z', price: 323.72, volume: 20_625 });
    expect(chart.sessions[1]?.startTime).toBe('2026-10-28T20:00:00.000Z');
  });

  it('retains the daily sampling interval used by the month chart', () => {
    const chart = parseFinanceChartResponse(fixture('chart-googl-month.json'), instrument, '1M');
    expect(chart.intervalSeconds).toBe(86_400);
    expect(chart.sessions[0]?.points[0]).toMatchObject({ time: '2026-09-29T20:00:00.000Z', price: 340.92, volume: 21_066_901 });
    expect(chart.sessions[0]?.points.at(-1)?.time).toBe('2026-10-28T20:00:01.000Z');
  });

  it('rejects corrupt points and unrelated chart responses', () => {
    expect(() => parseFinanceChartResponse([[[['GOOGL', 'NASDAQ'], null, 'USD', [[[1], [[null, [5]]]]]]]], instrument, '1D')).toThrow(/Invalid Finance chart point/);
    expect(() => parseFinanceChartResponse([], instrument, '1D')).toThrow(/not found/);
    expect(() => parseFinanceChartResponse(fixture('chart-googl-day.json'), { symbol: 'OTHER', exchange: 'TEST' }, '1D')).toThrow(/did not match/);
  });
});

describe('Finance instrument and time contracts', () => {
  it('uses symbol:exchange order and validates before constructing links', () => {
    expect(parseFinanceInstrument(' googl:nasdaq ')).toEqual(instrument);
    expect(buildFinanceQuoteUrl('.DJI:INDEXDJX')).toBe('https://www.google.com/finance/quote/.DJI:INDEXDJX');
    for (const value of ['GOOGL', ':NASDAQ', 'GOOGL:NASDAQ:EXTRA', 'GOOGL/evil:NASDAQ']) expect(() => parseFinanceInstrument(value)).toThrow(TypeError);
  });

  it('uses the wire UTC offset and rejects impossible calendar values', () => {
    expect(parseFinanceDateTime([2024, 2, 29, 10, 0, 0, 500_000_000, [19_800]])).toBe('2024-02-29T04:30:00.500Z');
    expect(parseFinanceDateTime([2026, 1, 1], -18_000)).toBe('2026-01-01T05:00:00.000Z');
    expect(parseFinanceDateTime([2025, 2, 29, 10, 0, 0, 0, [0]])).toBeUndefined();
    expect(parseFinanceDateTime([2026, 1, 1])).toBeUndefined();
  });
});
