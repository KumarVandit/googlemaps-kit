import { descendants, parseHtml, visibleText } from './google-search/html.js';
import { googleWebText, GoogleWebError, positiveTimeout, type GoogleWebConfig, type GoogleWebRequestOptions } from './utils/google-web.js';

export { GoogleWebError } from './utils/google-web.js';

export interface GoogleBooksMetadata {
  id: string;
  title: string;
  bibliographicTitle?: string;
  authors: string[];
  publisher?: string;
  publishedYear?: number;
  edition?: string;
  pageCount?: number;
  identifiers: Array<{ type: 'ISBN_10' | 'ISBN_13'; value: string }>;
  description?: string;
  canonicalUrl: string;
  rawMetadata: Record<string, string>;
}

function volumeId(value: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new TypeError('Expected a Google Books volume ID');
  return value;
}

/** Extracts bibliographic metadata from the observed English public Google Books page. */
export function parseGoogleBooksHtml(html: string, id: string): GoogleBooksMetadata {
  volumeId(id);
  if (typeof html !== 'string' || html.length > 10_000_000) throw new GoogleWebError('Unsupported Google Books HTML size', 'parse');
  const nodes = descendants(parseHtml(html));
  const meta = new Map(nodes.filter(node => node.tag === 'meta').map(node => [node.attrs.property ?? node.attrs.name, node.attrs.content]));
  const table = nodes.find(node => node.tag === 'table' && node.attrs.id === 'metadata_content_table');
  if (meta.get('og:type') !== 'book' || !table || !meta.get('og:title')) throw new GoogleWebError('Unrecognized Google Books metadata page', 'parse');
  const rawMetadata: Record<string, string> = {};
  let authors: string[] = [];
  for (const row of descendants(table).filter(node => node.tag === 'tr')) {
    const cells = row.children.filter(child => typeof child !== 'string' && child.tag === 'td');
    const key = typeof cells[0] === 'object' ? visibleText(cells[0]) : '';
    const value = cells[1];
    if (!key || typeof value !== 'object') continue;
    rawMetadata[key] = visibleText(value);
    if (key === 'Authors' || key === 'Author') {
      const linkedAuthors = descendants(value).filter(node => node.tag === 'a').map(visibleText).filter(Boolean);
      authors = linkedAuthors.length > 0 ? linkedAuthors : [visibleText(value)].filter(Boolean);
    }
  }
  const publisher = rawMetadata.Publisher;
  const year = publisher ? /,\s*(\d{4})$/.exec(publisher) : undefined;
  const pages = /^(\d+)\s+pages?$/i.exec(rawMetadata.Length ?? '');
  const identifiers = [...(rawMetadata.ISBN ?? '').matchAll(/\b(?:\d{13}|\d{9}[\dXx])\b/g)].map(match => ({
    type: match[0].length === 13 ? 'ISBN_13' as const : 'ISBN_10' as const, value: match[0],
  }));
  let canonicalUrl = `https://books.google.com/books?id=${encodeURIComponent(id)}`;
  const canonical = meta.get('og:url');
  if (canonical) {
    let parsed: URL;
    try { parsed = new URL(canonical); } catch { throw new GoogleWebError('Invalid Google Books canonical URL', 'parse'); }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'books.google.com' || parsed.username || parsed.password || parsed.searchParams.get('id') !== id) throw new GoogleWebError('Google Books returned a mismatched volume', 'parse');
    canonicalUrl = parsed.toString();
  }
  return {
    id, title: meta.get('og:title')!, bibliographicTitle: rawMetadata.Title, authors,
    publisher: year ? publisher!.slice(0, year.index) : publisher,
    publishedYear: year ? Number(year[1]) : undefined, edition: rawMetadata.Edition,
    pageCount: pages ? Number(pages[1]) : undefined, identifiers,
    description: meta.get('description'), canonicalUrl, rawMetadata,
  };
}

/** Public bibliographic pages only; the separately documented v1 API is not called. */
export class GoogleBooksClient {
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(config: GoogleWebConfig = {}) {
    this.fetcher = config.fetch ?? globalThis.fetch;
    this.timeoutMs = positiveTimeout(config.timeoutMs ?? 30_000);
  }

  async get(id: string, options: GoogleWebRequestOptions = {}): Promise<GoogleBooksMetadata> {
    const url = new URL('https://books.google.com/books');
    url.searchParams.set('id', volumeId(id));
    url.searchParams.set('hl', 'en');
    return parseGoogleBooksHtml(await googleWebText(this.fetcher, url, { method: 'GET' }, this.timeoutMs, options.signal), id);
  }
}

export function googleBooks(config: GoogleWebConfig = {}): GoogleBooksClient { return new GoogleBooksClient(config); }
