import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { buildTrendsEmbedUrl, buildTrendsExploreUrl, trends, TrendsError } from '../../../src/trends.js';
import { parseSuggestions, parseTrendingRss, parseTrendsJson } from '../../../src/trends/parsers.js';

const fixture = (name: string) => readFileSync(new URL(`../../fixtures/trends/${name}`, import.meta.url), 'utf8');

describe('Trends topic suggestions', () => {
  it('parses the observed XSSI-guarded response and preserves topic metadata', () => {
    const raw = parseTrendsJson(fixture('suggestions-coffee.txt'));
    const result = parseSuggestions(raw);
    expect(result.topics).toHaveLength(5);
    expect(result.topics[0]).toMatchObject({ mid: '/m/02vqfm', title: 'Coffee', type: 'Beverage' });
    expect(result.raw).toBe(raw);
    expect(result.topics[0]?.raw).toBe((raw.default as { topics: unknown[] }).topics[0]);
  });

  it('keeps unknown fields and permits a valid empty result', () => {
    const raw = { default: { topics: [{ mid: '/future', title: 'Future', type: 'Unknown type', future: [1, 2] }] }, extra: true };
    expect(parseSuggestions(raw).topics[0]?.raw.future).toEqual([1, 2]);
    expect(parseSuggestions({ default: { topics: [] } }).topics).toEqual([]);
  });

  it.each(['{', 'null', '[]', ')]}\',\nno-json'])('rejects malformed JSON: %s', body => {
    expect(() => parseTrendsJson(body)).toThrow(TrendsError);
  });

  it.each([{}, { default: [] }, { default: { topics: {} } }, { default: { topics: [null] } }, { default: { topics: [{ mid: '/m/id', title: 'No type' }] } }])('rejects malformed suggestion structures: %j', value => {
    expect(() => parseSuggestions(value)).toThrow(TrendsError);
  });
});

describe('Trends RSS parsing', () => {
  it('parses observed feed metadata, traffic buckets, dates, images and news articles', () => {
    const raw = fixture('trending-us.xml');
    const result = parseTrendingRss(raw);
    expect(result.title).toBe('Daily Search Trends');
    expect(result.description).toBe('Recent searches');
    expect(result.link).toBe('https://trends.google.com/trending/rss?geo=US');
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ title: 'japan open', approximateTraffic: '500+', publishedAt: '2026-10-29T07:10:00.000Z', pictureSource: 'Sportsnet.ca' });
    expect(result.items[0]?.articles[0]).toMatchObject({ title: "Canada's Leylah Fernandez wins first-round match at Japan Open", source: 'Sportsnet.ca', snippet: '' });
    expect(result.items[0]?.picture).toMatch(/^https:\/\/encrypted-tbn/);
    expect(result.items[0]?.articles).toHaveLength(3);
    expect(result.raw).toBe(raw);
    expect(result.items[0]?.raw).toContain('<ht:approx_traffic>500+</ht:approx_traffic>');
    expect(result.items[0]?.articles[0]?.raw).toContain('<ht:news_item_title>');
  });

  it('handles CDATA, numeric entities and empty or missing optional fields', () => {
    const raw = '<rss><channel><title><![CDATA[A & B </title>]]></title><description /><item><title>A &#x26; B &#39;C&#39;</title><ht:news_item><ht:news_item_title><![CDATA[Read & learn]]></ht:news_item_title><ht:news_item_url>https://example.com/?a=1&amp;b=2</ht:news_item_url></ht:news_item></item></channel></rss>';
    const result = parseTrendingRss(raw);
    expect(result.title).toBe('A & B </title>');
    expect(result.description).toBe('');
    expect(result.items[0]?.title).toBe("A & B 'C'");
    expect(result.items[0]?.publishedAt).toBeUndefined();
    expect(result.items[0]?.articles[0]).toMatchObject({ title: 'Read & learn', url: 'https://example.com/?a=1&b=2' });
    expect(parseTrendingRss('<rss><channel><title>Empty</title></channel></rss>').items).toEqual([]);
  });

  it.each([
    '<html>not a feed</html>',
    '<rss><channel><title><![CDATA[never closed</title></channel></rss>',
    '<rss><channel><title>Broken</title><item><title>x</title></channel></rss>',
    '<rss><channel><title>Broken</title><item></item></channel></rss>',
    '<rss><channel><title>&unknown;</title></channel></rss>',
    '<rss><channel><title>&#x110000;</title></channel></rss>',
    '<rss><channel><title>Broken</title><item><title>x</title><pubDate>never</pubDate></item></channel></rss>',
    '<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss><channel><title>&x;</title></channel></rss>',
  ])('rejects malformed feeds and unsupported entity declarations: %s', value => {
    expect(() => parseTrendingRss(value)).toThrow(TrendsError);
  });
});

