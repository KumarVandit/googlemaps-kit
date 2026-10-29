import { describe, expect, it, vi } from 'vitest';
import { googleNews, parseGoogleNewsRss } from '../../../src/news.js';
import { loadNestedFixture } from '../../helpers/fixtures.js';

const captured = () => loadNestedFixture('news', 'search.xml');

describe('Google News feeds', () => {
  it('parses captured articles and retains Google redirects and publisher metadata', () => {
    const feed = parseGoogleNewsRss(captured());
    expect(feed.articles).toHaveLength(3);
    expect(feed.title).toBe('"Google" - Google News');
    expect(feed.articles[0]?.url).toMatch(/^https:\/\/news.google.com\/rss\/articles\//);
    expect(feed.articles[0]?.source?.url).toMatch(/^https:\/\//);
    expect(feed.articles[0]?.publishedAt).toMatch(/^2026-/);
    expect(feed.copyright).toContain('Google');
  });

  it('preserves literal CDATA entities and supports a valid empty feed', () => {
    const result = parseGoogleNewsRss('<rss version="2.0"><channel><title><![CDATA[A &amp; B]]></title><link>https://news.google.com/</link></channel></rss>');
    expect(result.title).toBe('A &amp; B'); expect(result.articles).toEqual([]);
  });

  it('keeps element-looking CDATA text intact without splitting articles or titles', () => {
    const article = '<item><title><![CDATA[Literal </title> and <item> markers]]></title><link>https://example.com/article</link><description><![CDATA[<p>Literal </item> and <!DOCTYPE example> text &amp; symbols.</p>]]></description></item>';
    const result = parseGoogleNewsRss(`<rss><channel><title>Feed</title><link>https://news.google.com/</link>${article}</channel></rss>`);

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0]?.title).toBe('Literal </title> and <item> markers');
    expect(result.articles[0]?.descriptionHtml).toBe('<p>Literal </item> and <!DOCTYPE example> text &amp; symbols.</p>');
    expect(result.articles[0]?.rawXml).toBe(article);
  });

  it('skips XML comments and processing instructions without confusing their contents with elements', () => {
    const xml = '<?xml version="1.0"?><!-- <item><title>fake</title></item> --><rss version="2.0"><channel><!-- </channel> --><title>A<!-- hidden -->B</title><link>https://news.google.com/</link><?ignored value?><item><title>Actual</title><link>https://example.com/</link></item></channel></rss><!-- <rss> -->';
    const result = parseGoogleNewsRss(xml);

    expect(result.title).toBe('AB');
    expect(result.articles.map(article => article.title)).toEqual(['Actual']);
  });

  it('decodes source attributes and escaped descriptions once while preserving CDATA verbatim', () => {
    const xml = '<rss><channel><title>A &amp;lt; B</title><link>https://news.google.com/</link><item><title>A &amp; B</title><link>https://example.com/?a=1&amp;b=2</link><source url="https://example.com/?q=&amp;amp;&gt;">A &amp; B</source><description>&lt;b&gt;Text &amp;amp; symbols&lt;/b&gt;<![CDATA[ &amp; literal]]></description></item></channel></rss>';
    const result = parseGoogleNewsRss(xml);

    expect(result.title).toBe('A &lt; B');
    expect(result.articles[0]).toMatchObject({
      title: 'A & B', url: 'https://example.com/?a=1&b=2',
      source: { name: 'A & B', url: 'https://example.com/?q=&amp;%3E' },
      descriptionHtml: '<b>Text &amp; symbols</b> &amp; literal',
    });
  });

  it('reads channel metadata after articles and ignores descendant item markup', () => {
    const xml = '<rss><channel><item><title>Actual</title><link>https://example.com/</link><description><item>Nested markup</item></description></item><title>Feed</title><link>https://news.google.com/</link></channel></rss>';
    const result = parseGoogleNewsRss(xml);
    expect(result.title).toBe('Feed');
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0]?.descriptionHtml).toBe('<item>Nested markup</item>');
  });

  it.each([
    '<rss><channel><title>x</link><link>https://news.google.com/</link></channel></rss>',
    '<rss><channel><title>x</title><link>https://news.google.com/</link><item></channel></item></rss>',
    '<rss><channel><title><![CDATA[unterminated</title><link>https://news.google.com/</link></channel></rss>',
    '<rss><channel><title>x</title><link>https://news.google.com/</link></channel></rss><!-- unterminated',
    '<rss><channel><title>x</title><link>https://news.google.com/</link></channel></rss><rss/>',
    '<rss><channel/><channel/></rss>',
    '<rss version="2.0" version="2.0"><channel/></rss>',
    '<rss version=2.0><channel/></rss>',
  ])('rejects malformed nesting and XML delimiters: %s', xml => {
    expect(() => parseGoogleNewsRss(xml)).toThrow(expect.objectContaining({ kind: 'parse' }));
  });

  it('rejects excessive XML depth before traversing description content', () => {
    const nested = '<node>'.repeat(1000) + 'text' + '</node>'.repeat(1000);
    const xml = `<rss><channel><title>Feed</title><link>https://news.google.com/</link><description>${nested}</description></channel></rss>`;
    expect(() => parseGoogleNewsRss(xml)).toThrow(expect.objectContaining({ kind: 'parse' }));
  });

  it.each(['<html>blocked</html>', '<rss><channel><title>x</title><link>https://news.google.com</link><item></channel></rss>', '<!DOCTYPE rss><rss><channel></channel></rss>', '<rss><channel><title>x</title><link>javascript:alert(1)</link></channel></rss>'])('rejects malformed feeds: %s', xml => {
    expect(() => parseGoogleNewsRss(xml)).toThrow();
  });

  it('uses only the public RSS endpoint with encoded query and locale', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(captured()));
    const client = googleNews({ fetch: fetcher });
    await client.search('Google & "AI"', { language: 'en-IN', country: 'IN' });
    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(url.origin + url.pathname).toBe('https://news.google.com/rss/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({ hl: 'en-IN', gl: 'IN', ceid: 'IN:en', q: 'Google & "AI"' });
    await client.headlines();
    expect(new URL(String(fetcher.mock.calls[1]![0])).pathname).toBe('/rss');
  });

  it('rejects empty queries and invalid editions before requesting', async () => {
    const fetcher = vi.fn<typeof fetch>(); const client = googleNews({ fetch: fetcher });
    expect(() => client.search('')).toThrow(TypeError);
    await expect(client.headlines({ country: '../x' })).rejects.toThrow(TypeError);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
