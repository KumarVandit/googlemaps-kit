import { describe, expect, it, vi } from 'vitest';
import { googleBooks, parseGoogleBooksHtml } from '../../../src/books.js';
import { loadNestedFixture } from '../../helpers/fixtures.js';

const fixture = () => loadNestedFixture('books', 'metadata.html');

describe('Google Books public metadata', () => {
  it('extracts the observed bibliographic table without fetching book content', () => {
    const result = parseGoogleBooksHtml(fixture(), 'zyTCAlFPjgYC');
    expect(result).toMatchObject({
      id: 'zyTCAlFPjgYC', title: 'The Google Story (2018 Updated Edition)',
      authors: ['David A. Vise', 'Mark Malseed'], publisher: 'Random House Publishing Group',
      publishedYear: 2005, pageCount: 384, edition: 'unabridged',
      identifiers: [{ type: 'ISBN_10', value: '0440335701' }, { type: 'ISBN_13', value: '9780440335702' }],
    });
    expect(result.bibliographicTitle).toContain('Inside the Hottest Business');
    expect(result.canonicalUrl).toContain('books.google.com/books/about/');
    expect(result.rawMetadata.ISBN).toBe('0440335701, 9780440335702');
  });

  it('requests the observed English Books web page once rather than the throttled v1 API', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(fixture()));
    const result = await googleBooks({ fetch: fetcher }).get('zyTCAlFPjgYC');
    const [input, init] = fetcher.mock.calls[0]!;
    const url = new URL(String(input));
    expect(url.origin + url.pathname).toBe('https://books.google.com/books');
    expect(Object.fromEntries(url.searchParams)).toEqual({ id: 'zyTCAlFPjgYC', hl: 'en' });
    expect(init?.method).toBe('GET');
    expect(result.authors).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not turn unknown pages or a mismatched volume into metadata', () => {
    expect(() => parseGoogleBooksHtml('<html>Try again later</html>', 'zyTCAlFPjgYC')).toThrow(expect.objectContaining({ kind: 'parse' }));
    expect(() => parseGoogleBooksHtml(fixture(), 'otherVolume')).toThrow(/mismatched volume/);
  });

  it('rejects invalid IDs before requesting and propagates access denial without retry', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = googleBooks({ fetch: fetcher });
    await expect(client.get('../private')).rejects.toBeInstanceOf(TypeError);
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValue(new Response('denied', { status: 429, headers: { 'Retry-After': '5' } }));
    await expect(client.get('zyTCAlFPjgYC')).rejects.toMatchObject({ kind: 'blocked', status: 429, retryAfterMs: 5000 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('preserves caller cancellation', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const controller = new AbortController();
    const reason = new Error('stop'); controller.abort(reason);
    await expect(googleBooks({ fetch: fetcher }).get('zyTCAlFPjgYC', { signal: controller.signal })).rejects.toBe(reason);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