describe('Trends links from static widget evidence', () => {
  const options = { comparisonItem: [{ keyword: 'coffee', geo: 'US', time: 'today 12-m' }], category: 0, property: '' as const };

  it('constructs embed requests without making a network call', () => {
    const url = new URL(buildTrendsEmbedUrl('TIMESERIES', options, { timezone: -330, locale: 'en-US' }));
    expect(url.origin + url.pathname).toBe('https://trends.google.com/trends/embed/explore/TIMESERIES');
    expect(JSON.parse(url.searchParams.get('req')!)).toEqual(options);
    expect(url.searchParams.get('tz')).toBe('-330');
    expect(url.searchParams.get('hl')).toBe('enUS');
  });

  it('preserves topic IDs, commas and independent comparison settings in embed requests', () => {
    const url = new URL(buildTrendsEmbedUrl('RELATED_TOPICS', { comparisonItem: [{ keyword: '/m/02vqfm', geo: 'US' }, { keyword: 'a,b', geo: 'IN', time: 'all' }] }));
    expect(JSON.parse(url.searchParams.get('req')!).comparisonItem).toEqual([{ keyword: '/m/02vqfm', geo: 'US', time: 'today 12-m' }, { keyword: 'a,b', geo: 'IN', time: 'all' }]);
  });

  it('constructs shared-range Explore links including the offered classic option', () => {
    const url = new URL(buildTrendsExploreUrl({ comparisonItem: [{ keyword: 'coffee', geo: 'US' }, { keyword: 'tea', geo: 'US' }] }, { locale: 'en-US', legacy: true }));
    expect(url.searchParams.get('q')).toBe('coffee,tea');
    expect(url.searchParams.get('geo')).toBe('US');
    expect(url.searchParams.get('date')).toBe('today 12-m');
    expect(url.searchParams.has('legacy')).toBe(true);
  });

  it('rejects link settings that would silently change comparison meaning', () => {
    expect(() => buildTrendsExploreUrl({ comparisonItem: [{ keyword: 'a,b' }] })).toThrow(TypeError);
    expect(() => buildTrendsExploreUrl({ comparisonItem: [{ keyword: 'a', geo: 'US' }, { keyword: 'b', geo: 'IN' }] })).toThrow(TypeError);
    expect(() => buildTrendsEmbedUrl('GEO_MAP', { comparisonItem: [] })).toThrow(TypeError);
    expect(() => buildTrendsEmbedUrl('GEO_MAP', { comparisonItem: [{ keyword: 'a', geo: 'us' }] })).toThrow(TypeError);
    expect(() => buildTrendsEmbedUrl('GEO_MAP', { comparisonItem: [{ keyword: 'a' }], category: -1 })).toThrow(RangeError);
  });
});

describe('Trends HTTP client', () => {
  it('encodes topic suggestions and forwards the configured locale', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(fixture('suggestions-coffee.txt')));
    const result = await trends({ fetch: fetcher, locale: 'en-IN' }).suggestions('/m/02vqfm?x=1');
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/trends/api/autocomplete/%2Fm%2F02vqfm%3Fx%3D1');
    expect(url.searchParams.get('hl')).toBe('en-IN');
    expect(result.topics[0]?.title).toBe('Coffee');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('reads RSS using the configured fetcher', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(fixture('trending-us.xml'), { headers: { 'content-type': 'application/rss+xml' } }));
    expect((await trends({ fetch: fetcher }).trending({ geo: 'US' })).items).toHaveLength(2);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe('https://trends.google.com/trending/rss?geo=US');
  });

  it('reports observed 429 responses and retry-after without retrying', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(fixture('explore-rate-limit.html'), { status: 429, headers: { 'retry-after': '120' } }));
    await expect(trends({ fetch: fetcher }).suggestions('coffee')).rejects.toMatchObject({ name: 'TrendsError', kind: 'rate-limit', status: 429, retryAfterMs: 120_000 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('distinguishes challenge pages, HTTP errors, malformed JSON and network failures', async () => {
    const clientFor = (body: string, status: number) => trends({ fetch: async () => new Response(body, { status }) });
    await expect(clientFor('<html>unusual traffic /sorry/index</html>', 403).suggestions('coffee')).rejects.toMatchObject({ kind: 'blocked', status: 403 });
    await expect(clientFor('<html>Sign in</html>', 200).suggestions('coffee')).rejects.toMatchObject({ kind: 'blocked' });
    await expect(clientFor('temporarily unavailable', 503).suggestions('coffee')).rejects.toMatchObject({ kind: 'http', status: 503 });
    await expect(clientFor('{', 200).suggestions('coffee')).rejects.toMatchObject({ kind: 'parse' });
    const cause = new TypeError('fetch failed');
    await expect(trends({ fetch: async () => { throw cause; } }).suggestions('coffee')).rejects.toMatchObject({ kind: 'network', cause });
  });

  it('keeps ordinary feed titles mentioning unusual traffic', async () => {
    const client = trends({ fetch: async () => new Response('<rss><channel><title>unusual traffic</title></channel></rss>') });
    expect((await client.trending()).title).toBe('unusual traffic');
  });

  it('propagates caller cancellation and enforces the deadline while reading the body', async () => {
    const controller = new AbortController();
    const reason = new Error('Stop');
    controller.abort(reason);
    const fetcher = vi.fn<typeof fetch>();
    await expect(trends({ fetch: fetcher }).suggestions('coffee', { signal: controller.signal })).rejects.toBe(reason);
    expect(fetcher).not.toHaveBeenCalled();
    const hanging: typeof fetch = async (_, init) => new Response(new ReadableStream({ start(stream) { init?.signal?.addEventListener('abort', () => stream.error(init.signal?.reason), { once: true }); } }));
    await expect(trends({ fetch: hanging, timeoutMs: 5 }).suggestions('coffee')).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('validates inputs before requesting and uses instance link preferences', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = trends({ fetch: fetcher, locale: 'en-US', timezone: -330 });
    await expect(client.suggestions(' ')).rejects.toThrow(TypeError);
    await expect(client.trending({ geo: '../US' })).rejects.toThrow(TypeError);
    expect(fetcher).not.toHaveBeenCalled();
    expect(() => trends({ timeoutMs: 0 })).toThrow(RangeError);
    expect(() => trends({ timezone: 0.5 })).toThrow(RangeError);
    expect(new URL(client.embedUrl('GEO_MAP', { comparisonItem: [{ keyword: 'coffee' }] })).searchParams.get('tz')).toBe('-330');
    expect(new URL(client.exploreUrl({ comparisonItem: [{ keyword: 'coffee' }] })).searchParams.get('hl')).toBe('en-US');
  });
});
