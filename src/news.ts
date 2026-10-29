import { googleWebText, GoogleWebError, positiveTimeout, xmlText, type GoogleWebConfig, type GoogleWebRequestOptions } from './utils/google-web.js';

export { GoogleWebError } from './utils/google-web.js';

export interface GoogleNewsConfig extends GoogleWebConfig { language?: string; country?: string; edition?: string }
export interface GoogleNewsOptions extends GoogleWebRequestOptions { language?: string; country?: string; edition?: string }
export interface GoogleNewsArticle {
  title: string;
  url: string;
  guid?: string;
  publishedAt?: string;
  source?: { name: string; url?: string };
  descriptionHtml?: string;
  rawXml: string;
}
export interface GoogleNewsFeed { title: string; url: string; language?: string; copyright?: string; articles: GoogleNewsArticle[]; rawXml: string }

interface XmlElement {
  name: string;
  attributes: Record<string, string>;
  parts: Array<string | { cdata: string } | XmlElement>;
  children: XmlElement[];
  opening: string;
  closing: string;
  start: number;
  end: number;
}

function malformedXml(message = 'Malformed Google News RSS feed'): never {
  throw new GoogleWebError(message, 'parse');
}

function xmlTagEnd(xml: string, start: number): number {
  let quote: string | undefined;
  for (let i = start; i < xml.length; i++) {
    const character = xml[i];
    if (quote) { if (character === quote) quote = undefined; }
    else if (character === '"' || character === "'") quote = character;
    else if (character === '>') return i;
    else if (character === '<') return malformedXml();
  }
  return malformedXml();
}

function xmlAttributes(value: string): Record<string, string> {
  const attributes: Record<string, string> = Object.create(null) as Record<string, string>;
  const pattern = /\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/y;
  let cursor = 0;
  while (cursor < value.length) {
    if (!value.slice(cursor).trim()) break;
    pattern.lastIndex = cursor;
    const match = pattern.exec(value);
    if (!match || match[1]! in attributes) return malformedXml('Malformed Google News XML attributes');
    attributes[match[1]!] = xmlText(match[2] ?? match[3]!);
    cursor = pattern.lastIndex;
  }
  return attributes;
}

function xmlRoot(xml: string): XmlElement {
  if (typeof xml !== 'string' || xml.length > 10_000_000) return malformedXml('RSS exceeds the supported input size');
  const stack: XmlElement[] = [];
  let root: XmlElement | undefined;
  let cursor = 0, count = 0;
  while (cursor < xml.length) {
    if (xml[cursor] !== '<') {
      const next = xml.indexOf('<', cursor);
      const end = next === -1 ? xml.length : next;
      const text = xml.slice(cursor, end);
      const parent = stack[stack.length - 1];
      if (parent) parent.parts.push(text);
      else if (text.trim()) return malformedXml();
      cursor = end;
      continue;
    }
    if (xml.startsWith('<!--', cursor)) {
      const end = xml.indexOf('-->', cursor + 4);
      if (end === -1 || xml.slice(cursor + 4, end).includes('--')) return malformedXml('Malformed Google News XML comment');
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', cursor)) {
      const parent = stack[stack.length - 1];
      const end = xml.indexOf(']]>', cursor + 9);
      if (!parent || end === -1) return malformedXml('Malformed Google News CDATA');
      parent.parts.push({ cdata: xml.slice(cursor + 9, end) });
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith('<?', cursor)) {
      const end = xml.indexOf('?>', cursor + 2);
      if (end === -1) return malformedXml('Malformed Google News XML processing instruction');
      cursor = end + 2;
      continue;
    }
    if (xml.startsWith('<!', cursor)) return malformedXml('RSS declarations and external entities are unsupported');
    const end = xmlTagEnd(xml, cursor + 1);
    const token = xml.slice(cursor + 1, end);
    if (token.startsWith('/')) {
      const match = /^\/([A-Za-z_][\w.:-]*)\s*$/.exec(token);
      const node = stack.pop();
      if (!match || !node || node.name !== match[1]) return malformedXml('Mismatched Google News XML element');
      node.closing = xml.slice(cursor, end + 1);
      node.end = end + 1;
    } else {
      const match = /^([A-Za-z_][\w.:-]*)([\s\S]*)$/.exec(token);
      if (!match) return malformedXml();
      const selfClosing = /\/\s*$/.test(match[2]!);
      const attributeText = selfClosing ? match[2]!.replace(/\/\s*$/, '') : match[2]!;
      const node: XmlElement = {
        name: match[1]!, attributes: xmlAttributes(attributeText), parts: [], children: [],
        opening: xml.slice(cursor, end + 1), closing: '', start: cursor, end: end + 1,
      };
      const parent = stack[stack.length - 1];
      if (parent) { parent.children.push(node); parent.parts.push(node); }
      else if (root) return malformedXml('Google News RSS has multiple root elements');
      else root = node;
      if (++count > 50_000 || stack.length >= 64) return malformedXml('RSS exceeds supported XML complexity');
      if (!selfClosing) stack.push(node);
    }
    cursor = end + 1;
  }
  if (stack.length || !root) return malformedXml('Truncated Google News RSS feed');
  return root;
}

