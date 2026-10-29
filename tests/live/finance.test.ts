import { describe, expect, it } from 'vitest';
import { finance } from '../../src/finance.js';

describe.skipIf(process.env.GMAPS_LIVE !== '1' || process.env.FINANCE_LIVE !== '1')('Finance consumer RPCs', () => {
  it('returns a quote, instrument suggestions, and timestamped historical prices', async () => {
    const client = finance();
    const quote = await client.quote('GOOGL:NASDAQ');
    expect(quote.instrument).toEqual({ symbol: 'GOOGL', exchange: 'NASDAQ' });
    expect(quote.price).toBeGreaterThan(0);
    expect(quote.currency).toBe('USD');
    const suggestions = await client.search('Microsoft');
    expect(suggestions.matches.some(row => row.instrument.symbol === 'MSFT')).toBe(true);
    const chart = await client.chart('GOOGL:NASDAQ', { range: '1M' });
    expect(chart.sessions.flatMap(session => session.points).length).toBeGreaterThan(0);
    expect(chart.sessions[0]?.points[0]?.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  }, 60_000);
});
