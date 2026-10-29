import { TrendsError } from './errors.js';
import type { TrendingSearch, TrendsArticle, TrendsFeed, TrendsSuggestions } from './types.js';

function malformed(label: string): never {
  throw new TrendsError(`Malformed Google Trends ${label}`, 'parse');
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonempty(value: unknown, label: string): string {
  return typeof value === 'string' && value.length > 0 ? value : malformed(label);
}

export function parseTrendsJson(text: string): Record<string, unknown> {
  // The anonymous JSON endpoints prepend )]}', as an XSSI guard.
  const body = text.replace(/^\uFEFF/, '').replace(/^\)\]\}',?\s*/, '');
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch (cause) {
    throw new TrendsError('Malformed Google Trends JSON', 'parse', undefined, undefined, { cause });
  }
  return object(parsed) ? parsed : malformed('JSON object');
}

export function parseSuggestions(raw: unknown): TrendsSuggestions {
  if (!object(raw) || !object(raw.default) || !Array.isArray(raw.default.topics)) return malformed('suggestions');
  const topics = raw.default.topics.map(value => {
    if (!object(value)) return malformed('topic');
    return {
      mid: nonempty(value.mid, 'topic ID'),
      title: nonempty(value.title, 'topic title'),
      type: nonempty(value.type, 'topic type'),
      raw: value,
    };
  });
  return { topics, raw };
}

function xmlMask(xml: string): string {
  const masked = xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->/g, value => ' '.repeat(value.length));
  if (masked.includes('<![CDATA[') || masked.includes('<!--')) return malformed('RSS text section');
  return masked;
}

function elements(xml: string, tag: string): Array<{ inner: string; start: number; end: number }> {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const masked = xmlMask(xml);
  const expression = new RegExp(`(<${escaped}(?:\\s[^>]*?)?>)([\\s\\S]*?)<\\/${escaped}\\s*>`, 'g');
  const matches = Array.from(masked.matchAll(expression), match => {
    const start = match.index!;
    const innerStart = start + match[1]!.length;
    return { inner: xml.slice(innerStart, innerStart + match[2]!.length), start, end: start + match[0].length };
  });
  const starts = masked.match(new RegExp(`<${escaped}(?:\\s[^>]*?)?(?<!\\/)>`, 'g'))?.length ?? 0;
  if (starts !== matches.length) return malformed(`RSS ${tag}`);
  return matches;
}

function blocks(xml: string, tag: string): string[] {
  return elements(xml, tag).map(element => element.inner);
}

function decodeXml(text: string): string {
  const segments = text.split(/(<!\[CDATA\[[\s\S]*?\]\]>)/g);
  return segments.map(segment => segment.startsWith('<![CDATA[') ? segment.slice(9, -3) : segment.replace(/<!--[\s\S]*?-->/g, '').replace(/&([^;]+);/g, (_, entity: string) => {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (Object.hasOwn(named, entity)) return named[entity]!;
    const numeric = /^#x([0-9a-f]+)$/i.exec(entity) ?? /^#([0-9]+)$/.exec(entity);
    if (!numeric) return malformed('RSS entity');
    const code = Number.parseInt(numeric[1]!, entity.startsWith('#x') || entity.startsWith('#X') ? 16 : 10);
    if (code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return malformed('RSS entity');
    return String.fromCodePoint(code);
  })).join('');
}

function tag(xml: string, name: string): string | undefined {
  const values = blocks(xml, name);
  if (values.length > 0) return decodeXml(values[0]!).trim();
  return new RegExp(`<${name}\\s*\\/>`).test(xml) ? '' : undefined;
}

export function parseTrendingRss(raw: string): TrendsFeed {
  if (/<!DOCTYPE|<!ENTITY/i.test(raw) || !/<rss(?:\s|>)/.test(raw) || !/<\/rss\s*>/.test(raw)) return malformed('RSS document');
  const channels = blocks(raw, 'channel');
  if (channels.length !== 1) return malformed('RSS channel');
  const channel = channels[0]!;
  const itemElements = elements(channel, 'item');
  const itemBlocks = itemElements.map(item => item.inner);
  let channelMetadata = channel;
  for (const item of [...itemElements].reverse()) channelMetadata = channelMetadata.slice(0, item.start) + channelMetadata.slice(item.end);
  const items: TrendingSearch[] = itemBlocks.map(item => {
    const articles: TrendsArticle[] = blocks(item, 'ht:news_item').map(article => ({
      title: nonempty(tag(article, 'ht:news_item_title'), 'RSS article title'),
      url: nonempty(tag(article, 'ht:news_item_url'), 'RSS article URL'),
      source: tag(article, 'ht:news_item_source'),
      snippet: tag(article, 'ht:news_item_snippet'),
      picture: tag(article, 'ht:news_item_picture'),
      raw: article,
    }));
    const published = tag(item, 'pubDate');
    const timestamp = published === undefined ? undefined : Date.parse(published);
    if (timestamp !== undefined && !Number.isFinite(timestamp)) return malformed('RSS publication date');
    return {
      title: nonempty(tag(item, 'title'), 'RSS item title'),
      link: tag(item, 'link'),
      approximateTraffic: tag(item, 'ht:approx_traffic'),
      publishedAt: timestamp === undefined ? undefined : new Date(timestamp).toISOString(),
      picture: tag(item, 'ht:picture'),
      pictureSource: tag(item, 'ht:picture_source'),
      articles,
      raw: item,
    };
  });
  return {
    title: nonempty(tag(channelMetadata, 'title'), 'RSS title'),
    description: tag(channelMetadata, 'description'),
    link: tag(channelMetadata, 'link'),
    items,
    raw,
  };
}