function elementContent(element: XmlElement): string {
  return element.parts.map(part => typeof part === 'string' ? xmlText(part) : 'cdata' in part ? part.cdata : xmlText(part.opening) + elementContent(part) + xmlText(part.closing)).join('');
}

function field(element: XmlElement, name: string): string | undefined {
  const child = element.children.find(item => item.name === name);
  return child ? elementContent(child) : undefined;
}

function httpUrl(value: string, name: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new GoogleWebError(`Google News has an invalid ${name}`, 'parse'); }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) throw new GoogleWebError(`Google News has an invalid ${name}`, 'parse');
  return url.toString();
}

/** Parse Google News RSS metadata; article links remain Google's publisher redirects. */
export function parseGoogleNewsRss(xml: string): GoogleNewsFeed {
  const root = xmlRoot(xml);
  const channels = root.children.filter(child => child.name === 'channel');
  if (root.name !== 'rss' || channels.length !== 1) return malformedXml();
  const channel = channels[0]!;
  const title = field(channel, 'title'), link = field(channel, 'link');
  if (!title || !link) throw new GoogleWebError('Google News RSS has no channel title or URL', 'parse');
  const articles = channel.children.filter(child => child.name === 'item').map(item => {
    const rawXml = xml.slice(item.start, item.end);
    const title = field(item, 'title'), link = field(item, 'link');
    if (!title || !link) throw new GoogleWebError('Google News article has no title or URL', 'parse');
    const source = item.children.find(child => child.name === 'source');
    const sourceUrl = source?.attributes.url;
    const date = field(item, 'pubDate');
    if (date && !Number.isFinite(Date.parse(date))) throw new GoogleWebError('Google News article has an invalid publication date', 'parse');
    return {
      title, url: httpUrl(link, 'article URL'), guid: field(item, 'guid'),
      publishedAt: date ? new Date(date).toISOString() : undefined,
      source: source ? { name: elementContent(source), url: sourceUrl ? httpUrl(sourceUrl, 'source URL') : undefined } : undefined,
      descriptionHtml: field(item, 'description'), rawXml,
    };
  });
  return { title, url: httpUrl(link, 'channel URL'), language: field(channel, 'language'), copyright: field(channel, 'copyright'), articles, rawXml: xml };
}

/** Public headline and query feeds, separate from paid third-party news APIs. */
export class GoogleNewsClient {
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly defaults: GoogleNewsConfig;

  constructor(config: GoogleNewsConfig = {}) {
    this.fetcher = config.fetch ?? globalThis.fetch;
    this.timeoutMs = positiveTimeout(config.timeoutMs ?? 30_000);
    this.defaults = config;
  }

  headlines(options: GoogleNewsOptions = {}): Promise<GoogleNewsFeed> { return this.feed('/rss', options); }

  search(query: string, options: GoogleNewsOptions = {}): Promise<GoogleNewsFeed> {
    if (typeof query !== 'string' || !query.trim()) throw new TypeError('Google News query must not be empty');
    return this.feed('/rss/search', options, query);
  }

  private async feed(path: string, options: GoogleNewsOptions, query?: string): Promise<GoogleNewsFeed> {
    const language = options.language ?? this.defaults.language ?? 'en-US';
    const country = options.country ?? this.defaults.country ?? 'US';
    const edition = options.edition ?? this.defaults.edition ?? `${country}:${language.split('-')[0]}`;
    if (!/^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(language) || !/^[A-Z]{2}$/.test(country) || !/^[A-Z]{2}:[a-zA-Z-]+$/.test(edition)) throw new TypeError('Invalid Google News locale or edition');
    const url = new URL(path, 'https://news.google.com');
    for (const [key, value] of Object.entries({ hl: language, gl: country, ceid: edition })) url.searchParams.set(key, value);
    if (query !== undefined) url.searchParams.set('q', query);
    return parseGoogleNewsRss(await googleWebText(this.fetcher, url, { method: 'GET' }, this.timeoutMs, options.signal));
  }
}

export function googleNews(config: GoogleNewsConfig = {}): GoogleNewsClient { return new GoogleNewsClient(config); }
